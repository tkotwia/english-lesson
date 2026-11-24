import { createPcmDecoder, floatToPcm16, resample } from './pcm.ts';

// 即時語音對話在瀏覽器這一側的收音與播放。

/** 錄音用的小程式:把麥克風的每一小段聲音原樣交回主程式。 */
const CAPTURE_WORKLET = `
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor('capture', Capture);
`;

export interface MicStream {
  stop(): void;
}

/** 多長的聲音送出一次(秒)。太短請求太頻繁,太長老師會比較慢才聽到。 */
const STREAM_CHUNK_SECONDS = 0.1;

/**
 * 持續收麥克風的聲音:每累積一小段就交給 onChunk(16 位元單聲道 PCM,取樣率是指定的)。
 */
export async function startMicStream(sampleRate: number, onChunk: (pcm: Int16Array) => void): Promise<MicStream> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const context = new AudioContext({ sampleRate });
  const moduleUrl = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'application/javascript' }));
  const release = () => {
    stream.getTracks().forEach((track) => track.stop());
    void context.close();
    URL.revokeObjectURL(moduleUrl);
  };
  try {
    await context.audioWorklet.addModule(moduleUrl);
  } catch (err) {
    release();
    throw err;
  }
  let pending: Float32Array[] = [];
  let pendingSamples = 0;
  const source = context.createMediaStreamSource(stream);
  const capture = new AudioWorkletNode(context, 'capture');
  capture.port.onmessage = (event: MessageEvent<Float32Array>) => {
    pending.push(event.data);
    pendingSamples += event.data.length;
    if (pendingSamples < context.sampleRate * STREAM_CHUNK_SECONDS) return;
    const chunks = context.sampleRate === sampleRate ? pending : pending.map((chunk) => resample(chunk, context.sampleRate, sampleRate));
    pending = [];
    pendingSamples = 0;
    onChunk(floatToPcm16(chunks));
  };
  source.connect(capture);
  capture.connect(context.destination);
  return {
    stop() {
      capture.port.onmessage = null;
      source.disconnect();
      capture.disconnect();
      release();
    },
  };
}

export interface PcmPlayer {
  /** 把伺服器送來的一段聲音(base64 的 PCM,指定取樣率)接在目前排定的聲音後面播放。 */
  play(base64: string, sampleRate: number): void;
  /** 已經排定的聲音還要幾秒才播完。 */
  remaining(): number;
  /** 馬上停止目前的聲音(學生開始說話時)。 */
  stop(): void;
  close(): void;
}

/** 播放老師的聲音。要在使用者按下按鈕之後建立,瀏覽器才允許出聲。 */
export function createPcmPlayer(): PcmPlayer {
  const context = new AudioContext();
  const decode = createPcmDecoder();
  let nextTime = 0;
  let playing: AudioBufferSourceNode[] = [];
  return {
    play(base64, sampleRate) {
      const samples = decode(base64);
      if (samples.length === 0) return;
      const buffer = context.createBuffer(1, samples.length, sampleRate);
      buffer.getChannelData(0).set(samples);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      const at = Math.max(context.currentTime + 0.03, nextTime);
      source.start(at);
      nextTime = at + buffer.duration;
      playing.push(source);
      source.onended = () => {
        playing = playing.filter((item) => item !== source);
      };
    },
    remaining: () => Math.max(0, nextTime - context.currentTime),
    stop() {
      for (const source of playing) source.stop();
      playing = [];
      nextTime = 0;
    },
    close: () => void context.close(),
  };
}
