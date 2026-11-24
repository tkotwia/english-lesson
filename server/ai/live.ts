import { GoogleGenAI, Modality } from '@google/genai';
import { AiError, type UsageRecorder } from './provider.ts';

// 即時語音對話:模型直接聽學生的聲音、用聲音回應,不經過「語音轉文字 → 文字模型 → 朗讀」。
// 和 provider.ts 一樣,課程程式只依賴這裡的介面;Gemini 與假資料各有一個實作。
//
// 聲音的格式(兩個實作都一樣):學生的聲音是 16 kHz、老師的聲音是 24 kHz,都是 16 位元、單聲道、未壓縮的 PCM。

export const LIVE_INPUT_RATE = 16_000;
export const LIVE_OUTPUT_RATE = 24_000;

/** 對話進行中陸續送來的內容。 */
export interface LiveStreamHandlers {
  /** 學生這段話的文字稿(片段,依序接起來)。 */
  onHeard: (text: string) => void;
  /** 老師說的話的文字稿(片段)。 */
  onSaid: (text: string) => void;
  /** 老師的聲音(片段)。 */
  onAudio: (pcm: Buffer) => void;
  /** 老師說完一輪。 */
  onTurnComplete: () => void;
  /** 學生開口打斷了老師:還沒播完的聲音要立刻停掉。 */
  onInterrupted: () => void;
  /** 連線中斷或出錯;之後不會再有任何內容。只會呼叫一次。 */
  onFailure: (error: AiError) => void;
}

/** 一場進行中的對話:麥克風的聲音持續送進來,由模型自己判斷學生說完了沒。 */
export interface LiveStream {
  /** 請老師先開口。 */
  open(): void;
  /** 麥克風的一小段聲音。 */
  audio(pcm: Buffer): void;
  close(): void;
}

export interface LiveStreamOptions {
  apiKey: string;
  /** 老師的角色與規則。 */
  system: string;
  /** 請老師開場時給它的指示(學生不會看到)。 */
  opening: string;
  /** 學生安靜多久(毫秒)算說完了。太短會打斷停下來想的學生,太長老師接話會變慢。 */
  silenceMs: number;
  onUsage?: UsageRecorder;
}

export interface LiveVoice {
  /** 使用的模型名稱,顯示在用量表上。 */
  readonly model: string;
  stream(options: LiveStreamOptions, handlers: LiveStreamHandlers): Promise<LiveStream>;
}

/** 這個實作實際用到的 SDK 介面。測試時可以換成假的,不必連網。 */
export interface LiveSdkSession {
  sendClientContent(params: { turns: { role: string; parts: { text: string }[] }[]; turnComplete: boolean }): void;
  sendRealtimeInput(params: { audio: { data: string; mimeType: string } }): void;
  close(): void;
}

export interface LiveSdkMessage {
  usageMetadata?: { promptTokenCount?: number; responseTokenCount?: number; thoughtsTokenCount?: number };
  serverContent?: {
    modelTurn?: { parts?: { inlineData?: { data?: string } }[] };
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    turnComplete?: boolean;
    interrupted?: boolean;
  };
}

export interface LiveSdkCallbacks {
  onmessage: (message: LiveSdkMessage) => void;
  onerror: (event: { message?: string }) => void;
  onclose: (event: { code?: number; reason?: string }) => void;
}

export type LiveSdkConnect = (apiKey: string, model: string, system: string, silenceMs: number, callbacks: LiveSdkCallbacks) => Promise<LiveSdkSession>;

const defaultConnect: LiveSdkConnect = (apiKey, model, system, silenceMs, callbacks) =>
  new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1beta' } }).live.connect({
    model,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: system,
      // 雙方的文字稿:畫面上顯示,之後也用來評分。
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // 由模型判斷學生說完了沒,但把「安靜多久算說完」拉長,給學生停下來想的空間。
      realtimeInputConfig: { automaticActivityDetection: { disabled: false, silenceDurationMs: silenceMs } },
    },
    callbacks: callbacks as never,
  }) as unknown as Promise<LiveSdkSession>;

/** 連線中斷的原因對應成我們自己的錯誤類別。 */
export function mapLiveFailure(reason: string): AiError {
  if (/api[ _-]?key|permission|unauthori[sz]ed|unauthenticated/i.test(reason)) return new AiError('invalid_key', reason);
  if (/quota|rate limit|resource[ _]exhausted|exceeded/i.test(reason)) return new AiError('quota', reason);
  return new AiError('unavailable', reason);
}

