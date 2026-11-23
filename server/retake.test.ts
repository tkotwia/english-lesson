import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CalendarMonth, ProgressSummary } from '../shared/api.ts';
import { localDate, monthOf, previousMonth } from '../shared/dates.ts';
import { FLASHCARD_KNOWN, lessonExercises, type Exercise } from '../shared/lesson.ts';
import { SessionStateSchema, type ExerciseAnswer, type Lesson, type SessionResult, type SessionState, type SessionView } from '../shared/schema.ts';
import { LEVEL_GUIDES, STAGE_GUIDES } from './ai/cefr.ts';
import { createMockProvider } from './ai/mock.ts';
import { MOCK_FIXTURES, MOCK_LESSON } from './ai/mockData.ts';
import { AiError, type AiJsonRequest, type AiProvider } from './ai/provider.ts';
import { createApp } from './app.ts';
import { openDb, type Db } from './db.ts';

let db: Db;
let server: Server;
let base: string;
/** 每一次「產生課程」請求送給 AI 的提示文字。 */
let lessonPrompts: string[];
/** 接下來幾次「產生課程」要回傳的內容;Error 代表那次呼叫失敗。用完之後回傳假資料課程。 */
let lessonQueue: (Lesson | Error)[];

const TODAY = localDate();
const LAST_MONTH = previousMonth(monthOf(TODAY));

function provider(): AiProvider {
  const inner = createMockProvider({
    ...MOCK_FIXTURES,
    lesson: () => {
      const next = lessonQueue.shift() ?? MOCK_LESSON;
      if (next instanceof Error) throw next;
      return next;
    },
  });
  return {
    ...inner,
    generateJson<T>(request: AiJsonRequest<T>): Promise<T> {
      if (request.task === 'lesson') lessonPrompts.push(request.input);
      return inner.generateJson(request);
    },
  };
}

