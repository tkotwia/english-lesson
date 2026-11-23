import express from 'express';
import { z } from 'zod';
import { FlagSchema } from '../../shared/api.ts';
import { localDate } from '../../shared/dates.ts';
import { lessonExercises, reviewExercises, type ReviewItemView } from '../../shared/lesson.ts';
import { buildSessionResult, gradeExercise } from '../../shared/scoring.ts';
import {
  AskBodySchema,
  AskReplySchema,
  CHAT_TURNS,
  ChatBodySchema,
  ChatReplySchema,
  GradeSchema,
  MAX_ASKS,
  NewSessionSchema,
  SessionStateSchema,
  type Grade,
  type ItemKind,
  type Lesson,
  type LessonNovelty,
  type Level,
  type Minutes,
  type SessionResult,
  type SessionState,
  type SessionView,
  type Stage,
} from '../../shared/schema.ts';
import { askPrompt, chatPrompt, gradePrompt } from '../ai/prompts.ts';
import { AiError, type AiProvider } from '../ai/provider.ts';
import { usageRecorder } from '../ai/usage.ts';
import { transaction, type Db } from '../db.ts';
import { HttpError } from '../errors.ts';
import {
  contentForExercise,
  correctionItem,
  dueItems,
  glossaryItem,
  itemKeyForExercise,
  recordMiss,
  recordReviewResult,
  type ItemContent,
} from '../items.ts';
import type { LessonStudent } from '../lessons.ts';
import { createPreparer } from '../prepared.ts';
import { recordTaskTiming, taskTimings } from '../timings.ts';
import { getUserRow, parseId } from './users.ts';

interface SessionRow {
  id: number;
  user_id: number;
  local_date: string;
  level: Level;
  stage: Stage;
  minutes: Minutes;
  topic: string;
  status: 'in_progress' | 'completed';
  lesson_json: string;
  review_json: string;
  state_json: string;
  score: number | null;
  result_json: string | null;
  retake_of: number | null;
  grammar_point: string | null;
  novelty_json: string | null;
}

/** 暖身複習的題數上限,依課程長度而定。 */
const REVIEW_LIMIT: Record<Minutes, number> = { 20: 5, 30: 6, 40: 8 };

/** 原本那堂課的編號:重上的課回傳它重上的對象,否則是自己。 */
const rootId = (row: SessionRow): number => row.retake_of ?? row.id;

function toView(db: Db, row: SessionRow): SessionView {
  const retakes = db
    .prepare(`SELECT id, local_date AS date, score FROM sessions WHERE retake_of = ? AND status = 'completed' ORDER BY id`)
    .all(row.id) as unknown as SessionView['retakes'];
  return {
    id: row.id,
    userId: row.user_id,
    localDate: row.local_date,
    level: row.level,
    stage: row.stage,
    minutes: row.minutes,
    topic: row.topic,
    status: row.status,
    lesson: JSON.parse(row.lesson_json) as Lesson,
    review: JSON.parse(row.review_json) as ReviewItemView[],
    // 舊紀錄可能缺少後來新增的欄位,透過 schema 補上預設值。
    state: SessionStateSchema.parse(JSON.parse(row.state_json)),
    result: row.result_json ? (JSON.parse(row.result_json) as SessionResult) : null,
    retakeOf: row.retake_of,
    retakes: retakes.map((retake) => ({ ...retake })),
    novelty: row.novelty_json ? (JSON.parse(row.novelty_json) as LessonNovelty) : null,
  };
}

function getSessionRow(db: Db, id: number): SessionRow {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
  if (!row) throw new HttpError(404, '找不到這堂課');
  return row;
}

function currentSessionRow(db: Db, userId: number): SessionRow | undefined {
  return db.prepare(`SELECT * FROM sessions WHERE user_id = ? AND status = 'in_progress' ORDER BY id DESC LIMIT 1`).get(userId) as
    | SessionRow
    | undefined;
}

const storedState = (row: SessionRow): SessionState => SessionStateSchema.parse(JSON.parse(row.state_json));

/**
 * 對話紀錄、問老師的紀錄與「我不熟」的標記只由伺服器寫入。
 * 瀏覽器存進度時送來的這幾個欄位一律不採用,避免較舊的畫面狀態蓋掉剛寫入的內容。
 */
function withServerFields(incoming: SessionState, stored: SessionState): SessionState {
  return { ...incoming, chat: stored.chat, asks: stored.asks, flags: stored.flags };
}

function saveState(db: Db, id: number, state: SessionState): void {
  db.prepare('UPDATE sessions SET state_json = ? WHERE id = ?').run(JSON.stringify(state), id);
}

