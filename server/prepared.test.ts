import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PreparedStatus } from '../shared/api.ts';
import { lessonExercises, type Exercise } from '../shared/lesson.ts';
import { SessionStateSchema, STAGES, type Lesson, type SessionState, type SessionView } from '../shared/schema.ts';
import { LEVEL_GUIDES } from './ai/cefr.ts';
import { createMockProvider } from './ai/mock.ts';
import { MOCK_FIXTURES, MOCK_LESSON } from './ai/mockData.ts';
import { AiError, type AiJsonRequest, type AiProvider } from './ai/provider.ts';
import { createApp, type AppOptions } from './app.ts';
import { openDb, type Db } from './db.ts';
import { createPreparer } from './prepared.ts';
import { starterFor } from './starters/index.ts';
import { recordTaskTiming, taskTimings } from './timings.ts';

// 讓學生按「開始」時不用等:
// 沒上過的等級,第一堂課用內建的起始課;開課之後在背景把下一堂課備好。
// 課程長度依學習階段固定(國小 20、國中 25、高中與大學 30 分鐘),所以每個等級只需要備一堂。
// 沒有備好的課時,學生按「備課」請老師準備,備好了才開始。

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

/** 下一堂課的狀況,寫成好比對的樣子:可以馬上開始的寫來源(starter / prepared),否則寫狀態(preparing / none)。 */
const summary = (current: PreparedStatus) => current.source ?? current.state;

/** 等背景備課做完(成功或失敗),回傳之後的狀態。 */
async function settled(userId: number): Promise<PreparedStatus> {
  for (let i = 0; i < 400; i++) {
    const current = await status(userId);
    if (current.state !== 'preparing') return current;
    await new Promise((done) => setTimeout(done, 5));
  }
  throw new Error('背景備課一直沒有結束');
}

async function start(userId: number): Promise<SessionView> {
  const res = await call('POST', '/sessions', { userId });
  expect(res.status).toBe(201);
  return res.json;
}

/** 學生按下「備課」。 */
const prepare = (userId: number) => call('POST', '/sessions/prepare', { userId });

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

describe('內建起始課:沒上過的等級,第一堂課不用等', () => {
  // 這是功能的目的。AI 完全沒有回應(卡住)時,起始課仍然要能立刻開始。
  // 起始課是 20 分鐘的份量,所以照實記成 20 分鐘:對話的輪數、複習的題數才會和它的內容相稱。
  it('第一堂課直接用內建的起始課,不必等 AI', async () => {
    const userId = await newUser();
    closeGate();

    const session = await start(userId);
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

    const session = await start(userId);
    expect(session.level).toBe('B1');
    expect(session.lesson.title).toBe(starterFor('B1', 'junior').lesson.title);
  });

  // 國中以上的課比起始課長(25、30 分鐘)。第一堂寧可短一點也要馬上能上,所以每個學習階段都用起始課。
  it('每個學習階段的第一堂都用起始課,即使那個階段之後的課比較長', async () => {
    closeGate();
    for (const stage of STAGES) {
      const user = (await call('POST', '/users', { name: stage, stage })).json;
      await call('PUT', `/users/${user.id}/api-key`, { apiKey: 'key' });
      expect(await status(user.id), stage).toEqual({ minutes: 20, state: 'ready', source: 'starter', waitSeconds: 0 });
      const session = await start(user.id);
      expect(session.lesson.title, stage).toBe(starterFor(user.level, stage).lesson.title);
      expect(session.minutes, stage).toBe(20);
    }
  });

  // 起始課每位使用者都一樣、內容固定,只適合當第一堂;之後要上的是新的內容,長度照學習階段(國中 25 分鐘)。
  it('起始課只用在該等級的第一堂:上過之後,下一堂是新的內容,長度照學習階段', async () => {
    await restart({ prepareAhead: false }); // 沒有背景備課,第二堂沒有庫存可用,看得出它是不是又拿起始課
    const userId = await newUser();
    await finish(await start(userId));

    const second = await start(userId);
    expect(second.lesson.title).toBe('Lesson 1');
    expect(second.minutes).toBe(25);
  });

  // 起始課教過的東西要算進「上過的課」,否則下一堂 AI 課可能又教同一個主題、同一個文法、同一批單字。
  it('之後的課會避開起始課的主題與單字,文法重點從清單的下一項接著教', async () => {
    const userId = await newUser();
    await start(userId);
    await settled(userId);

    expect(lessonPrompts.map(grammarOf)).toEqual(LEVEL_GUIDES.A2.grammar.slice(1, 2));
    expect(lessonPrompts.map(topicOf)).not.toContain(STARTER.topic);
    expect(lessonPrompts[0]).toContain(STARTER.lesson.vocab[0]!.word);
  });

  // 對話與批改都需要 key。沒有 key 就讓學生開始上起始課的話,課上到一半會卡住。
  it('沒有設定 API key 的使用者不能開課(起始課也不行)、不能備課,也不會在背景備課', async () => {
    const user = (await call('POST', '/users', { name: '沒有 key', stage: 'junior' })).json;
    expect((await call('POST', '/sessions', { userId: user.id })).status).toBe(400);
    const refused = await prepare(user.id);
    expect(refused.status).toBe(400);
    expect(refused.json.error.code).toBe('no_key');
    expect(lessonCalls).toBe(0);
  });
});

