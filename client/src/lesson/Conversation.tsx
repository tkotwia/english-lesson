import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CHAT_TURNS, type ChatTurn, type SessionView } from '../../../shared/schema.ts';
import { errorCode, errorDetail, errorMessage } from '../api.ts';
import { useSpeech } from '../speech/SpeechContext.tsx';
import { isMicUnavailable, listen, sttErrorMessage, type Listening } from '../speech/stt.ts';
import { speechRate } from '../speech/tts.ts';
import { TeacherBubble } from './TeacherBubble.tsx';

interface Props {
  session: SessionView;
  chat: ChatTurn[];
  /** 送出學生說的一句話;失敗時丟出錯誤。 */
  onSend: (message: string) => Promise<void>;
  /** AI 對話服務無法使用時,跳過對話(這部分不計分)。 */
  onSkip: () => void;
}

/** AI 服務本身的問題(不是學生輸入的問題):這時提供「跳過對話」。 */
const SERVICE_ERRORS = new Set(['quota', 'unavailable', 'bad_output', 'no_key', 'invalid_key', 'network']);

/** 對話是否已經說完所有輪數。 */
export function conversationFinished(session: SessionView, chat: ChatTurn[]): boolean {
  return chat.filter((turn) => turn.role === 'student').length >= CHAT_TURNS[session.minutes];
}

/** 與老師的情境對話:學生用說的或用打的,老師回應並指出需要修正的地方。 */
export function Conversation({ session, chat, onSend, onSkip }: Props) {
  const { stt, disableStt } = useSpeech();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; detail?: string; service: boolean } | null>(null);
  const listening = useRef<Listening | null>(null);

  useEffect(() => () => listening.current?.stop(), []);

  const limit = CHAT_TURNS[session.minutes];
  const used = chat.filter((turn) => turn.role === 'student').length;
  const finished = used >= limit;
  const rate = speechRate(session.level);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(message);
      setDraft('');
    } catch (err) {
      setError({ message: errorMessage(err), detail: errorDetail(err), service: SERVICE_ERRORS.has(errorCode(err) ?? '') });
    } finally {
      setSending(false);
    }
  }

  function record() {
    setMicError(null);
    setRecording(true);
    const before = draft.trim();
    listening.current = listen({
      // 辨識出來的文字接在已經打好的內容後面,學生可以修改後再送出。
      onText: (text) => setDraft(`${before} ${text}`.trim()),
      onEnd: (finalText) => {
        setRecording(false);
        if (!finalText) setMicError('沒有聽到聲音,請再試一次,或直接用打字的。');
        else setDraft(`${before} ${finalText}`.trim());
      },
      onError: (code) => {
        setRecording(false);
        setMicError(sttErrorMessage(code));
        if (isMicUnavailable(code)) disableStt();
      },
    });
  }

  return (
    <div className="conversation">
      {chat.map((turn, index) =>
        turn.role === 'teacher' ? (
          <TeacherBubble key={index} speakText={turn.text} rate={rate}>
            {turn.text}
          </TeacherBubble>
        ) : (
          <div key={index} className="student-turn">
            <div className="student-bubble">{turn.text}</div>
            {turn.corrections.map((correction, i) => (
              <div key={i} className="correction">
                <strong>更好的說法:{correction.corrected}</strong>
                <span>{correction.explanation}</span>
              </div>
            ))}
          </div>
        ),
      )}

      {sending && <p className="muted typing">Emma 老師正在回覆…</p>}

      {!finished && (
        <form className="chat-input" onSubmit={send}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            disabled={sending}
            placeholder={stt ? '按麥克風用說的,或直接打字…' : 'Type your answer in English…'}
            autoComplete="off"
            spellCheck={false}
            aria-label="你要說的話"
          />
          {stt &&
            (recording ? (
              <button type="button" className="button button-recording" onClick={() => listening.current?.stop()}>
                ■ 說完了
              </button>
            ) : (
              <button type="button" className="button" onClick={record} disabled={sending} aria-label="用說的">
                🎤
              </button>
            ))}
          <button type="submit" className="button button-primary" disabled={sending || recording || !draft.trim()}>
            送出
          </button>
        </form>
      )}
      {!finished && (
        <p className="muted small">
          還可以說 {limit - used} 次(共 {limit} 次)。
        </p>
      )}
      {micError && <p className="feedback feedback-retry">{micError}</p>}
      {error && (
        <div className="alert alert-error">
          {error.message}
          {error.detail && <pre className="detail">{error.detail}</pre>}
          {error.service && (
            <div className="form-actions">
              <button type="button" className="button" onClick={() => void send()} disabled={sending}>
                再試一次
              </button>
              <button type="button" className="button" onClick={onSkip}>
                跳過對話(這部分不計分)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
