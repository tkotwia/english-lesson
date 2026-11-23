import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listen, SILENCE_LIMIT_MS, type Recognition } from './stt.ts';

/** 假的瀏覽器語音辨識:由測試決定它什麼時候聽到字、什麼時候自己結束。 */
class FakeRecognition implements Recognition {
  static created: FakeRecognition[] = [];
  lang = '';
  interimResults = false;
  continuous = false;
  maxAlternatives = 0;
  onresult: Recognition['onresult'] = null;
  onerror: Recognition['onerror'] = null;
  onend: Recognition['onend'] = null;
  started = false;

  constructor() {
    FakeRecognition.created.push(this);
  }
  start() {
    this.started = true;
  }
  /** 和 Chrome 一樣:被要求停止後會結束這一段辨識。 */
  stop() {
    this.onend?.();
  }
  abort() {}

  /** 瀏覽器回報這一段辨識目前的全部結果;final 表示那幾個字已經確定。 */
  hear(...results: { text: string; final: boolean }[]) {
    this.onresult?.({ resultIndex: 0, results: results.map(({ text, final }) => ({ isFinal: final, 0: { transcript: text } })) });
  }
  /** 瀏覽器自己結束這一段辨識(學生停頓太久,或到了單次辨識的時間上限)。 */
  endByItself() {
    this.onend?.();
  }
  fail(code: string) {
    this.onerror?.({ error: code });
    this.onend?.();
  }
}

const said = (text: string) => ({ text, final: true });
const guessing = (text: string) => ({ text, final: false });
const latest = () => FakeRecognition.created.at(-1)!;

function start() {
  const handlers = { onText: vi.fn(), onEnd: vi.fn(), onError: vi.fn() };
  const listening = listen(handlers, FakeRecognition);
  return { ...handlers, listening };
}

beforeEach(() => {
  FakeRecognition.created = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// 跟讀只有兩次機會。唸到一半停下來想,如果就被當成唸完,半個句子會用掉一次機會。
describe('學生停頓時不能結束錄音', () => {
  it('使用連續辨識,停頓時瀏覽器不會自己結束', () => {
    start();
    expect(latest()).toMatchObject({ continuous: true, interimResults: true, lang: 'en-US', started: true });
  });

  it('瀏覽器仍然自己結束時,不算說完:接著再聽,前面聽到的留著', () => {
    const { onText, onEnd, listening } = start();
    latest().hear(said('I went to the park'));
    latest().endByItself();

    expect(onEnd).not.toHaveBeenCalled();
    expect(FakeRecognition.created).toHaveLength(2);
    expect(latest().started).toBe(true);

    latest().hear(said('and played with my dog'));
    expect(onText).toHaveBeenLastCalledWith('I went to the park and played with my dog');
    listening.stop();
    expect(onEnd).toHaveBeenCalledExactlyOnceWith('I went to the park and played with my dog');
  });

  // Chrome 在一開始幾秒沒聲音時會回報 no-speech。學生可能只是還在想第一個字。
  it('一陣子沒有聲音不是錯誤,繼續聽', () => {
    const { onError, onEnd, listening } = start();
    latest().fail('no-speech');
    expect(onError).not.toHaveBeenCalled();
    expect(FakeRecognition.created).toHaveLength(2);

    latest().hear(said('hello'));
    listening.stop();
    expect(onEnd).toHaveBeenCalledExactlyOnceWith('hello');
  });
});

describe('學生按下「說完了」', () => {
  it('交出目前聽到的全部內容', () => {
    const { onEnd, listening } = start();
    latest().hear(said('They bought fried chicken'), said('and shared it'));
    listening.stop();
    expect(onEnd).toHaveBeenCalledExactlyOnceWith('They bought fried chicken and shared it');
  });

  // 按得快的時候,最後幾個字瀏覽器還來不及確定。丟掉的話句尾會少字,正確率被拉低。
  it('還沒確定的字也算進去', () => {
    const { onEnd, listening } = start();
    latest().hear(said('They bought'), guessing('fried chicken'));
    listening.stop();
    expect(onEnd).toHaveBeenCalledExactlyOnceWith('They bought fried chicken');
  });

  // 瀏覽器每次回報的是這一段的全部結果;同一句話不能因為回報了兩次就重複。
  it('同一個結果回報多次,文字不會重複', () => {
    const { onEnd, listening } = start();
    latest().hear(guessing('They'));
    latest().hear(guessing('They bought'));
    latest().hear(said('They bought fried chicken'));
    listening.stop();
    expect(onEnd).toHaveBeenCalledExactlyOnceWith('They bought fried chicken');
  });

  it('沒聽到任何內容時交出空字串,由畫面請學生再試一次', () => {
    const { onEnd, listening } = start();
    listening.stop();
    expect(onEnd).toHaveBeenCalledExactlyOnceWith('');
  });

  // 一次作答只能送出一次,否則會用掉兩次機會。
  it('結束之後再按一次,或瀏覽器又送來事件,都不會再交一次', () => {
    const { onEnd, listening } = start();
    const recognition = latest();
    recognition.hear(said('hello'));
    listening.stop();
    listening.stop();
    recognition.hear(said('hello again'));
    recognition.endByItself();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(FakeRecognition.created).toHaveLength(1);
  });
});

describe('真正的錯誤', () => {
  it('麥克風不能用:回報一次錯誤,不再重新開始', () => {
    const { onError, onEnd } = start();
    latest().fail('not-allowed');
    expect(onError).toHaveBeenCalledExactlyOnceWith('not-allowed');
    expect(onEnd).not.toHaveBeenCalled();
    expect(FakeRecognition.created).toHaveLength(1);
  });

  it('瀏覽器不支援語音辨識:回報無法使用', () => {
    const onError = vi.fn();
    listen({ onText: vi.fn(), onEnd: vi.fn(), onError }, undefined);
    expect(onError).toHaveBeenCalledExactlyOnceWith('service-not-allowed');
  });
});

// 錄音不再自己結束之後,學生忘了按「說完了」的話,麥克風會一直開著。
describe('太久沒有聽到新的內容', () => {
  it('自動收尾並交出已經聽到的內容', () => {
    const { onEnd } = start();
    latest().hear(said('hello'));
    vi.advanceTimersByTime(SILENCE_LIMIT_MS - 1);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onEnd).toHaveBeenCalledExactlyOnceWith('hello');
  });

  it('只要還有聽到新的內容,就重新計時', () => {
    const { onEnd } = start();
    vi.advanceTimersByTime(SILENCE_LIMIT_MS - 1000);
    latest().hear(guessing('hello'));
    vi.advanceTimersByTime(SILENCE_LIMIT_MS - 1000);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('學生已經按了「說完了」之後,不會再觸發一次', () => {
    const { onEnd, listening } = start();
    latest().hear(said('hello'));
    listening.stop();
    vi.advanceTimersByTime(SILENCE_LIMIT_MS * 2);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
