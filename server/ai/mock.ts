import type { KeyTestResult } from '../../shared/schema.ts';
import { AiError, type AiJsonRequest, type AiProvider, type UsageRecorder } from './provider.ts';

/** 依用途(task)回傳的假資料;可以是固定值,或依請求內容產生的函式。 */
export type MockFixtures = Record<string, unknown | ((request: AiJsonRequest<unknown>) => unknown)>;

/** 在假資料模式下,貼上這個字串當 key 可以模擬「key 無效」。 */
export const MOCK_INVALID_KEY = 'invalid';

const MOCK_MODEL = 'mock';

/** 假資料實作:不連網、不耗額度,供開發與測試使用。 */
export function createMockProvider(fixtures: MockFixtures = {}): AiProvider {
  return {
    name: 'mock',
    models: { quality: [MOCK_MODEL], chat: [MOCK_MODEL] },

    async generateJson<T>(request: AiJsonRequest<T>): Promise<T> {
      if (!request.apiKey) throw new AiError('no_key');
      if (request.apiKey === MOCK_INVALID_KEY) throw new AiError('invalid_key', 'mock: invalid key');
      const fixture = fixtures[request.task];
      if (fixture === undefined) throw new AiError('unavailable', `mock: 沒有 ${request.task} 的假資料`);
      const raw = typeof fixture === 'function' ? fixture(request as AiJsonRequest<unknown>) : fixture;
      request.onUsage?.({ model: MOCK_MODEL, inputTokens: 0, outputTokens: 0, durationMs: 0 });
      const result = request.schema.safeParse(raw);
      if (!result.success) throw new AiError('bad_output', result.error.message);
      return result.data;
    },

    async testKey(apiKey: string, onUsage?: UsageRecorder): Promise<KeyTestResult> {
      if (apiKey === MOCK_INVALID_KEY) {
        const error = new AiError('invalid_key', 'mock: invalid key');
        return { ok: false, code: error.code, message: error.message, detail: error.detail };
      }
      onUsage?.({ model: MOCK_MODEL, inputTokens: 0, outputTokens: 0, durationMs: 0 });
      return { ok: true, model: MOCK_MODEL };
    },
  };
}
