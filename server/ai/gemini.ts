import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import type { AiErrorCode, AiTier, KeyTestResult } from '../../shared/schema.ts';
import { AiError, type AiJsonRequest, type AiProvider, type UsageRecorder } from './provider.ts';
import { quotaDate } from './usage.ts';

/** 把 SDK 丟出的錯誤對應成我們自己的錯誤類別。 */
export function mapGeminiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  const status =
    typeof err === 'object' && err !== null && typeof (err as { status?: unknown }).status === 'number'
      ? (err as { status: number }).status
      : undefined;
  const detail = err instanceof Error ? err.message : String(err);

  if (status === 429) return new AiError('quota', detail);
  if (status === 401 || status === 403) return new AiError('invalid_key', detail);
  if (status === 400 && /api[ _-]?key/i.test(detail)) return new AiError('invalid_key', detail);
  return new AiError('unavailable', detail);
}

/** Gemini 的結構化輸出只支援 JSON Schema 的子集合,去掉它不需要的中繼欄位。 */
function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

function parseOutput<T>(text: string | undefined, schema: z.ZodType<T>): { ok: true; data: T } | { ok: false; detail: string } {
  if (!text) return { ok: false, detail: '模型沒有回傳任何文字' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, detail: '回傳內容不是合法的 JSON' };
  }
  const result = schema.safeParse(json);
  if (!result.success) return { ok: false, detail: z.prettifyError(result.error) };
  return { ok: true, data: result.data };
}

interface InteractionUsage {
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_thought_tokens?: number;
}

/** 這個實作實際用到的 SDK 介面。測試時可以換成假的 client,不必連網。 */
export interface InteractionClient {
  interactions: {
    create(
      params: {
        model: string;
        input: string;
        system_instruction?: string;
        response_format?: { type: 'text'; mime_type: 'application/json'; schema: Record<string, unknown> };
        generation_config?: { thinking_level: string };
        store: boolean;
      },
      options: { timeout_ms: number; retries: { strategy: 'none' } },
    ): Promise<{ output_text?: string; usage?: InteractionUsage }>;
  };
}

export type ClientFactory = (apiKey: string) => InteractionClient;

const defaultClientFactory: ClientFactory = (apiKey) => new GoogleGenAI({ apiKey }) as unknown as InteractionClient;

export interface GeminiOptions {
  /** 各類別使用的模型,依備援順序排列。 */
  models: Record<AiTier, string[]>;
  /**
   * 各類別的思考程度(minimal、low、medium、high…);沒設定就用模型自己的預設。
   * 實測產生一堂課時,模型預設會花掉輸出三倍的 token 在思考上,時間也多三倍。
   */
  thinking?: Partial<Record<AiTier, string>>;
  /** 各類別單次呼叫最多等多久(毫秒)。SDK 預設完全不設限,模型卡住時會一直等下去。 */
  timeoutMs?: Partial<Record<AiTier, number>>;
  createClient?: ClientFactory;
  /** 目前時間(毫秒);測試時可以替換。 */
  now?: () => number;
}

/** 實測預設思考下產生一堂課最久 79 秒;品質類的逾時留到兩倍多,避免把正常的產生過程切斷。 */
export const DEFAULT_TIMEOUT_MS: Record<AiTier, number> = { quality: 180_000, chat: 30_000 };

/** 模型暫時無法使用(忙線、逾時)時,隔多久再試它。 */
export const UNAVAILABLE_COOLDOWN_MS = 5 * 60_000;

/** 記下某個模型為什麼暫時不用:額度用完(到下一個額度日為止),或暫時無法使用(幾分鐘)。 */
type Cooldown = { quotaDay: string } | { until: number };

