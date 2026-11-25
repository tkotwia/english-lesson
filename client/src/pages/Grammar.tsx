import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { GrammarList, GrammarListItem } from '../../../shared/api.ts';
import { LEVELS, OUTCOME_LABELS, type Level } from '../../../shared/schema.ts';
import type { ItemStatus } from '../../../shared/srs.ts';
import { api, errorMessage } from '../api.ts';
import { useActiveUser } from '../userContext.tsx';

const STATUS_LABELS: Record<ItemStatus, string> = { learning: '複習中', unknown: '不會', unfamiliar: '不熟', mastered: '已掌握' };

const taught = (item: GrammarListItem) => item.lessons.length > 0;
const missed = (item: GrammarListItem) => item.missed.length > 0;

/** 文法表:某個等級的文法重點(依課程清單的順序),教過的附上講解與例句,並標出當初在課堂上答錯的練習題。 */
export function Grammar() {
  const user = useActiveUser();
  const [level, setLevel] = useState<Level>(user.level);
  const [list, setList] = useState<GrammarList | null>(null);
  const [onlyMissed, setOnlyMissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setLevel(user.level), [user.id, user.level]);

  useEffect(() => {
    let cancelled = false;
    setList(null);
    api
      .getGrammar(user.id, level)
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

  const points = list?.points ?? [];
  const taughtCount = points.filter(taught).length;
  const missedCount = points.filter(missed).length;
  // 這個等級沒有答錯的項目時,篩選不適用(勾選框也不顯示):切到別的等級時,先前勾的篩選不能把整張表清空。
  const shown = onlyMissed && missedCount > 0 ? points.filter(missed) : points;

  return (
    <section className="page">
      <h1>文法表</h1>
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
        {list !== null && (
          <>
            <p className="muted">
              {level} 的文法重點共 {points.length} 項,已經教過 {taughtCount} 項
              {taughtCount > 0 && (
                <>
                  ,其中 <strong className={missedCount > 0 ? 'text-warn' : 'text-ok'}>{missedCount} 項當初有練習題答錯或不熟</strong>
                </>
              )}
              。
            </p>
            {missedCount > 0 && (
              <label className="toggle">
                <input type="checkbox" checked={onlyMissed} onChange={(e) => setOnlyMissed(e.target.checked)} />
                只看當初有答錯或不熟的
              </label>
            )}
            <ul className="weak-list word-list grammar-list">
              {shown.map((item) => (
                <li key={item.point} className={missed(item) ? 'is-missed' : ''}>
                  <div className="review-item-head">
                    <strong className="vocab-word">{item.latest?.title ?? item.point}</strong>
                    <span className="word-tags">
                      {!taught(item) && <span className="tag">還沒教到</span>}
                      {taught(item) && !missed(item) && <span className="tag tag-mastered">練習題全對</span>}
                      {missed(item) && (
                        <span className="tag tag-unknown">
                          {item.exerciseCount} 題練習有 {item.missed.length} 題答錯或不熟
                        </span>
                      )}
                    </span>
                  </div>
                  {item.latest && (
                    <>
                      <p className="grammar-explanation">{item.latest.explanation}</p>
                      <ul className="grammar-examples">
                        {item.latest.examples.map((example) => (
                          <li key={example}>{example}</li>
                        ))}
                      </ul>
                      {item.missed.map((miss) => (
                        <div key={`${miss.sessionId}-${miss.question}`} className="grammar-miss">
                          <div className="review-item-head">
                            <span>{miss.question}</span>
                            <span className="word-tags">
                              {miss.outcome !== 'correct' && <span className={`tag tag-${miss.outcome}`}>當初{OUTCOME_LABELS[miss.outcome]}</span>}
                              {miss.flagged && <span className="tag tag-unfamiliar">標過我不熟</span>}
                              {miss.status && <span className={`tag tag-${miss.status}`}>現在:{STATUS_LABELS[miss.status]}</span>}
                            </span>
                          </div>
                          {miss.wrongAnswers.length > 0 && <div className="wrong-answer">✗ 當時你答的:{miss.wrongAnswers.join(' / ')}</div>}
                          <div>正確答案:{miss.answer}</div>
                        </div>
                      ))}
                      <div className="muted small">
                        {item.lessons.map((lesson, index) => (
                          <span key={lesson.sessionId}>
                            {index > 0 && '、'}
                            {lesson.date} · <Link to={`/sessions/${lesson.sessionId}`}>{lesson.lessonTitle}</Link>
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
