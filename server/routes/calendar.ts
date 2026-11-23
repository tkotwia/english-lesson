import express from 'express';
import type { CalendarDay, CalendarMonth, CalendarSession, ProgressSummary } from '../../shared/api.ts';
import { isValidMonth, localDate, monthOf, monthRange } from '../../shared/dates.ts';
import { dailyScores, monthlyAverage, type ScoredSession } from '../../shared/scores.ts';
import type { Lesson, Level, RetakeSummary, SessionResult } from '../../shared/schema.ts';
import type { Db } from '../db.ts';
import { HttpError } from '../errors.ts';
import { dueCount } from '../items.ts';
import { getUserRow, parseId } from './users.ts';

interface CompletedRow {
  id: number;
  local_date: string;
  level: Level;
  score: number;
  lesson_json: string;
  result_json: string;
}

/**
 * 計分用的課程:已完成、而且不是重上的。
 * 重上用的是同一份題目,分數一定偏高,所以不計入當日分數與月平均。
 */
function completedSessions(db: Db, userId: number, from: string, to: string): CompletedRow[] {
  return db
    .prepare(
      `SELECT id, local_date, level, score, lesson_json, result_json FROM sessions
       WHERE user_id = ? AND status = 'completed' AND retake_of IS NULL AND local_date BETWEEN ? AND ? ORDER BY local_date, id`,
    )
    .all(userId, from, to) as unknown as CompletedRow[];
}

const toScored = (row: CompletedRow): ScoredSession => ({ localDate: row.local_date, score: row.score });

/** 每堂課之後重上過的紀錄,以原本那堂課的編號為鍵。 */
function retakesByOriginal(db: Db, userId: number): Map<number, RetakeSummary[]> {
  const rows = db
    .prepare(`SELECT id, retake_of, local_date AS date, score FROM sessions WHERE user_id = ? AND status = 'completed' AND retake_of IS NOT NULL ORDER BY id`)
    .all(userId) as unknown as (RetakeSummary & { retake_of: number })[];
  const map = new Map<number, RetakeSummary[]>();
  for (const row of rows) map.set(row.retake_of, [...(map.get(row.retake_of) ?? []), { id: row.id, date: row.date, score: row.score }]);
  return map;
}

export function calendarRouter(db: Db): express.Router {
  const router = express.Router();

  // 月曆:該月每天的分數、當天的課程,以及月分數。
  router.get('/calendar', (req, res) => {
    const userId = parseId(req.query.userId);
    getUserRow(db, userId);
    const month = req.query.month;
    if (typeof month !== 'string' || !isValidMonth(month)) throw new HttpError(400, 'month 必須是 YYYY-MM 格式');

    const range = monthRange(month);
    const rows = completedSessions(db, userId, range.from, range.to);
    const scored = rows.map(toScored);
    const scores = dailyScores(scored);
    const retakes = retakesByOriginal(db, userId);

    const days: CalendarDay[] = [...scores].map(([date, score]) => ({
      date,
      score,
      sessions: rows
        .filter((row) => row.local_date === date)
        .map((row): CalendarSession => {
          const result = JSON.parse(row.result_json) as SessionResult;
          return {
            id: row.id,
            title: (JSON.parse(row.lesson_json) as Lesson).title,
            level: row.level,
            score: row.score,
            sections: result.sections,
            weakCount: result.weakPoints.length,
            retakes: retakes.get(row.id) ?? [],
          };
        }),
    }));

    const body: CalendarMonth = { month, average: monthlyAverage(scored, month), days };
    res.json(body);
  });

  // 首頁用的進度摘要。
  router.get('/progress', (req, res) => {
    const userId = parseId(req.query.userId);
    getUserRow(db, userId);
    const today = localDate();
    const range = monthRange(monthOf(today));
    const thisMonth = completedSessions(db, userId, range.from, range.to).map(toScored);

    const body: ProgressSummary = {
      today,
      todayScore: dailyScores(thisMonth).get(today) ?? null,
      monthAverage: monthlyAverage(thisMonth, monthOf(today)),
      dueCount: dueCount(db, userId, today),
    };
    res.json(body);
  });

  return router;
}
