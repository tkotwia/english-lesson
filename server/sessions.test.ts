import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FLASHCARD_KNOWN, lessonExercises, type Exercise } from '../shared/lesson.ts';
import { SessionStateSchema, type ExerciseAnswer, type SessionState, type SessionView, type SettingsStatus } from '../shared/schema.ts';
import { createMockProvider, type MockFixtures } from './ai/mock.ts';
import { AiError, type AiProvider } from './ai/provider.ts';
import { MOCK_FIXTURES, MOCK_LESSON } from './ai/mockData.ts';
import { createApp } from './app.ts';
import { openDb, type Db } from './db.ts';

let db: Db;
let server: Server;
let base: string;

async function start(fixtures: MockFixtures = MOCK_FIXTURES) {
  db = openDb(':memory:');
  // 這裡測的是「請 AI 產生課程」之後的流程,所以不用內建的起始課(否則第一堂課會是起始課)。
  const app = createApp({ db, ai: createMockProvider(fixtures), starters: false });
  server = await new Promise<Server>((done) => {
    const listening = app.listen(0, '127.0.0.1', () => done(listening));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
}

beforeEach(() => start());

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

async function userWithKey(): Promise<number> {
  const user = (await call('POST', '/users', { name: '小明', stage: 'junior' })).json;
  await call('PUT', `/users/${user.id}/api-key`, { apiKey: 'key' });
  return user.id;
}

async function startLesson(userId: number): Promise<SessionView> {
  const res = await call('POST', '/sessions', { userId });
  expect(res.status).toBe(201);
  return res.json;
}

function correctResponse(exercise: Exercise): string {
  switch (exercise.type) {
    case 'mcq':
      return String(exercise.answerIndex);
    case 'cloze':
      return exercise.answers[0]!;
    case 'reorder':
      return exercise.sentence;
    case 'flashcard':
      return FLASHCARD_KNOWN;
    case 'dictation':
    case 'readAloud':
    case 'rewrite':
      return exercise.sentence;
  }
}

/** 每一題第一次就答對的作答紀錄。 */
function perfectAnswers(): Record<string, ExerciseAnswer> {
  const answers: Record<string, ExerciseAnswer> = {};
  for (const { key, exercise } of lessonExercises(MOCK_LESSON)) {
    answers[key] = { attempts: [correctResponse(exercise)], hintUsed: false };
  }
  return answers;
}

const LONG_WRITING = 'Last weekend, I went to the night market with my family. It was crowded but fun. We shared delicious fried chicken and I spent one hundred dollars.';

/**
 * 這個檔案測的是課程核心(閱讀、單字文法、寫作)。
 * 為了讓分數好算,這裡模擬「瀏覽器不能朗讀也不能語音辨識、對話服務無法使用」的情況,
 * 此時聽力與口說都不計分。語音與對話的計分在 speaking.test.ts。
 */
function stateWith(overrides: Partial<SessionState>): SessionState {
  return {
    ...SessionStateSchema.parse({}),
    answers: perfectAnswers(),
    writing: LONG_WRITING,
    capabilities: { tts: false, stt: false },
    chatUnavailable: true,
    ...overrides,
  };
}

async function usageCalls(userId: number): Promise<number> {
  const status: SettingsStatus = (await call('GET', `/settings/status?userId=${userId}`)).json;
  return status.usage.reduce((sum, row) => sum + row.calls, 0);
}

describe('開始上課', () => {
  it('沒有 API key 不能開新課,並明確說明原因', async () => {
    const user = (await call('POST', '/users', { name: '小明', stage: 'junior' })).json;
    const res = await call('POST', '/sessions', { userId: user.id });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('no_key');
  });

  it('課程以使用者當時的等級與學習階段產生', async () => {
    const userId = await userWithKey();
    const session = await startLesson(userId);
    expect(session).toMatchObject({ level: 'A2', stage: 'junior', minutes: 25, status: 'in_progress', result: null });
    expect(session.lesson.title).toBe(MOCK_LESSON.title);
  });

  // 產生課程是每天額度最少的品質類呼叫,重新整理頁面不該再花一次。
  it('已有進行中的課時,再次開始會回到同一堂課,不重新產生', async () => {
    const userId = await userWithKey();
    const first = await startLesson(userId);
    const again = await call('POST', '/sessions', { userId });

    expect(again.status).toBe(200);
    expect(again.json.id).toBe(first.id);
    expect((await call('GET', `/sessions/current?userId=${userId}`)).json.id).toBe(first.id);
    expect(await usageCalls(userId)).toBe(1);
  });

  // 年紀越小,能專心的時間越短;長度固定,每天到期的複習份量才會穩定。所以長度不讓學生選。
  it('課程長度由學習階段決定:國小 20、國中 25、高中與大學 30 分鐘', async () => {
    const lengths: Record<string, number> = {};
    for (const stage of ['elementary', 'junior', 'senior', 'university']) {
      const user = (await call('POST', '/users', { name: stage, stage })).json;
      await call('PUT', `/users/${user.id}/api-key`, { apiKey: 'key' });
      lengths[stage] = (await call('POST', '/sessions', { userId: user.id })).json.minutes;
    }
    expect(lengths).toEqual({ elementary: 20, junior: 25, senior: 30, university: 30 });
  });

  it('還開著舊畫面的網頁送來自己選的長度時不採用,仍然照學習階段', async () => {
    const userId = await userWithKey();
    const res = await call('POST', '/sessions', { userId, minutes: 40 });
    expect(res.status).toBe(201);
    expect(res.json.minutes).toBe(25);
  });
});

describe('額度用完', () => {
  // 免費額度用完是一定會遇到的情況:要清楚告訴學生原因與何時恢復,而不是卡住或默默失敗。
  it('產生課程時額度用完:回報 429 與重置時間,而且不會留下半成品的課', async () => {
    await new Promise((done) => server.close(done));
    db.close();
    db = openDb(':memory:');
    const exhausted: AiProvider = {
      ...createMockProvider(),
      generateJson: async () => {
        throw new AiError('quota', 'RESOURCE_EXHAUSTED');
      },
    };
    const app = createApp({ db, ai: exhausted, starters: false });
    server = await new Promise<Server>((done) => {
      const listening = app.listen(0, '127.0.0.1', () => done(listening));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

    const userId = await userWithKey();
    const res = await call('POST', '/sessions', { userId });

    expect(res.status).toBe(429);
    expect(res.json.error).toMatchObject({ code: 'quota', detail: 'RESOURCE_EXHAUSTED' });
    expect(res.json.error.message).toContain('下午 3–4 點重置');
    expect((await call('GET', `/sessions/current?userId=${userId}`)).json).toBeNull();
    // 失敗後可以再試(例如稍後額度恢復),不會被「正在備課」卡住。
    expect((await call('POST', '/sessions', { userId })).status).toBe(429);
  });
});

describe('上課進度', () => {
  it('作答進度存檔後,重新載入可以從原處繼續', async () => {
    const userId = await userWithKey();
    const session = await startLesson(userId);
    const progress = { step: 1, answers: { 'reading.0': { attempts: ['1'], hintUsed: false } }, writing: 'draft' };

    expect((await call('PUT', `/sessions/${session.id}/state`, stateWith(progress))).status).toBe(204);
    expect((await call('GET', `/sessions/${session.id}`)).json.state).toMatchObject(progress);
  });

  it('可以放棄進行中的課,之後能開新的一堂', async () => {
    const userId = await userWithKey();
    const session = await startLesson(userId);
    expect((await call('DELETE', `/sessions/${session.id}`)).status).toBe(204);
    expect((await call('GET', `/sessions/current?userId=${userId}`)).json).toBeNull();
  });
});

describe('完成課程與評分', () => {
  it('全部答對時,總分是各階段依配分的加權平均', async () => {
    const userId = await userWithKey();
    const session = await startLesson(userId);
    const done: SessionView = (await call('POST', `/sessions/${session.id}/complete`, { state: stateWith({}) })).json;

    // 閱讀 100(配分 15)、單字文法 100(20)、寫作假資料給 88(20)→ (15×100 + 20×100 + 20×88) / 55
    expect(done.status).toBe('completed');
    expect(done.result!.score).toBe(95.6);
    expect(done.result!.sections.map((s) => [s.section, s.percent])).toEqual([
      ['reading', 100],
      ['language', 100],
      ['writing', 88],
    ]);
  });

  it('答錯與不熟的題目都列入弱點清單,並附上正確答案與說明', async () => {
    const userId = await userWithKey();
    const session = await startLesson(userId);
    const answers = perfectAnswers();
    answers['reading.0'] = { attempts: ['0', '3'], hintUsed: false }; // 兩次都錯 → 不會
    answers['vocab.0'] = { attempts: ['crowd', 'crowded'], hintUsed: false }; // 第二次才對 → 不熟
    const done: SessionView = (await call('POST', `/sessions/${session.id}/complete`, { state: stateWith({ answers }) })).json;

    const byKey = Object.fromEntries(done.result!.weakPoints.filter((w) => w.key).map((w) => [w.key, w]));
    expect(byKey['reading.0']).toMatchObject({ kind: 'reading', outcome: 'unknown', answer: 'Fried chicken' });
    expect(byKey['vocab.0']).toMatchObject({ kind: 'vocab', outcome: 'unfamiliar', label: 'crowded' });
    expect(byKey['vocab.0'].answer).toContain('crowded');
    expect(Object.keys(byKey)).toHaveLength(2);
  });

  it('AI 批改找到的寫作錯誤也進入弱點清單', async () => {
    const userId = await userWithKey();
    const session = await startLesson(userId);
    const done: SessionView = (await call('POST', `/sessions/${session.id}/complete`, { state: stateWith({}) })).json;

    expect(done.result!.weakPoints).toContainEqual(
      expect.objectContaining({ key: null, kind: 'writing', outcome: 'unfamiliar', answer: 'I went to the park yesterday.' }),
    );
    expect(done.result!.writing).toMatchObject({ score: 88 });
  });

  // 計畫的額度估算是「品質類每堂 2 次」;多出來的呼叫會讓免費額度提早用完。
  it('一堂課只用 2 次品質類呼叫:產生課程與批改', async () => {
    const userId = await userWithKey();
    const session = await startLesson(userId);
    await call('PUT', `/sessions/${session.id}/state`, stateWith({}));
    await call('POST', `/sessions/${session.id}/complete`, { state: stateWith({}) });
    expect(await usageCalls(userId)).toBe(2);
  });

  it('沒交寫作時不呼叫 AI 批改,寫作以 0 分計', async () => {
    const userId = await userWithKey();
    const session = await startLesson(userId);
    const done: SessionView = (await call('POST', `/sessions/${session.id}/complete`, { state: stateWith({ writing: '   ' }) })).json;

    expect(done.result!.writing).toBeNull();
    expect(done.result!.sections.find((s) => s.section === 'writing')!.percent).toBe(0);
    expect(done.result!.score).toBe(63.6); // (15×100 + 20×100 + 20×0) / 55
    expect(await usageCalls(userId)).toBe(1);
  });

  it('完成後不能再修改作答,重複送出完成也不會重新批改', async () => {
    const userId = await userWithKey();
    const session = await startLesson(userId);
    await call('POST', `/sessions/${session.id}/complete`, { state: stateWith({}) });

    expect((await call('PUT', `/sessions/${session.id}/state`, stateWith({ writing: 'changed' }))).status).toBe(409);
    const again = await call('POST', `/sessions/${session.id}/complete`, { state: stateWith({ writing: 'changed' }) });
    expect(again.json.result.score).toBe(95.6);
    expect(await usageCalls(userId)).toBe(2);
  });

  it('完成後可以開新的一堂課', async () => {
    const userId = await userWithKey();
    const first = await startLesson(userId);
    await call('POST', `/sessions/${first.id}/complete`, { state: stateWith({}) });
    const second = await startLesson(userId);
    expect(second.id).not.toBe(first.id);
  });
});

describe('批改失敗', () => {
  // 額度用完或服務中斷時,學生花時間寫的內容不能消失,也不能用錯誤的分數默默結束這堂課。
  it('AI 批改失敗時回報錯誤,課程維持進行中,作答與寫作都保留', async () => {
    await new Promise((done) => server.close(done));
    db.close();
    await start({ lesson: MOCK_LESSON }); // 沒有 grade 的假資料 → 批改呼叫會失敗

    const userId = await userWithKey();
    const session = await startLesson(userId);
    const res = await call('POST', `/sessions/${session.id}/complete`, { state: stateWith({ step: 3 }) });

    expect(res.status).toBe(502);
    expect(res.json.error.code).toBe('unavailable');
    const after: SessionView = (await call('GET', `/sessions/${session.id}`)).json;
    expect(after.status).toBe('in_progress');
    expect(after.result).toBeNull();
    expect(after.state.writing).toBe(LONG_WRITING);
    expect(after.state.step).toBe(3);
  });
});