describe('課程長度依學習階段固定', () => {
  // 年紀越小,能專心的時間越短。長度不讓學生選,所以備課時要照學習階段的長度請 AI 出課。
  it('AI 出的課:國小 20、國中 25、高中與大學 30 分鐘', async () => {
    const lengths: Record<string, number> = {};
    for (const stage of STAGES) {
      const user = (await call('POST', '/users', { name: stage, stage })).json;
      await call('PUT', `/users/${user.id}/api-key`, { apiKey: 'key' });
      await start(user.id); // 起始課;背景接著備下一堂
      lengths[stage] = (await settled(user.id)).minutes;
    }
    expect(lengths).toEqual({ elementary: 20, junior: 25, senior: 30, university: 30 });
    expect(lessonPrompts.map(minutesOf)).toEqual([20, 25, 30, 30]);
  });
});

describe('背景備課:開課之後,把下一堂課備好', () => {
  it('課一開始,就在背景把下一堂課備好', async () => {
    const userId = await newUser();
    expect(summary(await status(userId))).toBe('starter');

    await start(userId);
    expect(await settled(userId)).toEqual({ minutes: 25, state: 'ready', source: 'prepared', waitSeconds: 0 });
    expect(lessonCalls).toBe(1);
  });

  // 這是整個功能的目的:按下開始時不用等 AI。
  it('備好之後馬上能開始,不必等 AI', async () => {
    const userId = await newUser();
    await finish(await start(userId));
    await settled(userId);

    // 讓之後任何「產生課程」的呼叫都卡住:如果開課還需要等 AI,請求就不會回來。
    closeGate();
    const session = await start(userId);
    expect(session.minutes).toBe(25);
    expect(session.lesson.title).toBe('Lesson 1');
  });

  // 切到別的等級看看再切回來是很常見的操作。備好的課如果因此作廢,就要重新等,也白白多用額度。
  it('切換等級不會丟掉備好的課:切回來可以直接用', async () => {
    const userId = await newUser();
    await finish(await start(userId));
    await settled(userId); // 替 A2 備好一堂:第 1 次呼叫

    await call('PATCH', `/users/${userId}`, { level: 'B1' });
    // A2 備好的課是 A2 的難度,不能拿來給 B1 用;B1 還沒上過,所以是起始課。
    expect(summary(await status(userId))).toBe('starter');
    await finish(await start(userId));
    await settled(userId); // 替 B1 備好一堂:第 2 次呼叫

    await call('PATCH', `/users/${userId}`, { level: 'A2' });
    expect(summary(await status(userId))).toBe('prepared');
    closeGate();
    const back = await start(userId);
    expect(back.level).toBe('A2');
    expect(back.lesson.title).toBe('Lesson 1'); // 當初替 A2 備好的那一堂
    expect(lessonCalls).toBe(3); // 只多了一次:補回剛用掉的那堂
  });

  it('新等級的課照新等級的難度產生', async () => {
    const userId = await newUser();
    await call('PATCH', `/users/${userId}`, { level: 'B1' });
    await start(userId);
    await settled(userId);
    expect(lessonPrompts).toHaveLength(1);
    expect(lessonPrompts[0]).toContain('CEFR level: B1');
  });

  // 如果這時另外再現場產生一份,會白白多用一次額度,而且兩份會挑到同一個主題。
  it('背景正在準備下一堂時按開始:等它做完並使用那一份,不另外產生', async () => {
    const userId = await newUser();
    await finish(await start(userId));
    await settled(userId); // 第 1 次呼叫:備好的一堂

    closeGate();
    await abandon(await start(userId)); // 用掉備好的那堂;背景開始補(第 2 次呼叫,卡住)
    expect(lessonCalls).toBe(2);

    const pending = start(userId); // 下一堂還在準備中
    await pause(30);
    expect(lessonCalls).toBe(2); // 沒有另外發出產生課程的呼叫
    gate!.release();
    expect((await pending).lesson.title).toBe('Lesson 2');
  });

  it('放棄正在上的課,備好的課仍然保留', async () => {
    const userId = await newUser();
    const first = await start(userId);
    await settled(userId);
    await abandon(first);
    expect(summary(await status(userId))).toBe('prepared');
  });

  it('重上舊課不會用掉備好的課', async () => {
    const userId = await newUser();
    const first = await finish(await start(userId));
    await settled(userId);
    const before = lessonCalls;

    expect((await call('POST', `/sessions/${first.id}/retake`)).status).toBe(201);
    expect(summary(await status(userId))).toBe('prepared');
    expect(lessonCalls).toBe(before);
  });

  it('每位使用者各自備課,互不影響', async () => {
    const a = await newUser('小明');
    const b = await newUser('小華');
    await start(a);
    expect(summary(await settled(a))).toBe('prepared');
    expect(summary(await status(b))).toBe('starter');
  });
});