async function listen(): Promise<void> {
  const app = createApp({ db, ai: provider() });
  server = await new Promise<Server>((done) => {
    const listening = app.listen(0, '127.0.0.1', () => done(listening));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
}

beforeEach(async () => {
  lessonPrompts = [];
  lessonQueue = [];
  db = openDb(':memory:');
  await listen();
});

afterEach(async () => {
  await new Promise((done) => server.close(done));
  db.close();
});

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

async function newUser(stage = 'junior', level?: string): Promise<number> {
  const user = (await call('POST', '/users', { name: '小明', stage, level })).json;
  await call('PUT', `/users/${user.id}/api-key`, { apiKey: 'key' });
  return user.id;
}

function correctResponse(exercise: Exercise): string {
  switch (exercise.type) {
    case 'mcq':
      return String(exercise.answerIndex);
    case 'cloze':
      return exercise.answers[0]!;
    case 'reorder':
    case 'dictation':
    case 'readAloud':
    case 'rewrite':
      return exercise.sentence;
    case 'flashcard':
      return FLASHCARD_KNOWN;
  }
}

const WRONG_TWICE: ExerciseAnswer = { attempts: ['zzz', 'yyy'], hintUsed: false };

async function start(userId: number): Promise<SessionView> {
  const res = await call('POST', '/sessions', { userId, minutes: 30 });
  expect(res.status).toBe(201);
  return res.json;
}

/** 把一堂課做完。沒有覆蓋的題目都第一次就答對;不寫作、不對話。 */
async function finish(session: SessionView, overrides: Record<string, ExerciseAnswer> = {}): Promise<SessionView> {
  const answers = Object.fromEntries(lessonExercises(session.lesson).map(({ key, exercise }) => [key, { attempts: [correctResponse(exercise)], hintUsed: false }]));
  const state: SessionState = { ...SessionStateSchema.parse({}), answers: { ...answers, ...overrides }, chatUnavailable: true };
  const res = await call('POST', `/sessions/${session.id}/complete`, { state });
  expect(res.status).toBe(200);
  return res.json;
}

const takeLesson = async (userId: number, overrides: Record<string, ExerciseAnswer> = {}) => finish(await start(userId), overrides);

async function retake(sessionId: number): Promise<SessionView> {
  const res = await call('POST', `/sessions/${sessionId}/retake`);
  expect(res.status).toBe(201);
  return res.json;
}

/** 以假資料課程為底,換掉課文、標題與重點單字,做出一堂「不一樣的課」。 */
function lessonWith(title: string, passage: string, words?: string[]): Lesson {
  const lesson = structuredClone(MOCK_LESSON);
  lesson.title = title;
  lesson.passage.text = passage;
  if (words) lesson.vocab = lesson.vocab.map((vocab, index) => ({ ...vocab, word: words[index] ?? vocab.word }));
  return lesson;
}

const SCHOOL = lessonWith(
  'A Day at School',
  'Every morning Tom rides his bike to school. His first class is math, and he likes it because the teacher tells funny stories. At lunch he eats rice with his friends.',
  ['bicycle', 'lesson', 'funny', 'lunch'],
);
const ZOO = lessonWith(
  'Our Trip to the Zoo',
  'On Sunday our class took a bus to the zoo. We watched the monkeys jump between the trees and fed carrots to a tall giraffe. Everyone was sleepy on the way back.',
  ['monkey', 'giraffe', 'feed', 'sleepy'],
);

const novelty = (session: SessionView) => session.novelty!;

describe('重覆檢查:產生新課時和舊課比對', () => {
  it('第一堂課沒有舊課可比,不會重新產生', async () => {
    const userId = await newUser();
    const session = await start(userId);
    expect(novelty(session)).toEqual({ compared: 0, passageSimilarity: 0, similarTo: null, repeatedVocab: [], regenerated: false });
    expect(lessonPrompts).toHaveLength(1);
  });

  it('新課文和舊課明顯不同時:只呼叫 AI 一次,並記下比對結果', async () => {
    const userId = await newUser();
    await takeLesson(userId);
    lessonQueue = [SCHOOL];
    const second = await start(userId);

    expect(lessonPrompts).toHaveLength(2);
    expect(novelty(second)).toMatchObject({ compared: 1, regenerated: false, repeatedVocab: [] });
    expect(novelty(second).passageSimilarity).toBeLessThan(0.05);
  });

  // 這就是「怎麼知道有沒有重覆」的答案:由程式比對,而且抓到了會處理。
  it('新課文和某堂舊課幾乎相同時:重新產生一次,並告訴 AI 是和哪一堂太像', async () => {
    const userId = await newUser();
    const first = await takeLesson(userId);
    lessonQueue = [MOCK_LESSON, SCHOOL]; // 第一次回傳和舊課一樣的內容,第二次才是新的
    const second = await start(userId);

    expect(lessonPrompts).toHaveLength(3);
    expect(lessonPrompts[2]).toContain(`almost identical to an earlier lesson titled "${first.lesson.title}"`);
    expect(second.lesson.title).toBe('A Day at School');
    expect(novelty(second).regenerated).toBe(true);
    expect(novelty(second).passageSimilarity).toBeLessThan(0.05);
  });

  // 只重試一次:重試是用每天很少的品質類額度,不能為了追求不重覆而一直耗。
  it('重新產生後還是很像:不再重試,照實記下高相似度', async () => {
    const userId = await newUser();
    const first = await takeLesson(userId);
    lessonQueue = [MOCK_LESSON, MOCK_LESSON];
    const second = await start(userId);

    expect(lessonPrompts).toHaveLength(3);
    expect(novelty(second)).toMatchObject({ regenerated: true, passageSimilarity: 1 });
    expect(novelty(second).similarTo).toMatchObject({ sessionId: first.id, title: first.lesson.title });
  });

  // 重試時額度剛好用完,不該讓學生連原本那份可以上的課都拿不到。
  it('重新產生時額度用完:沿用第一份課程照常開課,並照實記錄它和舊課很像', async () => {
    const userId = await newUser();
    await takeLesson(userId);
    lessonQueue = [MOCK_LESSON, new AiError('quota', 'RESOURCE_EXHAUSTED')];
    const second = await start(userId);

    expect(second.status).toBe('in_progress');
    expect(novelty(second)).toMatchObject({ regenerated: false, passageSimilarity: 1 });
  });

  it('記下這堂課有哪些重點單字以前已經教過', async () => {
    const userId = await newUser();
    await takeLesson(userId); // 教過 crowded, delicious, share, spend
    lessonQueue = [lessonWith(SCHOOL.title, SCHOOL.passage.text, ['bicycle', 'Share', 'funny', 'spend'])];
    const second = await start(userId);
    expect(novelty(second).repeatedVocab).toEqual(['Share', 'spend']);
  });
});

describe('預防重覆:主題、文法重點與單字由程式安排', () => {
  const topicOf = (prompt: string) => prompt.match(/^Topic: (.*)$/m)![1]!;
  const grammarOf = (prompt: string) => prompt.match(/must be exactly this one: (.*?)\. Do not choose/)![1]!;

  it('連續上課時,主題不重覆,文法重點依清單順序往下', async () => {
    const userId = await newUser();
    lessonQueue = [MOCK_LESSON, SCHOOL, ZOO];
    for (let i = 0; i < 3; i++) await takeLesson(userId);

    expect(new Set(lessonPrompts.map(topicOf)).size).toBe(3);
    for (const prompt of lessonPrompts) expect(STAGE_GUIDES.junior.topics).toContain(topicOf(prompt));
    expect(lessonPrompts.map(grammarOf)).toEqual(LEVEL_GUIDES.A2.grammar.slice(0, 3));
  });

  it('之前所有課的重點單字都會告訴 AI 避開,不只最近幾堂', async () => {
    const userId = await newUser();
    lessonQueue = [MOCK_LESSON, SCHOOL, ZOO];
    for (let i = 0; i < 3; i++) await takeLesson(userId);
    lessonQueue = [lessonWith('Fourth', 'A brand new story about a quiet library and an old clock that never stops ticking at night.')];
    await start(userId);

    const avoid = lessonPrompts[3]!.match(/Do not choose them as target vocabulary: (.*)\./)![1]!;
    for (const word of ['crowded', 'spend', 'bicycle', 'lunch', 'monkey', 'sleepy']) expect(avoid).toContain(word);
  });

  // 文法重點是分等級的:升級後從新等級的第一個開始,舊等級教過什麼不影響。
  it('換了等級之後,文法重點從新等級的清單開始', async () => {
    const userId = await newUser();
    await takeLesson(userId);
    await call('PATCH', `/users/${userId}`, { level: 'B1' });
    lessonQueue = [SCHOOL];
    await start(userId);
    expect(grammarOf(lessonPrompts[1]!)).toBe(LEVEL_GUIDES.B1.grammar[0]);
  });

  // 計畫中的「舊內容回收」。答錯過的字最需要再見面,所以排在只是新學的字前面。
  it('還在學的單字會被帶回下一堂新課的課文裡,答錯過的排最前面', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE }); // crowded → 不會
    lessonQueue = [SCHOOL];
    await start(userId);

    expect(lessonPrompts[0]).not.toContain('still learning these words');
    expect(lessonPrompts[1]).toContain('do not choose them as target vocabulary: crowded, ');
    expect(lessonPrompts[1]).toMatch(/still learning these words[^:]*: crowded, .*delicious/);
  });
});

