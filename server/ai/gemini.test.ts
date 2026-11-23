import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createGeminiProvider, mapGeminiError, UNAVAILABLE_COOLDOWN_MS, type GeminiOptions, type InteractionClient } from './gemini.ts';
import { geminiOptionsFromEnv } from './index.ts';
import { AiError, type AiUsage } from './provider.ts';

// 這裡用假的 SDK client 測試備援、逾時與錯誤處理的邏輯,不會連到 Google。
// 真實 API 的行為另外用真正的 key 實測過(見 index.ts 開頭的數字)。

const Schema = z.object({ answer: z.string() });
const MODELS = { quality: ['strong', 'medium', 'lite'], chat: ['lite'] };

type Params = Parameters<InteractionClient['interactions']['create']>[0];
type RequestOptions = Parameters<InteractionClient['interactions']['create']>[1];
type Reply = { output_text?: string; usage?: { total_input_tokens?: number; total_output_tokens?: number }; tookMs?: number } | Error;

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

const ok = (answer: string, input = 100, output = 20, tookMs = 0): Reply => ({
  output_text: JSON.stringify({ answer }),
  usage: { total_input_tokens: input, total_output_tokens: output },
  tookMs,
});

/** 一組測試環境:假的 SDK client、可以撥動的時鐘,以及依模型預先排好的回應。 */
function setup(replies: Record<string, Reply[]>, options: Partial<GeminiOptions> = {}) {
  const calls: { apiKey: string; params: Params; options: RequestOptions }[] = [];
  const usage: AiUsage[] = [];
  // 台灣 11/20 中午 = 太平洋 11/19 晚上 8 點
  const clock = { now: Date.parse('2026-11-20T04:00:00Z') };
  const createClient = (apiKey: string): InteractionClient => ({
    interactions: {
      async create(params, requestOptions) {
        calls.push({ apiKey, params, options: requestOptions });
        const reply = replies[params.model]?.shift();
        if (!reply) throw new Error(`測試沒有為 ${params.model} 準備回應`);
        if (reply instanceof Error) throw reply;
        clock.now += reply.tookMs ?? 0;
        return reply;
      },
    },
  });
  const provider = createGeminiProvider({ models: MODELS, createClient, now: () => clock.now, ...options });
  const generate = (tier: 'quality' | 'chat' = 'quality', apiKey = 'user-key') =>
    provider.generateJson({ tier, task: 'test', apiKey, system: 'sys', input: 'in', schema: Schema, onUsage: (u) => usage.push(u) });
  const modelsCalled = () => calls.map((call) => call.params.model);
  return { provider, generate, calls, usage, clock, modelsCalled };
}

describe('Gemini:正常呼叫', () => {
  it('用使用者自己的 key、指定類別的第一個模型,並回傳通過驗證的內容', async () => {
    const t = setup({ strong: [ok('hi')] });
    await expect(t.generate()).resolves.toEqual({ answer: 'hi' });
    expect(t.calls.map((call) => call.apiKey)).toEqual(['user-key']);
    expect(t.modelsCalled()).toEqual(['strong']);
  });

  it('對話類的呼叫用對話類的模型', async () => {
    const t = setup({ lite: [ok('hi')] });
    await t.generate('chat');
    expect(t.modelsCalled()).toEqual(['lite']);
  });

  it('要求 JSON 結構化輸出,而且不要求 Google 保存內容', async () => {
    const t = setup({ strong: [ok('hi')] });
    await t.generate();
    const { params } = t.calls[0]!;
    expect(params).toMatchObject({ system_instruction: 'sys', input: 'in', store: false });
    expect(params.response_format).toMatchObject({ type: 'text', mime_type: 'application/json' });
    expect(params.response_format!.schema).toMatchObject({ type: 'object', required: ['answer'] });
    expect(params.response_format!.schema).not.toHaveProperty('$schema');
  });

  it('回報實際用掉的 token 數與花了多久,設定頁才能顯示用量與速度', async () => {
    const t = setup({ strong: [ok('hi', 1234, 567, 24_000)] });
    await t.generate();
    expect(t.usage).toEqual([{ model: 'strong', inputTokens: 1234, outputTokens: 567, durationMs: 24_000 }]);
  });
});