describe('「備課」按鈕:沒有備好的課時,由學生請老師準備', () => {
  /** 一位上過起始課、沒有任何備好的課的學生(背景備課關著)。 */
  async function studentWithoutStock(): Promise<number> {
    await restart({ prepareAhead: false });
    const userId = await newUser();
    await finish(await start(userId));
    return userId;
  }

  // 畫面靠這個狀態決定顯示「備課」而不是「開始」:沒有課可以馬上上的時候,不讓學生按了開始才發現要等。
  it('沒有備好的課時,狀態是「還沒備好」,並附上預估要等多久', async () => {
    const userId = await studentWithoutStock();
    expect(await status(userId)).toEqual({ minutes: 25, state: 'none', source: null, waitSeconds: 60 });
  });

  it('按下備課:備好才回應;之後按開始馬上能上,不必再等 AI', async () => {
    const userId = await studentWithoutStock();
    const res = await prepare(userId);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ minutes: 25, state: 'ready', source: 'prepared', waitSeconds: 0 });
    expect(lessonCalls).toBe(1);

    closeGate();
    const session = await start(userId);
    expect(session.lesson.title).toBe('Lesson 1');
    expect(session.minutes).toBe(25);
  });

  // 備課要幾十秒。這段時間重新整理頁面,畫面要知道老師還在備課(顯示進度),而不是又出現一個「備課」按鈕。
  it('還沒備好之前不會回應;這段時間查到的狀態是「正在備課」', async () => {
    const userId = await studentWithoutStock();
    closeGate();
    let answered = false;
    const pending = prepare(userId).then((res) => {
      answered = true;
      return res;
    });
    await pause(30);
    expect(answered).toBe(false);
    expect((await status(userId)).state).toBe('preparing');

    gate!.release();
    expect((await pending).status).toBe(200);
  });

  // 背景備課失敗時沒有畫面可看;學生自己按的就要當場知道為什麼不成,而且可以再試。
  it('備不成時回報原因(例如額度用完),狀態回到「還沒備好」,之後可以再按一次', async () => {
    const userId = await studentWithoutStock();
    failOnCall = 1;
    const failed = await prepare(userId);
    expect(failed.status).toBe(429);
    expect(failed.json.error.code).toBe('quota');
    expect((await status(userId)).state).toBe('none');

    expect((await prepare(userId)).status).toBe(200);
    expect(summary(await status(userId))).toBe('prepared');
  });

  // 備一堂課用掉一次每天只有 20 次的額度。
  it('連按兩次,或開了兩個分頁同時按:只備一堂', async () => {
    const userId = await studentWithoutStock();
    const [first, second] = await Promise.all([prepare(userId), prepare(userId)]);
    expect([first.status, second.status]).toEqual([200, 200]);
    await prepare(userId);
    expect(lessonCalls).toBe(1);
  });

  it('背景已經在備這堂課時按備課:等它做完,不另外產生', async () => {
    const userId = await newUser();
    closeGate();
    await start(userId); // 起始課;背景開始備下一堂(第 1 次呼叫,卡住)
    const pending = prepare(userId);
    await pause(30);
    expect(lessonCalls).toBe(1);
    gate!.release();
    expect((await pending).json).toMatchObject({ state: 'ready', source: 'prepared' });
    expect(lessonCalls).toBe(1);
  });

  it('還有起始課可以上時按備課:不需要請 AI 產生任何課', async () => {
    const userId = await newUser();
    const res = await prepare(userId);
    expect(res.json).toMatchObject({ state: 'ready', source: 'starter' });
    expect(lessonCalls).toBe(0);
  });
});

