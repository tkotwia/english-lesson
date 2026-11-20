import express from 'express';
import {
  ApiKeyBodySchema,
  DEFAULT_LEVEL_BY_STAGE,
  NewUserSchema,
  UserPatchSchema,
  type Level,
  type PublicUser,
  type Stage,
} from '../../shared/schema.ts';
import { AiError, type AiProvider } from '../ai/provider.ts';
import { usageRecorder } from '../ai/usage.ts';
import type { Db } from '../db.ts';
import { HttpError } from '../errors.ts';

export interface UserRow {
  id: number;
  name: string;
  stage: Stage;
  level: Level;
  api_key: string | null;
  created_at: string;
}

/** 轉成可以傳給瀏覽器的資料。完整的 API key 不會離開伺服器。 */
export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    stage: row.stage,
    level: row.level,
    hasApiKey: Boolean(row.api_key),
    apiKeyLast4: row.api_key ? row.api_key.slice(-4) : null,
    createdAt: row.created_at,
  };
}

export function parseId(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, '使用者編號不正確');
  return id;
}

export function getUserRow(db: Db, id: number): UserRow {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!row) throw new HttpError(404, '找不到這位使用者');
  return row;
}

export function usersRouter(db: Db, ai: AiProvider): express.Router {
  const router = express.Router();

  router.get('/', (_req, res) => {
    const rows = db.prepare('SELECT * FROM users ORDER BY id').all() as unknown as UserRow[];
    res.json(rows.map(toPublicUser));
  });

  router.post('/', (req, res) => {
    const input = NewUserSchema.parse(req.body);
    const level = input.level ?? DEFAULT_LEVEL_BY_STAGE[input.stage];
    const result = db.prepare('INSERT INTO users (name, stage, level) VALUES (?, ?, ?)').run(input.name, input.stage, level);
    res.status(201).json(toPublicUser(getUserRow(db, Number(result.lastInsertRowid))));
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const current = getUserRow(db, id);
    const patch = UserPatchSchema.parse(req.body);
    db.prepare('UPDATE users SET name = ?, stage = ?, level = ? WHERE id = ?').run(
      patch.name ?? current.name,
      patch.stage ?? current.stage,
      patch.level ?? current.level,
      id,
    );
    res.json(toPublicUser(getUserRow(db, id)));
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    getUserRow(db, id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.status(204).end();
  });

  router.put('/:id/api-key', (req, res) => {
    const id = parseId(req.params.id);
    getUserRow(db, id);
    const { apiKey } = ApiKeyBodySchema.parse(req.body);
    db.prepare('UPDATE users SET api_key = ? WHERE id = ?').run(apiKey === '' ? null : apiKey, id);
    res.json(toPublicUser(getUserRow(db, id)));
  });

  router.post('/:id/api-key/test', async (req, res) => {
    const id = parseId(req.params.id);
    const user = getUserRow(db, id);
    if (!user.api_key) throw new AiError('no_key');
    res.json(await ai.testKey(user.api_key, usageRecorder(db, id)));
  });

  return router;
}
