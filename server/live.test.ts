import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_SILENCE_MS, LIVE_TURNS, type LiveEvent, type LiveSessionInfo } from '../shared/api.ts';
import { lessonExercises } from '../shared/lesson.ts';
import { CHAT_TURNS, SessionStateSchema, type ChatTurn, type SessionView } from '../shared/schema.ts';
import { createGeminiLive, type LiveSdkCallbacks, type LiveSdkSession, type LiveStreamHandlers, type LiveStreamOptions, type LiveVoice } from './ai/live.ts';
import { createMockProvider } from './ai/mock.ts';
import { MOCK_FIXTURES, MOCK_LESSON } from './ai/mockData.ts';
import { AiError, type AiUsage } from './ai/provider.ts';
import { createApp } from './app.ts';
import { openDb, type Db } from './db.ts';

// ---- Gemini 的實作:用假的 SDK 連線,不必連網 ----

function fakeSdk() {
  const sent: Parameters<LiveSdkSession['sendRealtimeInput']>[0][] = [];
  const texts: string[] = [];
  let callbacks!: LiveSdkCallbacks;
  let closed = false;
  const connect = vi.fn(async (_apiKey: string, _model: string, _system: string, _silenceMs: number, given: LiveSdkCallbacks): Promise<LiveSdkSession> => {
    callbacks = given;
    return {
      sendClientContent: (params) => texts.push(params.turns[0]!.parts[0]!.text),
      sendRealtimeInput: (params) => sent.push(params),
      close: () => {
        closed = true;
      },
    };
  });
  return { connect, sent, texts, server: () => callbacks, isClosed: () => closed };
}

async function streaming() {
  const sdk = fakeSdk();
  const usage: AiUsage[] = [];
  const events: string[] = [];
  const voice = createGeminiLive({ model: 'live-model', connect: sdk.connect });
  const stream = await voice.stream(
    { apiKey: 'user-key', system: 'be a teacher', opening: 'please start', silenceMs: 1200, onUsage: (u) => usage.push(u) },
    {
      onHeard: (text) => events.push(`heard:${text}`),
      onSaid: (text) => events.push(`said:${text}`),
      onAudio: (pcm) => events.push(`audio:${pcm.length}`),
      onTurnComplete: () => events.push('turn-complete'),
      onInterrupted: () => events.push('interrupted'),
      onFailure: (error) => events.push(`failure:${error.code}`),
    },
  );
  return { sdk, stream, usage, events };
}

