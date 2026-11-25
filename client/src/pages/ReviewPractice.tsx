import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { isValidDate } from '../../../shared/dates.ts';
import { reviewExercises, reviewKey, type ReviewItemView } from '../../../shared/lesson.ts';
import type { ExerciseAnswer, Outcome } from '../../../shared/schema.ts';
import { api, errorMessage } from '../api.ts';
import { allDone, ExerciseSequence } from '../lesson/ExerciseSequence.tsx';
import { SpeechProvider, useDetectedSpeech } from '../speech/SpeechContext.tsx';
import { useActiveUser } from '../userContext.tsx';

/** 單獨的複習練習:重考到期的項目,或某段日期內不熟的項目。全部在本機判分,不耗 AI 額度。 */
export function ReviewPractice() {
  const user = useActiveUser();
  const [params] = useSearchParams();
  const from = params.get('from');
  const to = params.get('to');
  const byRange = Boolean(from && to && isValidDate(from) && isValidDate(to));

  const [items, setItems] = useState<ReviewItemView[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, ExerciseAnswer>>({});
  const [results, setResults] = useState<{ itemId: number; outcome: Outcome | 'skipped' }[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const speech = useDetectedSpeech();

  useEffect(() => {
    let cancelled = false;
    const load = byRange ? api.getReview(user.id, from!, to!) : api.getDueItems(user.id);
    load
      .then((loaded) => {
        if (!cancelled) setItems(loaded.items);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [user.id, byRange, from, to]);

  const exercises = useMemo(() => reviewExercises(items ?? []), [items]);
  const finished = exercises.length > 0 && allDone(exercises, answers);

  async function submit() {
    if (!items) return;
    setSaving(true);
    setError(null);
    try {
      // 伺服器以項目編號為鍵,並依它存的題目重新判分。
      const byItemId = Object.fromEntries(items.filter((item) => answers[reviewKey(item.id)]).map((item) => [String(item.id), answers[reviewKey(item.id)]!]));
      setResults((await api.postReviewResults(user.id, byItemId)).results);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (error && !items) return <p className="alert alert-error">{error}</p>;
  if (!items) return <p className="muted center">載入中…</p>;

  if (items.length === 0) {
    return (
      <section className="page">
        <h1>複習練習</h1>
        <p className="text-ok">{byRange ? '這段期間沒有可以練習的項目。' : '今天沒有到期的複習項目,明天再來!'}</p>
        <Link to="/review" className="button">
          回到回顧
        </Link>
      </section>
    );
  }

  if (results) {
    const skipped = results.filter((result) => result.outcome === 'skipped').length;
    const practiced = results.length - skipped;
    const remembered = results.filter((result) => result.outcome === 'correct').length;
    return (
      <section className="page">
        <h1>複習完成</h1>
        <div className="card">
          <p>
            共 {results.length} 項:<strong className="text-ok">記得 {remembered} 項</strong>、
            <strong className="text-warn">還不熟 {practiced - remembered} 項</strong>
            {skipped > 0 && <>、跳過 {skipped} 項</>}。
          </p>
          <p className="muted">記得的項目會隔久一點再出現;還不熟的明天會再複習{skipped > 0 && ';跳過的到期項目也排到明天'}。這次練習不列入日曆分數。</p>
          <div className="form-actions">
            <Link to="/review" className="button button-primary">
              回到回顧
            </Link>
            <Link to="/" className="button">
              回首頁
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page lesson">
      <h1>複習練習</h1>
      <p className="muted">
        {byRange ? `${from} 到 ${to} 不熟的內容` : '今天到期的複習項目'},共 {items.length} 項。
      </p>
      <div className="thread">
        <SpeechProvider value={speech}>
          <ExerciseSequence
            items={exercises}
            answers={answers}
            level={user.level}
            onAnswer={(key, answer) => setAnswers((current) => ({ ...current, [key]: answer }))}
            showContext
            showKind
            skippableSpeaking
          />
        </SpeechProvider>
        {error && <p className="alert alert-error">{error}</p>}
        {finished && (
          <div className="step-next">
            <button type="button" className="button button-primary button-large" onClick={submit} disabled={saving}>
              {saving ? '儲存中…' : '完成複習'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