describe('重上一堂課', () => {
  it('用同一份課文與題目,不需要 AI 重新產生;作答從頭開始', async () => {
    const userId = await newUser();
    const original = await takeLesson(userId, { 'vocab.0': WRONG_TWICE });
    const again = await retake(original.id);

    expect(lessonPrompts).toHaveLength(1);
    expect(again.lesson).toEqual(original.lesson);
    expect(again).toMatchObject({ status: 'in_progress', retakeOf: original.id, level: original.level, minutes: original.minutes, result: null });
    expect(again.state.answers).toEqual({});
    expect(again.state.chat).toEqual([{ role: 'teacher', text: original.lesson.speaking.opening, corrections: [] }]);
  });

  // 題目已經看過,第二次一定比較高分;算進去的話,日曆上的分數就不再代表第一次面對這堂課的表現。
  it('重上的分數不計入當日分數與月平均', async () => {
    const userId = await newUser();
    const original = await takeLesson(userId, { 'vocab.0': WRONG_TWICE, 'vocab.1': WRONG_TWICE, 'reading.0': WRONG_TWICE });
    const perfect = await finish(await retake(original.id));
    expect(perfect.result!.score).toBeGreaterThan(original.result!.score);

    const month: CalendarMonth = (await call('GET', `/calendar?userId=${userId}&month=${monthOf(TODAY)}`)).json;
    const summary: ProgressSummary = (await call('GET', `/progress?userId=${userId}`)).json;
    expect(month.days).toHaveLength(1);
    expect(month.days[0]!.score).toBe(original.result!.score);
    expect(month.average).toBe(original.result!.score);
    expect(summary.todayScore).toBe(original.result!.score);
  });

  it('日曆上,重上的紀錄列在原本那堂課底下', async () => {
    const userId = await newUser();
    const original = await takeLesson(userId);
    const again = await finish(await retake(original.id));

    const month: CalendarMonth = (await call('GET', `/calendar?userId=${userId}&month=${monthOf(TODAY)}`)).json;
    expect(month.days[0]!.sessions).toHaveLength(1);
    expect(month.days[0]!.sessions[0]!.retakes).toEqual([{ id: again.id, date: TODAY, score: again.result!.score }]);
  });

  it('上個月重上拿到的高分,不計入那個月的月平均', async () => {
    const userId = await newUser();
    const result: SessionResult = { score: 80, sections: [], weakPoints: [], writing: null, speaking: null, closing: '' };
    const insert = (score: number, retakeOf: number | null) =>
      Number(
        db
          .prepare(
            `INSERT INTO sessions (user_id, local_date, level, stage, minutes, topic, status, lesson_json, state_json, score, result_json, retake_of)
             VALUES (?, ?, 'A2', 'junior', 30, 'seed', 'completed', ?, '{}', ?, ?, ?)`,
          )
          .run(userId, `${LAST_MONTH}-10`, JSON.stringify(MOCK_LESSON), score, JSON.stringify({ ...result, score }), retakeOf).lastInsertRowid,
      );
    // 第一次 90 分;若把兩次 100 分的重上也算進去,當日平均會是 96.7。
    const original = insert(90, null);
    insert(100, original);
    insert(100, original);

    const month: CalendarMonth = (await call('GET', `/calendar?userId=${userId}&month=${LAST_MONTH}`)).json;
    expect(month.average).toBe(90);
  });

  it('原本那堂課的結果會列出每一次重上的分數', async () => {
    const userId = await newUser();
    const original = await takeLesson(userId);
    const first = await finish(await retake(original.id), { 'vocab.0': WRONG_TWICE });
    const second = await finish(await retake(original.id));

    const view: SessionView = (await call('GET', `/sessions/${original.id}`)).json;
    expect(view.retakeOf).toBeNull();
    expect(view.retakes.map((r) => [r.id, r.score])).toEqual([
      [first.id, first.result!.score],
      [second.id, second.result!.score],
    ]);
  });

  it('重上「重上的課」時,仍然記在最原本那堂課之下', async () => {
    const userId = await newUser();
    const original = await takeLesson(userId);
    const first = await finish(await retake(original.id));
    const second = await retake(first.id);
    expect(second.retakeOf).toBe(original.id);
  });

  it('還有課沒上完時不能重上;還沒上完的課本身也不能重上', async () => {
    const userId = await newUser();
    const original = await takeLesson(userId);
    const inProgress = await retake(original.id);

    const whileBusy = await call('POST', `/sessions/${original.id}/retake`);
    expect(whileBusy.status).toBe(409);
    expect(whileBusy.json.error.message).toContain('還有一堂課沒上完');
    expect((await call('POST', `/sessions/${inProgress.id}/retake`)).status).toBe(409);
  });

  it('重上進行中時,首頁的「繼續上課」會回到重上的那一堂', async () => {
    const userId = await newUser();
    const original = await takeLesson(userId);
    const again = await retake(original.id);
    expect((await call('GET', `/sessions/current?userId=${userId}`)).json.id).toBe(again.id);
  });

  // 同一題閱讀題在原本那堂與重上時都答錯,是同一個弱點錯了兩次,不是兩個弱點。
  it('重上時又答錯同一題:累加在同一個項目上,不會多出一筆', async () => {
    const userId = await newUser();
    const original = await takeLesson(userId, { 'reading.0': WRONG_TWICE });
    await finish(await retake(original.id), { 'reading.0': WRONG_TWICE });

    const reading = db.prepare(`SELECT item_key, wrong_count FROM items WHERE kind = 'reading'`).all() as unknown as { item_key: string; wrong_count: number }[];
    expect(reading).toEqual([{ item_key: `reading:${original.id}:reading.0`, wrong_count: 2 }]);
  });

  // 重上的內容和原本那堂相同;若把它也算成「上過的課」,下一堂新課會被誤判為和它重覆。
  it('重上的課不算進之後新課的比對對象與主題輪替', async () => {
    const userId = await newUser();
    const original = await takeLesson(userId);
    await finish(await retake(original.id));
    lessonQueue = [SCHOOL];
    const next = await start(userId);

    expect(novelty(next).compared).toBe(1);
    expect(next.retakeOf).toBeNull();
  });
});

