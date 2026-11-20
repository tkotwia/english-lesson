import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PublicUser, SettingsStatus } from '../shared/schema.ts';
import { createMockProvider, MOCK_INVALID_KEY } from './ai/mock.ts';
import { createApp } from './app.ts';
import { openDb, type Db } from './db.ts';

let db: Db;
let server: Server;
let base: string;

beforeEach(async () => {
  db = openDb(':memory:');
  const app = createApp({ db, ai: createMockProvider() });
  server = await new Promise<Server>((done) => {
    const listening = app.listen(0, '127.0.0.1', () => done(listening));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterEach(async () => {
  await new Promise((done) => server.close(done));
  db.close();
});

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; text: string; json: any }> {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text, json: text ? JSON.parse(text) : null };
}

async function createUser(name: string, stage: string, level?: string): Promise<PublicUser> {
  const res = await call('POST', '/users', { name, stage, level });
  expect(res.status).toBe(201);
  return res.json;
}

describe('使用者', () => {
  it('沒指定等級時,依學習階段給預設等級,讓不同年齡的學生從合理的難度開始', async () => {
    expect((await createUser('小明', 'elementary')).level).toBe('A1');
    expect((await createUser('小華', 'junior')).level).toBe('A2');
    expect((await createUser('小美', 'senior')).level).toBe('B1');
    expect((await createUser('阿哲', 'university')).level).toBe('B2');
  });

  it('手動選的等級優先於階段預設值,因為同年級的學生程度可能差很多', async () => {
    expect((await createUser('小明', 'elementary', 'B1')).level).toBe('B1');
  });

  it('拒絕空白名稱與不存在的學習階段', async () => {
    expect((await call('POST', '/users', { name: '   ', stage: 'junior' })).status).toBe(400);
    expect((await call('POST', '/users', { name: '小明', stage: 'kindergarten' })).status).toBe(400);
  });

  it('可以修改等級(升級或手動調整)而不影響其他欄位', async () => {
    const user = await createUser('小明', 'junior');
    const res = await call('PATCH', `/users/${user.id}`, { level: 'B1' });
    expect(res.json).toMatchObject({ name: '小明', stage: 'junior', level: 'B1' });
  });

  it('刪除後就查不到,對不存在的使用者操作回傳 404', async () => {
    const user = await createUser('小明', 'junior');
    expect((await call('DELETE', `/users/${user.id}`)).status).toBe(204);
    expect((await call('GET', '/users')).json).toEqual([]);
    expect((await call('PATCH', `/users/${user.id}`, { level: 'B1' })).status).toBe(404);
  });
});

describe('API key', () => {
  const SECRET = 'AIzaSy-secret-key-value-1234';

  it('完整的 key 絕不回傳給瀏覽器,只回傳末四碼', async () => {
    const user = await createUser('小明', 'junior');
    const saved = await call('PUT', `/users/${user.id}/api-key`, { apiKey: SECRET });
    const listed = await call('GET', '/users');

    expect(saved.json).toMatchObject({ hasApiKey: true, apiKeyLast4: '1234' });
    for (const response of [saved, listed]) {
      expect(response.text).not.toContain(SECRET);
      expect(response.text).not.toContain('secret-key');
    }
  });

  it('每位使用者的 key 各自獨立:一位的 key 無效不影響另一位', async () => {
    const bad = await createUser('小明', 'junior');
    const good = await createUser('小華', 'junior');
    await call('PUT', `/users/${bad.id}/api-key`, { apiKey: MOCK_INVALID_KEY });
    await call('PUT', `/users/${good.id}/api-key`, { apiKey: SECRET });

    expect((await call('POST', `/users/${bad.id}/api-key/test`)).json).toMatchObject({ ok: false, code: 'invalid_key' });
    expect((await call('POST', `/users/${good.id}/api-key/test`)).json).toMatchObject({ ok: true });
  });

  it('沒設定 key 就測試時,明確回報「尚未設定」而不是默默成功', async () => {
    const user = await createUser('小明', 'junior');
    const res = await call('POST', `/users/${user.id}/api-key/test`);
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('no_key');
  });

  it('送出空字串會清除 key', async () => {
    const user = await createUser('小明', 'junior');
    await call('PUT', `/users/${user.id}/api-key`, { apiKey: SECRET });
    const cleared = await call('PUT', `/users/${user.id}/api-key`, { apiKey: '' });
    expect(cleared.json).toMatchObject({ hasApiKey: false, apiKeyLast4: null });
  });
});

describe('API 用量', () => {
  it('每次呼叫都記在發出呼叫的使用者名下,才能對照各自的免費額度', async () => {
    const active = await createUser('小明', 'junior');
    const idle = await createUser('小華', 'junior');
    await call('PUT', `/users/${active.id}/api-key`, { apiKey: 'key-a' });
    await call('POST', `/users/${active.id}/api-key/test`);
    await call('POST', `/users/${active.id}/api-key/test`);

    const activeStatus: SettingsStatus = (await call('GET', `/settings/status?userId=${active.id}`)).json;
    const idleStatus: SettingsStatus = (await call('GET', `/settings/status?userId=${idle.id}`)).json;

    expect(activeStatus.usage).toEqual([{ model: 'mock', calls: 2, inputTokens: 0, outputTokens: 0, totalMs: 0 }]);
    expect(idleStatus.usage).toEqual([]);
  });

  it('刪除使用者時一併刪除他的用量紀錄', async () => {
    const user = await createUser('小明', 'junior');
    await call('PUT', `/users/${user.id}/api-key`, { apiKey: 'key-a' });
    await call('POST', `/users/${user.id}/api-key/test`);
    await call('DELETE', `/users/${user.id}`);

    const remaining = db.prepare('SELECT COUNT(*) AS n FROM api_usage').get() as { n: number };
    expect(remaining.n).toBe(0);
  });
});
