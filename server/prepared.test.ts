import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PreparedStatus } from '../shared/api.ts';
import { lessonExercises, type Exercise } from '../shared/lesson.ts';
import { SessionStateSchema, type Lesson, type SessionState, type SessionView } from '../shared/schema.ts';
import { LEVEL_GUIDES } from './ai/cefr.ts';
import { createMockProvider } from './ai/mock.ts';
import { MOCK_FIXTURES, MOCK_LESSON } from './ai/mockData.ts';
import { AiError, type AiJsonRequest, type AiProvider } from './ai/provider.ts';
import { createApp } from './app.ts';
import { openDb, type Db } from './db.ts';

// 預先備課:開始上一堂課時,在背景把下一堂準備好;下次按開始直接取用,不必等 AI。

let db: Db;
let server: Server;
let base: string;
/** 「產生課程」被呼叫了幾次(現場產生與背景準備都算)。 */
let lessonCalls: number;
/** 每次產生課程時送給 AI 的提示。 */
let lessonPrompts: string[];
/** 第幾次「產生課程」要失敗(額度用完);null 表示都成功。 */
let failOnCall: number | null;
/** 設定之後,「產生課程」會停在半路,直到呼叫 release();用來模擬 AI 還沒回應。 */
let gate: { wait: Promise<void>; release: () => void } | null;

/** 第 n 堂課:課文與單字都和其他堂完全不同,不會觸發重覆檢查的重新產生。 */
function lessonNumber(n: number): Lesson {
  const lesson = structuredClone(MOCK_LESSON);
  lesson.title = `Lesson ${n}`;
  lesson.passage.text = Array.from({ length: 40 }, (_, i) => `w${n}x${i}`).join(' ') + '.';
  lesson.vocab = lesson.vocab.map((vocab, i) => ({ ...vocab, word: `word${n}n${i}` }));
  return lesson;
}

function provider(): AiProvider {
  const inner = createMockProvider({ ...MOCK_FIXTURES, lesson: () => lessonNumber(lessonCalls) });
  return {
    ...inner,
    async generateJson<T>(request: AiJsonRequest<T>): Promise<T> {
      if (request.task === 'lesson') {
        lessonCalls++;
        lessonPrompts.push(request.input);
        if (gate) await gate.wait;
        if (lessonCalls === failOnCall) throw new AiError('quota', 'RESOURCE_EXHAUSTED');
      }
      return inner.generateJson(request);
    },
  };
}

function closeGate(): void {
  let release!: () => void;
  const wait = new Promise<void>((done) => {
    release = done;
  });
  gate = {
    wait,
    release: () => {
      gate = null;
      release();
    },
  };
}

