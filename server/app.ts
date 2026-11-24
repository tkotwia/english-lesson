import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { LESSON_MINUTES, type AiErrorCode, type Minutes } from '../shared/schema.ts';
import { createMockLive, type LiveVoice } from './ai/live.ts';
import { AiError, type AiProvider } from './ai/provider.ts';
import type { Db } from './db.ts';
import { HttpError } from './errors.ts';
import { audioRouter } from './routes/audio.ts';
import { calendarRouter } from './routes/calendar.ts';
import { createLessonAudio, type LessonAudioOptions } from './lessonAudio.ts';
import { createLiveSessions } from './liveSessions.ts';
import { createNotices, withQuotaNotices } from './notices.ts';
import { liveRouter } from './routes/live.ts';
import { noticesRouter } from './routes/notices.ts';
import { placementRouter } from './routes/placement.ts';
import { reviewRouter } from './routes/review.ts';
import { sessionsRouter } from './routes/sessions.ts';
import { settingsRouter } from './routes/settings.ts';
import { usersRouter } from './routes/users.ts';
import { wordsRouter } from './routes/words.ts';

export interface AppOptions {
  db: Db;
  ai: AiProvider;
  /** 建置後的前端檔案位置。有提供時,伺服器同時提供網頁本身。 */
  staticDir?: string;
  /** 是否在上課時於背景預先備好之後的課。沒指定時不做(測試時比較單純);正式執行時由 index.ts 開啟。 */
  prepareAhead?: boolean;
  /** 背景要備哪些長度的課;沒指定就是 20、30、40 分鐘都備。 */
  prepareMinutes?: readonly Minutes[];
  /** 即時語音對話的實作;沒指定時用假資料的(測試不必連網)。 */
  live?: LiveVoice;
  /** 用語音合成事先唸好聽力課文與聽寫句子。沒指定時不做,全部由瀏覽器朗讀。 */
  speech?: LessonAudioOptions;
}

const AI_ERROR_STATUS: Record<AiErrorCode, number> = {
  no_key: 400,
  invalid_key: 400,
  quota: 429,
  bad_output: 502,
  unavailable: 502,
};

export function createApp({ db, ai: provider, staticDir, prepareAhead = false, prepareMinutes = LESSON_MINUTES, live = createMockLive(), speech }: AppOptions): express.Express {
  const app = express();
  // 任何一次 AI 呼叫遇到額度上限(429)都記成通知,由網頁顯示給使用者。
  const notices = createNotices();
  const ai = withQuotaNotices(provider, notices);
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/users', usersRouter(db, ai));
  app.use('/api/settings', settingsRouter(db, ai));
  const liveSessions = createLiveSessions(db, live, notices);
  const audio = speech ? createLessonAudio(db, notices, speech) : undefined;
  app.use('/api/sessions', sessionsRouter(db, ai, { prepareAhead, prepareMinutes, live: liveSessions, audio }));
  app.use('/api/review', reviewRouter(db));
  app.use('/api/placement', placementRouter(db, ai, { prepareAhead }));
  app.use('/api/words', wordsRouter(db));
  app.use('/api/live', liveRouter(db, liveSessions));
  app.use('/api/notices', noticesRouter(db, notices));
  if (audio) app.use('/api/audio', audioRouter(audio));
  app.use('/api', calendarRouter(db));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: '找不到這個 API' } });
  });

  if (staticDir) {
    const indexHtml = join(staticDir, 'index.html');
    if (!existsSync(indexHtml)) {
      throw new Error(`找不到前端檔案 ${indexHtml},請先執行 npm run build`);
    }
    app.use(express.static(staticDir));
    // 單頁應用:其餘網址一律回傳 index.html,由前端路由處理。
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(indexHtml);
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof z.ZodError) {
      const message = err.issues.map((issue) => issue.message).join(';');
      res.status(400).json({ error: { code: 'validation', message } });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { code: 'http', message: err.message } });
      return;
    }
    if (err instanceof AiError) {
      res.status(AI_ERROR_STATUS[err.code]).json({ error: { code: err.code, message: err.message, detail: err.detail } });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: { code: 'validation', message: '請求內容不是合法的 JSON' } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: 'internal', message: '伺服器發生未預期的錯誤,請查看啟動紀錄。' } });
  });

  return app;
}
