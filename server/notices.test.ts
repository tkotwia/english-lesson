import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { QuotaNotice } from '../shared/api.ts';
import { SessionStateSchema } from '../shared/schema.ts';
import type { LiveVoice } from './ai/live.ts';
import { createMockProvider, MOCK_QUOTA_KEY } from './ai/mock.ts';
import { MOCK_FIXTURES } from './ai/mockData.ts';
import { AiError, type AiJsonRequest, type AiProvider } from './ai/provider.ts';
import { createApp } from './app.ts';
import { openDb, type Db } from './db.ts';
import { createNotices, withQuotaNotices } from './notices.ts';

const event = (model: string, scope: QuotaNotice['scope'] = 'minute') => ({ model, scope, retryAfterSeconds: 30, task: 'lesson' });

describe('額度上限的通知:記錄', () => {
  it('依發生的順序記下來;只拿某個編號之後的,就不會重複顯示', () => {
    const notices = createNotices();
    notices.add('key', event('strong'));
    notices.add('key', event('medium', 'day'));
    const all = notices.since('key', 0);
    expect(all.map((notice) => [notice.model, notice.scope, notice.task, notice.retryAfterSeconds])).toEqual([
      ['strong', 'minute', 'lesson', 30],
      ['medium', 'day', 'lesson', 30],
    ]);
    expect(notices.since('key', all[0]!.id).map((notice) => notice.model)).toEqual(['medium']);
  });

  // 額度跟著 Google 專案(API key)走。別人的專案額度滿了,和這位使用者無關。
  it('以 API key 為單位:另一把 key 看不到', () => {
    const notices = createNotices();
    notices.add('key-a', event('strong'));
    expect(notices.since('key-b', 0)).toEqual([]);
  });

  // 背景備課連續失敗時,同一件事每幾秒通知一次只會讓人把通知關掉。
  it('同一個模型、同一種上限,一分鐘內重複發生只通知一次', () => {
    let now = Date.parse('2026-11-24T02:00:00Z');
    const notices = createNotices(() => now);
    notices.add('key', event('strong'));
    now += 20_000;
    notices.add('key', event('strong'));
    notices.add('key', event('strong', 'day'));
    expect(notices.since('key', 0).map((notice) => notice.scope)).toEqual(['minute', 'day']);
    now += 61_000;
    notices.add('key', event('strong'));
    expect(notices.since('key', 0)).toHaveLength(3);
  });

  // 這是當下的狀況通知。隔了很久才打開網頁,不需要看到早就恢復的事。
  it('超過十分鐘的通知不再顯示', () => {
    let now = Date.parse('2026-11-24T02:00:00Z');
    const notices = createNotices(() => now);
    notices.add('key', event('strong'));
    now += 11 * 60_000;
    expect(notices.since('key', 0)).toEqual([]);
  });
});

describe('額度上限的通知:AI 呼叫遇到 429', () => {
  const failing = (events: { model: string }[]): AiProvider => ({
    name: 'fake',
    models: { quality: ['strong', 'medium'], chat: ['lite'] },
    testKey: async () => ({ ok: true, model: 'lite' }),
    generateJson: async <T>(request: AiJsonRequest<T>): Promise<T> => {
      for (const item of events) request.onQuota?.({ model: item.model, scope: 'minute', retryAfterSeconds: null });
      return { answer: 'from the fallback model' } as T;
    },
  });

  // 改用備援模型成功時學生不會察覺,但備援的品質較差。所以成功的呼叫也要留下通知。
  it('即使最後改用別的模型成功了,也留下通知,並記下當時在做什麼', async () => {
    const notices = createNotices();
    const ai = withQuotaNotices(failing([{ model: 'strong' }]), notices);
    await ai.generateJson({ tier: 'quality', task: 'grade', apiKey: 'key', system: '', input: '', schema: SessionStateSchema as never });
    expect(notices.since('key', 0)).toEqual([expect.objectContaining({ model: 'strong', task: 'grade', scope: 'minute' })]);
  });

  it('呼叫的地方自己也想知道時,照樣通知它', async () => {
    const notices = createNotices();
    const seen: string[] = [];
    const ai = withQuotaNotices(failing([{ model: 'strong' }]), notices);
    await ai.generateJson({ tier: 'quality', task: 'x', apiKey: 'key', system: '', input: '', schema: SessionStateSchema as never, onQuota: (e) => seen.push(e.model) });
    expect(seen).toEqual(['strong']);
  });
});