describe('Gemini:縮短等待時間', () => {
  // 思考程度預設不指定(品質優先);想換取速度時可以在 .env 調低,實測 low 是 24 秒、預設是 79 秒。
  it('有設定思考程度的類別才送出思考程度', async () => {
    const t = setup({ strong: [ok('a')], lite: [ok('b')] }, { thinking: { quality: 'low' } });
    await t.generate('quality');
    await t.generate('chat');
    expect(t.calls[0]!.params.generation_config).toEqual({ thinking_level: 'low' });
    expect(t.calls[1]!.params).not.toHaveProperty('generation_config');
  });

  // SDK 預設完全沒有逾時,而且遇到 429 / 5XX 會自己重試最多 4 次,才把錯誤交出來。
  // 那段時間使用者只能乾等;我們自己有備援模型,應該立刻換。
  it('每次呼叫都設逾時,並關掉 SDK 自己的重試', async () => {
    const t = setup({ strong: [ok('a')], lite: [ok('b')] });
    await t.generate('quality');
    await t.generate('chat');
    expect(t.calls[0]!.options).toEqual({ timeout_ms: 180_000, retries: { strategy: 'none' } });
    expect(t.calls[1]!.options).toEqual({ timeout_ms: 30_000, retries: { strategy: 'none' } });
  });

  it('逾時的長度可以調整', async () => {
    const t = setup({ strong: [ok('a')] }, { timeoutMs: { quality: 45_000 } });
    await t.generate();
    expect(t.calls[0]!.options.timeout_ms).toBe(45_000);
  });

  it('逾時視為暫時無法使用,改用下一個模型', async () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    const t = setup({ strong: [timeout], medium: [ok('from medium')] });
    await expect(t.generate()).resolves.toEqual({ answer: 'from medium' });
  });
});

describe('Gemini:記住剛失敗的模型', () => {
  // 沒有這個機制時,每一次呼叫都會先在同一個失敗的模型上白等一次才換備援。
  it('額度用完的模型在同一個額度日內不再嘗試,隔天恢復', async () => {
    const t = setup({ strong: [httpError(429, 'quota'), ok('strong is back')], medium: [ok('first'), ok('second')] });

    await expect(t.generate()).resolves.toEqual({ answer: 'first' });
    await expect(t.generate()).resolves.toEqual({ answer: 'second' });
    expect(t.modelsCalled()).toEqual(['strong', 'medium', 'medium']);

    t.clock.now += 24 * 60 * 60_000; // 過了太平洋時間午夜,額度重置
    await expect(t.generate()).resolves.toEqual({ answer: 'strong is back' });
  });

  it('暫時無法使用的模型先跳過 5 分鐘,之後再試', async () => {
    const t = setup({ strong: [httpError(503, 'high demand'), ok('strong is back')], medium: [ok('first'), ok('second')] });

    await t.generate();
    t.clock.now += 60_000;
    await t.generate();
    expect(t.modelsCalled()).toEqual(['strong', 'medium', 'medium']);

    t.clock.now += UNAVAILABLE_COOLDOWN_MS;
    await expect(t.generate()).resolves.toEqual({ answer: 'strong is back' });
  });

  // 實測遇過:分級測驗的輸出格式太複雜,備援模型回 400。它被當成忙線而跳過 5 分鐘,
  // 接著的備課在前面的模型逾時後就沒有備援可用了。請求被拒絕是那一次請求的問題,不是模型的問題。
  it('請求本身被拒絕(400)時改用下一個模型,但這個模型之後的工作照常使用', async () => {
    const t = setup({ strong: [httpError(400, 'schema has too many states'), ok('strong still works')], medium: [ok('fallback')] });

    await expect(t.generate()).resolves.toEqual({ answer: 'fallback' });
    await expect(t.generate()).resolves.toEqual({ answer: 'strong still works' });
    expect(t.modelsCalled()).toEqual(['strong', 'medium', 'strong']);
  });

  // 冷卻是為了少等,不是為了放棄:全部都失敗過時仍然要全部再試一次。
  it('所有模型都在冷卻中時,仍然照順序全部試一次', async () => {
    const t = setup({
      strong: [httpError(503, 'x'), ok('recovered')],
      medium: [httpError(503, 'x')],
      lite: [httpError(503, 'x')],
    });
    await expect(t.generate()).rejects.toMatchObject({ code: 'unavailable' });
    await expect(t.generate()).resolves.toEqual({ answer: 'recovered' });
  });

  // 額度跟著 key 所屬的專案走:一位使用者用完,不代表另一位也用完。
  it('一把 key 的額度用完,不影響另一把 key', async () => {
    const t = setup({ strong: [httpError(429, 'quota'), ok('other key works')], medium: [ok('fallback')] });
    await t.generate('quality', 'key-a');
    await expect(t.generate('quality', 'key-b')).resolves.toEqual({ answer: 'other key works' });
  });

  it('模型成功時不會被跳過', async () => {
    const t = setup({ strong: [ok('a'), ok('b')] });
    await t.generate();
    await t.generate();
    expect(t.modelsCalled()).toEqual(['strong', 'strong']);
  });
});

