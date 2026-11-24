import { AiError, type QuotaRecorder, type UsageRecorder } from './provider.ts';
import { quotaScope, retryAfterSeconds } from './gemini.ts';
import { quotaDate } from './usage.ts';

// 語音合成:把一段固定的文字逐字唸成自然的聲音(聽力課文、聽寫句子)。
// 和即時語音不同:即時語音是對話模型,不保證逐字照唸;語音合成模型的文件寫明會逐字照唸(2026-11-24 實測也一字不差)。
// 和 provider.ts 一樣,其他程式只依賴這裡的介面(SpeechVoice);要改用其他供應商時新增一個實作即可。

export interface SpeechRequest {
  apiKey: string;
  /** 要唸的文字。 */
  text: string;
  /** 怎麼唸(語速、語氣),例如「slowly and clearly」。 */
  style: string;
  onUsage?: UsageRecorder;
  onQuota?: QuotaRecorder;
}

export interface SpeechVoice {
  /** 使用的模型,依備援順序排列。 */
  readonly models: readonly string[];
  /** 回傳 WAV 格式的聲音。所有模型今天都不能用時丟出 quota 或 unavailable 的錯誤。 */
  synthesize(request: SpeechRequest): Promise<Buffer>;
}

/** 2026-11-24 在免費方案看到的上限:每個語音合成模型每分鐘 3 次、每日 10 次。兩個模型輪著用,一天合計 20 次。 */
export const DEFAULT_SPEECH_MODELS = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'];

/** 同一個模型兩次請求至少隔多久:每分鐘 3 次,留一點餘裕。 */
export const SPEECH_MIN_INTERVAL_MS = 21_000;
/** 模型忙線時隔多久再試。 */
const BUSY_COOLDOWN_MS = 5 * 60_000;
const MINUTE_COOLDOWN_MS = 60_000;
/** 一篇課文可能要唸好幾分鐘,產生也要一陣子。 */
const TIMEOUT_MS = 5 * 60_000;
const VOICE = 'Kore';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

/** 這個實作實際用到的網路呼叫。測試時可以換成假的,不必連網。 */
export type SpeechFetch = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface GeminiSpeechOptions {
  models?: readonly string[];
  fetch?: SpeechFetch;
  now?: () => number;
  /** 等待(毫秒);測試時可以換成不必真的等的版本。 */
  sleep?: (ms: number) => Promise<void>;
}

interface SpeechResponse {
  steps?: { content?: { type?: string; data?: string }[] }[];
  usage?: { total_input_tokens?: number; total_output_tokens?: number };
}

/** 某個模型暫時不用的原因:今天的額度用完了(到下一個額度日),或過一下再試。 */
type Cooldown = { quotaDay: string } | { until: number };

export function createGeminiSpeech(options: GeminiSpeechOptions = {}): SpeechVoice {
  const models = options.models ?? DEFAULT_SPEECH_MODELS;
  const request = options.fetch ?? (fetch as unknown as SpeechFetch);
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  // 額度跟著 API key 所屬的專案走,所以以「key + 模型」為單位。
  const cooldowns = new Map<string, Cooldown>();
  const lastRequestAt = new Map<string, number>();

  const cooling = (key: string): boolean => {
    const entry = cooldowns.get(key);
    if (!entry) return false;
    const active = 'quotaDay' in entry ? entry.quotaDay === quotaDate(new Date(now())) : now() < entry.until;
    if (!active) cooldowns.delete(key);
    return active;
  };

  return {
    models,
    async synthesize({ apiKey, text, style, onUsage, onQuota }) {
      if (!apiKey) throw new AiError('no_key');
      let lastError = new AiError('quota', '語音合成的模型今天都已經達到上限');

      for (const model of models) {
        const key = `${apiKey}|${model}`;
        if (cooling(key)) continue;
        // 每分鐘只能送 3 次:離上一次太近就先等一下,不要白白換來一個 429。
        const wait = (lastRequestAt.get(key) ?? -Infinity) + SPEECH_MIN_INTERVAL_MS - now();
        if (wait > 0) await sleep(wait);
        lastRequestAt.set(key, now());

        const startedAt = now();
        let response: Awaited<ReturnType<SpeechFetch>>;
        try {
          response = await request(ENDPOINT, {
            method: 'POST',
            headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style }] }] }],
              response_format: { type: 'audio' },
              generation_config: { speech_config: [{ voice: VOICE }] },
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
        } catch (err) {
          cooldowns.set(key, { until: now() + BUSY_COOLDOWN_MS });
          lastError = new AiError('unavailable', err instanceof Error ? err.message : String(err));
          console.warn(`[speech] ${model} 無法使用:${lastError.detail}`);
          continue;
        }

        const raw = await response.text();
        if (!response.ok) {
          const detail = raw.replace(/\s+/g, ' ').slice(0, 500);
          if (response.status === 401 || response.status === 403) throw new AiError('invalid_key', detail);
          if (response.status === 429) {
            const scope = quotaScope(detail);
            // 每日的上限:今天不用再試這個模型。每分鐘的上限:過一下就恢復。
            if (scope === 'day') cooldowns.set(key, { quotaDay: quotaDate(new Date(now())) });
            else cooldowns.set(key, { until: now() + Math.max(MINUTE_COOLDOWN_MS, (retryAfterSeconds(detail) ?? 0) * 1000) });
            onQuota?.({ model, scope, retryAfterSeconds: retryAfterSeconds(detail) });
            lastError = new AiError('quota', detail);
          } else {
            // 400 是這次的請求有問題(例如文字太長),不是模型出狀況:不必讓模型休息,換下一個試試。
            if (response.status !== 400) cooldowns.set(key, { until: now() + BUSY_COOLDOWN_MS });
            lastError = new AiError(response.status === 400 ? 'bad_output' : 'unavailable', detail);
          }
          console.warn(`[speech] ${model} 無法使用(HTTP ${response.status}):${detail.slice(0, 160)}`);
          continue;
        }

        const body = JSON.parse(raw) as SpeechResponse;
        const audio = (body.steps ?? []).flatMap((step) => step.content ?? []).filter((part) => part.type === 'audio' && part.data).at(-1);
        if (!audio?.data) {
          lastError = new AiError('bad_output', '語音合成沒有回傳聲音');
          continue;
        }
        onUsage?.({ model, inputTokens: body.usage?.total_input_tokens ?? 0, outputTokens: body.usage?.total_output_tokens ?? 0, durationMs: now() - startedAt });
        console.log(`[speech] ${model} ${Math.round((now() - startedAt) / 100) / 10} 秒(${text.split(/\s+/).length} 個字)`);
        return Buffer.from(audio.data, 'base64');
      }
      throw lastError;
    },
  };
}