// ---- 透過 API:網頁定時來問有沒有新的通知 ----

let db: Db;
let server: Server;
let base: string;
let liveFailure: AiError | null = null;

const quotaLive: LiveVoice = {
  model: 'live-model',
  async stream() {
    if (liveFailure) throw liveFailure;
    return { open: () => {}, audio: () => {}, close: () => {} };
  },
};

beforeEach(async () => {
  liveFailure = null;
  db = openDb(':memory:');
  const app = createApp({ db, ai: createMockProvider(MOCK_FIXTURES), live: quotaLive });
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
  const res = await fetch(base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

async function userWithKey(apiKey: string | null, name = '小明'): Promise<number> {
  const user = (await call('POST', '/users', { name, stage: 'junior' })).json;
  if (apiKey) await call('PUT', `/users/${user.id}/api-key`, { apiKey });
  return user.id;
}

const noticesOf = async (userId: number, after = 0): Promise<QuotaNotice[]> => (await call('GET', `/notices?userId=${userId}&after=${after}`)).json.notices;

describe('額度上限的通知:網頁查詢', () => {
  it('備課時遇到 429:使用者查得到通知,內容說明是哪個模型、在做什麼、哪一種上限', async () => {
    const userId = await userWithKey(MOCK_QUOTA_KEY);
    expect(await noticesOf(userId)).toEqual([]);

    const started = await call('POST', '/sessions', { userId, minutes: 30 });
    expect(started.status).toBe(429);
    const list = await noticesOf(userId);
    expect(list).toEqual([expect.objectContaining({ model: 'mock', task: 'lesson', scope: 'minute', retryAfterSeconds: 30 })]);
    // 看過之後,帶著最後的編號再問,不會重複拿到。
    expect(await noticesOf(userId, list[0]!.id)).toEqual([]);
  });

  it('用另一把 key 的使用者看不到;沒有 key 的使用者沒有通知', async () => {
    const limited = await userWithKey(MOCK_QUOTA_KEY);
    const other = await userWithKey('another-key', '小華');
    const keyless = await userWithKey(null, '小美');
    await call('POST', '/sessions', { userId: limited, minutes: 30 });
    expect(await noticesOf(other)).toEqual([]);
    expect(await noticesOf(keyless)).toEqual([]);
  });

  // 額度以專案為單位:家人共用同一把 key 時,一個人把額度用到上限,其他人也會受影響,所以也要看得到。
  it('共用同一把 key 的另一位使用者也看得到', async () => {
    const first = await userWithKey(MOCK_QUOTA_KEY);
    const second = await userWithKey(MOCK_QUOTA_KEY, '小華');
    await call('POST', '/sessions', { userId: first, minutes: 30 });
    expect(await noticesOf(second)).toHaveLength(1);
  });

  it('即時對話被額度上限擋下時也有通知', async () => {
    const userId = await userWithKey('live-key');
    liveFailure = new AiError('quota', 'Quota exceeded: requests per day');
    expect((await call('POST', '/live', { userId })).status).toBe(429);
    expect(await noticesOf(userId)).toEqual([expect.objectContaining({ model: 'live-model', task: 'live', scope: 'day' })]);
  });

  it('不存在的使用者', async () => {
    expect((await call('GET', '/notices?userId=999')).status).toBe(404);
  });
});
