import type { PlacementAttempt, PlacementResult, PlacementStatus } from '../../shared/api.ts';
import { localDate } from '../../shared/dates.ts';
import { countWords } from '../../shared/lesson.ts';
import {
  hasAllBandsInOrder,
  PlacementDraftSchema,
  placementOutcome,
  PlacementTestSchema,
  shuffleOptions,
  type BandResult,
  type PlacementAnswers,
  type PlacementTest,
} from '../../shared/placement.ts';
import type { Level, Stage } from '../../shared/schema.ts';
import { PLACEMENT_LENGTHS, placementPrompt } from '../ai/prompts.ts';
import { AI_ERROR_MESSAGES, AiError, type AiProvider } from '../ai/provider.ts';
import { usageRecorder } from '../ai/usage.ts';
import type { Db } from '../db.ts';
import { HttpError } from '../errors.ts';
import { expectedSeconds, recordTaskTiming } from '../timings.ts';
import { BUILTIN_PLACEMENT_TEST } from './builtin.ts';

// 分級測驗的題目來源與紀錄。
// - 第一次測驗用內建的題目,不必等。
// - 一開始作答,就在背景請老師(AI)出下一份並存起來,下次再測也不必等。
// - 作答與判分都在本機進行,不呼叫 AI;只有出題會用掉一次品質類額度。

export interface PlacementStudent {
  id: number;
  level: Level;
  stage: Stage;
  apiKey: string | null;
}

interface TestRow {
  id: number;
  user_id: number;
  source: 'builtin' | 'ai';
  status: 'ready' | 'in_progress' | 'completed';
  test_json: string;
  level_before: Level | null;
  recommended: Level | null;
  bands_json: string | null;
  local_date: string | null;
}

/**
 * 短文與聽力內容至少要有規定長度下限的這個比例。
 * 長度就是難度的一部分:實測備援模型出的高等級短文只有規定的一半,那樣的題目分不出程度。
 */
const MIN_LENGTH_RATIO = 0.7;

/** 短文或聽力內容太短的等級。 */
function tooShort(test: PlacementTest): Level[] {
  return test.bands
    .filter((band) => {
      const wanted = PLACEMENT_LENGTHS[band.level];
      return countWords(band.reading.passage) < wanted.passage[0] * MIN_LENGTH_RATIO || countWords(band.listening.script) < wanted.script[0] * MIN_LENGTH_RATIO;
    })
    .map((band) => band.level);
}

/** 回顧頁面上最多列出幾次測驗結果。 */
const HISTORY_LIMIT = 10;