describe('Gemini:額度用完時的備援', () => {
  it('第一個模型額度用完(429)時,自動改用下一個模型', async () => {
    const t = setup({ strong: [httpError(429, 'quota exceeded')], medium: [ok('from medium')] });
    await expect(t.generate()).resolves.toEqual({ answer: 'from medium' });
    expect(t.modelsCalled()).toEqual(['strong', 'medium']);
    expect(t.usage.map((u) => u.model)).toEqual(['medium']);
  });

  it('模型不存在或暫時無法使用時,也會改用下一個模型', async () => {
    const t = setup({ strong: [httpError(404, 'model not found')], medium: [httpError(503, 'overloaded')], lite: [ok('from lite')] });
    await expect(t.generate()).resolves.toEqual({ answer: 'from lite' });
    expect(t.modelsCalled()).toEqual(['strong', 'medium', 'lite']);
  });

  it('所有模型的額度都用完時,明確回報「額度用完」而不是默默失敗', async () => {
    const t = setup({ strong: [httpError(429, 'q')], medium: [httpError(429, 'q')], lite: [httpError(429, 'q')] });
    await expect(t.generate()).rejects.toMatchObject({ code: 'quota' });
  });

  // key 有問題時換模型也沒用,繼續試只會浪費時間並讓錯誤訊息變得不清楚。
  it('key 無效時立刻停止,不再嘗試其他模型', async () => {
    const t = setup({ strong: [httpError(403, 'permission denied')], medium: [ok('never')] });
    await expect(t.generate()).rejects.toMatchObject({ code: 'invalid_key' });
    expect(t.calls).toHaveLength(1);
  });

  it('沒有 key 時不發出任何請求', async () => {
    const t = setup({});
    await expect(t.generate('quality', '')).rejects.toMatchObject({ code: 'no_key' });
    expect(t.calls).toHaveLength(0);
  });
});

describe('Gemini:回傳格式不正確', () => {
  it('第一次格式不對時重試一次,成功就採用;兩次呼叫都計入用量', async () => {
    const t = setup({ strong: [{ output_text: 'not json', usage: { total_input_tokens: 10, total_output_tokens: 5 } }, ok('second try')] });
    await expect(t.generate()).resolves.toEqual({ answer: 'second try' });
    expect(t.modelsCalled()).toEqual(['strong', 'strong']);
    expect(t.usage).toHaveLength(2);
  });

  // 格式驗證失敗最多重試 1 次。再試下去只會耗掉更多額度。
  it('重試一次仍然不對就放棄,不會換模型繼續消耗額度', async () => {
    const t = setup({ strong: [{ output_text: '{"wrong":1}' }, { output_text: '' }], medium: [ok('never')] });
    await expect(t.generate()).rejects.toMatchObject({ code: 'bad_output' });
    expect(t.modelsCalled()).toEqual(['strong', 'strong']);
  });
});

