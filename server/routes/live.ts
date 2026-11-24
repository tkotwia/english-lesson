import express from 'express';
import { z } from 'zod';
import type { LiveEvent } from '../../shared/api.ts';
import type { Db } from '../db.ts';
import type { LiveSessions } from '../liveSessions.ts';
import { getUserRow } from './users.ts';

const rawAudio = express.raw({ type: 'application/octet-stream', limit: '1mb' });

/**
 * 即時語音對話。瀏覽器只拿到對話的代號;API key 留在伺服器。
 * 自由對話從這裡開始;課程裡的情境對話由上課的路由開始,之後的收音與回應同樣走這裡。
 */
export function liveRouter(db: Db, live: LiveSessions): express.Router {
  const router = express.Router();

  // 自由對話(「即時對話」頁面):不計分,也不留紀錄。
  router.post('/', async (req, res) => {
    const { userId } = z.object({ userId: z.number().int().positive() }).parse(req.body);
    const user = getUserRow(db, userId);
    res.status(201).json(await live.start({ id: user.id, level: user.level, stage: user.stage, apiKey: user.api_key }));
  });

  // 整場對話的回應都從這一條串流送出(一行一個 JSON),直到對話結束。瀏覽器斷線(關掉分頁、離開頁面)就結束對話。
  router.get('/:id/events', (req, res) => {
    const id = String(req.params.id);
    // 先設好標頭再接上:一接上老師就可能開始說話,那時就會開始送內容。
    // (接不上時會丟出錯誤,這時標頭還沒送出,錯誤照一般的格式回覆。)
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    live.attach(
      id,
      (event: LiveEvent) => res.write(`${JSON.stringify(event)}\n`),
      () => res.end(),
    );
    if (!res.headersSent) res.flushHeaders();
    res.on('close', () => live.end(id));
  });

  // 麥克風的一小段聲音(16 kHz、16 位元、單聲道的 PCM)。
  router.post('/:id/audio', rawAudio, (req, res) => {
    if (Buffer.isBuffer(req.body) && req.body.length > 0) live.audio(String(req.params.id), req.body);
    res.status(204).end();
  });

  router.delete('/:id', (req, res) => {
    live.end(String(req.params.id));
    res.status(204).end();
  });

  return router;
}