async function listen(prepareAhead = true): Promise<void> {
  const app = createApp({ db, ai: provider(), prepareAhead });
  server = await new Promise<Server>((done) => {
    const listening = app.listen(0, '127.0.0.1', () => done(listening));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
}

beforeEach(async () => {
  lessonCalls = 0;
  lessonPrompts = [];
  failOnCall = null;
  gate = null;
  db = openDb(':memory:');
  await listen();
});

afterEach(async () => {
  gate?.release();
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

async function newUser(name = '小明'): Promise<number> {
  const user = (await call('POST', '/users', { name, stage: 'junior' })).json;
  await call('PUT', `/users/${user.id}/api-key`, { apiKey: 'key' });
  return user.id;
}

const status = async (userId: number): Promise<PreparedStatus> => (await call('GET', `/sessions/prepared?userId=${userId}`)).json;

/** 等背景準備做完(成功或失敗),回傳之後的狀態。 */
async function settled(userId: number): Promise<PreparedStatus> {
  for (let i = 0; i < 200; i++) {
    const current = await status(userId);
    if (current.state !== 'preparing') return current;
    await new Promise((done) => setTimeout(done, 5));
  }
  throw new Error('背景準備一直沒有結束');
}

async function start(userId: number, minutes: 20 | 30 | 40 = 30): Promise<SessionView> {
  const res = await call('POST', '/sessions', { userId, minutes });
  expect(res.status).toBe(201);
  return res.json;
}

const correct = (exercise: Exercise): string =>
  exercise.type === 'mcq' ? String(exercise.answerIndex) : exercise.type === 'cloze' ? exercise.answers[0]! : exercise.type === 'flashcard' ? 'known' : exercise.sentence;

async function finish(session: SessionView): Promise<SessionView> {
  const answers = Object.fromEntries(lessonExercises(session.lesson).map(({ key, exercise }) => [key, { attempts: [correct(exercise)], hintUsed: false }]));
  const state: SessionState = { ...SessionStateSchema.parse({}), answers, chatUnavailable: true };
  const res = await call('POST', `/sessions/${session.id}/complete`, { state });
  expect(res.status).toBe(200);
  return res.json;
}

describe('預先備課', () => {
  it('第一堂課只能現場產生;課一開始,就在背景備好同樣長度的下一堂', async () => {
    const userId = await newUser();
    expect(await status(userId)).toEqual({ state: 'none', minutes: null });

    const first = await start(userId, 30);
    expect(first.lesson.title).toBe('Lesson 1');
    expect(await settled(userId)).toEqual({ state: 'ready', minutes: 30 });
    expect(lessonCalls).toBe(2);
  });

  // 這是整個功能的目的:按下開始時不用等 AI。
  it('下一次開課直接取用備好的課,不必等 AI 產生', async () => {
    const userId = await newUser();
    await finish(await start(userId));
    await settled(userId);

    // 讓之後任何「產生課程」的呼叫都卡住:如果開課還需要等 AI,這個請求就不會回來。
    closeGate();
    const second = await start(userId);
    expect(second.lesson.title).toBe('Lesson 2');
    expect(second.status).toBe('in_progress');
    // 取用之後,又開始在背景準備再下一堂。
    expect((await status(userId)).state).toBe('preparing');
  });

  it('備好的課和現場產生的課一樣:主題與文法重點往下輪替,並做過重覆檢查', async () => {
    const userId = await newUser();
    await finish(await start(userId));
    await settled(userId);
    const second = await start(userId);

    const topic = (prompt: string) => prompt.match(/^Topic: (.*)$/m)![1];
    const grammar = (prompt: string) => prompt.match(/must be exactly this one: (.*?)\. Do not choose/)![1];
    expect(topic(lessonPrompts[1]!)).not.toBe(topic(lessonPrompts[0]!));
    expect(lessonPrompts.slice(0, 2).map(grammar)).toEqual(LEVEL_GUIDES.A2.grammar.slice(0, 2));
    // 準備第二堂時,第一堂的單字已經列入避開的清單。
    expect(lessonPrompts[1]).toContain('word1n0');
    expect(second.novelty).toMatchObject({ compared: 1, regenerated: false });
  });

  // 如果這時另外再現場產生一份,會白白多用一次額度,而且兩份會挑到同一個主題。
  it('背景還在準備時按開始:等它做完並使用那一份,不會同時再產生一份', async () => {
    const userId = await newUser();
    const first = await start(userId);
    await settled(userId);
    await finish(first);
    await start(userId); // 用掉備好的第 2 堂;背景開始準備第 3 堂
    await settled(userId);
    await call('DELETE', `/sessions/${(await call('GET', `/sessions/current?userId=${userId}`)).json.id}`);

    // 第 3 堂已備好。用掉它,並讓第 4 堂的背景準備卡住。
    closeGate();
    const third = await start(userId);
    expect(third.lesson.title).toBe('Lesson 3');
    await finish(third);
    const callsWhilePreparing = lessonCalls;

    const pending = start(userId); // 第 4 堂還在準備中
    await new Promise((done) => setTimeout(done, 30));
    expect(lessonCalls).toBe(callsWhilePreparing); // 沒有另外發出產生課程的呼叫
    gate!.release();
    expect((await pending).lesson.title).toBe('Lesson 4');
  });

  it('放棄正在上的課,備好的下一堂仍然保留', async () => {
    const userId = await newUser();
    const first = await start(userId);
    await settled(userId);
    await call('DELETE', `/sessions/${first.id}`);

    expect(await status(userId)).toEqual({ state: 'ready', minutes: 30 });
    expect((await start(userId)).lesson.title).toBe('Lesson 2');
  });

  it('重上舊課不會用掉備好的下一堂', async () => {
    const userId = await newUser();
    const first = await finish(await start(userId));
    await settled(userId);
    const before = lessonCalls;

    expect((await call('POST', `/sessions/${first.id}/retake`)).status).toBe(201);
    expect(await status(userId)).toEqual({ state: 'ready', minutes: 30 });
    expect(lessonCalls).toBe(before);
  });

  it('每位使用者各自備課,互不影響', async () => {
    const a = await newUser('小明');
    const b = await newUser('小華');
    await start(a);
    await settled(a);
    expect((await status(a)).state).toBe('ready');
    expect((await status(b)).state).toBe('none');
  });
});

describe('備好的課不適用的情況', () => {
  // 備好的課是照當時選的長度產生的,題數與課文長度都不一樣,不能拿來充數。
  it('這次選了不同的課程長度:丟掉備好的那一份,現場產生,並改備新長度的下一堂', async () => {
    const userId = await newUser();
    await finish(await start(userId, 30));
    await settled(userId);
    const before = lessonCalls;

    const second = await start(userId, 20);
    expect(second.minutes).toBe(20);
    expect(second.lesson.title).toBe(`Lesson ${before + 1}`); // 現場產生的新課,不是備好的第 2 堂
    expect(await settled(userId)).toEqual({ state: 'ready', minutes: 20 });
  });

  // 備好的課是舊等級的難度;升級後還拿它來上,等於沒升級。
  it('等級改過之後:備好的課視為不存在,開課時照新等級現場產生', async () => {
    const userId = await newUser();
    await finish(await start(userId));
    await settled(userId);

    await call('PATCH', `/users/${userId}`, { level: 'B1' });
    expect(await status(userId)).toEqual({ state: 'none', minutes: null });

    const second = await start(userId);
    expect(second.level).toBe('B1');
    expect(lessonPrompts.at(-1)).toContain('CEFR level: B1');
  });
});

describe('背景準備失敗', () => {
  // 額度用完或模型忙線時,正在上的課不該受影響,也不該默默留下一堂壞掉的課。
  it('不影響正在上的課;上完課時再試一次', async () => {
    const userId = await newUser();
    failOnCall = 2; // 第 1 次是現場產生這堂課,第 2 次是開課後的背景準備
    const first = await start(userId);
    expect(first.lesson.title).toBe('Lesson 1');
    expect(await settled(userId)).toEqual({ state: 'none', minutes: null });
    expect((await call('GET', `/sessions/${first.id}`)).json.status).toBe('in_progress');

    // 上完課時再試一次(第 3 次呼叫),這次成功。
    await finish(first);
    expect(await settled(userId)).toEqual({ state: 'ready', minutes: 30 });
    expect(lessonCalls).toBe(3);
  });

  it('兩次機會都沒備好的話,下次開課照常現場產生', async () => {
    const userId = await newUser();
    failOnCall = 2;
    const first = await start(userId); // 第 1 次:現場產生;第 2 次:背景準備失敗
    await settled(userId);
    await call('DELETE', `/sessions/${first.id}`); // 放棄這堂課,所以也沒有「上完課時再試一次」

    const second = await start(userId); // 第 3 次:沒有備好的課,現場產生
    expect(second.lesson.title).toBe('Lesson 3');
    expect(await settled(userId)).toEqual({ state: 'ready', minutes: 30 }); // 第 4 次:這次背景準備成功
    expect(lessonCalls).toBe(4);
  });
});

describe('額度與設定', () => {
  // 預先備課是把「產生課程」提前到上一堂課時做,不是多做一次:
  // 上 N 堂課總共產生 N+1 堂(最後一堂是替下一次備好的)。
  it('連上三堂課,總共只產生四堂:每堂一次,加上替下一次備好的一堂', async () => {
    const userId = await newUser();
    for (let i = 0; i < 3; i++) {
      await finish(await start(userId));
      await settled(userId);
    }
    expect(lessonCalls).toBe(4);
  });

  it('關閉預先備課時,開課不會多產生一堂', async () => {
    await new Promise((done) => server.close(done));
    await listen(false);
    const userId = await newUser();
    await finish(await start(userId));

    expect(lessonCalls).toBe(1);
    expect(await status(userId)).toEqual({ state: 'none', minutes: null });
  });

  // 上完課就關掉程式是很常見的用法;備好的課要留到下次啟動。
  it('備好的課存在資料庫裡,程式重新啟動後仍然可以直接取用', async () => {
    const userId = await newUser();
    await finish(await start(userId));
    await settled(userId);
    const before = lessonCalls;

    await new Promise((done) => server.close(done));
    await listen(); // 新的伺服器,記憶體裡沒有任何狀態
    expect(await status(userId)).toEqual({ state: 'ready', minutes: 30 });
    closeGate();
    expect((await start(userId)).lesson.title).toBe('Lesson 2');
    expect(before).toBe(2);
  });

  it('刪除使用者時一併刪除替他備好的課', async () => {
    const userId = await newUser();
    await start(userId);
    await settled(userId);
    await call('DELETE', `/users/${userId}`);
    expect((db.prepare('SELECT COUNT(*) AS n FROM prepared_lessons').get() as { n: number }).n).toBe(0);
  });

  it('沒有設定 API key 的使用者不會在背景備課', async () => {
    const user = (await call('POST', '/users', { name: '沒有 key', stage: 'junior' })).json;
    expect((await call('POST', '/sessions', { userId: user.id, minutes: 30 })).status).toBe(400);
    expect(lessonCalls).toBe(0);
    expect(await status(user.id)).toEqual({ state: 'none', minutes: null });
  });
});