describe('即時語音(Gemini)', () => {
  // 一般語音對話的預設值很短;學生停下來想一下就會被當成說完。所以要把我們指定的時間交給模型。
  it('用使用者自己的 key 連線,帶上老師的角色設定,以及我們指定的「安靜多久算說完」', async () => {
    const { sdk } = await streaming();
    expect(sdk.connect).toHaveBeenCalledWith('user-key', 'live-model', 'be a teacher', 1200, expect.anything());
  });

  it('開場的指示交給老師;麥克風的聲音一段一段原樣送出', async () => {
    const { sdk, stream } = await streaming();
    stream.open();
    stream.audio(Buffer.from([1, 2, 3, 4]));
    stream.audio(Buffer.from([5, 6]));
    expect(sdk.texts).toEqual(['please start']);
    expect(sdk.sent).toEqual([
      { audio: { data: Buffer.from([1, 2, 3, 4]).toString('base64'), mimeType: 'audio/pcm;rate=16000' } },
      { audio: { data: Buffer.from([5, 6]).toString('base64'), mimeType: 'audio/pcm;rate=16000' } },
    ]);
  });

  it('文字稿、聲音、老師說完一輪、學生打斷老師,都依序交出來;每一輪回報一次用量', async () => {
    const { sdk, events, usage } = await streaming();
    sdk.server().onmessage({ serverContent: { inputTranscription: { text: 'I go home.' } } });
    sdk.server().onmessage({ serverContent: { outputTranscription: { text: 'I went home.' }, modelTurn: { parts: [{ inlineData: { data: Buffer.from('abcd').toString('base64') } }] } } });
    sdk.server().onmessage({ serverContent: { interrupted: true } });
    sdk.server().onmessage({ usageMetadata: { promptTokenCount: 500, responseTokenCount: 100, thoughtsTokenCount: 20 }, serverContent: { turnComplete: true } });
    expect(events).toEqual(['heard:I go home.', 'said:I went home.', 'audio:4', 'interrupted', 'turn-complete']);
    expect(usage).toEqual([expect.objectContaining({ model: 'live-model', inputTokens: 500, outputTokens: 120 })]);
  });

  // 連線斷了要讓畫面知道,而且只說一次;之後晚到的內容不能再冒出來。
  it('連線中斷時回報一次原因(額度、key、其他),之後不再送任何內容', async () => {
    const { sdk, stream, events } = await streaming();
    sdk.server().onclose({ code: 1011, reason: 'Quota exceeded: requests per day' });
    sdk.server().onerror({ message: 'socket closed' });
    sdk.server().onmessage({ serverContent: { outputTranscription: { text: 'late' } } });
    stream.audio(Buffer.from([1, 2]));
    expect(events).toEqual(['failure:quota']);
    expect(sdk.sent).toEqual([]);
  });

  it('我們自己關掉時不算出錯', async () => {
    const { sdk, stream, events } = await streaming();
    stream.close();
    sdk.server().onclose({ code: 1000, reason: '' });
    expect(events).toEqual([]);
    expect(sdk.isClosed()).toBe(true);
  });

  it('沒有 key 時不連線;連不上時依原因分類', async () => {
    const sdk = fakeSdk();
    const handlers = { onHeard: () => {}, onSaid: () => {}, onAudio: () => {}, onTurnComplete: () => {}, onInterrupted: () => {}, onFailure: () => {} };
    const options = { system: '', opening: '', silenceMs: 1200 };
    await expect(createGeminiLive({ model: 'm', connect: sdk.connect }).stream({ ...options, apiKey: '' }, handlers)).rejects.toMatchObject({ code: 'no_key' });
    expect(sdk.connect).not.toHaveBeenCalled();

    const failing = (message: string) => createGeminiLive({ model: 'm', connect: async () => Promise.reject(new Error(message)) }).stream({ ...options, apiKey: 'k' }, handlers);
    await expect(failing('API key not valid')).rejects.toMatchObject({ code: 'invalid_key' });
    await expect(failing('You exceeded your current quota')).rejects.toMatchObject({ code: 'quota' });
    await expect(failing('socket hang up')).rejects.toMatchObject({ code: 'unavailable' });
  });
});

// ---- 對話的管理與 API:用假的即時語音實作 ----

let db: Db;
let server: Server;
let base: string;
/** 假的模型那一端。測試用它來模擬「老師回應了」「連線斷了」。 */
let model: LiveStreamHandlers | null = null;
let asked: LiveStreamOptions | null = null;
let streamedAudio: Buffer[] = [];
let closedCount = 0;
let connectFailure: AiError | null = null;

const fakeVoice: LiveVoice = {
  model: 'fake-live',
  async stream(options, handlers) {
    if (connectFailure) throw connectFailure;
    asked = options;
    model = handlers;
    return {
      open: () => {
        handlers.onSaid('Hello!');
        handlers.onAudio(Buffer.from([1, 2, 3, 4]));
        options.onUsage?.({ model: 'fake-live', inputTokens: 10, outputTokens: 5, durationMs: 1 });
        handlers.onTurnComplete();
      },
      audio: (pcm) => streamedAudio.push(pcm),
      close: () => {
        closedCount++;
      },
    };
  },
};