describe('背景備課失敗', () => {
  // 失敗多半是額度用完或模型忙線。一直重試只會一直碰壁,所以先停下來;正在上的課不受影響。
  it('沒備好就先停下來,不影響正在上的課;上完課時再試一次', async () => {
    const userId = await newUser();
    failOnCall = 1; // 第 1 次呼叫是開課後背景備下一堂
    const first = await start(userId);
    expect(summary(await settled(userId))).toBe('none');
    expect(lessonCalls).toBe(1);
    expect((await call('GET', `/sessions/${first.id}`)).json.status).toBe('in_progress');

    await finish(first);
    expect(summary(await settled(userId))).toBe('prepared');
    expect(lessonCalls).toBe(2);
  });
});

describe('額度與設定', () => {
  // 免費額度有限。每上一堂課只備一堂:用掉一堂補一堂。
  it('連上三堂課,總共只請 AI 產生三堂:每用掉一堂補一堂', async () => {
    const userId = await newUser();
    for (let i = 0; i < 3; i++) {
      await finish(await start(userId));
      await settled(userId);
    }
    expect(lessonCalls).toBe(3);
  });

  // 關掉背景備課的人不想提前用掉額度;下一堂課等他自己按「備課」才準備。
  it('關閉背景備課時仍然使用起始課,但不會在背景產生任何課', async () => {
    await restart({ prepareAhead: false });
    const userId = await newUser();
    const session = await start(userId);
    expect(session.lesson.title).toBe(STARTER.lesson.title);
    await finish(session);

    expect(lessonCalls).toBe(0);
    expect(summary(await status(userId))).toBe('none');
  });

  // 上完課就關掉程式是很常見的用法;備好的課要留到下次啟動。
  it('備好的課存在資料庫裡,程式重新啟動後仍然可以直接取用', async () => {
    const userId = await newUser();
    await finish(await start(userId));
    await settled(userId);

    await restart(); // 新的伺服器,記憶體裡沒有任何狀態
    expect(summary(await status(userId))).toBe('prepared');
    closeGate();
    expect((await start(userId)).lesson.title).toBe('Lesson 1');
  });

  it('刪除使用者時一併刪除替他備好的課', async () => {
    const userId = await newUser();
    await start(userId);
    await settled(userId);
    await call('DELETE', `/users/${userId}`);
    expect((db.prepare('SELECT COUNT(*) AS n FROM prepared_lessons').get() as { n: number }).n).toBe(0);
  });
});

