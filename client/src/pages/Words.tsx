import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { WordList, WordListItem } from '../../../shared/api.ts';
import { LEVELS, OUTCOME_LABELS, type Level } from '../../../shared/schema.ts';
import type { ItemStatus } from '../../../shared/srs.ts';
import { api, errorMessage } from '../api.ts';
import { speak, speechRate, ttsSupported } from '../speech/tts.ts';
import { useActiveUser } from '../userContext.tsx';

const STATUS_LABELS: Record<ItemStatus, string> = { learning: '複習中', unknown: '不會', unfamiliar: '不熟', mastered: '已掌握' };

const missed = (word: WordListItem) => word.outcome !== 'correct';

/** 單字表:某個等級上過的重點單字,並標出當初在課堂上答錯的。 */
export function Words() {
  const user = useActiveUser();
  const [level, setLevel] = useState<Level>(user.level);
  const [list, setList] = useState<WordList | null>(null);
  const [onlyMissed, setOnlyMissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tts = ttsSupported();

  useEffect(() => setLevel(user.level), [user.id, user.level]);

  useEffect(() => {
    let cancelled = false;
    setList(null);
    api
      .getWords(user.id, level)
      .then((loaded) => {
        if (cancelled) return;
        setList(loaded);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [user.id, level]);

  const words = list?.words ?? [];
  const missedCount = words.filter(missed).length;
  const shown = onlyMissed ? words.filter(missed) : words;

  return (
    <section className="page">
      <h1>單字表</h1>
      {error && <p className="alert alert-error">{error}</p>}
      <div className="card">
        <div className="tabs" role="tablist" aria-label="等級">
          {LEVELS.map((value) => (
            <button key={value} type="button" role="tab" aria-selected={level === value} className={`tab${level === value ? ' is-selected' : ''}`} onClick={() => setLevel(value)}>
              {value}
              {value === user.level && '(目前)'}
            </button>
          ))}
        </div>

        {list === null && !error && <p className="muted">載入中…</p>}
        {list !== null && words.length === 0 && <p className="muted">還沒有在 {level} 上過課,所以沒有單字。</p>}
        {words.length > 0 && (
          <>
            <p className="muted">
              在 {level} 上過的重點單字共 {words.length} 個,其中 <strong className={missedCount > 0 ? 'text-warn' : 'text-ok'}>{missedCount} 個當初在課堂上答錯或不熟</strong>。
            </p>
            <label className="toggle">
              <input type="checkbox" checked={onlyMissed} onChange={(e) => setOnlyMissed(e.target.checked)} />
              只看當初答錯或不熟的
            </label>
            <ul className="weak-list word-list">
              {shown.map((word) => (
                <li key={`${word.sessionId}-${word.word}`} className={missed(word) ? 'is-missed' : ''}>
                  <div className="review-item-head">
                    <span>
                      <strong className="vocab-word">{word.word}</strong> <span className="muted">{word.pos}</span> {word.meaning}
                      {tts && (
                        <button type="button" className="speak-button" onClick={() => speak(`${word.word}. ${word.example}`, { rate: speechRate(level) })} aria-label={`聽 ${word.word} 的發音`}>
                          🔊
                        </button>
                      )}
                    </span>
                    <span className="word-tags">
                      {word.outcome !== 'correct' && <span className={`tag tag-${word.outcome}`}>當初{OUTCOME_LABELS[word.outcome]}</span>}
                      {word.flagged && <span className="tag tag-unfamiliar">標過我不熟</span>}
                      {word.status && <span className={`tag tag-${word.status}`}>現在:{STATUS_LABELS[word.status]}</span>}
                    </span>
                  </div>
                  <div className="vocab-example">{word.example}</div>
                  {word.wrongAnswers.length > 0 && <div className="wrong-answer">✗ 當時你填的:{word.wrongAnswers.join(' / ')}</div>}
                  <div className="muted small">
                    {word.date} · <Link to={`/sessions/${word.sessionId}`}>{word.lessonTitle}</Link>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
