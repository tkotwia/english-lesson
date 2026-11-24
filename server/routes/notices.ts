import express from 'express';
import type { Db } from '../db.ts';
import type { Notices } from '../notices.ts';
import { getUserRow, parseId } from './users.ts';

/** 額度上限(429)的通知:網頁定時來問有沒有新的。 */
export function noticesRouter(db: Db, notices: Notices): express.Router {
  const router = express.Router();

  router.get('/', (req, res) => {
    const user = getUserRow(db, parseId(req.query.userId));
    const after = Number(req.query.after ?? 0);
    res.json({ notices: user.api_key ? notices.since(user.api_key, Number.isFinite(after) ? after : 0) : [] });
  });

  return router;
}
