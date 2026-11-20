import { useState, type FormEvent } from 'react';
import { MAX_ASKS } from '../../../shared/schema.ts';
import { errorDetail, errorMessage } from '../api.ts';
import { TEACHER_NAME } from './lines.ts';

interface Props {
  asks: { question: string; answer: string }[];
  /** 送出問題;失敗時丟出錯誤。 */
  onAsk: (question: string) => Promise<void>;
}

/** 問老師:課堂中隨時可以打開的提問面板。每堂課有次數上限,不計分。 */
export function AskTeacher({ asks, onAsk }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const remaining = MAX_ASKS - asks.length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || asking) return;
    setAsking(true);
    setError(null);
    try {
      await onAsk(question);
      setDraft('');
    } catch (err) {
      setError({ message: errorMessage(err), detail: errorDetail(err) });
    } finally {
      setAsking(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="ask-fab" onClick={() => setOpen(true)}>
        🙋 問老師
        <small>剩 {remaining} 次</small>
      </button>
    );
  }

  return (
    <aside className="ask-panel" aria-label="問老師">
      <header>
        <strong>問{TEACHER_NAME}</strong>
        <button type="button" className="button button-ghost" onClick={() => setOpen(false)} aria-label="關閉">
          ✕
        </button>
      </header>
      <div className="ask-list">
        {asks.length === 0 && <p className="muted">有不懂的單字、文法或句子都可以問。這裡的問答不計分。</p>}
        {asks.map((item, index) => (
          <div key={index} className="ask-item">
            <p className="ask-question">{item.question}</p>
            <p className="ask-answer">{item.answer}</p>
          </div>
        ))}
        {asking && <p className="muted">{TEACHER_NAME}正在回答…</p>}
      </div>
      {error && (
        <div className="alert alert-error">
          {error.message}
          {error.detail && <pre className="detail">{error.detail}</pre>}
        </div>
      )}
      {remaining > 0 ? (
        <form className="chat-input" onSubmit={submit}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={300} disabled={asking} placeholder="輸入你的問題…" aria-label="你的問題" />
          <button type="submit" className="button button-primary" disabled={asking || !draft.trim()}>
            問
          </button>
        </form>
      ) : (
        <p className="muted small">這堂課的 {MAX_ASKS} 次提問已經用完了。</p>
      )}
      <p className="muted small">還可以問 {remaining} 次。</p>
    </aside>
  );
}
