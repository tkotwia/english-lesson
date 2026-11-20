import type { Level } from '../../../shared/schema.ts';

// 語音朗讀:使用瀏覽器內建的 Web Speech API,不耗 AI 額度。

export const ttsSupported = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

let voices: SpeechSynthesisVoice[] = [];
if (ttsSupported()) {
  const load = () => {
    voices = window.speechSynthesis.getVoices();
  };
  load();
  window.speechSynthesis.addEventListener('voiceschanged', load);
}

type Lang = 'en-US' | 'zh-TW';

const hasChinese = (text: string) => /[㐀-鿿]/.test(text);
const langOf = (voice: SpeechSynthesisVoice) => voice.lang.replace('_', '-').toLowerCase();

function pickVoice(lang: Lang): SpeechSynthesisVoice | null {
  const exact = voices.filter((voice) => langOf(voice) === lang.toLowerCase());
  const sameLanguage = voices.filter((voice) => langOf(voice).startsWith(lang.slice(0, 2)));
  if (lang === 'en-US') {
    return exact.find((voice) => voice.name === 'Google US English') ?? exact[0] ?? sameLanguage[0] ?? null;
  }
  return exact[0] ?? sameLanguage[0] ?? null;
}

/** 依等級放慢語速:初學者聽慢一點。 */
export function speechRate(level: Level): number {
  return level === 'A1' ? 0.8 : level === 'A2' ? 0.85 : level === 'B1' ? 0.92 : 1;
}

/** 把長文切成句子。有些語音一次唸太長會被瀏覽器中途切斷,逐句排隊唸比較穩定。 */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。!?])\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

export interface SpeakOptions {
  rate?: number;
  onEnd?: () => void;
}

/** 朗讀一段文字。含中文的句子用中文語音,其餘用英文語音。會先停掉正在唸的內容。 */
export function speak(text: string, { rate = 1, onEnd }: SpeakOptions = {}): void {
  if (!ttsSupported()) {
    onEnd?.();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const parts = sentences(text);
  if (parts.length === 0) {
    onEnd?.();
    return;
  }
  parts.forEach((part, index) => {
    const utterance = new SpeechSynthesisUtterance(part);
    const lang: Lang = hasChinese(part) ? 'zh-TW' : 'en-US';
    utterance.lang = lang;
    utterance.voice = pickVoice(lang);
    utterance.rate = rate;
    if (index === parts.length - 1) {
      utterance.onend = () => onEnd?.();
      utterance.onerror = () => onEnd?.();
    }
    synth.speak(utterance);
  });
}

export function stopSpeaking(): void {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

// ---- 自動朗讀老師的話 ----

const AUTO_SPEAK_KEY = 'autoSpeak';

export function autoSpeakEnabled(): boolean {
  return localStorage.getItem(AUTO_SPEAK_KEY) !== 'off';
}

export function setAutoSpeak(enabled: boolean): void {
  localStorage.setItem(AUTO_SPEAK_KEY, enabled ? 'on' : 'off');
  if (!enabled) stopSpeaking();
}

let batch: { text: string; rate: number }[] = [];
let batchTimer: number | undefined;

/**
 * 新出現的老師對話泡泡會呼叫這裡。同一瞬間出現很多個泡泡時(剛進入一個階段、或重新整理頁面),
 * 只唸最後一個,避免把整頁舊的對話從頭唸一遍。
 */
export function requestAutoSpeak(text: string, rate: number): void {
  if (!ttsSupported() || !autoSpeakEnabled()) return;
  batch.push({ text, rate });
  window.clearTimeout(batchTimer);
  batchTimer = window.setTimeout(() => {
    const last = batch.at(-1);
    batch = [];
    if (last) speak(last.text, { rate: last.rate });
  }, 50);
}
