import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LIVE_SILENCE_MS, type LiveEvent, type LiveSessionInfo } from '../../../shared/api.ts';
import { api, errorDetail, errorMessage, liveAudio, liveEvents } from '../api.ts';
import { createPcmPlayer, startMicStream, type MicStream, type PcmPlayer } from '../speech/liveAudio.ts';
import { stopSpeaking } from '../speech/tts.ts';
import { TeacherBubble } from './TeacherBubble.tsx';

/** 一來一往:學生說的話,和老師的回應。開場那一次只有老師。 */
interface Exchange {
  /** 學生這段話的文字稿;null 表示這一次沒有學生的話(老師開場)。 */
  student: string | null;
  teacher: string;
  /** 老師說完了這一輪。之後收到的內容屬於下一次來回。 */
  complete: boolean;
}

export interface TalkLine {
  role: 'teacher' | 'student';
  text: string;
}

interface Props {
  /** 向伺服器要一場新的對話。 */
  start: () => Promise<LiveSessionInfo>;
  /** 這場對話開始之前就已經說過的話(例如中斷後接著進行),顯示在最上面。 */
  history?: TalkLine[];
  /** 連上了,開始收音。 */
  onStarted?: () => void;
  /** 老師說完一輪。 */
  onTurn?: () => void;
  /** 對話結束:輪數用完、時間到(等老師最後一句播完才通知),或學生按了「結束對話」。 */
  onEnded?: () => void;
  /** 對話進行不下去:連不上、麥克風不能用、被額度擋下。 */
  onFailed?: (message: string, detail?: string) => void;
  startLabel?: string;
  /** 開始之前顯示在按鈕旁邊的其他選項(例如「改用打字對話」)。 */
  extra?: ReactNode;
}

type Phase = 'idle' | 'connecting' | 'listening' | 'ended';

/** 老師的聲音播完之後,再多等這麼久才恢復收音:喇叭的尾音不要被麥克風錄進去。 */
const AFTER_TEACHER_MS = 250;
const HEADPHONES_KEY = 'live.headphones';

/** 這個瀏覽器能不能做即時語音對話(需要麥克風與即時處理聲音的功能)。 */
export const liveTalkSupported = (): boolean =>
  typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof AudioWorkletNode !== 'undefined';

/**
 * 即時語音對話:學生直接說,不用按任何按鈕;停下來一會兒老師就用聲音回答。
 * 麥克風的聲音持續送到本機伺服器,再由伺服器轉給模型;API key 不會到瀏覽器。
 */
