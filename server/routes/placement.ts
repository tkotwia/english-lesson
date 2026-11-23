import express from 'express';
import { z } from 'zod';
import { PlacementCompleteSchema } from '../../shared/api.ts';
import type { AiProvider } from '../ai/provider.ts';
import type { Db } from '../db.ts';
import { createPlacement, type PlacementStudent } from '../placement/service.ts';
import { getUserRow, parseId } from './users.ts';

export interface PlacementOptions {
  /** 開始作答後,要不要在背景先備好下一份題目(和預先備課共用同一個設定)。 */
  prepareAhead: boolean;
}

export function placementRouter(db: Db, ai: AiProvider, { prepareAhead }: PlacementOptions): express.Router {
  const router = express.Router();
  const placement = createPlacement(db, ai);
  const studentOf = (userId: number): PlacementStudent => {
    const user = getUserRow(db, userId);
    return { id: user.id, level: user.level, stage: user.stage, apiKey: user.api_key };
  };

  // 現在能不能馬上開始、要等多久,以及做過的測驗結果。
  router.get('/', (req, res) => {
    res.json(placement.status(studentOf(parseId(req.query.userId))));
  });

  // 開始(或繼續)一次測驗。一開始作答,就在背景備好下一份。
  router.post('/', async (req, res) => {
    const { userId } = z.object({ userId: z.number().int().positive() }).parse(req.body);
    const student = studentOf(userId);
    const attempt = await placement.start(student);
    res.json(attempt);
    // 剛剛才出題失敗而改用內建題目的話,不馬上在背景再試一次:多半還是失敗,只是白白消耗額度。
    if (prepareAhead && attempt.repeatReason === null) placement.prepareNext(student);
  });

  router.post('/:id/complete', (req, res) => {
    const { answers, tts } = PlacementCompleteSchema.parse(req.body);
    res.json(placement.complete(parseId(req.params.id), answers, tts));
  });

  return router;
}