beforeEach(async () => {
  model = null;
  asked = null;
  streamedAudio = [];
  closedCount = 0;
  connectFailure = null;
  db = openDb(':memory:');
  const app = createApp({ db, ai: createMockProvider(MOCK_FIXTURES), live: fakeVoice });
  server = await new Promise<Server>((done) => {
    const listening = app.listen(0, '127.0.0.1', () => done(listening));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterEach(async () => {
  await new Promise((done) => server.close(done));
  db.close();
});

async function json(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, text, json: text ? JSON.parse(text) : null };
}

async function newUser(withKey = true): Promise<number> {
  const user = (await json('POST', '/users', { name: '小明', stage: 'junior' })).json;
  if (withKey) await json('PUT', `/users/${user.id}/api-key`, { apiKey: 'secret-user-key' });
  return user.id;
}

/** 接上整場對話的串流,一筆一筆讀出內容。 */
async function listen(id: string) {
  const controller = new AbortController();
  const res = await fetch(`${base}/live/${id}/events`, { signal: controller.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  const queue: LiveEvent[] = [];
  let finished = false;
  const pump = async () => {
    const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
    if (done) {
      finished = true;
      return;
    }
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines.filter(Boolean)) queue.push(JSON.parse(line) as LiveEvent);
  };
  return {
    status: res.status,
    raw: () => queue.map((event) => JSON.stringify(event)).join(''),
    /** 讀到第 count 筆為止(或串流結束)。 */
    async take(count: number): Promise<LiveEvent[]> {
      while (queue.length < count && !finished) await pump();
      return queue.splice(0, count);
    },
    async ended(): Promise<boolean> {
      while (!finished) await pump();
      return true;
    },
    /** 瀏覽器斷線,並等伺服器處理完(關掉對話);否則這個關閉動作會落到下一個測試裡。 */
    async disconnect(): Promise<void> {
      const before = closedCount;
      controller.abort();
      for (let i = 0; i < 100 && closedCount === before; i++) await new Promise((done) => setTimeout(done, 5));
    },
  };
}

const start = async (userId: number): Promise<LiveSessionInfo> => (await json('POST', '/live', { userId })).json;
const sendAudio = (id: string, audio: Buffer) => fetch(`${base}/live/${id}/audio`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: new Uint8Array(audio) });
const types = (events: LiveEvent[]) => events.map((event) => event.type);
/** 學生說了一句(heard 是它的文字稿;空字串表示沒聽到內容),老師回應。 */
const exchange = (heard = 'student words', said = 'Nice!') => {
  if (heard) model!.onHeard(heard);
  model!.onSaid(said);
  model!.onAudio(Buffer.from([9, 9]));
  model!.onTurnComplete();
};

describe('即時對話:自由對話', () => {
  it('開始時告訴模型「安靜多久算說完」;瀏覽器接上串流後老師才開場,開場白不會漏掉', async () => {
    const session = await start(await newUser());
    expect(session).toMatchObject({ turns: LIVE_TURNS, inputRate: 16_000, outputRate: 24_000 });
    expect(asked!.silenceMs).toBe(LIVE_SILENCE_MS);

    const stream = await listen(session.id);
    expect(stream.status).toBe(200);
    const opening = await stream.take(3);
    expect(types(opening)).toEqual(['said', 'audio', 'done']);
    expect(opening[1]).toEqual({ type: 'audio', data: Buffer.from([1, 2, 3, 4]).toString('base64') });
    expect(opening[2]).toEqual({ type: 'done', turnsLeft: LIVE_TURNS });
    await stream.disconnect();
  });

  it('麥克風的聲音一段一段交給模型;老師的回應從同一條串流送回來,剩下的輪數跟著減少', async () => {
    const session = await start(await newUser());
    const stream = await listen(session.id);
    await stream.take(3);

    expect((await sendAudio(session.id, Buffer.from([1, 2, 3, 4]))).status).toBe(204);
    expect((await sendAudio(session.id, Buffer.from([5, 6]))).status).toBe(204);
    expect(Buffer.concat(streamedAudio).equals(Buffer.from([1, 2, 3, 4, 5, 6]))).toBe(true);

    exchange();
    const reply = await stream.take(4);
    expect(types(reply)).toEqual(['heard', 'said', 'audio', 'done']);
    expect(reply[3]).toEqual({ type: 'done', turnsLeft: LIVE_TURNS - 1 });
    await stream.disconnect();
  });

  // key 只在伺服器使用。瀏覽器拿到的任何回應裡都不能有它。
  it('用的是這位使用者自己的 key,而且任何回應裡都沒有 key', async () => {
    const userId = await newUser();
    const started = await json('POST', '/live', { userId });
    const stream = await listen(started.json.id);
    await stream.take(3);
    expect(asked!.apiKey).toBe('secret-user-key');
    expect(started.text + stream.raw()).not.toContain('secret-user-key');
    await stream.disconnect();
  });

  it('沒有設定 key 的使用者不能開始', async () => {
    const res = await json('POST', '/live', { userId: await newUser(false) });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('no_key');
    expect(asked).toBeNull();
  });

  it('學生打斷老師時通知瀏覽器,讓它停掉還沒播完的聲音', async () => {
    const session = await start(await newUser());
    const stream = await listen(session.id);
    await stream.take(3);
    model!.onInterrupted();
    expect(await stream.take(1)).toEqual([{ type: 'interrupted' }]);
    await stream.disconnect();
  });

  // 麥克風一直開著。輪數到了就要自己結束並關掉連線,不能等學生記得去按。
  it(`老師回應滿 ${LIVE_TURNS} 輪就結束:通知瀏覽器、關閉連線、串流收尾`, async () => {
    const session = await start(await newUser());
    const stream = await listen(session.id);
    await stream.take(3);
    for (let i = 0; i < LIVE_TURNS; i++) exchange();
    const all = await stream.take(LIVE_TURNS * 4 + 1);
    expect(all.at(-1)).toEqual({ type: 'ended' });
    expect(await stream.ended()).toBe(true);
    expect(closedCount).toBe(1);
    expect((await sendAudio(session.id, Buffer.from([1, 2]))).status).toBe(404);
  });

  // 關掉分頁或離開頁面時,麥克風的另一端也要跟著關掉,不能繼續佔用連線與額度。
  it('瀏覽器斷線時,對話跟著結束', async () => {
    const session = await start(await newUser());
    const stream = await listen(session.id);
    await stream.take(3);
    await stream.disconnect();
    expect(closedCount).toBe(1);
  });

  // 連線放著會佔用額度(也可能佔用同時連線的上限)。
  it('同一位使用者重新開始時,舊的那一場會被關掉', async () => {
    const userId = await newUser();
    const first = await start(userId);
    const second = await start(userId);
    expect(closedCount).toBe(1);
    expect((await fetch(`${base}/live/${first.id}/events`)).status).toBe(404);
    const stream = await listen(second.id);
    expect(stream.status).toBe(200);
    await stream.disconnect();
  });

  it('可以提前結束', async () => {
    const session = await start(await newUser());
    const stream = await listen(session.id);
    await stream.take(3);
    expect((await json('DELETE', `/live/${session.id}`)).status).toBe(204);
    expect(await stream.ended()).toBe(true);
    expect(closedCount).toBe(1);
  });

  it('連線出狀況時把原因送給瀏覽器,並結束對話', async () => {
    const session = await start(await newUser());
    const stream = await listen(session.id);
    await stream.take(3);
    model!.onFailure(new AiError('quota', 'Quota exceeded: requests per minute'));
    expect(await stream.take(1)).toEqual([expect.objectContaining({ type: 'error', code: 'quota' })]);
    expect(await stream.ended()).toBe(true);
    expect(closedCount).toBe(1);
  });

  it('一開始就連不上時回報原因(例如額度用完)', async () => {
    connectFailure = new AiError('quota');
    const res = await json('POST', '/live', { userId: await newUser() });
    expect(res.status).toBe(429);
    expect(res.json.error.code).toBe('quota');
  });

  it('格式不對的聲音、不存在的對話會被拒絕;同一場對話不能接兩條串流', async () => {
    const session = await start(await newUser());
    expect((await sendAudio(session.id, Buffer.from([1, 2, 3]))).status).toBe(400);
    expect((await sendAudio('no-such-id', Buffer.from([1, 2]))).status).toBe(404);
    expect(streamedAudio).toEqual([]);
    const stream = await listen(session.id);
    expect((await fetch(`${base}/live/${session.id}/events`)).status).toBe(409);
    await stream.disconnect();
  });

  it('用量記在這位使用者的用量表上', async () => {
    const userId = await newUser();
    const stream = await listen((await start(userId)).id);
    await stream.take(3);
    const usage = (await json('GET', `/settings/status?userId=${userId}`)).json.usage;
    expect(usage).toEqual([expect.objectContaining({ model: 'fake-live', calls: 1 })]);
    await stream.disconnect();
  });
});

// ---- 課程裡的情境對話改用即時語音 ----

const MINUTES = 30;
const LIMIT = CHAT_TURNS[MINUTES];
const startLesson = async (userId: number): Promise<SessionView> => (await json('POST', '/sessions', { userId, minutes: MINUTES })).json;
const chatOf = async (sessionId: number): Promise<ChatTurn[]> => (await json('GET', `/sessions/${sessionId}`)).json.state.chat;
const lessonLive = (sessionId: number) => json('POST', `/sessions/${sessionId}/live`);

describe('課程裡的情境對話:用即時語音進行', () => {
  it('用這堂課的情境、單字與文法開場,老師的第一句就是課程寫好的開場白;輪數依課程長度', async () => {
    const lesson = await startLesson(await newUser());
    const started = await lessonLive(lesson.id);
    expect(started.status).toBe(201);
    expect(started.json).toMatchObject({ turns: LIMIT, topic: MOCK_LESSON.speaking.scenario });
    expect(asked!.system).toContain(MOCK_LESSON.speaking.scenario);
    expect(asked!.system).toContain(MOCK_LESSON.vocab[0]!.word);
    expect(asked!.system).toContain(MOCK_LESSON.grammar.point);
    expect(asked!.opening).toContain(MOCK_LESSON.speaking.opening);
  });

  // 批改、評分與訂正題都靠這份對話紀錄。它由伺服器依聽到的內容寫入,瀏覽器改不了。
  it('每一次來回的文字稿依序記進這堂課的對話紀錄:學生一句、老師一句', async () => {
    const lesson = await startLesson(await newUser());
    const stream = await listen((await lessonLive(lesson.id)).json.id);
    await stream.take(3);

    exchange('I go to the market yesterday.', 'I went to the market yesterday. What did you buy?');
    exchange('I buyed a toy.', 'I bought a toy. Was it expensive?');
    const events = await stream.take(8);
    expect(events.filter((event) => event.type === 'done')).toEqual([
      { type: 'done', turnsLeft: LIMIT - 1 },
      { type: 'done', turnsLeft: LIMIT - 2 },
    ]);
    expect(await chatOf(lesson.id)).toEqual([
      { role: 'teacher', text: MOCK_LESSON.speaking.opening, corrections: [] },
      { role: 'student', text: 'I go to the market yesterday.', corrections: [] },
      { role: 'teacher', text: 'I went to the market yesterday. What did you buy?', corrections: [] },
      { role: 'student', text: 'I buyed a toy.', corrections: [] },
      { role: 'teacher', text: 'I bought a toy. Was it expensive?', corrections: [] },
    ]);
    await stream.disconnect();
  });

  // 雜音也會讓老師開口(「抱歉,我沒聽清楚」)。學生其實沒說話,不能算掉他一輪,也不能留下一筆空的紀錄。
  it('沒有聽到學生說話內容的那一次不算一輪,也不記進紀錄', async () => {
    const lesson = await startLesson(await newUser());
    const stream = await listen((await lessonLive(lesson.id)).json.id);
    await stream.take(3);
    exchange('', 'Sorry, I didn’t catch that.');
    expect((await stream.take(3)).at(-1)).toEqual({ type: 'done', turnsLeft: LIMIT });
    expect(await chatOf(lesson.id)).toHaveLength(1);
    await stream.disconnect();
  });

  it('一直聽不到學生說話時也會自己結束,不會沒完沒了', async () => {
    const lesson = await startLesson(await newUser());
    const stream = await listen((await lessonLive(lesson.id)).json.id);
    await stream.take(3);
    for (let i = 0; i <= LIMIT; i++) exchange('', 'Sorry?');
    expect(await stream.ended()).toBe(true);
    expect(closedCount).toBe(1);
  });

  it(`學生說滿這堂課的輪數(${MINUTES} 分鐘是 ${LIMIT} 輪)就結束,之後不能再開始`, async () => {
    const lesson = await startLesson(await newUser());
    const stream = await listen((await lessonLive(lesson.id)).json.id);
    await stream.take(3);
    for (let i = 0; i < LIMIT; i++) exchange(`sentence ${i + 1}`);
    expect(await stream.ended()).toBe(true);
    expect((await chatOf(lesson.id)).filter((turn) => turn.role === 'student')).toHaveLength(LIMIT);
    expect((await lessonLive(lesson.id)).status).toBe(409);
  });

  // 對話到一半斷線、或先用打字說了幾句再改用語音:要接著進行,不能從頭再來,輪數也不能多給。
  it('已經說過幾輪再開始:只剩下沒用完的輪數,並把先前的對話交給老師接著進行', async () => {
    const lesson = await startLesson(await newUser());
    await json('POST', `/sessions/${lesson.id}/chat`, { message: 'I go to the night market.' });
    await json('POST', `/sessions/${lesson.id}/chat`, { message: 'It was fun.' });

    const started = await lessonLive(lesson.id);
    expect(started.json.turns).toBe(LIMIT - 2);
    expect(asked!.system).toContain('I go to the night market.');
    expect(asked!.opening).not.toContain(MOCK_LESSON.speaking.opening);

    const stream = await listen(started.json.id);
    await stream.take(3);
    exchange('And I ate noodles.');
    expect((await stream.take(4)).at(-1)).toEqual({ type: 'done', turnsLeft: LIMIT - 3 });
    await stream.disconnect();
  });

  // 語音對話的內容和打字的一樣要被批改:口說的分數、老師指出的錯誤都從這份紀錄來。
  it('交卷時,語音對話照原本的方式批改並計入口說分數', async () => {
    const userId = await newUser();
    const lesson = await startLesson(userId);
    const stream = await listen((await lessonLive(lesson.id)).json.id);
    await stream.take(3);
    exchange('I eat fried chicken there.', 'I ate fried chicken there. Was it good?');
    await stream.take(4);
    await stream.disconnect();

    const answers = Object.fromEntries(lessonExercises(lesson.lesson).map(({ key }) => [key, { attempts: [], hintUsed: false }]));
    const done = await json('POST', `/sessions/${lesson.id}/complete`, { state: { ...SessionStateSchema.parse({}), answers } });
    expect(done.status).toBe(200);
    expect(done.json.result.speaking).not.toBeNull();
    expect(done.json.state.chat.filter((turn: ChatTurn) => turn.role === 'student')).toHaveLength(1);
  });

  it('課已經交卷之後,還在進行的對話不會再寫進紀錄', async () => {
    const lesson = await startLesson(await newUser());
    const stream = await listen((await lessonLive(lesson.id)).json.id);
    await stream.take(3);
    const answers = Object.fromEntries(lessonExercises(lesson.lesson).map(({ key }) => [key, { attempts: [], hintUsed: false }]));
    await json('POST', `/sessions/${lesson.id}/complete`, { state: { ...SessionStateSchema.parse({}), answers } });
    exchange('late sentence');
    expect(await stream.ended()).toBe(true);
    expect((await chatOf(lesson.id)).some((turn) => turn.text === 'late sentence')).toBe(false);
    expect((await lessonLive(lesson.id)).status).toBe(409);
  });

  it('沒有 key、或這堂課不存在時不能開始', async () => {
    const lesson = await startLesson(await newUser());
    db.prepare('UPDATE users SET api_key = NULL').run();
    expect((await lessonLive(lesson.id)).status).toBe(400);
    expect((await lessonLive(999)).status).toBe(404);
  });
});