describe('Gemini:測試連線', () => {
  it('用對話類模型測試,不消耗品質類較少的額度', async () => {
    const t = setup({ lite: [{ output_text: 'OK', usage: { total_input_tokens: 8, total_output_tokens: 1 } }] });
    const result = await t.provider.testKey('user-key', (u) => t.usage.push(u));
    expect(result).toEqual({ ok: true, model: 'lite' });
    expect(t.modelsCalled()).toEqual(['lite']);
    expect(t.usage).toHaveLength(1);
  });

  it('key 無效時回報原因與原始錯誤訊息,方便排除問題', async () => {
    const t = setup({ lite: [httpError(400, 'API key not valid. Please pass a valid API key.')] });
    const result = await t.provider.testKey('bad');
    expect(result).toMatchObject({ ok: false, code: 'invalid_key', detail: 'API key not valid. Please pass a valid API key.' });
  });
});

describe('預設設定(來自實測)', () => {
  // 2026-11-20 實測(預設思考):hydrogen 40–61 秒,3.8-flash 79 秒;
  // flash-lite 8 秒但會把不合文法的答案列為正確,所以只當最後備援。
  it('品質類以 gemini-4-hydrogen 為第一順位,flash-lite 排最後', () => {
    const { models } = geminiOptionsFromEnv({});
    expect(models.quality).toEqual(['gemini-4-hydrogen', 'gemini-3.8-flash', 'gemini-3.5-flash-lite']);
    expect(models.chat).toEqual(['gemini-3.5-flash-lite']);
  });

  // 使用者的決定:不為了速度降低思考程度,等待時間改用預先備課解決。
  it('思考程度預設不指定,交給模型自己決定', () => {
    expect(geminiOptionsFromEnv({}).thinking).toEqual({ quality: undefined, chat: undefined });
  });

  it('可以在 .env 改思考程度;設成 default 或空字串表示交給模型決定', () => {
    expect(geminiOptionsFromEnv({ AI_THINKING_QUALITY: 'low' }).thinking.quality).toBe('low');
    expect(geminiOptionsFromEnv({ AI_THINKING_QUALITY: 'default' }).thinking.quality).toBeUndefined();
    expect(geminiOptionsFromEnv({ AI_THINKING_QUALITY: '' }).thinking.quality).toBeUndefined();
  });

  // 預設思考下實測最久 79 秒,逾時要明顯比它長,否則會把正常的產生過程切斷。
  it('逾時預設品質類 180 秒、對話類 30 秒,可以用秒數覆寫;不合理的值會被忽略', () => {
    expect(geminiOptionsFromEnv({}).timeoutMs).toEqual({ quality: 180_000, chat: 30_000 });
    expect(geminiOptionsFromEnv({ AI_TIMEOUT_QUALITY_SECONDS: '45' }).timeoutMs.quality).toBe(45_000);
    expect(geminiOptionsFromEnv({ AI_TIMEOUT_QUALITY_SECONDS: 'abc' }).timeoutMs.quality).toBe(180_000);
    expect(geminiOptionsFromEnv({ AI_TIMEOUT_QUALITY_SECONDS: '0' }).timeoutMs.quality).toBe(180_000);
  });
});

describe('錯誤分類', () => {
  it('依 HTTP 狀態碼分成額度、key 與其他三類', () => {
    expect(mapGeminiError(httpError(429, 'x')).code).toBe('quota');
    expect(mapGeminiError(httpError(401, 'x')).code).toBe('invalid_key');
    expect(mapGeminiError(httpError(403, 'x')).code).toBe('invalid_key');
    expect(mapGeminiError(httpError(400, 'API_KEY_INVALID')).code).toBe('invalid_key');
    expect(mapGeminiError(httpError(400, 'schema too complex')).code).toBe('unavailable');
    expect(mapGeminiError(httpError(503, 'high demand')).code).toBe('unavailable');
    expect(mapGeminiError(new Error('fetch failed')).code).toBe('unavailable');
  });

  it('已經分類過的錯誤原樣傳回', () => {
    const error = new AiError('quota', 'x');
    expect(mapGeminiError(error)).toBe(error);
  });
});
