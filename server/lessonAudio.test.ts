import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LessonAudioInfo, PreparedStatus, QuotaNotice } from '../shared/api.ts';
import { lessonExercises, type Exercise } from '../shared/lesson.ts';
import { SessionStateSchema, type Lesson, type Minutes, type SessionState, type SessionView } from '../shared/schema.ts';
import { createMockProvider } from './ai/mock.ts';
import { MOCK_FIXTURES, MOCK_LESSON } from './ai/mockData.ts';
import { AiError, type AiJsonRequest, type AiProvider } from './ai/provider.ts';
import type { SpeechVoice } from './ai/speech.ts';
import { createApp, type AppOptions } from './app.ts';
import { openDb, type Db } from './db.ts';
import { clipId, readingStyle } from './lessonAudio.ts';
import { starterFor } from './starters/index.ts';

// 聽力課文與聽寫句子用語音合成事先唸好(聲音比瀏覽器朗讀自然)。
// 免費方案一天只有 20 次,所以這裡測的重點是:先做最重要的、同樣的內容不重做、用不到的不做,
// 以及任何一段沒有音檔時網頁都知道(那一段會改用瀏覽器朗讀),不會讓學生聽不到。

let db: Db;
let server: Server;
let base: string;
let dir: string;
/** 語音合成被要求唸過的內容,依先後順序。 */
let spoken: { text: string; style: string; apiKey: string }[];
/** 從第幾次語音合成開始失敗(今天的額度用完);null 表示都成功。 */
let failFrom: number | null;
/** 模型做不出來的文字(例如太長而被拒絕)。 */
let refused: string | null;
/** 設定之後,語音合成會停在半路,直到呼叫 release();用來模擬還沒唸好。 */
let gate: { wait: Promise<void>; release: () => void } | null;
/** 「產生課程」被呼叫了幾次。 */
let lessonCalls: number;

/** 測試用的使用者是國中、A2,第一堂 20 分鐘的課是這堂內建的起始課。 */
const STARTER = starterFor('A2', 'junior').lesson;

/** AI 產生的第 n 堂課:課文與聽寫句子都和其他堂不同,從文字就看得出是哪一堂的。 */
function lessonNumber(n: number): Lesson {
  const lesson = structuredClone(MOCK_LESSON);
  lesson.title = `Lesson ${n}`;
  lesson.passage.text = `Passage ${n}: ` + Array.from({ length: 40 }, (_, i) => `w${n}x${i}`).join(' ') + '.';
  lesson.vocab = lesson.vocab.map((vocab, i) => ({ ...vocab, word: `word${n}n${i}` }));
  lesson.listening.dictation = [`Dictation ${n} one.`, `Dictation ${n} two.`];
  return lesson;
}

function provider(): AiProvider {
  const inner = createMockProvider({ ...MOCK_FIXTURES, lesson: () => lessonNumber(lessonCalls) });
  return {
    ...inner,
    async generateJson<T>(request: AiJsonRequest<T>): Promise<T> {
      if (request.task === 'lesson') lessonCalls++;
      return inner.generateJson(request);
    },
  };
}

