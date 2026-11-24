import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 朗讀:聽力課文與聽寫句子有唸好的音檔時播音檔,其餘用瀏覽器朗讀。
// 這裡用假的瀏覽器語音與假的 <audio>,測的是「學生一定聽得到」:有音檔就播、播不出來就退回瀏覽器朗讀、
// 學生按下播放的內容不會被老師自動朗讀的台詞打斷。

class FakeUtterance {
  text: string;
  lang = '';
  voice: unknown = null;
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

/** 假的瀏覽器語音:排進來的句子留在 queue 裡,由測試決定什麼時候「唸完」。 */
function fakeSynth() {
  return {
    queue: [] as FakeUtterance[],
    get speaking() {
      return this.queue.length > 0;
    },
    pending: false,
    getVoices: () => [],
    addEventListener: () => {},
    speak(utterance: FakeUtterance) {
      this.queue.push(utterance);
    },
    // Chrome 取消朗讀時,被取消的句子會收到 error 事件。
    cancel() {
      const cancelled = this.queue;
      this.queue = [];
      cancelled.forEach((utterance) => utterance.onerror?.());
    },
    finish() {
      const spoken = this.queue;
      this.queue = [];
      spoken.forEach((utterance) => utterance.onend?.());
    },
    texts() {
      return this.queue.map((utterance) => utterance.text);
    },
  };
}

class FakeAudio {
  static made: FakeAudio[] = [];
  static rejectPlay = false;
  src: string;
  paused = true;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.src = url;
    FakeAudio.made.push(this);
  }
  play(): Promise<void> {
    this.paused = false;
    return FakeAudio.rejectPlay ? Promise.reject(new Error('NotSupportedError')) : Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
}

const PASSAGE = 'We went to the night market. It was fun.';
const LINE = '現在回答幾個問題。';

let synth: ReturnType<typeof fakeSynth>;
let tts: typeof import('./tts.ts');

beforeEach(async () => {
  vi.useFakeTimers();
  synth = fakeSynth();
  FakeAudio.made = [];
  FakeAudio.rejectPlay = false;
  vi.stubGlobal('window', { speechSynthesis: synth, setTimeout: (run: () => void, ms: number) => setTimeout(run, ms), clearTimeout: (id: number) => clearTimeout(id) });
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  vi.resetModules();
  tts = await import('./tts.ts');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** 老師的台詞出現在畫面上(自動朗讀會稍等一下,把同時出現的幾句合成一次)。 */
function teacherSays(text: string): void {
  tts.requestAutoSpeak(text, 1);
  vi.advanceTimersByTime(60);
}

describe('有唸好的音檔', () => {
  beforeEach(() => tts.setRecordings({ [PASSAGE]: '/api/audio/abc' }));

  it('一模一樣的文字播音檔,不用瀏覽器朗讀', () => {
    tts.speak(PASSAGE);
    expect(FakeAudio.made.map((audio) => audio.src)).toEqual(['/api/audio/abc']);
    expect(FakeAudio.made[0]!.paused).toBe(false);
    expect(synth.texts()).toEqual([]);
  });

  it('沒有音檔的文字照舊用瀏覽器朗讀', () => {
    tts.speak('Hello.');
    expect(FakeAudio.made).toEqual([]);
    expect(synth.texts()).toEqual(['Hello.']);
  });

  // 聽力那一步靠這個通知把「播放中…」換回來。
  it('播完時通知一次', () => {
    const onEnd = vi.fn();
    tts.speak(PASSAGE, { onEnd });
    expect(onEnd).not.toHaveBeenCalled();
    FakeAudio.made[0]!.onended!();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  // 音檔可能已經被清掉(只保留還用得到的),或伺服器剛好連不上;學生按了播放就一定要聽得到。
  it('音檔讀不到時改用瀏覽器朗讀,唸完才通知', () => {
    const onEnd = vi.fn();
    tts.speak(PASSAGE, { onEnd });
    FakeAudio.made[0]!.onerror!();
    expect(synth.texts()).toEqual(['We went to the night market.', 'It was fun.']);
    expect(onEnd).not.toHaveBeenCalled();
    synth.finish();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('瀏覽器拒絕播放時也改用瀏覽器朗讀', async () => {
    FakeAudio.rejectPlay = true;
    tts.speak(PASSAGE);
    await vi.advanceTimersByTimeAsync(0);
    expect(synth.texts()).toEqual(['We went to the night market.', 'It was fun.']);
  });

  it('停止朗讀會停掉音檔,並通知不再播了', () => {
    const onEnd = vi.fn();
    tts.speak(PASSAGE, { onEnd });
    tts.stopSpeaking();
    expect(FakeAudio.made[0]!.paused).toBe(true);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('按另一段的播放,正在播的音檔會停下來並通知;不會兩段同時出聲', () => {
    const onEnd = vi.fn();
    tts.speak(PASSAGE, { onEnd });
    tts.speak('Hello.');
    expect(FakeAudio.made[0]!.paused).toBe(true);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(synth.texts()).toEqual(['Hello.']);
  });

  it('老師的台詞還在唸的時候學生按下播放:台詞停下來,只聽得到音檔', () => {
    teacherSays(LINE);
    tts.speak(PASSAGE);
    expect(synth.texts()).toEqual([]);
    expect(FakeAudio.made[0]!.paused).toBe(false);
  });

  it('離開課堂後清掉音檔的對照表,同樣的文字回到瀏覽器朗讀', () => {
    tts.setRecordings({});
    tts.speak(PASSAGE);
    expect(FakeAudio.made).toEqual([]);
  });
});

// 按下「播放課文」的同一瞬間,畫面會出現老師的下一句話(「現在回答幾個問題」)。
// 這句話自動朗讀時如果先停掉正在唸的內容,學生第一次按播放就聽不到課文。
describe('學生按下播放的內容不被老師的台詞打斷', () => {
  it('音檔還在播:老師的台詞不出聲,音檔繼續播', () => {
    tts.setRecordings({ [PASSAGE]: '/api/audio/abc' });
    const onEnd = vi.fn();
    tts.speak(PASSAGE, { onEnd });
    teacherSays(LINE);
    expect(FakeAudio.made[0]!.paused).toBe(false);
    expect(synth.texts()).toEqual([]);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('瀏覽器還在朗讀學生要聽的內容:老師的台詞不出聲,朗讀繼續', () => {
    tts.speak(PASSAGE);
    teacherSays(LINE);
    expect(synth.texts()).toEqual(['We went to the night market.', 'It was fun.']);
  });

  it('播完之後,老師的台詞照常自動朗讀', () => {
    tts.setRecordings({ [PASSAGE]: '/api/audio/abc' });
    tts.speak(PASSAGE);
    FakeAudio.made[0]!.onended!();
    teacherSays(LINE);
    expect(synth.texts()).toEqual([LINE]);
  });

  it('學生按了停止之後,老師的台詞照常自動朗讀', () => {
    tts.speak(PASSAGE);
    tts.stopSpeaking();
    teacherSays(LINE);
    expect(synth.texts()).toEqual([LINE]);
  });

  // 老師的台詞彼此之間維持原本的行為:學生已經往下做了,就唸最新的那一句。
  it('老師的新台詞會取代還在唸的上一句台詞', () => {
    teacherSays('第一句。');
    teacherSays('第二句。');
    expect(synth.texts()).toEqual(['第二句。']);
  });

  it('學生要聽的內容唸完很久以後,老師的台詞之間仍然是新的取代舊的', () => {
    tts.speak('Hello.');
    synth.finish();
    teacherSays('第一句。');
    teacherSays('第二句。');
    expect(synth.texts()).toEqual(['第二句。']);
  });
});