export function LiveTalk({ start, history = [], onStarted, onTurn, onEnded, onFailed, startLabel = '開始對話', extra }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [info, setInfo] = useState<LiveSessionInfo | null>(null);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [turnsLeft, setTurnsLeft] = useState(0);
  const [headphones, setHeadphones] = useState(() => localStorage.getItem(HEADPHONES_KEY) === '1');
  const [teacherSpeaking, setTeacherSpeaking] = useState(false);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const player = useRef<PcmPlayer | null>(null);
  const mic = useRef<MicStream | null>(null);
  const events = useRef<AbortController | null>(null);
  const sessionId = useRef<string | null>(null);
  const outputRate = useRef(24_000);
  /** 老師的聲音預計播到什麼時候(performance.now() 的時間)。在那之前不收音,除非戴了耳機。 */
  const teacherUntil = useRef(0);
  const headphonesRef = useRef(headphones);
  headphonesRef.current = headphones;
  /** 這場對話開始時已經有的紀錄。對話進行中外層的紀錄會跟著更新;畫面上只顯示開始時的那一份,新的內容由這場對話自己顯示,才不會重複。 */
  const shownHistory = useRef(history);
  const endRef = useRef<HTMLDivElement>(null);

  /** 放開麥克風與喇叭,並結束伺服器上的對話。 */
  function release() {
    mic.current?.stop();
    mic.current = null;
    events.current?.abort();
    events.current = null;
    player.current?.close();
    player.current = null;
    if (sessionId.current) void api.endLive(sessionId.current).catch(() => {});
    sessionId.current = null;
  }
  useEffect(() => release, []);
  useEffect(() => {
    // 寫成區塊而不是直接回傳:新版 Chrome 的 scrollIntoView 會回傳 Promise,而 effect 只能回傳清除用的函式。
    if (phase === 'listening') endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [exchanges, phase]);

  /**
   * 等老師把最後一句說完再收尾,並通知外層對話結束了(太早通知的話,外層換畫面會把老師的話切斷)。
   * 只收「排定時的那一場」:學生如果在這之前就又開始了一場,不能把新的那一場也關掉。
   */
  function finishAfterPlayback(id: string) {
    window.setTimeout(() => {
      if (sessionId.current !== id) return;
      release();
      onEnded?.();
    }, (player.current?.remaining() ?? 0) * 1000 + 300);
  }

  function fail(err: unknown) {
    release();
    const failure = { message: errorMessage(err), detail: errorDetail(err) };
    setError(failure);
    setPhase('idle');
    onFailed?.(failure.message, failure.detail);
  }

  function onEvent(event: LiveEvent) {
    if (event.type === 'heard' || event.type === 'said') {
      setExchanges((current) => {
        // 上一次來回已經結束:這是新的一次。文字稿和聲音的先後不一定,所以學生與老師的話各自累加。
        const open = current.length > 0 && !current.at(-1)!.complete;
        const list = open ? current : [...current, { student: '', teacher: '', complete: false }];
        return list.map((exchange, index) => {
          if (index !== list.length - 1) return exchange;
          return event.type === 'heard' ? { ...exchange, student: (exchange.student ?? '') + event.text } : { ...exchange, teacher: exchange.teacher + event.text };
        });
      });
    } else if (event.type === 'audio') {
      const output = player.current;
      if (!output) return;
      output.play(event.data, outputRate.current);
      teacherUntil.current = performance.now() + output.remaining() * 1000 + AFTER_TEACHER_MS;
    } else if (event.type === 'interrupted') {
      player.current?.stop();
      teacherUntil.current = 0;
    } else if (event.type === 'done') {
      setTurnsLeft(event.turnsLeft);
      setExchanges((current) => current.map((exchange, index) => (index === current.length - 1 ? { ...exchange, complete: true } : exchange)));
      onTurn?.();
    } else if (event.type === 'ended') {
      mic.current?.stop();
      mic.current = null;
      setPhase('ended');
      if (sessionId.current) finishAfterPlayback(sessionId.current);
      else onEnded?.();
    } else if (event.type === 'error') fail(new Error(event.message));
  }

  /** 把麥克風的聲音依序送出去:上一段送完才送下一段,期間累積的併成一段,順序才不會亂。 */
  function uploader(id: string) {
    let queued: Int16Array[] = [];
    let sending = false;
    const flush = async () => {
      sending = true;
      while (queued.length > 0 && sessionId.current === id) {
        const parts = queued;
        queued = [];
        const merged = new Int16Array(parts.reduce((total, part) => total + part.length, 0));
        let offset = 0;
        for (const part of parts) {
          merged.set(part, offset);
          offset += part.length;
        }
        try {
          await liveAudio(id, merged);
        } catch {
          // 對話已經結束(輪數用完或被關掉)時會失敗;結束的原因由串流那一邊顯示。
          break;
        }
      }
      sending = false;
    };
    return (chunk: Int16Array) => {
      // 老師說話時先不收音,否則喇叭的聲音會被麥克風錄回去,老師會聽到自己。戴耳機就沒有這個問題,可以直接打斷老師。
      if (!headphonesRef.current && performance.now() < teacherUntil.current) return;
      queued.push(chunk);
      if (!sending) void flush();
    };
  }

  // 畫面要顯示現在是老師在說還是在聽學生。
  useEffect(() => {
    if (phase !== 'listening') return;
    const timer = window.setInterval(() => setTeacherSpeaking(performance.now() < teacherUntil.current), 150);
    return () => window.clearInterval(timer);
  }, [phase]);

  async function begin() {
    setError(null);
    setExchanges([]);
    shownHistory.current = history;
    setPhase('connecting');
    stopSpeaking();
    try {
      // 喇叭要在按下按鈕的當下建立,瀏覽器才允許之後自動出聲。
      player.current = createPcmPlayer();
      const started = await start();
      sessionId.current = started.id;
      outputRate.current = started.outputRate;
      setInfo(started);
      setTurnsLeft(started.turns);
      // 先取得麥克風,再接上串流:伺服器在串流接上之後才請老師開場。
      mic.current = await startMicStream(started.inputRate, uploader(started.id)).catch(() => {
        throw new Error('無法使用麥克風。請確認瀏覽器有麥克風權限。');
      });
      setExchanges([{ student: null, teacher: '', complete: false }]);
      setPhase('listening');
      onStarted?.();
      const controller = new AbortController();
      events.current = controller;
      await liveEvents(started.id, onEvent, controller.signal).catch((err: unknown) => {
        if (!controller.signal.aborted) throw err;
      });
    } catch (err) {
      fail(err);
    }
  }

  function stopNow() {
    release();
    setPhase('ended');
    onEnded?.();
  }

  function chooseHeadphones(value: boolean) {
    setHeadphones(value);
    localStorage.setItem(HEADPHONES_KEY, value ? '1' : '0');
  }

  const silence = (LIVE_SILENCE_MS / 1000).toFixed(1);
  const active = phase === 'listening' || phase === 'ended';
  const lines = phase === 'idle' ? history : shownHistory.current;

  return (
    <div className="live-talk">
      {(lines.length > 0 || active) && (
        <div className="conversation">
          {lines.map((line, index) =>
            line.role === 'teacher' ? (
              <TeacherBubble key={`h${index}`}>{line.text}</TeacherBubble>
            ) : (
              <div key={`h${index}`} className="student-turn">
                <div className="student-bubble">{line.text}</div>
              </div>
            ),
          )}
          {active &&
            exchanges.map((exchange, index) => (
              <div key={index}>
                {exchange.student !== null && (
                  <div className="student-turn">
                    <div className="student-bubble">{exchange.student || '(老師正在聽你說的話…)'}</div>
                  </div>
                )}
                {(exchange.teacher || exchange.student === null || exchange.complete) && <TeacherBubble>{exchange.teacher || '…'}</TeacherBubble>}
              </div>
            ))}
        </div>
      )}

      {phase === 'listening' && (
        <div className="step-next">
          <p className={`live-status${teacherSpeaking ? '' : ' is-listening'}`}>
            {teacherSpeaking
              ? `Emma 老師正在說…${headphones ? '想說話可以直接打斷她。' : '(這時麥克風先不收音)'}`
              : `🎤 正在聽,直接說就可以。停下來約 ${silence} 秒,老師就會接話。`}
          </p>
          <p className="muted small">還可以說 {turnsLeft} 輪{info ? `(共 ${info.turns} 輪)` : ''}。</p>
          <button type="button" className="button" onClick={stopNow}>
            結束對話
          </button>
        </div>
      )}

      {(phase === 'idle' || phase === 'connecting' || phase === 'ended') && (
        <div className="live-start">
          <label className="toggle">
            <input type="checkbox" checked={headphones} onChange={(e) => chooseHeadphones(e.target.checked)} disabled={phase === 'connecting'} />
            我戴了耳機(可以在老師說話時打斷她)
          </label>
          <p className="muted small">
            不用按任何按鈕,直接說;停下來約 {silence} 秒,老師就會接話。沒戴耳機時,老師說話的期間麥克風先不收音,避免把老師的聲音錄回去。你的聲音會送到 Google 處理,請不要說出真實姓名、地址等個人資料。
          </p>
          <div className="form-actions">
            <button type="button" className="button button-primary button-large" onClick={() => void begin()} disabled={phase === 'connecting'}>
              {phase === 'connecting' ? '正在連線…' : phase === 'ended' ? '再說一次' : startLabel}
            </button>
            {extra}
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          {error.message}
          {error.detail && <pre className="detail">{error.detail}</pre>}
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
