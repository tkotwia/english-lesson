import { createContext, useContext, useMemo, useState } from 'react';
import { sttSupported } from './stt.ts';
import { ttsSupported } from './tts.ts';

/** 目前可以使用的語音功能。 */
export interface SpeechAbility {
  /** 能不能朗讀(聽力、聽寫需要)。 */
  tts: boolean;
  /** 能不能語音辨識(跟讀需要)。 */
  stt: boolean;
  /** 麥克風被拒絕或不存在時呼叫,之後改用不需要麥克風的方式。 */
  disableStt: () => void;
}

const SpeechContext = createContext<SpeechAbility>({ tts: false, stt: false, disableStt: () => {} });

export const SpeechProvider = SpeechContext.Provider;
export const useSpeech = (): SpeechAbility => useContext(SpeechContext);

/** 以瀏覽器實際支援的功能為準;麥克風確定不能用之後把 stt 關掉。 */
export function useDetectedSpeech(): SpeechAbility {
  const [micBlocked, setMicBlocked] = useState(false);
  return useMemo(() => ({ tts: ttsSupported(), stt: sttSupported() && !micBlocked, disableStt: () => setMicBlocked(true) }), [micBlocked]);
}