export function createGeminiProvider(options: GeminiOptions): AiProvider {
  const { models, thinking = {}, createClient = defaultClientFactory, now = Date.now } = options;
  const timeoutMs = { ...DEFAULT_TIMEOUT_MS, ...options.timeoutMs };
  // 以「key + 模型」為單位:額度是跟著 key 所屬的專案走的,一位使用者用完不代表另一位也用完。
  const cooldowns = new Map<string, Cooldown>();

  const isCooling = (apiKey: string, model: string): boolean => {
    const entry = cooldowns.get(`${apiKey}|${model}`);
    if (!entry) return false;
    const active = 'quotaDay' in entry ? entry.quotaDay === quotaDate(new Date(now())) : now() < entry.until;
    if (!active) cooldowns.delete(`${apiKey}|${model}`);
    return active;
  };

  const startCooldown = (apiKey: string, model: string, code: AiErrorCode): void => {
    if (code === 'quota') cooldowns.set(`${apiKey}|${model}`, { quotaDay: quotaDate(new Date(now())) });
    else if (code === 'unavailable') cooldowns.set(`${apiKey}|${model}`, { until: now() + UNAVAILABLE_COOLDOWN_MS });
  };

  /**
   * 這次要依序嘗試的模型:跳過剛失敗過的。
   * 沒有這一步的話,每次呼叫都會先在同一個失敗的模型上白等一次,才換到備援。
   * 全部都在冷卻中時仍然照原順序全部試一次,不會因此連試都不試。
   */
  const candidates = (apiKey: string, tier: AiTier): string[] => {
    const ready = models[tier].filter((model) => !isCooling(apiKey, model));
    return ready.length > 0 ? ready : models[tier];
  };

  const seconds = (startedAt: number) => Math.round((now() - startedAt) / 100) / 10;

  return {
    name: 'gemini',
    models,

    async generateJson<T>(request: AiJsonRequest<T>): Promise<T> {
      if (!request.apiKey) throw new AiError('no_key');
      const client = createClient(request.apiKey);
      const schema = toGeminiSchema(request.schema);
      const level = thinking[request.tier];
      let lastError = new AiError('unavailable', `沒有設定 ${request.tier} 類別的模型`);

      for (const model of candidates(request.apiKey, request.tier)) {
        // 格式錯誤最多重試 1 次;額度用完或模型不可用則改用下一個備援模型。
        for (let attempt = 0; attempt < 2; attempt++) {
          const startedAt = now();
          let interaction;
          try {
            interaction = await client.interactions.create(
              {
                model,
                input: request.input,
                system_instruction: request.system,
                response_format: { type: 'text', mime_type: 'application/json', schema },
                ...(level ? { generation_config: { thinking_level: level } } : {}),
                // 不要求 Google 保存這次的請求與回應。
                store: false,
              },
              // 逾時由我們設定;失敗時不讓 SDK 自己重試,直接交給下面的備援順序處理,才不會白等。
              { timeout_ms: timeoutMs[request.tier], retries: { strategy: 'none' } },
            );
          } catch (err) {
            const mapped = mapGeminiError(err);
            // key 本身有問題時,換模型也沒用。
            if (mapped.code === 'invalid_key') throw mapped;
            console.warn(`[ai] ${request.task} ${model} 無法使用(${mapped.code},等了 ${seconds(startedAt)} 秒):${mapped.detail ?? ''}`);
            startCooldown(request.apiKey, model, mapped.code);
            lastError = mapped;
            break;
          }

          const usage = interaction.usage ?? {};
          const durationMs = now() - startedAt;
          request.onUsage?.({ model, inputTokens: usage.total_input_tokens ?? 0, outputTokens: usage.total_output_tokens ?? 0, durationMs });
          console.log(
            `[ai] ${request.task} ${model} ${seconds(startedAt)} 秒(輸入 ${usage.total_input_tokens ?? 0} / 輸出 ${usage.total_output_tokens ?? 0} / 思考 ${usage.total_thought_tokens ?? 0} token)`,
          );
          const parsed = parseOutput(interaction.output_text, request.schema);
          if (parsed.ok) return parsed.data;

          console.warn(`[ai] ${model} 回傳格式不正確(第 ${attempt + 1} 次):${parsed.detail}`);
          if (attempt === 1) throw new AiError('bad_output', parsed.detail);
        }
      }
      throw lastError;
    },

    async testKey(apiKey: string, onUsage?: UsageRecorder): Promise<KeyTestResult> {
      // 用額度最高的對話類模型測試,避免消耗品質類模型較少的每日額度。
      const model = models.chat[0];
      if (!model) return { ok: false, code: 'unavailable', message: '沒有設定對話類模型', detail: undefined };
      const startedAt = now();
      try {
        const interaction = await createClient(apiKey).interactions.create(
          { model, input: 'Reply with the single word: OK', store: false },
          { timeout_ms: timeoutMs.chat, retries: { strategy: 'none' } },
        );
        onUsage?.({
          model,
          inputTokens: interaction.usage?.total_input_tokens ?? 0,
          outputTokens: interaction.usage?.total_output_tokens ?? 0,
          durationMs: now() - startedAt,
        });
        return { ok: true, model };
      } catch (err) {
        const mapped = mapGeminiError(err);
        return { ok: false, code: mapped.code, message: mapped.message, detail: mapped.detail };
      }
    },
  };
}
