import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { ProgressSummary, ReviewListItem } from '../../../shared/api.ts';
import { isValidMonth, localDate, monthOf, monthRange, weekRange, type DateRange } from '../../../shared/dates.ts';
import type { ItemStatus } from '../../../shared/srs.ts';
import { KIND_LABELS, type ItemKind } from '../../../shared/schema.ts';
import { api, errorMessage } from '../api.ts';
import { Solution } from '../lesson/Solution.tsx';
import { useActiveUser } from '../userContext.tsx';

type Mode = 'week' | 'month' | 'custom';

const STATUS_LABELS: Record<ItemStatus, string> = { learning: '新學', unknown: '不會', unfamiliar: '不熟', mastered: '已掌握' };
const KIND_ORDER: ItemKind[] = ['vocab', 'grammar', 'reading', 'listening', 'speaking', 'writing'];

export function Review() {
  const user = useActiveUser();
  const today = localDate();
  const [mode, setMode] = useState<Mode>('week');
  const [customMonth, setCustomMonth] = useState(monthOf(today));
  const [items, setItems] = useState<ReviewListItem[] | null>(null);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const range: DateRange = mode === 'week' ? weekRange(today) : monthRange(mode === 'month' ? monthOf(today) : customMonth);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    Promise.all([api.getReview(user.id, range.from, range.to), api.getProgress(user.id)])
      .then(([review, summary]) => {
        if (cancelled) return;
        setItems(review.items);
        setProgress(summary);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [user.id, range.from, range.to]);

  const groups = KIND_ORDER.map((kind) => ({ kind, items: (items ?? []).filter((item) => item.kind === kind) })).filter((group) => group.items.length > 0);

  return (
    <section className="page">
      <h1>回顧不熟的部分</h1>
      {error && <p className="alert alert-error">{error}</p>}

      {progress && progress.dueCount > 0 && (
        <div className="card due-card">
          <div>
            <strong>今天有 {progress.dueCount} 個項目該複習了</strong>
            <p className="muted">複習不需要連網路上的 AI,不耗額度。</p>
          </div>
          <Link to="/review/practice?mode=due" className="button button-primary">
            開始複習
          </Link>
        </div>
      )}

      <div className="card">
        <div className="tabs" role="tablist" aria-label="回顧範圍">
          {(
            [
              ['week', '本週'],
              ['month', '本月'],
              ['custom', '指定月份'],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={mode === value} className={`tab${mode === value ? ' is-selected' : ''}`} onClick={() => setMode(value)}>
              {label}
            </button>
          ))}
          {mode === 'custom' && (
            <input
              type="month"
              value={customMonth}
              max={monthOf(today)}
              onChange={(e) => {
                if (isValidMonth(e.target.value)) setCustomMonth(e.target.value);
              }}
              aria-label="選擇月份"
            />
          )}
        </div>
        <p className="muted">
          {range.from} 到 {range.to} 之間,答錯、不熟或你自己標記過的內容。
        </p>

        {items === null && !error && <p className="muted">載入中…</p>}
        {items !== null && items.length === 0 && <p className="text-ok">這段期間沒有不會或不熟的內容。</p>}

        {items !== null && items.length > 0 && (
          <>
            <Link to={`/review/practice?from=${range.from}&to=${range.to}`} className="button button-primary">
              練習這些({items.length} 項)
            </Link>
            {items.some((item) => item.wrongAnswers.length > 0) && (
              <p className="muted small">
                ✗ 是你最近一次答錯時的作答,→ 是正確答案,<mark className="missed">黃底</mark>是答錯的地方。
              </p>
            )}
            {groups.map((group) => (
              <div key={group.kind} className="weak-group">
                <h3>
                  {KIND_LABELS[group.kind]} · {group.items.length} 項
                </h3>
                <ul className="weak-list">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <div className="review-item-head">
                        <strong>{item.label}</strong>
                        <span className={`tag tag-${item.status}`}>{STATUS_LABELS[item.status]}</span>
                      </div>
                      {item.wrongAnswers.length > 0 && <div className="wrong-answer">✗ 你的答案:{item.wrongAnswers.join(' / ')}</div>}
                      <div className="weak-answer">
                        → {item.wrongAnswers.length > 0 ? <Solution exercise={item.quiz} response={item.wrongAnswers.at(-1)} /> : item.answer}
                      </div>
                      {item.explanation !== item.answer && <div className="muted small">{item.explanation}</div>}
                      <div className="muted small">
                        這段期間 {item.misses} 次 · 累計答錯 {item.wrongCount} 次 · 最近一次 {item.lastSeen}
                        {item.status !== 'mastered' && ` · 下次複習 ${item.dueDate}`}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
