import type { Level } from '../../../shared/schema.ts';

// 語音朗讀:使用瀏覽器內建的 Web Speech API,不耗 AI 額度。
// 例外:聽力課文與聽寫句子如果伺服器已經用自然的聲音唸好(setRecordings),就播那個音檔。

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

// 句點後面不是句子結尾的常見縮寫。
const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'mt', 'vs', 'no', 'etc', 'e.g', 'i.e']);

/**
 * 前一段結尾的句點其實不是句子的結束:它跟在縮寫(Dr.)或單一字母(J. K.)後面,或下一段以小寫字母開頭(9 a.m. on Monday)。
 * 這種地方切開的話,語音會把落單的縮寫唸錯,例如「Dr. Evans」的「Dr.」單獨唸會變成 drive。
 */
function continuesSentence(previous: string, next: string): boolean {
  if (!previous.endsWith('.')) return false;
  if (/^[a-z]/.test(next)) return true;
  const lastWord = previous.slice(0, -1).split(/\s+/).at(-1)!.replace(/^[("'“‘]+/, '').toLowerCase();
  return ABBREVIATIONS.has(lastWord) || /^[a-z]$/.test(lastWord);
}

/**
 * 把長文切成句子。有些語音一次唸太長會被瀏覽器中途切斷,逐句排隊唸比較穩定。
 * 拿不準的地方寧可不切:兩句連著唸沒有壞處,切錯了會唸錯。句子在這三種地方結束:
 * 1. 句號、問號、驚嘆號(後面可以跟著引號或括號)之後有空白。英文一定要有空白才算,所以 3.5、a.m. 中間的點不算。
 * 2. 問號或驚嘆號後面直接接中文字,或中文字後面的問號、驚嘆號直接接英文。這個程式的中文台詞用的是半形的 ! 和 ?,
 *    而且後面沒有空白(「很好!接下來…」「準備好了嗎?Let’s go!」)。中英文要分開,才能各自用對的語音唸。
 * 3. 中文的句號,或全形的問號、驚嘆號,後面直接接下一句。
 */
function sentences(text: string): string[] {
  const pieces = text
    .split(/(?<=[.!?\u3002\uFF01\uFF1F]["'\u201D\u2019)\]\u300D\u300F]*)\s+|(?<=[!?]["'\u201D\u2019)\]\u300D\u300F]*)(?=[\u3400-\u9FFF])|(?<=[\u3400-\u9FFF][!?])(?=[A-Za-z])|(?<=[\u3002\uFF01\uFF1F][\u201D\u2019)\u300D\u300F]*)(?=[^\s\u201D\u2019)\u300D\u300F])/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const joined: string[] = [];
  for (const piece of pieces) {
    const previous = joined.at(-1);
    if (previous !== undefined && continuesSentence(previous, piece)) joined[joined.length - 1] = `${previous} ${piece}`;
    else joined.push(piece);
  }
  return joined;
}

export interface SpeakOptions {
  rate?: number;
  onEnd?: () => void;
}

// 已經唸好的音檔:文字 → 網址。由上課的頁面向伺服器問來。
let recordings: Record<string, string> = {};
/** 正在播放的音檔,以及它結束(播完或被停掉)時要通知誰。 */
let playing: { audio: HTMLAudioElement; onEnd?: () => void } | null = null;

/** 設定目前有哪些文字已經有唸好的音檔;之後 speak 遇到一模一樣的文字就播音檔。 */
export function setRecordings(clips: Record<string, string>): void {
  recordings = clips;
}

/** 放掉正在播放的音檔(不通知任何人),回傳它結束時原本要通知的對象。 */
function releaseRecording(): (() => void) | undefined {
  if (!playing) return undefined;
  const { audio, onEnd } = playing;
  playing = null;
  audio.onended = null;
  audio.onerror = null;
  audio.pause();
  return onEnd;
}

/** 停掉正在播放的音檔。和瀏覽器朗讀被取消時一樣會通知「不再唸了」,畫面才不會一直停在播放中。 */
function stopRecording(): void {
  releaseRecording()?.();
}

/** 播放唸好的音檔。播不出來(檔案已經被清掉、連不上)就改用瀏覽器朗讀,學生不會因此聽不到。 */
function playRecording(url: string, onEnd: (() => void) | undefined, fallback: () => void): void {
  const audio = new Audio(url);
  const current = { audio, onEnd };
  playing = current;
  const failed = () => {
    if (playing !== current) return;
    releaseRecording();
    fallback();
  };
  audio.onended = () => {
    if (playing !== current) return;
    releaseRecording()?.();
  };
  audio.onerror = failed;
  audio.play().catch(failed);
}

// 學生自己按下播放的內容(課文、聽寫句子、單字…)。它還在唸的時候,老師的台詞不可以自動朗讀把它打斷。
let requested = false;
const requestedStillPlaying = (): boolean =>
  requested && (playing !== null || (ttsSupported() && (window.speechSynthesis.speaking || window.speechSynthesis.pending)));

/**
 * 朗讀一段文字(學生按下播放,或程式要學生聽的內容)。含中文的句子用中文語音,其餘用英文語音。會先停掉正在唸的內容。
 * 有唸好的音檔時播音檔(語速在製作時已經依等級決定,rate 不適用)。
 */
export function speak(text: string, options: SpeakOptions = {}): void {
  requested = true;
  start(text, options);
}

function start(text: string, options: SpeakOptions): void {
  stopRecording();
  const url = recordings[text];
  if (url) {
    if (ttsSupported()) window.speechSynthesis.cancel();
    playRecording(url, options.onEnd, () => synthesize(text, options));
    return;
  }
  synthesize(text, options);
}

function synthesize(text: string, { rate = 1, onEnd }: SpeakOptions): void {
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
  stopRecording();
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
    // 學生自己按下播放的內容還在唸(例如按下「播放課文」的同時,畫面出現老師的下一句話):這句不出聲。
    // 老師的話在畫面上看得到,旁邊也有重聽的按鈕;課文被打斷的話,學生就聽不到了。
    if (!last || requestedStillPlaying()) return;
    requested = false;
    start(last.text, { rate: last.rate });
  }, 50);
}
