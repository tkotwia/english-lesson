import express from 'express';
import type { GrammarList, GrammarListItem } from '../../shared/api.ts';
import { correctAnswerText, lessonExercises, type Exercise } from '../../shared/lesson.ts';
import { LevelSchema, SessionStateSchema, type Lesson, type Level } from '../../shared/schema.ts';
import { gradeExercise, wrongResponses } from '../../shared/scoring.ts';
import type { ItemStatus } from '../../shared/srs.ts';
import { LEVEL_GUIDES } from '../ai/cefr.ts';
import type { Db } from '../db.ts';
import { itemKeyForExercise } from '../items.ts';
import { getUserRow, parseId } from './users.ts';

interface TaughtRow {
  id: number;
  local_date: string;
  grammar_point: string | null;
  lesson_json: string;
  state_json: string;
}

/** 文法練習題的題目文字。重組題畫面上給學生看的是中文意思(要排的字是打散的),所以用它。 */
function questionText(exercise: Exercise): string {
  if (exercise.type === 'mcq') return exercise.prompt;
  if (exercise.type === 'reorder') return exercise.translation;
  return exercise.type === 'cloze' ? exercise.sentence : '';
}

/**
 * 某個等級的文法表:課程清單上的每一個文法重點,教過的附上講解、例句、教過它的課,以及當初答錯的練習題。
 * 同一個文法重點會教不只一次(清單教完一輪會再輪一次,不同學習階段的起始課也教同一個),所以合成一項。
 * 「當初有沒有答錯」看的是第一次上那堂課時的作答;重上是練習,不算在內。
 */
export function grammarList(db: Db, userId: number, level: Level): GrammarList {
  const sessions = db
    .prepare(
      `SELECT id, local_date, grammar_point, lesson_json, state_json FROM sessions
       WHERE user_id = ? AND level = ? AND status = 'completed' AND retake_of IS NULL ORDER BY local_date DESC, id DESC`,
    )
    .all(userId, level) as unknown as TaughtRow[];
  const statuses = new Map(
    (db.prepare(`SELECT item_key, status FROM items WHERE user_id = ? AND kind = 'grammar'`).all(userId) as unknown as { item_key: string; status: ItemStatus }[]).map(
      (item) => [item.item_key, item.status],
    ),
  );

  // 先照課程清單的順序放好每一個文法重點;清單以外的(較早的課沒有記錄清單上的名稱)依出現的先後接在後面。
  const points = new Map<string, GrammarListItem>(
    LEVEL_GUIDES[level].grammar.map((point) => [point, { point, latest: null, lessons: [], exerciseCount: 0, missed: [] }]),
  );
  for (const session of sessions) {
    const lesson = JSON.parse(session.lesson_json) as Lesson;
    const state = SessionStateSchema.parse(JSON.parse(session.state_json));
    const name = session.grammar_point ?? lesson.grammar.point;
    const entry = points.get(name) ?? { point: name, latest: null, lessons: [], exerciseCount: 0, missed: [] };
    points.set(name, entry);

    // 課是由新到舊處理的,所以第一次遇到的就是最近教的那一堂。
    entry.latest ??= { title: lesson.grammar.point, explanation: lesson.grammar.explanation, examples: lesson.grammar.examples };
    entry.lessons.push({ sessionId: session.id, date: session.local_date, lessonTitle: lesson.title });
    for (const item of lessonExercises(lesson).filter((exercise) => exercise.kind === 'grammar')) {
      entry.exerciseCount++;
      const answer = state.answers[item.key];
      const { outcome } = gradeExercise(item.exercise, answer);
      const flagged = state.flags.includes(item.key);
      if (outcome === 'correct' && !flagged) continue;
      entry.missed.push({
        sessionId: session.id,
        date: session.local_date,
        question: questionText(item.exercise),
        answer: correctAnswerText(item.exercise),
        outcome,
        wrongAnswers: wrongResponses(item.exercise, answer),
        flagged,
        status: statuses.get(itemKeyForExercise(item, session.id)) ?? null,
      });
    }
  }
  return { level, points: [...points.values()] };
}

export function grammarRouter(db: Db): express.Router {
  const router = express.Router();

  // 文法表:預設是使用者目前的等級,也可以指定其他等級。
  router.get('/', (req, res) => {
    const user = getUserRow(db, parseId(req.query.userId));
    const level = req.query.level === undefined ? user.level : LevelSchema.parse(req.query.level);
    res.json(grammarList(db, user.id, level));
  });

  return router;
}
