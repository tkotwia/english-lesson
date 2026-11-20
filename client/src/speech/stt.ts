// 語音辨識:使用 Chrome 內建的 Web Speech API,不耗 AI 額度。
// 注意:這個功能會盡量「猜出」你說的字,所以只能粗略反映發音是否能被聽懂,不是精確的發音評分。

interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

interface Recognition {
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

type RecognitionConstructor = new () => Recognition;

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
  /** 說完一句話(或手動停止)後的最終文字;沒聽到任何內容時是空字串。 */
  onEnd: (finalText: string) => void;
  onError: (code: string) => void;
}

export interface Listening {
  stop: () => void;
}

/** 開始聽一句英文。學生停頓後會自動結束,也可以呼叫 stop() 提早結束。 */
export function listen(handlers: ListenHandlers): Listening {
  const Constructor = recognitionConstructor();
  if (!Constructor) {
    handlers.onError('service-not-allowed');
    return { stop: () => {} };
  }
  const recognition = new Constructor();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  let finalText = '';
  let failed = false;
  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]!;
      if (result.isFinal) finalText += `${result[0].transcript} `;
      else interim += result[0].transcript;
    }
    handlers.onText(`${finalText}${interim}`.trim());
  };
  recognition.onerror = (event) => {
    failed = true;
    handlers.onError(event.error);
  };
  recognition.onend = () => {
    if (!failed) handlers.onEnd(finalText.trim());
  };

  try {
    recognition.start();
  } catch {
    handlers.onError('aborted');
  }
  return { stop: () => recognition.stop() };
}
