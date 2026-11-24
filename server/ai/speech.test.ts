import { describe, expect, it } from 'vitest';
import type { AiUsage, QuotaEvent } from './provider.ts';
import { createGeminiSpeech, SPEECH_MIN_INTERVAL_MS, type SpeechFetch } from './speech.ts';

// 語音合成(Gemini):免費方案每個模型每分鐘 3 次、每天 10 次,而且失敗的請求也可能算次數。
// 所以這裡測的重點是「不白白送出會失敗的請求」:控制節奏、上限到了就換模型、今天不能用的今天不再試。

const WAV = Buffer.from('RIFF-fake-wav');
const ok = (audio: Buffer = WAV, usage = { total_input_tokens: 40, total_output_tokens: 160 }) => ({
  status: 200,
  body: JSON.stringify({ steps: [{ content: [{ type: 'audio', data: audio.toString('base64') }] }], usage }),
});
const DAILY = { status: 429, body: '{"error":{"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded for metric: generate_requests_per_model_per_day, limit: 10"}}' };
const MINUTE = { status: 429, body: '{"error":{"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded for metric: generate_requests_per_model_per_minute, limit: 3. Please retry in 20s."}}' };

/** 假的網路與時鐘:依模型決定回什麼,並記下每一次請求;等待不會真的等,只把時鐘往前撥。 */
function setup(reply: (model: string, call: number) => { status: number; body: string } | Error) {
  let time = Date.parse('2026-11-24T10:00:00Z');
  const requests: { model: string; at: number; key: string; body: any }[] = [];
  const fetch: SpeechFetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ model: body.model, at: time, key: init.headers['x-goog-api-key']!, body });
    const result = reply(body.model, requests.length);
    if (result instanceof Error) throw result;
    return { ok: result.status === 200, status: result.status, text: async () => result.body };
  };
  const voice = createGeminiSpeech({
    models: ['tts-a', 'tts-b'],
    fetch,
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
  });
  const say = (text = 'Hello there.') => voice.synthesize({ apiKey: 'user-key', text, style: 'slowly' });
  return {
    voice,
    say,
    requests,
    models: () => requests.map((request) => request.model),
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('語音合成(Gemini)', () => {
  // 請求的寫法是 2026-11-24 用真實 key 驗證過的;文字與「怎麼唸」分開給,模型才會逐字照唸而不是把指示也唸出來。
  it('用使用者自己的 key,把文字和唸法分開交給第一個模型,回傳聲音', async () => {
    const { say, requests } = setup(() => ok());
    expect(await say('We went home.')).toEqual(WAV);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.key).toBe('user-key');
    expect(requests[0]!.body).toMatchObject({
      model: 'tts-a',
      input: [{ type: 'user_input', content: [{ type: 'text', text: 'We went home.', annotations: [{ type: 'speech_metadata', style: 'slowly' }] }] }],
      response_format: { type: 'audio' },
    });
  });

  // 設定頁用這個數字顯示今天各模型用了幾次;語音合成一天只有 10 次,使用者要看得到用了多少。
  it('成功時回報是哪個模型做的、用了多少 token', async () => {
    const { voice } = setup(() => ok());
    const usage: AiUsage[] = [];
    await voice.synthesize({ apiKey: 'user-key', text: 'Hi.', style: 'slowly', onUsage: (entry) => usage.push(entry) });
    expect(usage).toEqual([expect.objectContaining({ model: 'tts-a', inputTokens: 40, outputTokens: 160 })]);
  });

  it('同一個模型每分鐘只能用 3 次:離上一次不到 21 秒就先等,不去換一個 429', async () => {
    const { say, requests } = setup(() => ok());
    await say();
    await say();
    await say();
    expect(requests.map((request) => request.model)).toEqual(['tts-a', 'tts-a', 'tts-a']);
    expect(requests[1]!.at - requests[0]!.at).toBe(SPEECH_MIN_INTERVAL_MS);
    expect(requests[2]!.at - requests[1]!.at).toBe(SPEECH_MIN_INTERVAL_MS);
  });

  it('已經隔得夠久就不必再等', async () => {
    const { say, requests, advance } = setup(() => ok());
    await say();
    advance(60_000);
    await say();
    expect(requests[1]!.at - requests[0]!.at).toBe(60_000);
  });

  describe('每日的上限到了', () => {
    it('改用下一個模型,並通知使用者', async () => {
      const { voice, models } = setup((model) => (model === 'tts-a' ? DAILY : ok()));
      const quota: QuotaEvent[] = [];
      const wav = await voice.synthesize({ apiKey: 'user-key', text: 'Hi.', style: 'slowly', onQuota: (event) => quota.push(event) });
      expect(wav).toEqual(WAV);
      expect(models()).toEqual(['tts-a', 'tts-b']);
      expect(quota).toEqual([expect.objectContaining({ model: 'tts-a', scope: 'day' })]);
    });

    // 再試也只會再失敗一次,而且失敗的請求可能照樣算進每日次數。
    it('今天不再試那個模型', async () => {
      const { say, models, advance } = setup((model) => (model === 'tts-a' ? DAILY : ok()));
      await say();
      advance(3 * 60 * 60_000);
      await say();
      expect(models()).toEqual(['tts-a', 'tts-b', 'tts-b']);
    });

    // 額度在太平洋時間午夜(台灣下午 3–4 點)重置。10:00Z 是太平洋時間凌晨 2 點,再過 24 小時就是隔天。
    it('額度重置之後會再試', async () => {
      let exhausted = true;
      const { say, models, advance } = setup((model) => (model === 'tts-a' && exhausted ? DAILY : ok()));
      await say();
      advance(24 * 60 * 60_000);
      exhausted = false;
      await say();
      expect(models()).toEqual(['tts-a', 'tts-b', 'tts-a']);
    });

    it('所有模型今天都用完時直接回報額度用完,不再送出任何請求', async () => {
      const { say, requests } = setup(() => DAILY);
      await expect(say()).rejects.toMatchObject({ code: 'quota' });
      expect(requests).toHaveLength(2);
      await expect(say()).rejects.toMatchObject({ code: 'quota' });
      expect(requests).toHaveLength(2);
    });
  });

  it('每分鐘的上限到了:先用下一個模型,一分鐘後再回來用原本的', async () => {
    let limited = true;
    const { say, models, advance } = setup((model) => (model === 'tts-a' && limited ? MINUTE : ok()));
    await say();
    advance(30_000);
    await say();
    limited = false;
    advance(31_000);
    await say();
    expect(models()).toEqual(['tts-a', 'tts-b', 'tts-b', 'tts-a']);
  });

  it('連不上或逾時:換下一個模型,原本的休息五分鐘', async () => {
    const { say, models, advance } = setup((model) => (model === 'tts-a' ? new Error('timeout') : ok()));
    expect(await say()).toEqual(WAV);
    advance(4 * 60_000);
    await say();
    advance(2 * 60_000);
    await say();
    expect(models()).toEqual(['tts-a', 'tts-b', 'tts-b', 'tts-a', 'tts-b']);
  });

  // 400 是這一次的內容被拒絕,不是模型壞了;讓模型休息的話,下一段正常的文字也會被跳過。
  it('這次的請求被拒絕(400)時換下一個模型,但不讓原本的模型休息', async () => {
    const { say, models } = setup((model, call) => (model === 'tts-a' && call === 1 ? { status: 400, body: 'INVALID_ARGUMENT' } : ok()));
    await say();
    await say();
    expect(models()).toEqual(['tts-a', 'tts-b', 'tts-a']);
  });

  // key 無效的話換哪個模型都一樣,而且每試一次都是白費。
  it('key 無效時馬上回報,不再試其他模型', async () => {
    const { say, requests } = setup(() => ({ status: 403, body: 'PERMISSION_DENIED' }));
    await expect(say()).rejects.toMatchObject({ code: 'invalid_key' });
    expect(requests).toHaveLength(1);
  });

  it('回應裡沒有聲音時不會把空的內容當成音檔,改用下一個模型', async () => {
    const { say, models } = setup((model) => (model === 'tts-a' ? { status: 200, body: JSON.stringify({ steps: [{ content: [{ type: 'text', text: 'sorry' }] }] }) } : ok()));
    expect(await say()).toEqual(WAV);
    expect(models()).toEqual(['tts-a', 'tts-b']);
  });

  it('沒有 key 時不送出請求', async () => {
    const { voice, requests } = setup(() => ok());
    await expect(voice.synthesize({ apiKey: '', text: 'Hi.', style: 'slowly' })).rejects.toMatchObject({ code: 'no_key' });
    expect(requests).toHaveLength(0);
  });
});
