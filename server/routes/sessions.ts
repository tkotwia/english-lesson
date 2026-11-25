import express from 'express';
import { z } from 'zod';
import { FlagSchema, type LessonAudioInfo } from '../../shared/api.ts';
import { localDate } from '../../shared/dates.ts';
import { lessonExercises, reviewExercises, type ReviewItemView } from '../../shared/lesson.ts';
import { buildSessionResult, gradeExercise, isSkipped, wrongResponses } from '../../shared/scoring.ts';
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
import { askPrompt, chatPrompt, gradePrompt, lessonLivePrompt } from '../ai/prompts.ts';
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
  recordLearned,
  recordMiss,
  postponeReview,
  recordReviewResult,
  type ItemContent,
} from '../items.ts';
import type { LessonStudent } from '../lessons.ts';
import type { LiveSessions } from '../liveSessions.ts';
import { lessonTexts, type LessonAudio } from '../lessonAudio.ts';
import { createPreparer } from '../prepared.ts';
import { recordTaskTiming, taskTimings } from '../timings.ts';
import { pickVideo } from '../videos.ts';
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

/**
 * 暖身複習的題數上限,依課程長度而定:每堂新單字數(20 分鐘 5 個,25 與 30 分鐘 6 個,40 分鐘 8 個)的 4 倍。
 * 每個新單字之後至少要複習 4 次(1、4、16、64 天),所以每天上課的話,到期的題數大約就是新單字的 4 倍;
 * 上限低於這個數字,複習會越積越多。超過上限的留在「回顧」頁的複習練習。
 */
const REVIEW_LIMIT: Record<Minutes, number> = { 20: 20, 25: 24, 30: 24, 40: 32 };

/** 原本那堂課的編號:重上的課回傳它重上的對象,否則是自己。 */
const rootId = (row: SessionRow): number => row.retake_of ?? row.id;

/** 往回找幾堂課來取得「上次的流暢度成績」。 */
const FLUENCY_LOOKBACK = 10;

/**
 * 課前流暢度練習要用的上一課:這位使用者在這堂課之前上完的最近一堂(不含重上的課,也不是這堂課重上的對象,
 * 否則重溫的課文就是今天要上的那一篇)。同時附上最近一次有紀錄的成績,讓學生和自己比。
 */
function previousLessonRow(db: Db, row: SessionRow): { lesson_json: string; level: Level } | undefined {
  return db
    .prepare(
      `SELECT lesson_json, level FROM sessions
       WHERE user_id = ? AND status = 'completed' AND retake_of IS NULL AND id < ? AND id != ?
       ORDER BY id DESC LIMIT 1`,
    )
    .get(row.user_id, row.id, rootId(row)) as { lesson_json: string; level: Level } | undefined;
}

function previousLesson(db: Db, row: SessionRow): SessionView['previous'] {
  const earlier = previousLessonRow(db, row);
  if (!earlier) return null;
  const lesson = JSON.parse(earlier.lesson_json) as Lesson;

  const states = db
    .prepare(`SELECT state_json FROM sessions WHERE user_id = ? AND status = 'completed' AND id < ? ORDER BY id DESC LIMIT ?`)
    .all(row.user_id, row.id, FLUENCY_LOOKBACK) as unknown as { state_json: string }[];
  const records = states.map((state) => SessionStateSchema.parse(JSON.parse(state.state_json)).fluency);
  return {
    title: lesson.title,
    text: lesson.passage.text,
    lastReadingWpm: records.find((record) => record.readingWpm !== null)?.readingWpm ?? null,
    lastRetellWords: records.find((record) => record.retellWords !== null)?.retellWords ?? null,
  };
}

