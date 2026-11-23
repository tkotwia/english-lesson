import { useEffect, useRef, useState } from 'react';
import { MAX_READING_WPM, readingSpeed, RETELL_SECONDS } from '../../../shared/fluency.ts';
import { countWords } from '../../../shared/lesson.ts';
import type { SessionState, SessionView } from '../../../shared/schema.ts';
import { useSpeech } from '../speech/SpeechContext.tsx';
import { isMicUnavailable, listen, type Listening } from '../speech/stt.ts';
import { speak, speechRate, stopSpeaking } from '../speech/tts.ts';
import { teacherLine, type LineKey } from './lines.ts';
import { TeacherBubble } from './TeacherBubble.tsx';

interface Props {
  session: SessionView;
  state: SessionState;
  onFluency: (record: Partial<SessionState['fluency']>) => void;
  onNext: () => void;
  nextLabel: string;
  /** 這是不是整堂課的第一個階段;是的話先顯示老師的開場白。 */
  showIntro: boolean;
}

/** 和上次比較的一句話;沒有上次的成績就不說。 */
function comparison(now: number, last: number | null): string {
  if (last === null) return '';
  if (now > last) return `上次是 ${last},這次進步了!`;
  if (now === last) return `和上次一樣(${last})。`;
  return `上次是 ${last}。`;
}

/**
 * 課前重溫上一課(流暢度練習):不看字再聽一次、計時重讀、一分鐘重述。
 * 內容是學生已經熟悉的,目標是「快」而不是學新東西。不計分,每一步都可以跳過。
 */