const voice: SpeechVoice = {
  models: ['tts-test'],
  async synthesize({ apiKey, text, style, onUsage, onQuota }) {
    spoken.push({ text, style, apiKey });
    const call = spoken.length;
    if (gate) await gate.wait;
    if (text === refused) throw new AiError('bad_output', 'INVALID_ARGUMENT');
    if (failFrom !== null && call >= failFrom) {
      onQuota?.({ model: 'tts-test', scope: 'day', retryAfterSeconds: null });
      throw new AiError('quota', 'per day');
    }
    onUsage?.({ model: 'tts-test', inputTokens: 10, outputTokens: 100, durationMs: 5 });
    return Buffer.from(`wav:${text}`);
  },
};

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
  const app = createApp({ db, ai: provider(), speech: { voice, dir }, ...options });
  server = await new Promise<Server>((done) => {
    const listening = app.listen(0, '127.0.0.1', () => done(listening));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
}

async function restart(options: Partial<AppOptions> = {}): Promise<void> {
  await new Promise((done) => server.close(done));
  await listen(options);
}

beforeEach(async () => {
  spoken = [];
  failFrom = null;
  refused = null;
  gate = null;
  lessonCalls = 0;
  dir = mkdtempSync(join(tmpdir(), 'lesson-audio-'));
  db = openDb(':memory:');
  await listen();
});

afterEach(async () => {
  gate?.release();
  await new Promise((done) => server.close(done));
  db.close();
  rmSync(dir, { recursive: true, force: true });
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
  await call('PUT', `/users/${user.id}/api-key`, { apiKey: 'user-key' });
  return user.id;
}

async function start(userId: number, minutes: Minutes = 20): Promise<SessionView> {
  const res = await call('POST', '/sessions', { userId, minutes });
  expect(res.status).toBe(201);
  return res.json;
}

const correct = (exercise: Exercise): string =>
  exercise.type === 'mcq' ? String(exercise.answerIndex) : exercise.type === 'cloze' ? exercise.answers[0]! : exercise.type === 'flashcard' ? 'known' : exercise.sentence;

/** 把課上完(沒有寫作內容,不會請 AI 批改)。 */
async function finish(session: SessionView): Promise<void> {
  const answers = Object.fromEntries(lessonExercises(session.lesson).map(({ key, exercise }) => [key, { attempts: [correct(exercise)], hintUsed: false }]));
  const state: SessionState = { ...SessionStateSchema.parse({}), answers, chatUnavailable: true };
  expect((await call('POST', `/sessions/${session.id}/complete`, { state })).status).toBe(200);
}

const pause = (milliseconds: number) => new Promise((done) => setTimeout(done, milliseconds));

/** 網頁進入一堂課(或換到下一個步驟)時做的事:請伺服器把還缺的音檔做出來。 */
const enter = async (session: SessionView): Promise<LessonAudioInfo> => (await call('POST', `/sessions/${session.id}/audio`)).json;
/** 網頁等待時做的事:只問現在有哪些音檔。 */
const ask = async (session: SessionView): Promise<LessonAudioInfo> => (await call('GET', `/sessions/${session.id}/audio`)).json;

/** 等背景的音檔工作結束(做完或停下來),回傳之後的狀況。 */
async function done(session: SessionView): Promise<LessonAudioInfo> {
  for (let i = 0; i < 400; i++) {
    const info = await ask(session);
    if (!info.working) return info;
    await pause(5);
  }
  throw new Error('背景的音檔工作一直沒有結束');
}

/** 進入一堂課,並等它的音檔做完。 */
async function prepared(session: SessionView): Promise<LessonAudioInfo> {
  await enter(session);
  return done(session);
}

/** 等背景備課做完。 */
async function stocked(userId: number): Promise<void> {
  for (let i = 0; i < 400; i++) {
    const status: PreparedStatus = (await call('GET', `/sessions/prepared?userId=${userId}`)).json;
    if (status.lengths.every((length) => length.state === 'ready')) return;
    await pause(5);
  }
  throw new Error('背景備課一直沒有結束');
}

const texts = () => spoken.map((entry) => entry.text);
const files = () => readdirSync(dir).length;
const starterTexts = [STARTER.passage.text, ...STARTER.listening.dictation];

describe('聽力音檔:進入一堂課時在背景唸好', () => {
  // 課文最長、也是聽力的主體,先做;額度只夠做一段時,做的是課文。
  it('課文先做,再做聽寫句子;做好之後網頁拿得到每一段的網址', async () => {
    const session = await start(await newUser());
    const info = await prepared(session);
    expect(texts()).toEqual(starterTexts);
    expect(Object.keys(info.clips).sort()).toEqual([...starterTexts].sort());
  });

  it('網址拿到的就是那一段文字唸出來的聲音', async () => {
    const session = await start(await newUser());
    const { clips } = await prepared(session);
    const res = await fetch(base.replace(/\/api$/, '') + clips[STARTER.passage.text]);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/wav');
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe(`wav:${STARTER.passage.text}`);
  });

  // 瀏覽器朗讀時 A1、A2 會放慢;換成事先唸好的聲音之後,初學者聽到的不能反而變快。
  it('用使用者自己的 key;初學者(A2)的課唸得慢,高等級的課用自然的速度', async () => {
    const session = await start(await newUser());
    await prepared(session);
    expect(spoken.every((entry) => entry.apiKey === 'user-key')).toBe(true);
    expect(spoken.every((entry) => entry.style === readingStyle('A2'))).toBe(true);
    expect(readingStyle('A2')).toMatch(/slowly/i);
    expect(readingStyle('B2')).not.toMatch(/slow/i);
  });

  // 沒有網址的那一段,網頁會用瀏覽器朗讀;所以還沒做好時不能給出網址。
  it('還沒唸好的內容不給網址,並回報背景還在做', async () => {
    closeGate();
    const session = await start(await newUser());
    expect(await enter(session)).toEqual({ clips: {}, working: true });
    gate!.release();
    const info = await done(session);
    expect(Object.keys(info.clips)).toHaveLength(3);
  });

  // 語音合成一天只有 20 次。
  it('同樣的內容只唸一次:再進入同一堂課、換步驟,都不會重做', async () => {
    const session = await start(await newUser());
    await prepared(session);
    await prepared(session);
    await prepared(session);
    expect(spoken).toHaveLength(3);
  });

  it('兩位使用者上同一堂起始課,共用同一份音檔', async () => {
    await prepared(await start(await newUser('小明')));
    const info = await prepared(await start(await newUser('小華')));
    expect(spoken).toHaveLength(3);
    expect(Object.keys(info.clips)).toHaveLength(3);
  });

  it('音檔留在硬碟上:程式重新啟動後不必重做', async () => {
    const session = await start(await newUser());
    await prepared(session);
    await restart();
    const info = await prepared(session);
    expect(spoken).toHaveLength(3);
    expect(Object.keys(info.clips)).toHaveLength(3);
  });

  // 等級不同,唸的速度不同;如果共用,切到高等級後聽到的還是放慢的版本。
  it('同一段文字在唸法不同的等級各有一份音檔;唸法相同的等級共用', () => {
    expect(clipId('We went home.', 'A2')).not.toBe(clipId('We went home.', 'B2'));
    expect(clipId('We went home.', 'A1')).toBe(clipId('We went home.', 'A2'));
    expect(clipId('We went home.', 'A2')).not.toBe(clipId('We went to school.', 'A2'));
  });

  // 共用同一把 key 的使用者額度也共用(每分鐘 3 次);兩個人的音檔同時做,會互相擠到上限。
  it('一次只做一段:另一位使用者的音檔排在後面', async () => {
    closeGate();
    const first = await start(await newUser('小明'));
    const second = await start(await newUser('小華'), 30);
    await enter(first);
    await enter(second);
    await pause(20);
    expect(spoken).toHaveLength(1);
    gate!.release();
    await done(first);
    await done(second);
    expect(spoken).toHaveLength(6);
  });

  // 設定頁顯示今天各模型用了幾次,使用者才知道一天 10 次的額度用了多少。
  it('每做一段,記一次使用者今天的用量', async () => {
    const userId = await newUser();
    await prepared(await start(userId));
    const usage = db.prepare(`SELECT calls FROM api_usage WHERE user_id = ? AND model = 'tts-test'`).get(userId) as { calls: number };
    expect(usage.calls).toBe(3);
  });
});

describe('聽力音檔:備好的課', () => {
  // 學生開始上備好的課時,聽力通常幾分鐘內就到;等那時候才做會來不及。
  it('課一備好就接著做它的音檔,不必等網頁來要:先做正在上的這堂,再把每一堂備好的課文做完,最後才是聽寫句子', async () => {
    await restart({ prepareAhead: true });
    closeGate();
    const userId = await newUser();
    const session = await start(userId);
    await stocked(userId);
    gate!.release();
    await done(session);

    expect(texts().slice(0, 3)).toEqual(starterTexts);
    expect(texts().slice(3, 6).every((text) => text.startsWith('Passage '))).toBe(true);
    expect(texts().slice(6).every((text) => text.startsWith('Dictation '))).toBe(true);
    expect(spoken).toHaveLength(3 + 3 + 6);
  });

  it('上備好的課時,音檔已經在了', async () => {
    await restart({ prepareAhead: true });
    const userId = await newUser();
    const first = await start(userId);
    await stocked(userId);
    await prepared(first);
    await finish(first);

    const made = spoken.length;
    const second = await start(userId, 30);
    const info = await enter(second);
    expect(Object.keys(info.clips)).toEqual(expect.arrayContaining([second.lesson.passage.text, ...second.lesson.listening.dictation]));
    // 上完第一堂之後又在背景補了一堂 20 分鐘的課,它的音檔會接著做;但第二堂自己的不必再做。
    await done(second);
    expect(texts().slice(made).filter((text) => text === second.lesson.passage.text)).toEqual([]);
  });

  // 切換等級後,原本等級備好的課還留著,但可能再也不會上;一天只有 20 次,不花在那上面。
  it('換了等級之後,舊等級備好的課先不做;切回來才做', async () => {
    await restart({ prepareAhead: true });
    closeGate();
    const userId = await newUser();
    const session = await start(userId);
    await enter(session);
    await stocked(userId);
    await call('PATCH', `/users/${userId}`, { level: 'B1' });
    gate!.release();
    await done(session);
    expect(texts()).toEqual(starterTexts);

    await call('PATCH', `/users/${userId}`, { level: 'A2' });
    await prepared(session);
    expect(spoken).toHaveLength(3 + 3 + 6);
  });
});

describe('聽力音檔:額度用完', () => {
  beforeEach(() => {
    failFrom = 2;
  });

  it('做到一半額度用完:做好的照樣能用,其餘的沒有網址(由瀏覽器朗讀)', async () => {
    const session = await start(await newUser());
    const info = await prepared(session);
    expect(Object.keys(info.clips)).toEqual([STARTER.passage.text]);
    expect(info.working).toBe(false);
  });

  // 背景的失敗沒有任何畫面在等,不通知的話使用者不會知道為什麼聲音變回瀏覽器的。
  it('通知使用者是製作聽力音檔時遇到上限', async () => {
    const userId = await newUser();
    await prepared(await start(userId));
    const { notices }: { notices: QuotaNotice[] } = (await call('GET', `/notices?userId=${userId}&after=0`)).json;
    expect(notices).toEqual([expect.objectContaining({ task: 'speech', model: 'tts-test', scope: 'day' })]);
  });

  // 網頁在等音檔時每 15 秒問一次;如果每問一次就重試一次,額度用完之後整堂課都在白送請求。
  it('停下來之後,網頁單純詢問不會重試;換到下一個步驟時才再試一次', async () => {
    const session = await start(await newUser());
    await prepared(session);
    expect(spoken).toHaveLength(2);
    await ask(session);
    await ask(session);
    await pause(20);
    expect(spoken).toHaveLength(2);

    failFrom = null;
    const info = await prepared(session);
    expect(spoken).toHaveLength(4);
    expect(Object.keys(info.clips)).toHaveLength(3);
  });
});

describe('聽力音檔:某一段模型做不出來', () => {
  beforeEach(() => {
    refused = STARTER.passage.text;
  });

  it('跳過那一段(由瀏覽器朗讀),其他的照樣做', async () => {
    const session = await start(await newUser());
    const info = await prepared(session);
    expect(Object.keys(info.clips).sort()).toEqual([...STARTER.listening.dictation].sort());
  });

  // 再試也只會再被拒絕,而每試一次都用掉一天只有 10 次的額度;上課時每換一個步驟都會觸發一次重試。
  it('之後換步驟、再進入課堂,都不再重試那一段', async () => {
    const session = await start(await newUser());
    await prepared(session);
    await prepared(session);
    await prepared(session);
    expect(texts().filter((text) => text === STARTER.passage.text)).toHaveLength(1);
    expect(spoken).toHaveLength(3);
  });
});

describe('聽力音檔:只保留還用得到的', () => {
  // 一篇課文的音檔有好幾 MB,每天上課的話一年會累積到幾 GB。
  it('上完的課,聽寫的音檔刪掉;課文留著,下一堂課前的「重聽上一課」會用到', async () => {
    const userId = await newUser();
    const first = await start(userId);
    await prepared(first);
    expect(files()).toBe(3);
    await finish(first);

    const second = await start(userId);
    const info = await prepared(second);
    expect(Object.keys(info.clips).sort()).toEqual([STARTER.passage.text, second.lesson.passage.text, ...second.lesson.listening.dictation].sort());
    expect(files()).toBe(4);
    // 上一課的課文沒有重做,用的是上那堂課時做的那一份。
    expect(texts().filter((text) => text === STARTER.passage.text)).toHaveLength(1);
  });

  it('再上完一堂,更早那堂的課文也刪掉,它的網址不再有效', async () => {
    const userId = await newUser();
    const first = await start(userId);
    const { clips } = await prepared(first);
    await finish(first);
    const second = await start(userId);
    await prepared(second);
    await finish(second);
    const third = await start(userId);
    const info = await prepared(third);

    expect(info.clips[STARTER.passage.text]).toBeUndefined();
    expect(files()).toBe(4);
    expect((await fetch(base.replace(/\/api$/, '') + clips[STARTER.passage.text])).status).toBe(404);
  });

  it('另一位使用者還在上的課,音檔不會被刪掉', async () => {
    const other = await start(await newUser('小華'));
    await prepared(other);

    const userId = await newUser('小明');
    const first = await start(userId, 30);
    await prepared(first);
    await finish(first);
    await prepared(await start(userId, 30));

    expect(Object.keys((await ask(other)).clips)).toHaveLength(3);
  });
});

describe('聽力音檔:沒有啟用或網址不對', () => {
  it('沒有啟用語音合成時,回報沒有任何音檔(全部由瀏覽器朗讀),也不會出錯', async () => {
    await restart({ speech: undefined });
    const session = await start(await newUser());
    expect(await enter(session)).toEqual({ clips: {}, working: false });
    expect(await ask(session)).toEqual({ clips: {}, working: false });
    expect(spoken).toHaveLength(0);
  });

  // 音檔的資料夾旁邊就是資料庫(裡面有 API key);網址只能對到我們自己產生的檔名。
  it('只接受音檔的編號,不能用網址讀到音檔資料夾以外的檔案', async () => {
    await prepared(await start(await newUser()));
    mkdirSync(join(dir, 'inner'));
    writeFileSync(join(dir, 'outside.wav'), 'not for you');
    await restart({ speech: { voice, dir: join(dir, 'inner') } });
    for (const id of ['..%2Foutside', '%2E%2E%2Foutside', 'abc', '0'.repeat(32)]) {
      expect((await call('GET', `/audio/${id}`)).status).toBe(404);
    }
  });
});
