import express from 'express';
import { ReviewResultsSchema } from '../../shared/api.ts';
import { isValidDate, localDate } from '../../shared/dates.ts';
import { transaction, type Db } from '../db.ts';
import { HttpError } from '../errors.ts';
import { dueItems, gradeReviewAnswers, missedItemsInRange, postponeReview, recordReviewResult } from '../items.ts';
import { getUserRow, parseId } from './users.ts';

/** 單獨做複習練習時,一次最多拿幾個到期項目。 */
const DUE_PRACTICE_LIMIT = 30;

function parseDate(value: unknown, name: string): string {
  if (typeof value !== 'string' || !isValidDate(value)) throw new HttpError(400, `${name} 必須是 YYYY-MM-DD 格式的日期`);
  return value;
}

export function reviewRouter(db: Db): express.Router {
  const router = express.Router();

  // 回顧:某段日期內不會、不熟或手動標記過的項目。
  router.get('/', (req, res) => {
    const userId = parseId(req.query.userId);
    getUserRow(db, userId);
    const from = parseDate(req.query.from, 'from');
    const to = parseDate(req.query.to, 'to');
    if (from > to) throw new HttpError(400, '起始日期不能晚於結束日期');
    res.json({ items: missedItemsInRange(db, userId, from, to) });
  });

  // 今天到期、等待複習的項目。
  router.get('/due', (req, res) => {
    const userId = parseId(req.query.userId);
    getUserRow(db, userId);
    res.json({ items: dueItems(db, userId, localDate(), DUE_PRACTICE_LIMIT) });
  });

  // 單獨做完複習練習後回報作答。不呼叫 AI,也不列入日曆分數,只更新各項目的複習間隔。
  router.post('/results', (req, res) => {
    const { userId, answers } = ReviewResultsSchema.parse(req.body);
    getUserRow(db, userId);
    const graded = gradeReviewAnswers(db, userId, answers);
    const today = localDate();
    transaction(db, () => {
      for (const { itemId, outcome, responses } of graded) {
        if (outcome === 'skipped') postponeReview(db, itemId, today);
        else recordReviewResult(db, itemId, outcome, null, today, responses);
      }
    });
    res.json({ results: graded.map(({ itemId, outcome }) => ({ itemId, outcome })) });
  });

  return router;
}