export function FluencyStep({ session, state, onFluency, onNext, nextLabel, showIntro }: Props) {
  const previous = session.previous!;
  const { level } = session;
  const { tts, stt, disableStt } = useSpeech();
  const rate = speechRate(level);
  const words = countWords(previous.text);
  const line = (id: LineKey) => {
    const text = teacherLine(level, id);
    return (
      <TeacherBubble speakText={text} rate={rate}>
        {text}
      </TeacherBubble>
    );
  };

  // 第一步:重聽。不能朗讀就直接從第二步開始。
  const [listened, setListened] = useState(!tts);
  const [playing, setPlaying] = useState(false);
  function play() {
    setPlaying(true);
    speak(previous.text, {
      rate,
      onEnd: () => {
        setPlaying(false);
        setListened(true);
      },
    });
  }

  // 第二步:計時重讀。
  const [readingSince, setReadingSince] = useState<number | null>(null);
  const [readSeconds, setReadSeconds] = useState<number | null>(null);
  const [tooFast, setTooFast] = useState(false);
  const [readSkipped, setReadSkipped] = useState(false);
  const readDone = state.fluency.readingWpm !== null || readSkipped;
  function startReading() {
    stopSpeaking();
    setTooFast(false);
    setReadingSince(Date.now());
  }
  function finishReading() {
    if (readingSince === null) return;
    const elapsed = Date.now() - readingSince;
    const wpm = readingSpeed(words, elapsed);
    setReadingSince(null);
    if (wpm === null) {
      setTooFast(true);
      return;
    }
    setReadSeconds(Math.round(elapsed / 1000));
    onFluency({ readingWpm: wpm });
  }

  // 第三步:一分鐘重述。有麥克風用說的,沒有就用打的。
  const [retellingSince, setRetellingSince] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RETELL_SECONDS);
  const [said, setSaid] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const listening = useRef<Listening | null>(null);
  /** 離開這個畫面之後,還在進行的錄音不能再留下成績。 */
  const left = useRef(false);
  const saidRef = useRef('');
  saidRef.current = said;
  const retelling = retellingSince !== null;
  const retellDone = state.fluency.retellWords !== null;

  function finishRetell(text: string) {
    if (left.current) return;
    setRetellingSince(null);
    setSaid(text);
    onFluency({ retellWords: countWords(text) });
  }
  function startRetell() {
    stopSpeaking();
    setMicError(null);
    setSaid('');
    setSecondsLeft(RETELL_SECONDS);
    setRetellingSince(Date.now());
    if (!stt) return;
    listening.current = listen({
      onText: setSaid,
      onEnd: finishRetell,
      onError: (code) => {
        // 麥克風不能用:留在這一步,改成用打的。
        listening.current = null;
        if (isMicUnavailable(code)) disableStt();
        setMicError('麥克風現在不能用,請改用打字重述。');
      },
    });
  }
  function stopRetell() {
    if (listening.current) listening.current.stop();
    else finishRetell(saidRef.current);
  }
  useEffect(() => {
    if (retellingSince === null) return;
    const timer = window.setInterval(() => {
      const left = RETELL_SECONDS - Math.floor((Date.now() - retellingSince) / 1000);
      setSecondsLeft(Math.max(0, left));
      if (left <= 0) stopRetell();
    }, 250);
    return () => window.clearInterval(timer);
    // 只跟著「這一次重述的開始時間」重新計時。
  }, [retellingSince]);
  useEffect(() => {
    left.current = false;
    return () => {
      // 離開時放開麥克風;講到一半的內容不算成績。
      left.current = true;
      listening.current?.stop();
    };
  }, []);
  const typing = retelling && listening.current === null;

  return (
    <>
      {showIntro && (
        <TeacherBubble speakText={session.lesson.intro} rate={rate}>
          {session.lesson.intro}
        </TeacherBubble>
      )}
      {line('fluencyIntro')}
      <p className="muted fluency-title">上一課:{previous.title}</p>

      {tts && (
        <div className="fluency-part">
          <h3>1. 不看文字,再聽一次</h3>
          <div className="exercise-actions">
            <button type="button" className="button button-primary" onClick={play} disabled={playing}>
              🔊 {playing ? '播放中…' : listened ? '再聽一次' : '播放上一課的課文'}
            </button>
            {!listened && (
              <button type="button" className="button button-ghost" onClick={() => setListened(true)}>
                跳過這一步
              </button>
            )}
          </div>
        </div>
      )}

      {listened && (
        <div className="fluency-part">
          <h3>{tts ? 2 : 1}. 計時重讀</h3>
          <p className="muted">{teacherLine(level, 'fluencyRead')}</p>
          {readingSince !== null && (
            <>
              <p className="fluency-passage">{previous.text}</p>
              <div className="exercise-actions">
                <button type="button" className="button button-primary" onClick={finishReading}>
                  讀完了
                </button>
              </div>
            </>
          )}
          {readingSince === null && !readDone && (
            <div className="exercise-actions">
              <button type="button" className="button button-primary" onClick={startReading}>
                開始計時
              </button>
              <button type="button" className="button button-ghost" onClick={() => setReadSkipped(true)}>
                跳過這一步
              </button>
            </div>
          )}
          {tooFast && <p className="feedback feedback-retry">這個速度超過每分鐘 {MAX_READING_WPM} 個字,不像是讀完了。這次不算,請再讀一次。</p>}
          {state.fluency.readingWpm !== null && (
            <p className="feedback feedback-correct">
              <strong>每分鐘 {state.fluency.readingWpm} 個字</strong>
              {readSeconds !== null && `(${words} 個字,花了 ${readSeconds} 秒)`}。{comparison(state.fluency.readingWpm, previous.lastReadingWpm)}
            </p>
          )}
        </div>
      )}

      {listened && readDone && (
        <div className="fluency-part">
          <h3>{tts ? 3 : 2}. 一分鐘重述</h3>
          <p className="muted">{teacherLine(level, 'fluencyRetell')}</p>
          {!retelling && !retellDone && (
            <div className="exercise-actions">
              <button type="button" className="button button-primary" onClick={startRetell}>
                {stt ? '🎤 開始說(60 秒)' : '開始打字(60 秒)'}
              </button>
            </div>
          )}
          {retelling && (
            <>
              <p className="fluency-timer" aria-live="off">
                還有 <strong>{secondsLeft}</strong> 秒
              </p>
              {typing ? (
                <textarea
                  className="fluency-typing"
                  value={said}
                  onChange={(e) => setSaid(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  autoFocus
                  spellCheck={false}
                  placeholder="Type what the passage was about…"
                  aria-label="重述的內容"
                />
              ) : (
                <p className="heard">{said || '正在聽…'}</p>
              )}
              <div className="exercise-actions">
                <button type="button" className="button button-recording" onClick={stopRetell}>
                  ■ {typing ? '寫完了' : '說完了'}
                </button>
              </div>
            </>
          )}
          {micError && <p className="feedback feedback-retry">{micError}</p>}
          {state.fluency.retellWords !== null && (
            <>
              <p className="feedback feedback-correct">
                <strong>一分鐘內說了 {state.fluency.retellWords} 個英文字</strong>。{comparison(state.fluency.retellWords, previous.lastRetellWords)}
              </p>
              {said && <p className="last-attempt">{said}</p>}
            </>
          )}
        </div>
      )}

      {retellDone && line('fluencyDone')}
      <div className="step-next">
        <button type="button" className={`button button-large${retellDone ? ' button-primary' : ''}`} onClick={onNext} disabled={retelling || readingSince !== null}>
          {retellDone ? `下一步:${nextLabel}` : `跳過重溫,直接到${nextLabel}`}
        </button>
      </div>
    </>
  );
}
