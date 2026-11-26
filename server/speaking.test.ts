import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FLASHCARD_KNOWN, lessonExercises, type Exercise } from '../shared/lesson.ts';
import { CHAT_TURNS, MAX_ASKS, SessionStateSchema, type ExerciseAnswer, type SessionState, type SessionView, type Stage } from '../shared/schema.ts';
import { createMockProvider } from './ai/mock.ts';
import { MOCK_FIXTURES } from './ai/mockData.ts';
import type { AiJsonRequest, AiProvider } from './ai/provider.ts';
import { createApp } from './app.ts';
import { openDb, type Db } from './db.ts';

let db: Db;
let server: Server;
let base: string;
/** 每一次送給 AI 的請求,用來檢查用了哪一類模型、送出了什麼內容。 */
let requests: { tier: string; task: string; text: string; timeoutMs: number | undefined }[];

/** 包住假資料供應商,把每次請求記下來。 */
function spyProvider(): AiProvider {
  const inner = createMockProvider(MOCK_FIXTURES);
  return {
    ...inner,
    generateJson<T>(request: AiJsonRequest<T>): Promise<T> {
      requests.push({ tier: request.tier, task: request.task, text: `${request.system}\n${request.input}`, timeoutMs: request.timeoutMs });
      return inner.generateJson(request);
    },
  };
}