/** 這是學生在這個等級上的第幾堂課(重上的課算它原本那一堂)。用來讓每堂課後建議的影片都不一樣。 */
function lessonNumber(db: Db, row: SessionRow): number {
  const counted = db
    .prepare(`SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND level = ? AND retake_of IS NULL AND status = 'completed' AND id <= ?`)
    .get(row.user_id, row.level, rootId(row)) as { n: number };
  return counted.n;
}

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
    previous: previousLesson(db, row),
    video: row.status === 'completed' ? pickVideo(row.level, row.stage, lessonNumber(db, row)) : null,
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
  /** 是否使用內建的起始課;沒指定就是使用。 */
  starters?: boolean;
  /** 進行中的即時語音對話。 */
  live: LiveSessions;
  /** 聽力課文與聽寫句子的音檔;沒有提供時全部由瀏覽器朗讀。 */
  audio?: LessonAudio;
}

export function sessionsRouter(db: Db, ai: AiProvider, options: SessionsOptions): express.Router {
  const router = express.Router();
  const preparer = createPreparer(db, ai, {
    enabled: options.prepareAhead,
    starters: options.starters,
    // 課備好了就接著做它的聽力音檔,等學生開始上那堂課時多半已經做好。
    onPrepared: (userId) => options.audio?.ensure(userId),
  });
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

  // 下一堂課現在能不能馬上開始、要等多久:開始上課的畫面用它決定顯示「開始」、進度條還是「備課」。
  router.get('/prepared', (req, res) => {
    const user = getUserRow(db, parseId(req.query.userId));
    res.json(preparer.status(user));
  });

  // 「備課」按鈕:把下一堂課備好才回應。備不成(額度用完、模型忙線)時回報錯誤,畫面會說明原因。
  router.post('/prepare', async (req, res) => {
    const { userId } = NewSessionSchema.parse(req.body);
    const user = getUserRow(db, userId);
    if (!user.api_key) throw new AiError('no_key');
    await preparer.prepare({ id: user.id, level: user.level, stage: user.stage, apiKey: user.api_key });
    res.json(preparer.status(user));
  });

  // 等 AI 產生課程或批改時,預估要等幾秒(由過去實際花費的時間推估)。
  router.get('/timings', (_req, res) => {
    res.json(taskTimings(db));
  });

  router.post('/', async (req, res) => {
    const { userId } = NewSessionSchema.parse(req.body);
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
      // 依序嘗試:備好的課 → 內建的起始課 → 請 AI 現場產生(只有這種情況需要等)。
      // 長度由學習階段決定;起始課是 20 分鐘的份量,所以以拿到的這堂課為準。
      const { made } = await preparer.obtain(student);
      const minutes = made.minutes;
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
      // 這堂課開始了,趁上課的這段時間在背景把下一堂課準備好。
      preparer.replenish(student);
    } finally {
      generating.delete(userId);
    }
  });

  router.get('/:id', (req, res) => {
    res.json(toView(db, getSessionRow(db, parseId(req.params.id))));
  });

  // 重上一堂已經完成的課:用同一份課文與題目,不需要 AI 重新產生。
  // 重上只當練習,分數不計入日曆與月平均;不會 / 不熟的項目照常更新。
  /** 這堂課的聽力課文、聽寫句子與「重聽上一課」的課文裡,已經有音檔的那些。 */
  function lessonAudio(row: SessionRow): LessonAudioInfo {
    if (!options.audio) return { clips: {}, working: false };
    const texts = lessonTexts(JSON.parse(row.lesson_json) as Lesson, row.level);
    const previous = previousLessonRow(db, row);
    if (previous) texts.push({ text: (JSON.parse(previous.lesson_json) as Lesson).passage.text, level: previous.level });
    return options.audio.info(row.user_id, texts);
  }

  router.get('/:id/audio', (req, res) => {
    res.json(lessonAudio(getSessionRow(db, parseId(req.params.id))));
  });

  // 網頁一進入這堂課、之後每換一個步驟都會呼叫一次:請背景把還缺的音檔做出來,並回報目前有哪些。
  // 起始課與現場產生的課是從這裡開始做的(聽力通常在幾分鐘後才開始);先前因為額度而停下來的也在這裡重試。
  // 和單純詢問(GET)分開,是為了讓網頁在等待時可以反覆詢問,而不會每問一次就重試一次。
  router.post('/:id/audio', (req, res) => {
    const row = getSessionRow(db, parseId(req.params.id));
    if (row.status === 'in_progress') options.audio?.ensure(row.user_id);
    res.json(lessonAudio(row));
  });

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

  // 情境對話改用即時語音進行:學生直接說,老師用聲音回答。
  // 每一次來回的文字稿由伺服器記進這堂課的對話紀錄,之後照原本的方式批改。輪數和打字的對話共用同一個上限。
  router.post('/:id/live', async (req, res) => {
    const id = parseId(req.params.id);
    const row = getSessionRow(db, id);
    if (row.status !== 'in_progress') throw new HttpError(409, '這堂課已經完成。');
    const state = storedState(row);
    const turnLimit = CHAT_TURNS[row.minutes];
    const used = state.chat.filter((turn) => turn.role === 'student').length;
    if (used >= turnLimit) throw new HttpError(409, '這次的對話已經結束了。');

    const user = getUserRow(db, row.user_id);
    const lesson = JSON.parse(row.lesson_json) as Lesson;
    const info = await options.live.start(
      { id: user.id, level: row.level, stage: row.stage, apiKey: user.api_key },
      {
        prompt: lessonLivePrompt({ level: row.level, stage: row.stage, lesson, chat: state.chat, turnsLeft: turnLimit - used }),
        topic: lesson.speaking.scenario,
        turns: turnLimit - used,
        onExchange: ({ student, teacher }) => {
          // 每次都重新讀取最新的進度再寫入:對話進行的期間,瀏覽器可能存過別的作答。
          const latest = getSessionRow(db, id);
          const current = storedState(latest);
          const spoken = () => current.chat.filter((turn) => turn.role === 'student').length;
          // 沒有聽到學生說話的內容(只有雜音)時不算一輪,也不記進紀錄;課已經交卷了也不再寫入。
          if (student !== '' && latest.status === 'in_progress' && spoken() < turnLimit) {
            current.chat.push({ role: 'student', text: student, corrections: [] }, { role: 'teacher', text: teacher, corrections: [] });
            saveState(db, id, current);
          }
          return latest.status === 'in_progress' ? turnLimit - spoken() : 0;
        },
      },
    );
    res.status(201).json(info);
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
            responses: wrongResponses(exercise.exercise, state.answers[exercise.key]),
          });
        }

        // 第一次就答對的新單字也要進入間隔複習:當下答對不代表之後還記得。
        const weakKeys = new Set(result.weakPoints.map((point) => point.key));
        for (const exercise of exercisesByKey.values()) {
          if (exercise.kind !== 'vocab' || weakKeys.has(exercise.key)) continue;
          recordLearned(db, {
            userId: row.user_id,
            kind: 'vocab',
            itemKey: itemKeyForExercise(exercise, rootId(row)),
            content: contentForExercise(exercise),
            sessionId: id,
            date: today,
          });
        }

        // 暖身複習的每一題 → 依結果拉長或歸零間隔。
        const reviewItems = reviewExercises(review);
        review.forEach((item, index) => {
          const exercise = reviewItems[index]!;
          const answer = state.answers[exercise.key];
          if (isSkipped(exercise.exercise, answer)) postponeReview(db, item.id, today);
          else recordReviewResult(db, item.id, gradeExercise(exercise.exercise, answer).outcome, id, today, wrongResponses(exercise.exercise, answer));
        });
      });

      res.json(toView(db, getSessionRow(db, id)));
      // 開課時的背景準備如果失敗了(例如模型忙線),上完課時再試一次。
      const owner = getUserRow(db, row.user_id);
      if (owner.api_key) preparer.replenish({ id: owner.id, level: owner.level, stage: owner.stage, apiKey: owner.api_key });
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
