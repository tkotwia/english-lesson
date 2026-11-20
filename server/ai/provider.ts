import type { z } from 'zod';
import type { AiErrorCode, AiTier, KeyTestResult } from '../../shared/schema.ts';

// 課程程式只依賴這個介面,不直接碰任何供應商的 SDK。
// 要改接其他供應商或本機模型時,新增一個實作檔並在 index.ts 註冊即可。

export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** 這次呼叫從送出到收到回應花了多久(毫秒)。 */
  durationMs: number;
}

export type UsageRecorder = (usage: AiUsage) => void;

export interface AiJsonRequest<T> {
  /** quality:產生課程與批改;chat:對話回合與問老師。兩類使用不同模型以節省額度。 */
  tier: AiTier;
  /** 這次呼叫的用途,例如 'lesson'、'grade'、'chat'。假資料實作靠它挑選回應。 */
  task: string;
  apiKey: string;
  system: string;
  input: string;
  /** 回傳內容必須通過這個 schema 的驗證。 */
  schema: z.ZodType<T>;
  /** 每次成功的 API 呼叫都會回報一次用量(包含因格式錯誤而重試的那次)。 */
  onUsage?: UsageRecorder;
}

export interface AiProvider {
  readonly name: string;
  /** 各類別使用的模型,依備援順序排列。 */
  readonly models: Record<AiTier, string[]>;
  generateJson<T>(request: AiJsonRequest<T>): Promise<T>;
  testKey(apiKey: string, onUsage?: UsageRecorder): Promise<KeyTestResult>;
}

export const AI_ERROR_MESSAGES: Record<AiErrorCode, string> = {
  no_key: '尚未設定 API key,請到「設定」頁貼上。',
  invalid_key: 'API key 無效或沒有權限,請到「設定」頁確認。',
  quota: '今日免費額度已用完,台灣時間下午 3–4 點重置。可以先做不耗額度的複習。',
  bad_output: 'AI 回傳的內容格式不正確,請再試一次。',
  unavailable: 'AI 服務暫時無法使用,請稍後再試。',
};

export class AiError extends Error {
  code: AiErrorCode;
  /** 供應商回傳的原始錯誤訊息,用於除錯。 */
  detail: string | undefined;

  constructor(code: AiErrorCode, detail?: string) {
    super(AI_ERROR_MESSAGES[code]);
    this.name = 'AiError';
    this.code = code;
    this.detail = detail;
  }
}