describe('舊版資料庫', () => {
  // 你的資料庫是在加入「重上」之前建立的。升級程式後,原有的上課紀錄必須原封不動,而且能直接重上。
  it('打開沒有新欄位的舊資料庫時自動補上欄位,原有的課程不變,並且可以重上', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'english-lesson-test-'));
    const path = join(dir, 'english.db');
    try {
      // 用加入「重上」之前的資料表定義建立資料庫,並放進一位使用者與一堂已完成的課。
      const old = new DatabaseSync(path);
      old.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, stage TEXT NOT NULL, level TEXT NOT NULL, api_key TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
        CREATE TABLE sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, local_date TEXT NOT NULL,
          level TEXT NOT NULL, stage TEXT NOT NULL, minutes INTEGER NOT NULL, topic TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'in_progress',
          lesson_json TEXT NOT NULL, review_json TEXT NOT NULL DEFAULT '[]', state_json TEXT NOT NULL, score REAL, result_json TEXT,
          started_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT
        );
        CREATE TABLE api_usage (
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL, model TEXT NOT NULL,
          calls INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, date, model)
        );`);
      old.prepare(`INSERT INTO users (name, stage, level, api_key) VALUES ('舊使用者', 'university', 'B2', 'old-key')`).run();
      const result: SessionResult = { score: 20.5, sections: [], weakPoints: [], writing: null, speaking: null, closing: 'bye' };
      old
        .prepare(
          `INSERT INTO sessions (user_id, local_date, level, stage, minutes, topic, status, lesson_json, state_json, score, result_json)
           VALUES (1, '2026-11-20', 'B2', 'university', 20, 'a life-changing course', 'completed', ?, '{"step":5}', 20.5, ?)`,
        )
        .run(JSON.stringify(MOCK_LESSON), JSON.stringify(result));
      old.prepare(`INSERT INTO api_usage (user_id, date, model, calls, input_tokens, output_tokens) VALUES (1, '2026-11-19', 'gemini-3.8-flash', 1, 1033, 2881)`).run();
      old.close();

      await new Promise((done) => server.close(done));
      db.close();
      db = openDb(path);
      await listen();

      const columns = (db.prepare('PRAGMA table_info(sessions)').all() as unknown as { name: string }[]).map((column) => column.name);
      expect(columns).toEqual(expect.arrayContaining(['retake_of', 'grammar_point', 'novelty_json']));

      const kept: SessionView = (await call('GET', '/sessions/1')).json;
      expect(kept).toMatchObject({ status: 'completed', level: 'B2', topic: 'a life-changing course', retakeOf: null, retakes: [], novelty: null });
      expect(kept.result!.score).toBe(20.5);
      expect(kept.lesson.title).toBe(MOCK_LESSON.title);
      expect((await call('GET', '/users')).json[0]).toMatchObject({ name: '舊使用者', hasApiKey: true });

      const again = await retake(1);
      expect(again).toMatchObject({ retakeOf: 1, level: 'B2', minutes: 20 });

      // 用量表:舊紀錄保留(沒有等待時間,記為 0),新的呼叫可以正常記錄。
      const oldUsage = db.prepare(`SELECT calls, output_tokens, total_ms FROM api_usage WHERE date = '2026-11-19'`).get();
      expect({ ...oldUsage }).toEqual({ calls: 1, output_tokens: 2881, total_ms: 0 });
      expect((await call('POST', '/users/1/api-key/test')).json).toMatchObject({ ok: true });
      expect((db.prepare('SELECT COUNT(*) AS n FROM api_usage').get() as { n: number }).n).toBe(2);

      // 再打開一次不會出錯,也不會重覆加欄位。
      db.close();
      db = openDb(path);
      expect((db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