/** 把「我不熟」的對象對應到項目庫的內容。對象必須是這堂課裡真的存在的題目或生字。 */
function flagTarget(lesson: Lesson, sessionId: number, target: string): { kind: ItemKind; itemKey: string; content: ItemContent } | null {
  const glossary = target.match(/^glossary\.(\d+)$/);
  if (glossary) {
    const item = glossaryItem(lesson, Number(glossary[1]));
    return item ? { kind: 'vocab', ...item } : null;
  }
  const exercise = lessonExercises(lesson).find((item) => item.key === target);
  if (!exercise) return null;
  return { kind: exercise.kind, itemKey: itemKeyForExercise(exercise, sessionId), content: contentForExercise(exercise) };
}

export interface SessionsOptions {
  /** 是否在上課時於背景預先備好之後的課。 */
  prepareAhead: boolean;
  /** 背景要備哪些長度的課。 */
  prepareMinutes: readonly Minutes[];
}

export function sessionsRouter(db: Db, ai: AiProvider, options: SessionsOptions): express.Router {
  const router = express.Router();
  const preparer = createPreparer(db, ai, { enabled: options.prepareAhead, minutes: options.prepareMinutes });
  // 防止連點造成同一位使用者同時產生兩堂課或批改兩次,白白消耗額度。
  const generating = new Set<number>();
  const completing = new Set<number>();
  const chatting = new Set<number>();

  router.get('/current', (req, res) => {
    const userId = parseId(req.query.userId);
    getUserRow(db, userId);
    const row = currentSessionRow(db, userId);
    res.json(row ? toView(db, row) : null);
  });

  // 各種課程長度現在能不能馬上開始、要等多久:開始上課的畫面用它顯示「已備好」與進度條。
  router.get('/prepared', (req, res) => {
    const user = getUserRow(db, parseId(req.query.userId));
    res.json(preparer.status(user));
  });

  // 等 AI 產生課程或批改時,預估要等幾秒(由過去實際花費的時間推估)。
  router.get('/timings', (_req, res) => {
    res.json(taskTimings(db));
  });

  router.post('/', async (req, res) => {
    const { userId, minutes } = NewSessionSchema.parse(req.body);
    const user = getUserRow(db, userId);

    // 已有進行中的課就接著上,不重新產生。
    const existing = currentSessionRow(db, userId);
    if (existing) {
      res.json(toView(db, existing));
      return;
    }
    if (!user.api_key) throw new AiError('no_key');
    if (generating.has(userId)) throw new HttpError(409, '老師正在備課,請稍候。');
    const student: LessonStudent = { id: user.id, level: user.level, stage: user.stage, apiKey: user.api_key };

    generating.add(userId);
    try {
      // 依序嘗試:背景備好的課 → 內建的起始課 → 請 AI 現場產生(只有這種情況需要等)。
      const { made } = await preparer.obtain(student, minutes);
      const today = localDate();
      // 開課當下到期的複習項目就固定下來,之後才到期的留到下一堂。
      const review = dueItems(db, userId, today, REVIEW_LIMIT[minutes]);
      const state: SessionState = SessionStateSchema.parse({ chat: [{ role: 'teacher', text: made.lesson.speaking.opening }] });
      const result = db
        .prepare(
          `INSERT INTO sessions (user_id, local_date, level, stage, minutes, topic, grammar_point, novelty_json, lesson_json, review_json, state_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          userId,
          today,
          made.level,
          made.stage,
          minutes,
          made.topic,
          made.grammarPoint,
          made.novelty ? JSON.stringify(made.novelty) : null,
          JSON.stringify(made.lesson),
          JSON.stringify(review),
          JSON.stringify(state),
        );
      res.status(201).json(toView(db, getSessionRow(db, Number(result.lastInsertRowid))));
      // 這堂課開始了,趁上課的這段時間在背景把之後的課(各種長度)準備好。
      preparer.replenish(student, minutes);
    } finally {
      generating.delete(userId);
    }
  });

  router.get('/:id', (req, res) => {
    res.json(toView(db, getSessionRow(db, parseId(req.params.id))));
  });

  // 重上一堂已經完成的課:用同一份課文與題目,不需要 AI 重新產生。
  // 重上只當練習,分數不計入日曆與月平均;不會 / 不熟的項目照常更新。
  router.post('/:id/retake', (req, res) => {
    const original = getSessionRow(db, parseId(req.params.id));
    if (original.status !== 'completed') throw new HttpError(409, '這堂課還沒上完,不能重上。');
    if (currentSessionRow(db, original.user_id)) throw new HttpError(409, '還有一堂課沒上完,請先上完或放棄那堂課。');

    const lesson = JSON.parse(original.lesson_json) as Lesson;
    const today = localDate();
    const review = dueItems(db, original.user_id, today, REVIEW_LIMIT[original.minutes]);
    const state: SessionState = SessionStateSchema.parse({ chat: [{ role: 'teacher', text: lesson.speaking.opening }] });
    const result = db
      .prepare(
        `INSERT INTO sessions (user_id, local_date, level, stage, minutes, topic, grammar_point, lesson_json, review_json, state_json, retake_of)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        original.user_id,
        today,
        original.level,
        original.stage,
        original.minutes,
        original.topic,
        original.grammar_point,
        original.lesson_json,
        JSON.stringify(review),
        JSON.stringify(state),
        // 重上「重上的課」時,仍然記在最原本那堂課之下。
        rootId(original),
      );
    res.status(201).json(toView(db, getSessionRow(db, Number(result.lastInsertRowid))));
  });

  router.put('/:id/state', (req, res) => {
    const id = parseId(req.params.id);
    const row = getSessionRow(db, id);
    if (row.status !== 'in_progress') throw new HttpError(409, '這堂課已經完成,不能再修改作答。');
    saveState(db, id, withServerFields(SessionStateSchema.parse(req.body), storedState(row)));
    res.status(204).end();
  });

  // 情境對話:學生說一句,老師回一句並指出需要修正的地方。每輪呼叫一次對話類模型。
  router.post('/:id/chat', async (req, res) => {
    const id = parseId(req.params.id);
    const row = getSessionRow(db, id);
    if (row.status !== 'in_progress') throw new HttpError(409, '這堂課已經完成。');
    const { message } = ChatBodySchema.parse(req.body);
    const state = storedState(row);
    const turnLimit = CHAT_TURNS[row.minutes];
    const studentTurns = state.chat.filter((turn) => turn.role === 'student').length;
    if (studentTurns >= turnLimit) throw new HttpError(409, '這次的對話已經結束了。');
    if (chatting.has(id)) throw new HttpError(409, '老師正在回覆,請稍候。');

    const user = getUserRow(db, row.user_id);
    if (!user.api_key) throw new AiError('no_key');

    chatting.add(id);
    try {
      const lesson = JSON.parse(row.lesson_json) as Lesson;
      const reply = await ai.generateJson({
        tier: 'chat',
        task: 'chat',
        apiKey: user.api_key,
        ...chatPrompt({ level: row.level, stage: row.stage, lesson, chat: state.chat, message, turnsLeft: turnLimit - studentTurns - 1 }),
        schema: ChatReplySchema,
        onUsage: usageRecorder(db, row.user_id),
      });
      // 重新讀取最新的進度再寫入,等待 AI 的期間學生可能已經存過別的作答。
      const latest = storedState(getSessionRow(db, id));
      latest.chat.push({ role: 'student', text: message, corrections: reply.corrections }, { role: 'teacher', text: reply.reply, corrections: [] });
      saveState(db, id, latest);
      res.json({ chat: latest.chat });
    } finally {
      chatting.delete(id);
    }
  });

  // 問老師:課堂中隨時提問。每堂課有次數上限,不計分。
  router.post('/:id/ask', async (req, res) => {
    const id = parseId(req.params.id);
    const row = getSessionRow(db, id);
    if (row.status !== 'in_progress') throw new HttpError(409, '這堂課已經完成。');
    const { question } = AskBodySchema.parse(req.body);
    if (storedState(row).asks.length >= MAX_ASKS) throw new HttpError(409, `每堂課最多可以問老師 ${MAX_ASKS} 次,這堂課的次數已經用完了。`);
    if (chatting.has(id)) throw new HttpError(409, '老師正在回覆,請稍候。');

    const user = getUserRow(db, row.user_id);
    if (!user.api_key) throw new AiError('no_key');

    chatting.add(id);
    try {
      const lesson = JSON.parse(row.lesson_json) as Lesson;
      const { answer } = await ai.generateJson({
        tier: 'chat',
        task: 'ask',
        apiKey: user.api_key,
        ...askPrompt({ level: row.level, stage: row.stage, lesson, question }),
        schema: AskReplySchema,
        onUsage: usageRecorder(db, row.user_id),
      });
      const latest = storedState(getSessionRow(db, id));
      latest.asks.push({ question, answer });
      saveState(db, id, latest);
      res.json({ asks: latest.asks });
    } finally {
      chatting.delete(id);
    }
  });

  // 學生手動把某一題或某個生字標為「我不熟」。上課中與課後都可以。
  router.post('/:id/flags', (req, res) => {
    const id = parseId(req.params.id);
    const row = getSessionRow(db, id);
    const { target } = FlagSchema.parse(req.body);
    const lesson = JSON.parse(row.lesson_json) as Lesson;
    const item = flagTarget(lesson, rootId(row), target);
    if (!item) throw new HttpError(400, '這堂課裡沒有這個題目或單字');

    const state = storedState(row);
    if (!state.flags.includes(target)) {
      transaction(db, () => {
        recordMiss(db, {
          userId: row.user_id,
          ...item,
          miss: 'manual',
          sessionId: id,
          date: localDate(),
        });
        state.flags.push(target);
        saveState(db, id, state);
      });
    }
    res.json({ flags: state.flags });
  });

  router.post('/:id/complete', async (req, res) => {
    const id = parseId(req.params.id);
    const row = getSessionRow(db, id);
    if (row.status === 'completed') {
      res.json(toView(db, row));
      return;
    }
    if (completing.has(id)) throw new HttpError(409, '老師正在批改,請稍候。');

    const body = z.object({ state: SessionStateSchema }).parse(req.body);
    const state = withServerFields(body.state, storedState(row));
    // 先把作答存起來:批改失敗時(例如額度用完),學生寫的內容不會遺失,之後可以再送一次。
    saveState(db, id, state);

    completing.add(id);
    try {
      const lesson = JSON.parse(row.lesson_json) as Lesson;
      const review = JSON.parse(row.review_json) as ReviewItemView[];
      const writing = state.writing.trim();
      const talked = state.chat.some((turn) => turn.role === 'student');
      let grade: Grade | null = null;

      // 寫作與對話合併成一次批改。兩者都沒做就不呼叫 AI,各以 0 分計。
      if (writing || talked) {
        const user = getUserRow(db, row.user_id);
        if (!user.api_key) throw new AiError('no_key');
        const objectiveSections = buildSessionResult(lesson, state, null, review).sections.filter(
          (s) => s.section !== 'writing' && s.section !== 'speaking',
        );
        const gradingStartedAt = Date.now();
        grade = await ai.generateJson({
          tier: 'quality',
          task: 'grade',
          apiKey: user.api_key,
          ...gradePrompt({ level: row.level, stage: row.stage, lesson, writing, chat: talked ? state.chat : [], objectiveSections }),
          schema: GradeSchema,
          onUsage: usageRecorder(db, row.user_id),
        });
        recordTaskTiming(db, 'grade', Date.now() - gradingStartedAt);
      }

      const result = buildSessionResult(lesson, state, grade, review);
      const today = localDate();
      const exercisesByKey = new Map(lessonExercises(lesson).map((item) => [item.key, item]));

      // 分數、弱點項目與複習結果要嘛全部寫入,要嘛都不寫,避免課程完成了但弱點沒記到。
      transaction(db, () => {
        db.prepare(
          `UPDATE sessions SET status = 'completed', score = ?, result_json = ?, local_date = ?, completed_at = datetime('now') WHERE id = ?`,
        ).run(result.score, JSON.stringify(result), today, id);

        // 這堂課新出現的弱點 → 進入項目庫。
        for (const point of result.weakPoints) {
          if (point.key === null) {
            // AI 批改找出的錯誤,來源是寫作或對話。
            const kind = point.kind === 'speaking' ? 'speaking' : 'writing';
            const item = correctionItem(kind, point.label, point.answer, point.explanation);
            recordMiss(db, { userId: row.user_id, kind, ...item, miss: point.outcome, sessionId: id, date: today });
            continue;
          }
          const exercise = exercisesByKey.get(point.key);
          if (!exercise) continue; // 暖身複習的題目,在下面依複習結果處理
          recordMiss(db, {
            userId: row.user_id,
            kind: exercise.kind,
            itemKey: itemKeyForExercise(exercise, rootId(row)),
            content: contentForExercise(exercise),
            miss: point.outcome,
            sessionId: id,
            date: today,
          });
        }

        // 暖身複習的每一題 → 依結果拉長或歸零間隔。
        const reviewItems = reviewExercises(review);
        review.forEach((item, index) => {
          const exercise = reviewItems[index]!;
          recordReviewResult(db, item.id, gradeExercise(exercise.exercise, state.answers[exercise.key]).outcome, id, today);
        });
      });

      res.json(toView(db, getSessionRow(db, id)));
      // 開課時的背景準備如果失敗了(例如模型忙線),上完課時再試一次。
      const owner = getUserRow(db, row.user_id);
      if (owner.api_key) preparer.replenish({ id: owner.id, level: owner.level, stage: owner.stage, apiKey: owner.api_key }, row.minutes);
    } finally {
      completing.delete(id);
    }
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const row = getSessionRow(db, id);
    if (row.status !== 'in_progress') throw new HttpError(409, '已完成的課不能刪除。');
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    res.status(204).end();
  });

  return router;
}
