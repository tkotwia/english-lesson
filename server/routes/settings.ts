import express from 'express';
import type { SettingsStatus } from '../../shared/schema.ts';
import type { AiProvider } from '../ai/provider.ts';
import { getUsage, quotaDate } from '../ai/usage.ts';
import type { Db } from '../db.ts';
import { getUserRow, parseId } from './users.ts';

export function settingsRouter(db: Db, ai: AiProvider): express.Router {
  const router = express.Router();

  router.get('/status', (req, res) => {
    const userId = parseId(req.query.userId);
    getUserRow(db, userId);
    const date = quotaDate();
    const status: SettingsStatus = {
      provider: ai.name,
      models: ai.models,
      quotaDate: date,
      usage: getUsage(db, userId, date),
    };
    res.json(status);
  });

  return router;
}