describe('等待時間的預估:需要等的時候,畫面用它顯示進度條與剩餘時間', () => {
  /** 沒有起始課可用的備課程式:時鐘由測試控制。 */
  function timedPreparer() {
    const clock = { now: 1_000_000 };
    return { clock, preparer: createPreparer(db, provider(), { enabled: true, starters: false, now: () => clock.now }) };
  }

  it('可以馬上開始時不用等;還沒備好時回報預估秒數', async () => {
    await restart({ prepareAhead: false });
    const userId = await newUser();
    expect((await status(userId)).waitSeconds).toBe(0);
    await finish(await start(userId));
    // 還沒有任何實際紀錄時,用預設的 60 秒。
    expect((await status(userId)).waitSeconds).toBe(60);
  });

  // 預估來自過去實際花的時間:換了比較快或比較慢的模型,進度條要跟著調整,而不是永遠用同一個數字。
  it('預估秒數跟著實際花費的時間調整,新的紀錄比重較高但不會完全蓋過舊的', async () => {
    await restart({ prepareAhead: false });
    const userId = await newUser();
    await finish(await start(userId));
    recordTaskTiming(db, 'lesson', 20_000);
    expect(taskTimings(db)).toMatchObject({ lesson: 20, grade: 30 });
    recordTaskTiming(db, 'lesson', 40_000);
    expect(taskTimings(db).lesson).toBe(26); // 20 × 0.7 + 40 × 0.3

    expect((await call('GET', '/sessions/timings')).json).toMatchObject({ lesson: 26, grade: 30 });
    expect((await status(userId)).waitSeconds).toBe(26);
  });

  it('產生課程與批改實際花的時間會被記錄下來', async () => {
    const userId = await newUser();
    const first = await start(userId);
    await settled(userId); // 背景請 AI 備了下一堂
    await finish(first, 'I played badminton with my friends yesterday.');
    const tasks = (db.prepare('SELECT task FROM task_timings ORDER BY task').all() as { task: string }[]).map((row) => row.task);
    expect(tasks).toEqual(['grade', 'lesson']);
  });

  it('正在備的那一堂只算剩下的時間', async () => {
    const userId = await newUser();
    closeGate();
    await start(userId); // 起始課;背景開始備下一堂(卡住)

    expect(await status(userId)).toEqual({ minutes: 25, state: 'preparing', source: null, waitSeconds: 60 });
  });

  // 剛換等級時,背景可能還在產生上一個等級的課。同一位使用者一次只產生一堂,所以新等級的課要排在它後面。
  it('別的等級的課還在產生時:這個等級還沒備好,要等的時間多算正在產生的那一堂', async () => {
    const userId = await newUser();
    const { preparer } = timedPreparer();
    closeGate();
    preparer.replenish({ id: userId, level: 'A2', stage: 'junior', apiKey: 'key' });
    await pause(10);

    expect(preparer.status({ id: userId, level: 'A2', stage: 'junior' })).toMatchObject({ state: 'preparing', waitSeconds: 60 });
    expect(preparer.status({ id: userId, level: 'B1', stage: 'junior' })).toMatchObject({ state: 'none', waitSeconds: 120 });

    gate!.release();
    await preparer.idle(userId);
  });

  // 預估只是推估。實際比預估久的時候,不能顯示「剩 0 秒」甚至負數,讓人以為當掉了。
  it('實際等得比預估久時,剩餘時間不會變成 0 或負數', async () => {
    const userId = await newUser();
    const { preparer, clock } = timedPreparer();
    const student = { id: userId, level: 'A2', stage: 'junior', apiKey: 'key' } as const;
    closeGate();
    preparer.replenish(student);
    await pause(10);

    clock.now += 600_000; // 已經等了 10 分鐘,遠超過預估的 60 秒
    expect(preparer.status(student)).toMatchObject({ state: 'preparing', waitSeconds: 5 });

    gate!.release();
    await preparer.idle(userId);
  });
});

