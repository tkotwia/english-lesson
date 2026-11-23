import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PreparedStatus } from '../shared/api.ts';
import { lessonExercises, type Exercise } from '../shared/lesson.ts';
import { SessionStateSchema, type Lesson, type Minutes, type SessionState, type SessionView } from '../shared/schema.ts';
import { LEVEL_GUIDES } from './ai/cefr.ts';
import { createMockProvider } from './ai/mock.ts';
import { MOCK_FIXTURES, MOCK_LESSON } from './ai/mockData.ts';
import { AiError, type AiJsonRequest, type AiProvider } from './ai/provider.ts';
import { createApp, type AppOptions } from './app.ts';
import { openDb, type Db } from './db.ts';
import { createPreparer } from './prepared.ts';
import { starterFor } from './starters/index.ts';
import { recordTaskTiming, taskTimings } from './timings.ts';

// 讓學生按「開始」時盡量不用等:
// 沒上過的等級,20 分鐘的第一堂課用內建的起始課;開課之後在背景把 20、30、40 分鐘各備一堂。

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

/** 測試用的使用者是國中、A2(國中的預設等級),對應的起始課是這一堂。 */
const STARTER = starterFor('A2', 'junior');

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

async function listen(options: Partial<AppOptions> = {}): Promise<void> {
  const app = createApp({ db, ai: provider(), prepareAhead: true, ...options });
  server = await new Promise<Server>((done) => {
    const listening = app.listen(0, '127.0.0.1', () => done(listening));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
}

/** 關掉伺服器再開一個新的(同一個資料庫),可以換設定;記憶體裡的狀態全部消失。 */
async function restart(options: Partial<AppOptions> = {}): Promise<void> {
  await new Promise((done) => server.close(done));
  await listen(options);
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

/** 各長度的狀況,寫成好比對的樣子:可以馬上開始的寫來源(starter / prepared),否則寫狀態(preparing / none)。 */
const summary = (current: PreparedStatus) => Object.fromEntries(current.lengths.map((length) => [length.minutes, length.source ?? length.state]));

const ALL_PREPARED = { 20: 'prepared', 30: 'prepared', 40: 'prepared' };

/** 等背景備課做完(成功或失敗),回傳之後的狀態。 */
async function settled(userId: number): Promise<PreparedStatus> {
  for (let i = 0; i < 400; i++) {
    const current = await status(userId);
    if (current.lengths.every((length) => length.state !== 'preparing')) return current;
    await new Promise((done) => setTimeout(done, 5));
  }
  throw new Error('背景備課一直沒有結束');
}

async function start(userId: number, minutes: Minutes): Promise<SessionView> {
  const res = await call('POST', '/sessions', { userId, minutes });
  expect(res.status).toBe(201);
  return res.json;
}

const abandon = (session: SessionView) => call('DELETE', `/sessions/${session.id}`);

const correct = (exercise: Exercise): string =>
  exercise.type === 'mcq' ? String(exercise.answerIndex) : exercise.type === 'cloze' ? exercise.answers[0]! : exercise.type === 'flashcard' ? 'known' : exercise.sentence;

/** 把課上完。沒有寫作內容時不會請 AI 批改。 */
async function finish(session: SessionView, writing = ''): Promise<SessionView> {
  const answers = Object.fromEntries(lessonExercises(session.lesson).map(({ key, exercise }) => [key, { attempts: [correct(exercise)], hintUsed: false }]));
  const state: SessionState = { ...SessionStateSchema.parse({}), answers, writing, chatUnavailable: true };
  const res = await call('POST', `/sessions/${session.id}/complete`, { state });
  expect(res.status).toBe(200);
  return res.json;
}

/** 從送給 AI 的提示裡讀出這堂課的長度、主題與文法重點。 */
const minutesOf = (prompt: string) => Number(prompt.match(/^Create a (\d+)-minute lesson\./m)![1]);
const topicOf = (prompt: string) => prompt.match(/^Topic: (.*)$/m)![1]!;
const grammarOf = (prompt: string) => prompt.match(/must be exactly this one: (.*?)\. Do not choose/)![1]!;

const pause = (milliseconds: number) => new Promise((done) => setTimeout(done, milliseconds));

describe('內建起始課:切到沒上過的等級時,20 分鐘的第一堂課不用等', () => {
  // 這是功能的目的。AI 完全沒有回應(卡住)時,起始課仍然要能立刻開始。
  it('第一堂 20 分鐘的課直接用內建的起始課,不必等 AI', async () => {
    const userId = await newUser();
    closeGate();

    const session = await start(userId, 20);
    expect(session.lesson.title).toBe(STARTER.lesson.title);
    expect(session.minutes).toBe(20);
    expect(session.status).toBe('in_progress');
    // 起始課不是 AI 產生的,沒有重覆檢查的結果。
    expect(session.novelty).toBeNull();
  });

  it('換到另一個等級,同樣馬上有那個等級的起始課', async () => {
    const userId = await newUser();
    await call('PATCH', `/users/${userId}`, { level: 'B1' });
    closeGate();

    const session = await start(userId, 20);
    expect(session.level).toBe('B1');
    expect(session.lesson.title).toBe(starterFor('B1', 'junior').lesson.title);
  });

  // 起始課每位使用者都一樣、內容固定,只適合當第一堂;之後要上的是新的內容。
  it('起始課只用在該等級的第一堂:上過之後,下一堂 20 分鐘的課是新的內容', async () => {
    await restart({ prepareAhead: false }); // 沒有背景備課,第二堂沒有庫存可用,看得出它是不是又拿起始課
    const userId = await newUser();
    await finish(await start(userId, 20));

    const second = await start(userId, 20);
    expect(second.lesson.title).toBe('Lesson 1');
  });

  // 起始課教過的東西要算進「上過的課」,否則下一堂 AI 課可能又教同一個主題、同一個文法、同一批單字。
  it('之後的課會避開起始課的主題與單字,文法重點從清單的下一項接著教', async () => {
    const userId = await newUser();
    await start(userId, 20);
    await settled(userId);

    expect(lessonPrompts.map(grammarOf)).toEqual(LEVEL_GUIDES.A2.grammar.slice(1, 4));
    expect(lessonPrompts.map(topicOf)).not.toContain(STARTER.topic);
    expect(lessonPrompts[0]).toContain(STARTER.lesson.vocab[0]!.word);
  });

  it('30 與 40 分鐘沒有起始課:第一堂要請 AI 現場產生', async () => {
    const userId = await newUser();
    const session = await start(userId, 30);
    expect(session.lesson.title).toBe('Lesson 1');
    expect(session.novelty).toMatchObject({ regenerated: false });
  });

  // 對話與批改都需要 key。沒有 key 就讓學生開始上起始課的話,課上到一半會卡住。
  it('沒有設定 API key 的使用者不能開課(起始課也不行),也不會在背景備課', async () => {
    const user = (await call('POST', '/users', { name: '沒有 key', stage: 'junior' })).json;
    expect((await call('POST', '/sessions', { userId: user.id, minutes: 20 })).status).toBe(400);
    expect((await call('POST', '/sessions', { userId: user.id, minutes: 30 })).status).toBe(400);
    expect(lessonCalls).toBe(0);
  });
});

describe('背景備課:開課之後,把 20、30、40 分鐘各備一堂', () => {
  it('課一開始,就在背景把三種長度都備好', async () => {
    const userId = await newUser();
    expect(summary(await status(userId))).toEqual({ 20: 'starter', 30: 'none', 40: 'none' });

    await start(userId, 20);
    expect(summary(await settled(userId))).toEqual(ALL_PREPARED);
    expect(lessonPrompts.map(minutesOf)).toEqual([20, 30, 40]);
  });

  // 學生剛選的長度最可能再選一次,所以先備它。
  it('先備學生這次選的長度', async () => {
    const userId = await newUser();
    await start(userId, 40); // 第 1 次呼叫:現場產生這堂 40 分鐘的課
    await settled(userId);
    expect(lessonPrompts.map(minutesOf)).toEqual([40, 40, 20, 30]);
  });

  // 這是整個功能的目的:按下開始時不用等 AI。
  it('備好之後,三種長度都能馬上開始,不必等 AI', async () => {
    const userId = await newUser();
    await abandon(await start(userId, 20));
    await settled(userId);

    // 讓之後任何「產生課程」的呼叫都卡住:如果開課還需要等 AI,請求就不會回來。
    closeGate();
    for (const minutes of [30, 40, 20] as const) {
      const session = await start(userId, minutes);
      expect(session.minutes).toBe(minutes);
      expect(session.lesson.title).toMatch(/^Lesson [123]$/);
      await abandon(session);
    }
  });

  // 同時放在庫存裡的三堂課如果主題、文法、單字相同,學生連上兩堂就會覺得重覆。
  it('同時備好的課彼此不重覆:主題與文法各不相同,後備的會避開先備的單字', async () => {
    const userId = await newUser();
    await start(userId, 20);
    await settled(userId);

    expect(new Set(lessonPrompts.map(topicOf)).size).toBe(3);
    expect(new Set(lessonPrompts.map(grammarOf)).size).toBe(3);
    // 準備第 2 堂時,第 1 堂(還在庫存裡、沒人上過)的單字已經列入避開的清單。
    expect(lessonPrompts[1]).toContain('word1n0');
  });

  // 切到別的等級看看再切回來是很常見的操作。備好的課如果因此作廢,就要重新等,也白白多用額度。
  it('切換等級不會丟掉備好的課:切回來可以直接用', async () => {
    const userId = await newUser();
    await finish(await start(userId, 20));
    await settled(userId); // A2 的三堂:第 1–3 次呼叫

    await call('PATCH', `/users/${userId}`, { level: 'B1' });
    // A2 備好的課是 A2 的難度,不能拿來給 B1 用。
    expect(summary(await status(userId))).toEqual({ 20: 'starter', 30: 'none', 40: 'none' });
    await finish(await start(userId, 20));
    await settled(userId); // B1 的三堂:第 4–6 次呼叫

    await call('PATCH', `/users/${userId}`, { level: 'A2' });
    expect(summary(await status(userId))).toEqual(ALL_PREPARED);
    closeGate();
    const back = await start(userId, 30);
    expect(back.level).toBe('A2');
    expect(back.lesson.title).toBe('Lesson 2'); // 當初替 A2 備好的那堂 30 分鐘
    expect(lessonCalls).toBe(7); // 只多了一次:補回剛用掉的那堂
  });

  it('新等級的課照新等級的難度產生', async () => {
    const userId = await newUser();
    await abandon(await start(userId, 20));
    await settled(userId); // 第 1–3 次呼叫是 A2

    await call('PATCH', `/users/${userId}`, { level: 'B1' });
    const session = await start(userId, 30); // 第 4 次呼叫
    expect(session.level).toBe('B1');
    expect(lessonPrompts[3]).toContain('CEFR level: B1');
  });

  // 如果這時另外再現場產生一份,會白白多用一次額度,而且兩份會挑到同一個主題。
  it('背景正在準備學生要的那一堂時按開始:等它做完並使用那一份,不另外產生', async () => {
    const userId = await newUser();
    await abandon(await start(userId, 30));
    await settled(userId); // 第 1 次是現場產生,第 2–4 次是背景備好的三堂

    closeGate();
    await abandon(await start(userId, 30)); // 用掉備好的 30 分鐘;背景開始補(第 5 次呼叫,卡住)
    expect(lessonCalls).toBe(5);

    const pending = start(userId, 30); // 30 分鐘的課還在準備中
    await pause(30);
    expect(lessonCalls).toBe(5); // 沒有另外發出產生課程的呼叫
    gate!.release();
    expect((await pending).lesson.title).toBe('Lesson 5');
  });

  // 學生正在等的時候,背景不該先去做他沒有要的長度。
  it('背景正在準備別的長度時按開始:排在正在做的那一堂後面,優先於背景剩下的工作', async () => {
    const userId = await newUser();
    closeGate();
    await abandon(await start(userId, 20)); // 起始課;背景開始備 20 分鐘(第 1 次呼叫,卡住),30 與 40 還在排隊

    const pending = start(userId, 40);
    await pause(30);
    expect(lessonCalls).toBe(1); // 同一位使用者一次只產生一堂
    gate!.release();

    const session = await pending;
    expect(session.minutes).toBe(40);
    expect(session.lesson.title).toBe('Lesson 2');
    await settled(userId);
    expect(lessonPrompts.map(minutesOf).slice(0, 2)).toEqual([20, 40]);
  });

  it('放棄正在上的課,備好的課仍然保留', async () => {
    const userId = await newUser();
    const first = await start(userId, 30);
    await settled(userId);
    await abandon(first);
    expect(summary(await status(userId))).toEqual(ALL_PREPARED);
  });

  it('重上舊課不會用掉備好的課', async () => {
    const userId = await newUser();
    const first = await finish(await start(userId, 20));
    await settled(userId);
    const before = lessonCalls;

    expect((await call('POST', `/sessions/${first.id}/retake`)).status).toBe(201);
    expect(summary(await status(userId))).toEqual(ALL_PREPARED);
    expect(lessonCalls).toBe(before);
  });

  it('每位使用者各自備課,互不影響', async () => {
    const a = await newUser('小明');
    const b = await newUser('小華');
    await start(a, 20);
    expect(summary(await settled(a))).toEqual(ALL_PREPARED);
    expect(summary(await status(b))).toEqual({ 20: 'starter', 30: 'none', 40: 'none' });
  });
});

describe('背景備課失敗', () => {
  // 失敗多半是額度用完或模型忙線。繼續試其他長度只會一直碰壁,所以先停下來;正在上的課不受影響。
  it('一堂沒備好就先停下來,不影響正在上的課;上完課時再試一次', async () => {
    const userId = await newUser();
    failOnCall = 1; // 第 1 次呼叫是開課後背景備 20 分鐘的課
    const first = await start(userId, 20);
    expect(summary(await settled(userId))).toEqual({ 20: 'none', 30: 'none', 40: 'none' });
    expect(lessonCalls).toBe(1); // 沒有接著去試 30 與 40 分鐘
    expect((await call('GET', `/sessions/${first.id}`)).json.status).toBe('in_progress');

    await finish(first);
    expect(summary(await settled(userId))).toEqual(ALL_PREPARED);
    expect(lessonCalls).toBe(4);
  });

  it('沒備好的長度,下次開課時照常現場產生', async () => {
    const userId = await newUser();
    failOnCall = 1;
    const first = await start(userId, 20);
    await settled(userId);
    await abandon(first); // 放棄這堂課,所以也沒有「上完課時再試一次」

    const second = await start(userId, 30); // 第 2 次呼叫:現場產生
    expect(second.lesson.title).toBe('Lesson 2');
    expect(summary(await settled(userId))).toEqual(ALL_PREPARED);
  });
});

describe('額度與設定', () => {
  // 免費額度有限。背景備課只補「被用掉的那一堂」,不會每次開課都把三種長度重做一遍。
  it('連上三堂 20 分鐘的課,總共產生五堂:三種長度各備一堂,之後每用掉一堂補一堂', async () => {
    const userId = await newUser();
    for (let i = 0; i < 3; i++) {
      await finish(await start(userId, 20));
      await settled(userId);
    }
    expect(lessonCalls).toBe(5);
  });

  it('關閉背景備課時仍然使用起始課,但不會在背景產生任何課', async () => {
    await restart({ prepareAhead: false });
    const userId = await newUser();
    const session = await start(userId, 20);
    expect(session.lesson.title).toBe(STARTER.lesson.title);
    await finish(session);

    expect(lessonCalls).toBe(0);
    expect(summary(await status(userId))).toEqual({ 20: 'none', 30: 'none', 40: 'none' });
  });

  // 額度很緊的人可以只備常用的長度,其他長度要用時再現場產生。
  it('可以設定背景只備某些長度', async () => {
    await restart({ prepareMinutes: [20] });
    const userId = await newUser();
    await start(userId, 20);
    expect(summary(await settled(userId))).toEqual({ 20: 'prepared', 30: 'none', 40: 'none' });
    expect(lessonCalls).toBe(1);
  });

  // 上完課就關掉程式是很常見的用法;備好的課要留到下次啟動。
  it('備好的課存在資料庫裡,程式重新啟動後仍然可以直接取用', async () => {
    const userId = await newUser();
    await abandon(await start(userId, 20));
    await settled(userId);

    await restart(); // 新的伺服器,記憶體裡沒有任何狀態
    expect(summary(await status(userId))).toEqual(ALL_PREPARED);
    closeGate();
    expect((await start(userId, 30)).lesson.title).toBe('Lesson 2');
  });

  it('刪除使用者時一併刪除替他備好的課', async () => {
    const userId = await newUser();
    await start(userId, 20);
    await settled(userId);
    await call('DELETE', `/users/${userId}`);
    expect((db.prepare('SELECT COUNT(*) AS n FROM prepared_lessons').get() as { n: number }).n).toBe(0);
  });
});

describe('等待時間的預估:需要等的時候,畫面用它顯示進度條與剩餘時間', () => {
  it('可以馬上開始的長度不用等;要現場產生的長度回報預估秒數', async () => {
    const userId = await newUser();
    // 還沒有任何實際紀錄時,用預設的 60 秒。
    expect((await status(userId)).lengths.map((length) => length.waitSeconds)).toEqual([0, 60, 60]);
  });

  // 預估來自過去實際花的時間:換了比較快或比較慢的模型,進度條要跟著調整,而不是永遠用同一個數字。
  it('預估秒數跟著實際花費的時間調整,新的紀錄比重較高但不會完全蓋過舊的', async () => {
    const userId = await newUser();
    recordTaskTiming(db, 'lesson', 20_000);
    expect(taskTimings(db)).toEqual({ lesson: 20, grade: 30 });
    recordTaskTiming(db, 'lesson', 40_000);
    expect(taskTimings(db).lesson).toBe(26); // 20 × 0.7 + 40 × 0.3

    expect((await call('GET', '/sessions/timings')).json).toEqual({ lesson: 26, grade: 30 });
    expect((await status(userId)).lengths.map((length) => length.waitSeconds)).toEqual([0, 26, 26]);
  });

  it('產生課程與批改實際花的時間會被記錄下來', async () => {
    const userId = await newUser();
    await finish(await start(userId, 30), 'I played badminton with my friends yesterday.');
    const tasks =(db.prepare('SELECT task FROM task_timings ORDER BY task').all() as { task: string }[]).map((row) => row.task);
    expect(tasks).toEqual(['grade', 'lesson']);
  });

  // 正在產生的那一堂只要等它剩下的時間;排在後面的長度現在按開始,還要再加上自己那一堂的時間。
  it('背景正在準備的那一堂只算剩下的時間,還沒輪到的要多算一堂', async () => {
    const userId = await newUser();
    closeGate();
    await start(userId, 20); // 起始課;背景開始備 20 分鐘(卡住),30 與 40 排隊中

    expect((await status(userId)).lengths).toEqual([
      { minutes: 20, state: 'preparing', source: null, waitSeconds: 60 },
      { minutes: 30, state: 'preparing', source: null, waitSeconds: 120 },
      { minutes: 40, state: 'preparing', source: null, waitSeconds: 120 },
    ]);
  });

  // 預估只是推估。實際比預估久的時候,不能顯示「剩 0 秒」甚至負數,讓人以為當掉了。
  it('實際等得比預估久時,剩餘時間不會變成 0 或負數', async () => {
    const userId = await newUser();
    let clock = 1_000_000;
    const preparer = createPreparer(db, provider(), { enabled: true, minutes: [20, 30, 40], now: () => clock });
    const student = { id: userId, level: 'A2', stage: 'junior', apiKey: 'key' } as const;
    closeGate();
    preparer.replenish(student, 30);
    await pause(10);

    clock += 600_000; // 已經等了 10 分鐘,遠超過預估的 60 秒
    const waiting = preparer.status(student).lengths.find((length) => length.minutes === 30)!;
    expect(waiting.state).toBe('preparing');
    expect(waiting.waitSeconds).toBe(5);

    gate!.release();
    await preparer.idle(userId);
  });
});

describe('升級舊版資料庫', () => {
  // 舊版每位使用者只存一堂備好的課(主鍵是 user_id)。升級時不能把已經備好的課弄丟,而且之後要能再存其他長度。
  it('舊格式的備課資料表會改成新格式,原本備好的那一堂保留下來', () => {
    const dir = mkdtempSync(join(tmpdir(), 'english-lesson-test-'));
    const path = join(dir, 'english.db');
    try {
      const old = openDb(path);
      old.prepare(`INSERT INTO users (name, stage, level, api_key) VALUES ('小明', 'junior', 'A2', 'key')`).run();
      old.exec('DROP TABLE prepared_lessons');
      old.exec(`CREATE TABLE prepared_lessons (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        level TEXT NOT NULL, stage TEXT NOT NULL, minutes INTEGER NOT NULL, topic TEXT NOT NULL, grammar_point TEXT NOT NULL,
        lesson_json TEXT NOT NULL, novelty_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
      const insert = `INSERT INTO prepared_lessons (user_id, level, stage, minutes, topic, grammar_point, lesson_json, novelty_json) VALUES (1, 'A2', 'junior', ?, 'a school trip', 'past simple', ?, '{}')`;
      old.prepare(insert).run(30, JSON.stringify(lessonNumber(7)));
      old.close();

      const upgraded = openDb(path);
      const rows = upgraded.prepare('SELECT user_id, level, stage, minutes, topic, lesson_json FROM prepared_lessons').all() as unknown as { minutes: number; lesson_json: string }[];
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ user_id: 1, level: 'A2', stage: 'junior', minutes: 30, topic: 'a school trip' });
      expect((JSON.parse(rows[0]!.lesson_json) as Lesson).title).toBe('Lesson 7');
      // 新格式:同一位使用者可以再存另一種長度(舊格式的主鍵不允許)。
      expect(() => upgraded.prepare(insert).run(20, JSON.stringify(lessonNumber(8)))).not.toThrow();
      upgraded.close();

      // 再開一次不會重覆搬資料或出錯。
      const again = openDb(path);
      expect((again.prepare('SELECT COUNT(*) AS n FROM prepared_lessons').get() as { n: number }).n).toBe(2);
      again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
