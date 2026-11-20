import { createGeminiProvider, DEFAULT_TIMEOUT_MS, type GeminiOptions } from './gemini.ts';
import { createMockProvider } from './mock.ts';
import { MOCK_FIXTURES } from './mockData.ts';
import type { AiProvider } from './provider.ts';

// 2026-11-20 用真實 key 產生 B2 課程的實測(思考程度為模型預設,除非另外註明):
//   gemini-4-hydrogen           40 秒、61 秒,另有一次回 503「需求過高」;速度看當下負載
//   gemini-3.8-flash            79 秒(思考用掉的 token 是輸出的三倍)
//   gemini-3.8-flash 思考 low   24 秒、33 秒,但對指示(例如課文字數)遵循得較不精確
//   gemini-3.5-flash-lite        8 秒,但克漏字會把不合文法的答案列為正確,只適合當最後備援
//
// 思考程度維持模型預設(品質優先);等待時間改用「上課時在背景預先備好下一堂」來解決。
// hydrogen 排第一:預設思考下它比 3.8-flash 快,忙線時會立刻失敗並換到 3.8-flash。
const DEFAULT_QUALITY_MODELS = 'gemini-4-hydrogen,gemini-3.8-flash,gemini-3.5-flash-lite';
const DEFAULT_CHAT_MODELS = 'gemini-3.5-flash-lite';
const DEFAULT_THINKING_QUALITY: string | undefined = undefined;

function parseModelList(value: string | undefined, fallback: string): string[] {
  return (value?.trim() ? value : fallback)
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
}

/** 思考程度:沒設定用我們的預設;設成空字串或 default 表示交給模型自己決定。 */
function parseThinking(value: string | undefined, fallback: string | undefined): string | undefined {
  const level = (value ?? fallback ?? '').trim().toLowerCase();
  return level === '' || level === 'default' ? undefined : level;
}

/** 逾時秒數:沒設定或不是正數時用預設值。 */
function parseTimeoutMs(value: string | undefined, fallbackMs: number): number {
  const secondsValue = Number(value);
  return Number.isFinite(secondsValue) && secondsValue > 0 ? Math.round(secondsValue * 1000) : fallbackMs;
}

/** 從環境變數讀出 Gemini 的設定。獨立成函式是為了能測試預設值。 */
export function geminiOptionsFromEnv(env: NodeJS.ProcessEnv): Required<Pick<GeminiOptions, 'models' | 'thinking' | 'timeoutMs'>> {
  return {
    models: {
      quality: parseModelList(env.AI_MODELS_QUALITY, DEFAULT_QUALITY_MODELS),
      chat: parseModelList(env.AI_MODELS_CHAT, DEFAULT_CHAT_MODELS),
    },
    thinking: {
      quality: parseThinking(env.AI_THINKING_QUALITY, DEFAULT_THINKING_QUALITY),
      chat: parseThinking(env.AI_THINKING_CHAT, undefined),
    },
    timeoutMs: {
      quality: parseTimeoutMs(env.AI_TIMEOUT_QUALITY_SECONDS, DEFAULT_TIMEOUT_MS.quality),
      chat: parseTimeoutMs(env.AI_TIMEOUT_CHAT_SECONDS, DEFAULT_TIMEOUT_MS.chat),
    },
  };
}

/** 依環境變數建立 AI 供應商。未知的 AI_PROVIDER 會直接報錯,不會默默改用預設值。 */
export function createProvider(env: NodeJS.ProcessEnv): AiProvider {
  const name = env.AI_PROVIDER?.trim() || 'gemini';
  switch (name) {
    case 'gemini':
      return createGeminiProvider(geminiOptionsFromEnv(env));
    case 'mock':
      return createMockProvider(MOCK_FIXTURES);
    default:
      throw new Error(`不支援的 AI_PROVIDER:「${name}」(可用:gemini、mock)`);
  }
}