describe('升級舊版資料庫', () => {
  const insert = `INSERT INTO prepared_lessons (user_id, level, stage, minutes, topic, grammar_point, lesson_json, novelty_json) VALUES (?, ?, ?, ?, 'a school trip', 'past simple', ?, '{}')`;

  /** 在暫存的資料庫檔案上做事,做完刪掉。 */
  function withDbFile(run: (path: string) => void): void {
    const dir = mkdtempSync(join(tmpdir(), 'english-lesson-test-'));
    try {
      run(join(dir, 'english.db'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // 舊版每位使用者只存一堂備好的課(主鍵是 user_id)。升級時不能把已經備好的課弄丟,而且之後要能替別的等級再存一堂。
  it('舊格式的備課資料表會改成新格式,原本備好的那一堂保留下來', () => {
    withDbFile((path) => {
      const old = openDb(path);
      old.prepare(`INSERT INTO users (name, stage, level, api_key) VALUES ('小明', 'senior', 'B1', 'key')`).run();
      old.exec('DROP TABLE prepared_lessons');
      old.exec(`CREATE TABLE prepared_lessons (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        level TEXT NOT NULL, stage TEXT NOT NULL, minutes INTEGER NOT NULL, topic TEXT NOT NULL, grammar_point TEXT NOT NULL,
        lesson_json TEXT NOT NULL, novelty_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
      old.prepare(insert).run(1, 'B1', 'senior', 30, JSON.stringify(lessonNumber(7)));
      old.close();

      const upgraded = openDb(path);
      const rows = upgraded.prepare('SELECT user_id, level, stage, minutes, topic, lesson_json FROM prepared_lessons').all() as unknown as { minutes: number; lesson_json: string }[];
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ user_id: 1, level: 'B1', stage: 'senior', minutes: 30, topic: 'a school trip' });
      expect((JSON.parse(rows[0]!.lesson_json) as Lesson).title).toBe('Lesson 7');
      // 新格式:同一位使用者可以替另一個等級再存一堂(舊格式的主鍵不允許)。
      expect(() => upgraded.prepare(insert).run(1, 'B2', 'senior', 30, JSON.stringify(lessonNumber(8)))).not.toThrow();
      upgraded.close();

      // 再開一次不會重覆搬資料或出錯。
      const again = openDb(path);
      expect((again.prepare('SELECT COUNT(*) AS n FROM prepared_lessons').get() as { n: number }).n).toBe(2);
      again.close();
    });
  });

  // 以前可以自己選 20、30、40 分鐘,每種長度各備一堂。長度改成依學習階段固定之後,其他長度的課不會再被取用;
  // 留著的話,程式還會替它們製作聽力音檔,白白用掉一天只有 20 次的語音合成額度。
  it('以前替其他長度備好的課會清掉;符合學習階段長度的保留', () => {
    withDbFile((path) => {
      const old = openDb(path);
      old.prepare(`INSERT INTO users (name, stage, level, api_key) VALUES ('高中生', 'senior', 'B1', 'key'), ('國小生', 'elementary', 'A1', 'key')`).run();
      for (const minutes of [20, 30, 40]) {
        old.prepare(insert).run(1, 'B1', 'senior', minutes, JSON.stringify(lessonNumber(minutes)));
        old.prepare(insert).run(2, 'A1', 'elementary', minutes, JSON.stringify(lessonNumber(minutes)));
      }
      old.close();

      const upgraded = openDb(path);
      const rows = upgraded.prepare('SELECT stage, minutes FROM prepared_lessons ORDER BY user_id').all() as unknown as { stage: string; minutes: number }[];
      expect(rows.map((row) => ({ ...row }))).toEqual([
        { stage: 'senior', minutes: 30 },
        { stage: 'elementary', minutes: 20 },
      ]);
      upgraded.close();
    });
  });

  // 使用者改了學習階段(升學,或更正設定)之後,替原本階段備的課不會再上;不清掉的話,它和它的聽力音檔會一直留著。
  it('替使用者已經不在的學習階段備好的課會清掉', () => {
    withDbFile((path) => {
      const old = openDb(path);
      old.prepare(`INSERT INTO users (name, stage, level, api_key) VALUES ('改成國中', 'junior', 'B1', 'key')`).run();
      old.prepare(insert).run(1, 'B1', 'senior', 30, JSON.stringify(lessonNumber(1))); // 還是高中時備的
      old.prepare(insert).run(1, 'B1', 'junior', 25, JSON.stringify(lessonNumber(2)));
      old.close();

      const upgraded = openDb(path);
      const rows = upgraded.prepare('SELECT stage, minutes FROM prepared_lessons').all() as unknown as { stage: string; minutes: number }[];
      expect(rows.map((row) => ({ ...row }))).toEqual([{ stage: 'junior', minutes: 25 }]);
      upgraded.close();
    });
  });

  // 切到別的等級看看再切回來很常見;切回來時要能直接上,不必重新備課。
  it('替別的等級備好的課不會清掉', () => {
    withDbFile((path) => {
      const old = openDb(path);
      old.prepare(`INSERT INTO users (name, stage, level, api_key) VALUES ('切到 B2', 'senior', 'B2', 'key')`).run();
      old.prepare(insert).run(1, 'B1', 'senior', 30, JSON.stringify(lessonNumber(1)));
      old.close();

      const reopened = openDb(path);
      expect((reopened.prepare('SELECT COUNT(*) AS n FROM prepared_lessons').get() as { n: number }).n).toBe(1);
      reopened.close();
    });
  });
});
