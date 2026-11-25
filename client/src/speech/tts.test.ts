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

// 長文會切成一句一句排隊唸(一次唸太長會被瀏覽器中途切斷)。切的位置不對,語音就會唸錯:
// 「Dr. Evans」如果在句點切開,落單的「Dr.」會被唸成 drive。
describe('把文字切成句子來唸', () => {
  const spoken = (text: string) => {
    tts.speak(text);
    return synth.texts();
  };

  it('一般的句子一句一段', () => {
    expect(spoken('We went home. It was late! Did you eat?')).toEqual(['We went home.', 'It was late!', 'Did you eat?']);
  });

  it('稱謂的縮寫不是句子結尾:Dr. Evans 留在同一句裡', () => {
    expect(spoken('Dr. Evans is my teacher. She is kind.')).toEqual(['Dr. Evans is my teacher.', 'She is kind.']);
    expect(spoken('I met Mr. Lin and Mrs. Chen at St. John Road.')).toEqual(['I met Mr. Lin and Mrs. Chen at St. John Road.']);
  });

  it('句子中間的縮寫也一樣:Prof. Wang、J. K. Rowling', () => {
    expect(spoken('Yesterday Prof. Wang read a book by J. K. Rowling.')).toEqual(['Yesterday Prof. Wang read a book by J. K. Rowling.']);
  });

  // 3.5 切成「3.」和「5」的話,會唸成 three、five,而不是 three point five。
  it('數字裡的小數點、a.m. 這類中間有點的字不會被切開', () => {
    expect(spoken('It costs 3.5 dollars. The shop opens at 9 a.m. on Monday.')).toEqual(['It costs 3.5 dollars.', 'The shop opens at 9 a.m. on Monday.']);
  });

  it('引號裡的句子結束後才切', () => {
    expect(spoken('She said, "Stop!" Then she left.')).toEqual(['She said, "Stop!"', 'Then she left.']);
  });

  // 這個程式的中文台詞用半形的 ! 和 ?,後面沒有空白就接下一句。
  it('中文的句子在句號、問號、驚嘆號後面切,後面不必有空白', () => {
    expect(spoken('\u73FE\u5728\u56DE\u7B54\u554F\u984C\u3002\u5F88\u597D!\u6E96\u5099\u597D\u4E86\u55CE?\u958B\u59CB\u5427')).toEqual([
      '\u73FE\u5728\u56DE\u7B54\u554F\u984C\u3002',
      '\u5F88\u597D!',
      '\u6E96\u5099\u597D\u4E86\u55CE?',
      '\u958B\u59CB\u5427',
    ]);
  });

  it('全形的問號與驚嘆號也一樣;引號裡的句子結束後才切', () => {
    expect(spoken('\u5F88\u597D\uFF01\u6E96\u5099\u597D\u4E86\u55CE\uFF1F\u958B\u59CB')).toEqual(['\u5F88\u597D\uFF01', '\u6E96\u5099\u597D\u4E86\u55CE\uFF1F', '\u958B\u59CB']);
    expect(spoken('\u4ED6\u8AAA\u300C\u597D\u3002\u300D\u7136\u5F8C\u8D70\u4E86\u3002')).toEqual(['\u4ED6\u8AAA\u300C\u597D\u3002\u300D', '\u7136\u5F8C\u8D70\u4E86\u3002']);
  });

  // 每一段依內容選中文或英文的語音。中文和英文黏在同一段的話,英文會被中文語音唸。
  it('中文句子後面沒有空白就接英文:切開,讓英文用英文語音唸', () => {
    expect(spoken('\u6E96\u5099\u597D\u4E86\u55CE?Let\u2019s go!')).toEqual(['\u6E96\u5099\u597D\u4E86\u55CE?', 'Let\u2019s go!']);
  });

  it('中英夾雜的台詞:英文句子結束後接中文,照樣切開', () => {
    expect(spoken('Good job! \u7B54\u5C0D\u4E86\u3002Next one.')).toEqual(['Good job!', '\u7B54\u5C0D\u4E86\u3002', 'Next one.']);
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
