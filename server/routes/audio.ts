import express from 'express';
import { HttpError } from '../errors.ts';
import type { LessonAudio } from '../lessonAudio.ts';

/** 聽力課文與聽寫句子的音檔(WAV)。網址由 GET /api/sessions/:id/audio 提供。 */
export function audioRouter(audio: LessonAudio): express.Router {
  const router = express.Router();

  router.get('/:id', (req, res) => {
    const path = audio.file(req.params.id);
    if (!path) throw new HttpError(404, '找不到這段音檔');
    // 音檔的編號由內容算出來,同一個網址的內容不會變,瀏覽器可以放心留著重複使用。
    res.sendFile(path, { headers: { 'Content-Type': 'audio/wav' }, immutable: true, maxAge: '7d' });
  });

  return router;
}
