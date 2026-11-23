import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PlacementAttempt, PlacementResult, PlacementStatus } from '../shared/api.ts';
import { localDate } from '../shared/dates.ts';
import { bandQuestions, type PlacementAnswers, type PlacementTest } from '../shared/placement.ts';
import type { Level } from '../shared/schema.ts';
import { createMockProvider } from './ai/mock.ts';
import { MOCK_FIXTURES, mockPlacementTest } from './ai/mockData.ts';
import { AiError, type AiJsonRequest, type AiProvider } from './ai/provider.ts';
import { createApp } from './app.ts';
import { openDb, type Db } from './db.ts';
import { BUILTIN_PLACEMENT_TEST } from './placement/builtin.ts';

let db: Db;
let server: Server;
let base: string;
/** 請 AI 出題的次數。 */
let generated = 0;
/** 第幾次出題要失敗(模擬額度用完);0 表示都成功。 */
let failOnCall = 0;
/** 出題時回傳的內容;預設是假資料的測驗。 */
let nextTest: () => unknown = mockPlacementTest;
/** 要不要在背景先備好下一份題目;個別測試可以在開始前改掉,再重新建立伺服器。 */
let prepareAhead = true;

async function listen(): Promise<void> {
  const mock = createMockProvider({ ...MOCK_FIXTURES, placement: () => nextTest() });
  const ai: AiProvider = {
    ...mock,
    generateJson: async <T>(request: AiJsonRequest<T>): Promise<T> => {
      if (request.task === 'placement') {
        generated++;
        if (generated === failOnCall) throw new AiError('quota');
      }
      return mock.generateJson(request);
    },
  };
  const app = createApp({ db, ai, prepareAhead });
  server = await new Promise<Server>((done) => {
    const listening = app.listen(0, '127.0.0.1', () => done(listening));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
}

beforeEach(async () => {
  generated = 0;
  failOnCall = 0;
  nextTest = mockPlacementTest;
  prepareAhead = true;
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

async function newUser(withKey = true): Promise<number> {
  const user = (await call('POST', '/users', { name: '小明', stage: 'junior' })).json;
  if (withKey) await call('PUT', `/users/${user.id}/api-key`, { apiKey: 'key' });
  return user.id;
}

const status = async (userId: number): Promise<PlacementStatus> => (await call('GET', `/placement?userId=${userId}`)).json;
const start = async (userId: number): Promise<PlacementAttempt> => (await call('POST', '/placement', { userId })).json;
const stocked = () => (db.prepare(`SELECT COUNT(*) AS n FROM placement_tests WHERE status = 'ready'`).get() as { n: number }).n;

/** 等背景的出題結束:備好一份,或出題的次數到了(失敗時不會有備好的)。 */
async function settled(calls: number): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (generated >= calls) {
      await new Promise((done) => setTimeout(done, 20));
      return;
    }
    await new Promise((done) => setTimeout(done, 5));
  }
  throw new Error('背景出題沒有結束');
}

/** 指定幾個等級全對,其餘作答過的等級全錯。 */
function answersPassing(test: PlacementTest, passed: Level[]): PlacementAnswers {
  const answers: PlacementAnswers = {};
  for (const band of test.bands) {
    for (const question of bandQuestions(band, true)) {
      answers[question.key] = passed.includes(band.level) ? question.mcq.answerIndex : (question.mcq.answerIndex + 1) % 4;
    }
  }
  return answers;
}

const finish = async (attempt: PlacementAttempt, passed: Level[]): Promise<PlacementResult> =>
  (await call('POST', `/placement/${attempt.id}/complete`, { answers: answersPassing(attempt.test, passed), tts: true })).json;

// 「隨時可以點來做」:不能每次都等 AI 出題。
describe('分級測驗:題目先備好', () => {
  it('第一次測驗用內建的題目,馬上可以開始', async () => {
    const userId = await newUser();
    expect(await status(userId)).toMatchObject({ ready: true, waitSeconds: 0, inProgress: false, results: [] });

    const attempt = await start(userId);
    expect(attempt.source).toBe('builtin');
    expect(attempt.repeatReason).toBeNull();
    expect(attempt.test).toEqual(BUILTIN_PLACEMENT_TEST);
  });

  it('一開始作答,背景就備好下一份;下次測驗直接用那一份,不必等', async () => {
    const userId = await newUser();
    const first = await start(userId);
    await settled(1);
    expect(stocked()).toBe(1);
    await finish(first, []);

    expect(await status(userId)).toMatchObject({ ready: true, waitSeconds: 0 });
    const second = await start(userId);
    expect(second.source).toBe('ai');
    expect(second.repeatReason).toBeNull();
    expect(second.id).not.toBe(first.id);
    // 題目就是 AI 出的那一份;選項的順序由程式打亂過,但每一題的正確答案沒有變。
    const questions = second.test.bands.flatMap((band) => bandQuestions(band, true));
    expect(questions.map((question) => question.mcq.prompt)).toEqual(mockPlacementTest().bands.flatMap((band) => bandQuestions(band, true)).map((question) => question.mcq.prompt));
    expect(questions.every((question) => question.mcq.options[question.mcq.answerIndex] === '(正確)')).toBe(true);
  });

  // 免費額度有限:每次測驗只多出一份備用的題目,不會越出越多。
  it('每開始一次測驗只出一份備用題目', async () => {
    const userId = await newUser();
    await finish(await start(userId), []);
    await settled(1);
    await finish(await start(userId), []);
    await settled(2);
    await new Promise((done) => setTimeout(done, 30));
    expect(generated).toBe(2);
    expect(stocked()).toBe(1);
  });

  it('做到一半離開,再開始時是同一份測驗,不會多用一份題目', async () => {
    const userId = await newUser();
    const first = await start(userId);
    await settled(1);
    expect((await status(userId)).inProgress).toBe(true);
    const again = await start(userId);
    expect(again.id).toBe(first.id);
    expect(stocked()).toBe(1);
  });

  // 背景出題失敗(例如額度用完)不能弄壞正在做的測驗;下次再測時才現場出題。
  it('背景出題失敗不影響這次測驗,下次開始時現場出題', async () => {
    const userId = await newUser();
    failOnCall = 1;
    const first = await start(userId);
    await settled(1);
    expect(stocked()).toBe(0);
    expect((await finish(first, ['A1'])).recommended).toBe('A2');

    expect(await status(userId)).toMatchObject({ ready: false, waitSeconds: 60, repeatsBuiltin: false });
    const second = await start(userId);
    expect(second.source).toBe('ai');
    // 第 1 次是失敗的背景出題,第 2 次是現場出題,第 3 次是這次測驗開始後在背景備的下一份。
    await settled(3);
    expect(generated).toBe(3);
    expect(stocked()).toBe(1);
  });

  // 「隨時可以測」:老師出不了題(忙線、額度用完)時不能卡住。但題目看過了,結果可能偏高,一定要說清楚。
  it('現場出題也失敗時,改用內建的題目並說明原因;不會馬上在背景再試而白白消耗額度', async () => {
    const userId = await newUser();
    failOnCall = 1;
    await finish(await start(userId), []);
    await settled(1);
    failOnCall = 2;
    const attempt = await start(userId);
    expect(attempt.source).toBe('builtin');
    expect(attempt.repeatReason).toContain('額度');
    expect(attempt.test).toEqual(BUILTIN_PLACEMENT_TEST);
    await new Promise((done) => setTimeout(done, 40));
    expect(generated).toBe(2);
  });

  // 長度就是難度的一部分。實測備援模型出的高等級短文只有規定的一半,那樣的題目分不出程度。
  it('AI 出的短文或聽力內容太短時不採用', async () => {
    const userId = await newUser();
    nextTest = () => {
      const test = mockPlacementTest();
      test.bands[4]!.reading.passage = 'Far too short for this level.';
      return test;
    };
    await finish(await start(userId), []);
    await settled(1);
    expect(stocked()).toBe(0);
  });

  // 少一個等級或順序不對的題目,無法由低到高判定,結果會是錯的。
  it('AI 出的題目等級順序不對時不採用', async () => {
    const userId = await newUser();
    nextTest = () => ({ bands: [...mockPlacementTest().bands].reverse() });
    await finish(await start(userId), []);
    await settled(1);
    expect(stocked()).toBe(0);
  });

  // 交給模型的格式不帶數量限制,所以模型可能回傳少一個選項的題目;那會讓那一題比較好猜。
  it('AI 出的題目不符合題數或選項數的規定時不採用', async () => {
    const userId = await newUser();
    nextTest = () => {
      const test = mockPlacementTest();
      test.bands[2]!.grammar[0]!.options = ['only', 'two'];
      return test;
    };
    await finish(await start(userId), []);
    await settled(1);
    expect(stocked()).toBe(0);
  });

  // 免費額度很緊的人會關掉預先備課。那時不該偷偷在背景用額度;下次測驗時再現場出題。
  it('關掉預先備課時不在背景出題,下次測驗才現場出題', async () => {
    await new Promise((done) => server.close(done));
    prepareAhead = false;
    await listen();
    const userId = await newUser();
    await finish(await start(userId), []);
    await new Promise((done) => setTimeout(done, 40));
    expect(generated).toBe(0);
    expect(await status(userId)).toMatchObject({ ready: false, repeatsBuiltin: false });

    const second = await start(userId);
    expect(second.source).toBe('ai');
    expect(generated).toBe(1);
  });

  it('沒有 API key 也能測:只能重複做內建的題目,而且會事先說明', async () => {
    const userId = await newUser(false);
    await finish(await start(userId), []);
    expect(generated).toBe(0);
    expect(await status(userId)).toMatchObject({ ready: true, repeatsBuiltin: true });
    const again = await start(userId);
    expect(again.source).toBe('builtin');
    expect(again.repeatReason).toContain('API key');
  });

  it('記下實際出題花了多久,之後等待時才有預估時間', async () => {
    const userId = await newUser();
    await start(userId);
    await settled(1);
    expect(db.prepare(`SELECT samples FROM task_timings WHERE task = 'placement'`).get()).toEqual({ samples: 1 });
  });
});

describe('分級測驗:結果', () => {
  // 作答與對錯都由伺服器依存好的題目判定,瀏覽器只送「選了第幾個」。
  it('由伺服器判分:通過 A1、A2,B1 沒通過,建議 B1', async () => {
    const userId = await newUser();
    const result = await finish(await start(userId), ['A1', 'A2']);

    expect(result).toMatchObject({ recommended: 'B1', levelBefore: 'A2', date: localDate() });
    expect(result.bands.map((band) => `${band.level}:${band.correct}/${band.total}`)).toEqual(['A1:8/8', 'A2:8/8', 'B1:0/8']);
  });

  // 測驗只是建議。等級突然被改掉,下一堂課的難度會讓學生措手不及。
  it('測驗不會自動更改等級', async () => {
    const userId = await newUser();
    await finish(await start(userId), ['A1', 'A2', 'B1', 'B2']);
    expect((await call('GET', '/users')).json[0].level).toBe('A2');
  });

  it('做過的測驗由新到舊列出', async () => {
    const userId = await newUser();
    await finish(await start(userId), ['A1']);
    await settled(1);
    await finish(await start(userId), ['A1', 'A2', 'B1']);
    const { results } = await status(userId);
    expect(results.map((result) => result.recommended)).toEqual(['B2', 'A2']);
  });

  it('同一份測驗重複交卷,結果不變', async () => {
    const userId = await newUser();
    const attempt = await start(userId);
    const first = await finish(attempt, ['A1']);
    const again = await finish(attempt, ['A1', 'A2', 'B1']);
    expect(again).toEqual(first);
  });

  it('找不到的測驗、別人的資料', async () => {
    expect((await call('POST', '/placement/999/complete', { answers: {}, tts: true })).status).toBe(404);
    expect((await call('GET', '/placement?userId=999')).status).toBe(404);
  });

  it('刪除使用者時,他的測驗紀錄也一併刪除', async () => {
    const userId = await newUser();
    await finish(await start(userId), []);
    await settled(1);
    await call('DELETE', `/users/${userId}`);
    expect((db.prepare('SELECT COUNT(*) AS n FROM placement_tests').get() as { n: number }).n).toBe(0);
  });
});