export interface GeminiLiveOptions {
  model: string;
  connect?: LiveSdkConnect;
  now?: () => number;
}

export function createGeminiLive({ model, connect = defaultConnect, now = Date.now }: GeminiLiveOptions): LiveVoice {
  return {
    model,
    async stream({ apiKey, system, opening, onUsage, silenceMs }, handlers) {
      if (!apiKey) throw new AiError('no_key');
      /** 已經結束(我們關的,或連線斷了):之後的內容一律不再往外送。 */
      let ended = false;
      let turnStartedAt = now();
      const fail = (reason: string) => {
        if (ended) return;
        ended = true;
        handlers.onFailure(mapLiveFailure(reason));
      };

      let session: LiveSdkSession;
      try {
        session = await connect(apiKey, model, system, silenceMs, {
            onmessage: (message) => {
              if (ended) return;
              const content = message.serverContent;
              if (content?.inputTranscription?.text) handlers.onHeard(content.inputTranscription.text);
              if (content?.outputTranscription?.text) handlers.onSaid(content.outputTranscription.text);
              for (const part of content?.modelTurn?.parts ?? []) {
                if (part.inlineData?.data) handlers.onAudio(Buffer.from(part.inlineData.data, 'base64'));
              }
              if (content?.interrupted) handlers.onInterrupted();
              if (content?.turnComplete) {
                const usage = message.usageMetadata ?? {};
                onUsage?.({
                  model,
                  inputTokens: usage.promptTokenCount ?? 0,
                  outputTokens: (usage.responseTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
                  durationMs: now() - turnStartedAt,
                });
                turnStartedAt = now();
                handlers.onTurnComplete();
              }
            },
            onerror: (event) => fail(event.message ?? '連線發生錯誤'),
            onclose: (event) => fail(event.reason || `連線已經關閉(${event.code ?? '不明'})`),
        });
      } catch (err) {
        throw mapLiveFailure(err instanceof Error ? err.message : String(err));
      }

      return {
        open: () => {
          if (!ended) session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: opening }] }], turnComplete: true });
        },
        audio: (pcm) => {
          if (!ended) session.sendRealtimeInput({ audio: { data: pcm.toString('base64'), mimeType: `audio/pcm;rate=${LIVE_INPUT_RATE}` } });
        },
        close: () => {
          if (ended) return;
          ended = true;
          session.close();
        },
      };
    },
  };
}

/** 一小段提示音(假資料模式用):讓瀏覽器播放聲音的流程也走得到。 */
function tone(seconds: number, frequency: number): Buffer {
  const samples = Math.round(seconds * LIVE_OUTPUT_RATE);
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * frequency * i) / LIVE_OUTPUT_RATE) * 6000), i * 2);
  return pcm;
}

/** 假資料實作:不連網、不耗額度。老師的回應是固定的句子加一小段提示音。 */
export function createMockLive(): LiveVoice {
  return {
    model: 'mock-live',
    // 假資料沒辦法真的聽出學生說完了沒:收到一定長度的聲音就當成說完一句,回一句話。
    async stream({ apiKey, onUsage }, handlers) {
      if (!apiKey) throw new AiError('no_key');
      const REPLY_AFTER_BYTES = Math.round(1.5 * LIVE_INPUT_RATE * 2);
      let received = 0;
      let replies = 0;
      let closed = false;
      const say = (heard: string | null, said: string) => {
        if (heard) handlers.onHeard(heard);
        handlers.onSaid(said);
        handlers.onAudio(tone(0.4, 440));
        onUsage?.({ model: 'mock-live', inputTokens: 0, outputTokens: 0, durationMs: 0 });
        handlers.onTurnComplete();
      };
      return {
        open: () => say(null, '(假資料)Hello! What did you do last weekend?'),
        audio: (pcm) => {
          if (closed) return;
          received += pcm.length;
          if (received < REPLY_AFTER_BYTES) return;
          received = 0;
          replies++;
          say('(假資料)學生說了一句話', `(假資料)That sounds great! Tell me more. (${replies})`);
        },
        close: () => {
          closed = true;
        },
      };
    },
  };
}