export function createPlacement(db: Db, ai: AiProvider, now: () => number = Date.now) {
  /** 每位使用者正在出題的工作,以及它開始的時間。同一位使用者一次只出一份。 */
  const generating = new Map<number, { work: Promise<void>; startedAt: number }>();

  const rowWith = (userId: number, status: TestRow['status']): TestRow | undefined =>
    db.prepare('SELECT * FROM placement_tests WHERE user_id = ? AND status = ? ORDER BY id LIMIT 1').get(userId, status) as TestRow | undefined;
  const usedBuiltin = (userId: number): boolean =>
    db.prepare(`SELECT 1 FROM placement_tests WHERE user_id = ? AND source = 'builtin' LIMIT 1`).get(userId) !== undefined;

  function insert(userId: number, source: TestRow['source'], status: TestRow['status'], test: PlacementTest): TestRow {
    const result = db.prepare('INSERT INTO placement_tests (user_id, source, status, test_json) VALUES (?, ?, ?, ?)').run(userId, source, status, JSON.stringify(test));
    return db.prepare('SELECT * FROM placement_tests WHERE id = ?').get(Number(result.lastInsertRowid)) as unknown as TestRow;
  }

  const toAttempt = (row: TestRow, repeatReason: string | null = null): PlacementAttempt => ({
    id: row.id,
    test: JSON.parse(row.test_json) as PlacementTest,
    source: row.source,
    repeatReason,
  });
  /** 再做一次內建的題目,並記下為什麼不是新的題目。 */
  const repeatBuiltin = (userId: number, reason: string): PlacementAttempt => toAttempt(insert(userId, 'builtin', 'in_progress', BUILTIN_PLACEMENT_TEST), reason);
  const toResult = (row: TestRow): PlacementResult => ({
    id: row.id,
    date: row.local_date!,
    levelBefore: row.level_before!,
    recommended: row.recommended!,
    bands: JSON.parse(row.bands_json!) as BandResult[],
  });

  /** 確保有一份備好的題目:已經有就不做事;正在出題就等它;都沒有就現在出。 */
  function ensureReady(student: PlacementStudent): Promise<void> {
    const running = generating.get(student.id);
    if (running) return running.work;
    if (rowWith(student.id, 'ready')) return Promise.resolve();
    if (!student.apiKey) return Promise.reject(new AiError('no_key'));

    const startedAt = now();
    const apiKey = student.apiKey;
    const work = (async () => {
      const draft = await ai.generateJson({
        tier: 'quality',
        task: 'placement',
        apiKey,
        ...placementPrompt({ stage: student.stage }),
        schema: PlacementDraftSchema,
        onUsage: usageRecorder(db, student.id),
      });
      // 交給模型的格式不帶數量限制(否則會被拒絕),所以題數、選項數與答案位置在這裡才嚴格檢查。
      const checked = PlacementTestSchema.safeParse(draft);
      if (!checked.success) throw new AiError('bad_output', `分級測驗的題目不符合格式:${checked.error.message}`);
      // 等級少一組或順序不對,就無法由低到高判定;這種題目不能用。
      if (!hasAllBandsInOrder(checked.data)) throw new AiError('bad_output', '分級測驗的等級順序不正確');
      const short = tooShort(checked.data);
      if (short.length > 0) throw new AiError('bad_output', `分級測驗的短文或聽力內容太短:${short.join('、')}`);
      const test = shuffleOptions(checked.data);
      recordTaskTiming(db, 'placement', now() - startedAt);
      // 出題期間使用者可能被刪除。
      if (db.prepare('SELECT 1 FROM users WHERE id = ?').get(student.id)) insert(student.id, 'ai', 'ready', test);
    })().finally(() => generating.delete(student.id));
    generating.set(student.id, { work, startedAt });
    return work;
  }

  return {
    status(student: PlacementStudent): PlacementStatus {
      const results = (
        db.prepare(`SELECT * FROM placement_tests WHERE user_id = ? AND status = 'completed' ORDER BY id DESC LIMIT ?`).all(student.id, HISTORY_LIMIT) as unknown as TestRow[]
      ).map(toResult);
      const inProgress = rowWith(student.id, 'in_progress') !== undefined;
      const stocked = inProgress || rowWith(student.id, 'ready') !== undefined || !usedBuiltin(student.id);
      const repeatsBuiltin = !stocked && !student.apiKey;
      const running = generating.get(student.id);
      const expected = expectedSeconds(db, 'placement');
      // 正在出題:扣掉已經等的時間;超過預估時至少顯示幾秒,不會倒數到 0 卻還沒好。
      const waitSeconds = running ? Math.max(Math.min(5, expected), expected - (now() - running.startedAt) / 1000) : expected;
      return { ready: stocked || repeatsBuiltin, waitSeconds: stocked || repeatsBuiltin ? 0 : Math.round(waitSeconds), repeatsBuiltin, inProgress, results };
    },

    /**
     * 開始(或繼續)一次測驗。依序使用:做到一半的那一份 → 備好的 → 還沒做過的內建題目 → 現場請老師出題。
     * 沒有 API key,或老師現在出不了合格的題目(忙線、額度用完、題目不合規定)時,再做一次內建的題目並說明原因:
     * 隨時都要能測;但題目看過了,結果可能偏高,所以一定要讓學生知道。
     */
    async start(student: PlacementStudent): Promise<PlacementAttempt> {
      const current = rowWith(student.id, 'in_progress');
      if (current) return toAttempt(current);

      let ready = rowWith(student.id, 'ready');
      if (!ready && !usedBuiltin(student.id)) return toAttempt(insert(student.id, 'builtin', 'in_progress', BUILTIN_PLACEMENT_TEST));
      if (!ready && !student.apiKey) return repeatBuiltin(student.id, AI_ERROR_MESSAGES.no_key);
      if (!ready) {
        try {
          await ensureReady(student);
        } catch (err) {
          if (!(err instanceof AiError)) throw err;
          return repeatBuiltin(student.id, err.code === 'bad_output' ? '老師這次出的題目沒有通過檢查' : err.message);
        }
        ready = rowWith(student.id, 'ready');
        if (!ready) return repeatBuiltin(student.id, AI_ERROR_MESSAGES.unavailable);
      }
      db.prepare(`UPDATE placement_tests SET status = 'in_progress' WHERE id = ?`).run(ready.id);
      return toAttempt({ ...ready, status: 'in_progress' });
    },

    /** 學生開始作答後,在背景備好下一份題目。失敗不影響這次測驗,下次開始時會再試。 */
    prepareNext(student: PlacementStudent): void {
      if (!student.apiKey) return;
      ensureReady(student).catch((err: unknown) => {
        console.warn(`[placement] 背景出題失敗:${err instanceof Error ? err.message : String(err)}`);
      });
    },

    /** 交卷:由伺服器依題目判分,記下結果。等級不會自動更改,由學生決定要不要切換。 */
    complete(id: number, answers: PlacementAnswers, tts: boolean): PlacementResult {
      const row = db.prepare('SELECT * FROM placement_tests WHERE id = ?').get(id) as TestRow | undefined;
      if (!row) throw new HttpError(404, '找不到這份測驗');
      if (row.status === 'completed') return toResult(row);
      if (row.status !== 'in_progress') throw new HttpError(409, '這份測驗還沒有開始');

      const user = db.prepare('SELECT level FROM users WHERE id = ?').get(row.user_id) as { level: Level };
      const outcome = placementOutcome(JSON.parse(row.test_json) as PlacementTest, answers, tts);
      db.prepare(
        `UPDATE placement_tests SET status = 'completed', answers_json = ?, level_before = ?, recommended = ?, bands_json = ?, local_date = ? WHERE id = ?`,
      ).run(JSON.stringify(answers), user.level, outcome.level, JSON.stringify(outcome.bands), localDate(), id);
      return toResult(db.prepare('SELECT * FROM placement_tests WHERE id = ?').get(id) as unknown as TestRow);
    },

    /** 測試用:等背景的出題工作結束。 */
    async idle(userId: number): Promise<void> {
      await generating.get(userId)?.work.catch(() => {});
    },
  };
}

export type Placement = ReturnType<typeof createPlacement>;
