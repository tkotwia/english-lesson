// 語音辨識:使用 Chrome 內建的 Web Speech API,不耗 AI 額度。
// 注意:這個功能會盡量「猜出」你說的字,所以只能粗略反映發音是否能被聽懂,不是精確的發音評分。

interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

export interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

export const sttSupported = (): boolean => Boolean(recognitionConstructor());

/** 代表「麥克風不能用」的錯誤:使用者拒絕權限,或這台電腦沒有麥克風。之後就不必再試了。 */
export const isMicUnavailable = (code: string): boolean => code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture';

export function sttErrorMessage(code: string): string {
  if (isMicUnavailable(code)) return '無法使用麥克風。請確認瀏覽器有麥克風權限,或改用打字。';
  if (code === 'no-speech') return '沒有聽到聲音,請再試一次。';
  if (code === 'network') return '語音辨識需要網路連線,請確認網路後再試一次。';
  return `語音辨識發生問題(${code}),請再試一次。`;
}

export interface ListenHandlers {
  /** 辨識過程中不斷更新的文字,用來即時顯示。 */
  onText: (text: string) => void;
  /** 學生按下「說完了」(或太久沒有聲音)之後的最終文字;沒聽到任何內容時是空字串。 */
  onEnd: (finalText: string) => void;
  onError: (code: string) => void;
}

export interface Listening {
  stop: () => void;
}

/** 這麼久都沒有聽到新的內容,就當作學生忘了按結束,自動收尾並放開麥克風。 */
export const SILENCE_LIMIT_MS = 30_000;

/**
 * 開始聽學生說英文,一直聽到呼叫 stop() 為止。
 *
 * 學生中途停頓不算說完:唸一個長句子時常常會停下來想,這時如果就結束,
 * 只唸到一半的句子會被當成一次作答(跟讀只有兩次機會)。所以:
 * - 用連續辨識,停頓時不結束;
 * - 瀏覽器仍然自己結束時(安靜了一陣子、單次辨識的時間上限),把已經聽到的留著,接著再聽。
 */
export function listen(handlers: ListenHandlers, Constructor: RecognitionConstructor | undefined = recognitionConstructor()): Listening {
  if (!Constructor) {
    handlers.onError('service-not-allowed');
    return { stop: () => {} };
  }

  /** 前幾段辨識(已經結束)聽到的文字。 */
  let earlier = '';
  /** 目前這一段辨識聽到的文字:已經確定的,以及還在猜的。 */
  let confirmed = '';
  let tentative = '';
  let stopping = false;
  let finished = false;
  let recognition: Recognition | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;

  const heard = () => `${earlier} ${confirmed} ${tentative}`.replace(/\s+/g, ' ').trim();

  function close(report: () => void) {
    if (finished) return;
    finished = true;
    clearTimeout(silenceTimer);
    report();
  }

  function stop() {
    if (finished || stopping) return;
    stopping = true;
    recognition?.stop();
  }

  function watchSilence() {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(stop, SILENCE_LIMIT_MS);
  }

  function begin() {
    const current = new Constructor!();
    recognition = current;
    current.lang = 'en-US';
    current.interimResults = true;
    current.continuous = true;
    current.maxAlternatives = 1;

    current.onresult = (event) => {
      if (finished) return;
      // 每次都從這一段的全部結果重新整理,不依賴事件只回報一次。
      confirmed = '';
      tentative = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]!;
        if (result.isFinal) confirmed += `${result[0].transcript} `;
        else tentative += result[0].transcript;
      }
      handlers.onText(heard());
      watchSilence();
    };
    current.onerror = (event) => {
      // 一陣子沒聲音不是錯誤:學生可能還在想。接下來的 onend 會接著再聽。
      if (event.error === 'no-speech') return;
      close(() => handlers.onError(event.error));
    };
    current.onend = () => {
      if (finished || recognition !== current) return;
      if (stopping) {
        close(() => handlers.onEnd(heard()));
        return;
      }
      // 瀏覽器自己結束了,但學生還沒說完:留著已經聽到的,再開一段接著聽。
      earlier = heard();
      confirmed = '';
      tentative = '';
      begin();
    };

    try {
      current.start();
    } catch {
      close(() => handlers.onError('aborted'));
    }
  }

  watchSilence();
  begin();
  return { stop };
}