beforeEach(async () => {
  requests = [];
  db = openDb(':memory:');
  // 這裡測的是「請 AI 產生課程」之後的流程,所以不用內建的起始課(否則第一堂課會是起始課)。
  const app = createApp({ db, ai: spyProvider(), starters: false });
  server = await new Promise<Server>((done) => {
    const listening = app.listen(0, '127.0.0.1', () => done(listening));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
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

const SECRET_NAME = '王小明獨特名字';

/** 開一堂課。課程長度由學習階段決定:國小 20、國中 25、高中 30 分鐘。 */
async function startLesson(stage: Stage = 'junior'): Promise<SessionView> {
  const user = (await call('POST', '/users', { name: SECRET_NAME, stage, level: 'A2' })).json;
  await call('PUT', `/users/${user.id}/api-key`, { apiKey: 'key' });
  return (await call('POST', '/sessions', { userId: user.id })).json;
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

function perfectAnswers(session: SessionView): Record<string, ExerciseAnswer> {
  return Object.fromEntries(lessonExercises(session.lesson).map(({ key, exercise }) => [key, { attempts: [correctResponse(exercise)], hintUsed: false }]));
}

const WRITING = 'Last weekend, I went to the night market with my family. It was crowded but fun. We shared delicious fried chicken and I spent one hundred dollars.';

async function complete(session: SessionView, overrides: Partial<SessionState> = {}): Promise<SessionView> {
  const state: SessionState = { ...SessionStateSchema.parse({}), answers: perfectAnswers(session), writing: WRITING, ...overrides };
  const res = await call('POST', `/sessions/${session.id}/complete`, { state });
  expect(res.status).toBe(200);
  return res.json;
}

const say = (session: SessionView, message: string) => call('POST', `/sessions/${session.id}/chat`, { message });

async function talk(session: SessionView, turns: number): Promise<void> {
  for (let i = 0; i < turns; i++) expect((await say(session, `I went there with my sister. (${i})`)).status).toBe(200);
}

const sectionPercents = (session: SessionView) => Object.fromEntries(session.result!.sections.map((s) => [s.section, s.percent]));

describe('情境對話', () => {
  it('對話從老師的開場白開始', async () => {
    const session = await startLesson();
    expect(session.state.chat).toEqual([{ role: 'teacher', text: session.lesson.speaking.opening, corrections: [] }]);
  });

  it('學生說一句,老師回一句,並附上需要修正的地方', async () => {
    const session = await startLesson();
    const res = await say(session, 'I eat fried chicken there.');

    expect(res.json.chat).toHaveLength(3);
    expect(res.json.chat[1]).toMatchObject({ role: 'student', text: 'I eat fried chicken there.' });
    expect(res.json.chat[1].corrections[0]).toMatchObject({ corrected: 'I ate fried chicken there.' });
    expect(res.json.chat[2].role).toBe('teacher');
  });

  // 輪數上限同時也是額度上限:對話類呼叫每堂課不能無限增加。
  it('學生可以說的輪數依課程長度而定,用完就不能再說', async () => {
    const turns: Record<string, number> = {};
    for (const stage of ['elementary', 'junior', 'senior'] as const) {
      const session = await startLesson(stage);
      turns[session.minutes] = CHAT_TURNS[session.minutes];
      await talk(session, CHAT_TURNS[session.minutes]);
      const extra = await say(session, 'One more?');
      expect(extra.status, `${session.minutes} 分鐘`).toBe(409);
    }
    expect(turns).toEqual({ 20: 5, 25: 5, 30: 6 });
  });

  it('最後一輪會告訴 AI 收尾', async () => {
    const session = await startLesson('elementary');
    await talk(session, CHAT_TURNS[20]);
    const chatRequests = requests.filter((r) => r.task === 'chat');
    expect(chatRequests.at(-1)!.text).toContain("student's last turn");
    expect(chatRequests.at(-2)!.text).toContain('1 more turn after this');
  });

  // 瀏覽器存進度時帶的是它上次看到的對話;不能讓它把伺服器剛寫入的對話蓋掉。
  it('瀏覽器存進度時,不會蓋掉伺服器上的對話紀錄', async () => {
    const session = await startLesson();
    await say(session, 'I went to a night market.');
    const stale: SessionState = { ...SessionStateSchema.parse({}), step: 4, chat: [] };
    await call('PUT', `/sessions/${session.id}/state`, stale);

    const after: SessionView = (await call('GET', `/sessions/${session.id}`)).json;
    expect(after.state.step).toBe(4);
    expect(after.state.chat).toHaveLength(3);
  });

  it('空白的訊息會被拒絕,不浪費一次 AI 呼叫', async () => {
    const session = await startLesson();
    expect((await say(session, '   ')).status).toBe(400);
    expect(requests.filter((r) => r.task === 'chat')).toHaveLength(0);
  });
});

describe('問老師', () => {
  const ask = (session: SessionView, question: string) => call('POST', `/sessions/${session.id}/ask`, { question });

  it('回答會記在這堂課的紀錄裡', async () => {
    const session = await startLesson();
    const res = await ask(session, 'went 是什麼意思?');
    expect(res.json.asks).toHaveLength(1);
    expect(res.json.asks[0].question).toBe('went 是什麼意思?');
  });

  it(`每堂課最多問 ${MAX_ASKS} 次,超過會被擋下並說明原因`, async () => {
    const session = await startLesson();
    for (let i = 0; i < MAX_ASKS; i++) expect((await ask(session, `問題 ${i}`)).status).toBe(200);
    const extra = await ask(session, '再一個');
    expect(extra.status).toBe(409);
    expect(extra.json.error.message).toContain(String(MAX_ASKS));
    expect(requests.filter((r) => r.task === 'ask')).toHaveLength(MAX_ASKS);
  });
});

describe('免費額度的用量', () => {
  // 品質類模型每天的免費次數很少,對話這種高頻率的呼叫必須走額度高的對話類模型。
  it('產生課程與批改用品質類模型;對話與問老師用對話類模型', async () => {
    const session = await startLesson();
    await talk(session, 2);
    await call('POST', `/sessions/${session.id}/ask`, { question: 'What does crowded mean?' });
    await complete(session);

    const tierOf = Object.fromEntries(requests.map((r) => [r.task, r.tier]));
    expect(tierOf).toEqual({ lesson: 'quality', grade: 'quality', chat: 'chat', ask: 'chat' });
  });

  it('最長的課(30 分鐘)做滿對話與問老師:品質類 2 次,對話類 11 次(對話 6 輪 + 問老師 5 次)', async () => {
    const session = await startLesson('senior');
    await talk(session, CHAT_TURNS[30]);
    for (let i = 0; i < MAX_ASKS; i++) await call('POST', `/sessions/${session.id}/ask`, { question: `q${i}` });
    await complete(session);

    expect(requests.filter((r) => r.tier === 'quality')).toHaveLength(2);
    expect(requests.filter((r) => r.tier === 'chat')).toHaveLength(11);
  });

  // 批改是學生在畫面前等的。模型卡住時,預設要等 180 秒才換下一個模型;備課在背景做,等久一點沒關係。
  it('批改時每個模型最多等 60 秒;備課沿用品質類的設定', async () => {
    const session = await startLesson();
    await talk(session, 1);
    await complete(session);
    const timeoutOf = Object.fromEntries(requests.map((r) => [r.task, r.timeoutMs]));
    expect(timeoutOf).toMatchObject({ grade: 60_000, lesson: undefined });
  });

  it('寫作與對話合併成一次批改', async () => {
    const session = await startLesson();
    await talk(session, 3);
    await complete(session);
    expect(requests.filter((r) => r.task === 'grade')).toHaveLength(1);
  });

  it('沒寫作也沒對話時,完全不呼叫批改', async () => {
    const session = await startLesson();
    await complete(session, { writing: '' });
    expect(requests.filter((r) => r.task === 'grade')).toHaveLength(0);
  });
});

describe('隱私', () => {
  // 免費額度的內容可能被 Google 用來改進產品並由人工審閱,所以使用者的名稱不能送出去。
  it('送給 AI 的任何內容都不包含使用者的名稱', async () => {
    const session = await startLesson();
    await talk(session, 2);
    await call('POST', `/sessions/${session.id}/ask`, { question: 'How do I use spend?' });
    await complete(session);

    expect(requests.length).toBeGreaterThanOrEqual(5);
    for (const request of requests) expect(request.text, request.task).not.toContain(SECRET_NAME);
  });
});

describe('六個階段的計分', () => {
  it('全部做完且全對:口說 = 跟讀 40% + 對話 60%', async () => {
    const session = await startLesson();
    await talk(session, 3);
    const done = await complete(session);

    // 假資料:對話 90 分、寫作 88 分。口說 = 100×0.4 + 90×0.6 = 94。
    expect(sectionPercents(done)).toEqual({ listening: 100, reading: 100, language: 100, speaking: 94, writing: 88 });
    // (15×100 + 15×100 + 20×100 + 20×94 + 20×88) / 90
    expect(done.result!.score).toBe(96);
    expect(done.result!.speaking).toMatchObject({ score: 90 });
  });

  it('沒有麥克風(不能語音辨識)時,口說只算對話,不因為無法跟讀而扣分', async () => {
    const session = await startLesson();
    await talk(session, 3);
    const done = await complete(session, { capabilities: { tts: true, stt: false } });
    expect(sectionPercents(done).speaking).toBe(90);
  });

  // 額度用完不是學生的錯,不該讓口說拿 0 分。
  it('AI 對話服務無法使用而跳過對話時,口說只算跟讀', async () => {
    const session = await startLesson();
    const done = await complete(session, { chatUnavailable: true });
    expect(sectionPercents(done).speaking).toBe(100);
  });

  it('可以對話卻沒有對話:對話以 0 分計', async () => {
    const session = await startLesson();
    const done = await complete(session);
    expect(sectionPercents(done).speaking).toBe(40); // 100×0.4 + 0×0.6
    expect(done.result!.speaking).toBeNull();
  });

  it('不能朗讀時沒有聽力階段;不能朗讀、不能辨識、對話也無法使用時,聽力與口說都不計分', async () => {
    const session = await startLesson();
    const noListening = await complete(session, { capabilities: { tts: false, stt: true }, chatUnavailable: true });
    expect(Object.keys(sectionPercents(noListening))).toEqual(['reading', 'language', 'speaking', 'writing']);

    const second = (await call('POST', '/sessions', { userId: session.userId })).json as SessionView;
    const nothing = await complete(second, { capabilities: { tts: false, stt: false }, chatUnavailable: true });
    expect(Object.keys(sectionPercents(nothing))).toEqual(['reading', 'language', 'writing']);
  });

  it('只有對話、沒交寫作:仍然批改對話,寫作 0 分,且不採用 AI 對寫作回報的錯誤', async () => {
    const session = await startLesson();
    await talk(session, 2);
    const done = await complete(session, { writing: '' });

    expect(sectionPercents(done)).toMatchObject({ speaking: 94, writing: 0 });
    expect(done.result!.writing).toBeNull();
    expect(done.result!.weakPoints.map((w) => w.kind)).toEqual(['speaking']);
  });

  it('聽寫與跟讀的結果進入弱點清單與項目庫', async () => {
    const session = await startLesson();
    const answers = perfectAnswers(session);
    answers['listening.d.0'] = { attempts: ['they bought chicken', 'they bought chicken'], hintUsed: false }; // 不會
    answers['speaking.r.0'] = { attempts: ['The market was crowded and nosy', 'The market was crowded and nosy'], hintUsed: false }; // 6 個字對 5 個 → 不熟
    const done = await complete(session, { answers, chatUnavailable: true, writing: '' });

    const weak = Object.fromEntries(done.result!.weakPoints.map((w) => [w.key, w]));
    expect(weak['listening.d.0']).toMatchObject({ kind: 'listening', outcome: 'unknown', answer: 'They bought fried chicken and shared it.' });
    expect(weak['speaking.r.0']).toMatchObject({ kind: 'speaking', outcome: 'unfamiliar' });
    // 第一次就答對的新單字也在項目庫裡(狀態是「新學」),這裡只看被記為不會或不熟的項目。
    const kinds = (db.prepare(`SELECT kind FROM items WHERE status != 'learning' ORDER BY kind`).all() as unknown as { kind: string }[]).map((row) => row.kind);
    expect(kinds).toEqual(['listening', 'speaking']);
  });

  it('對話中的錯誤做成口說類的訂正題', async () => {
    const session = await startLesson();
    await talk(session, 1);
    await complete(session, { writing: '' });
    const item = db.prepare(`SELECT content_json FROM items WHERE kind = 'speaking' AND item_key LIKE 'speaking:i eat%'`).get() as { content_json: string };
    expect(JSON.parse(item.content_json).quiz).toMatchObject({ type: 'rewrite', sentence: 'I ate fried chicken there.' });
  });
});
