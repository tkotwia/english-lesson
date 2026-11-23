import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { ProgressSummary } from '../../../shared/api.ts';
import { STAGE_LABELS, type SessionView } from '../../../shared/schema.ts';
import { api, errorMessage } from '../api.ts';
import { useActiveUser } from '../userContext.tsx';

export function Home() {
  const user = useActiveUser();
  const [current, setCurrent] = useState<SessionView | null>(null);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [session, summary] = await Promise.all([api.currentSession(user.id), api.getProgress(user.id)]);
      setCurrent(session);
      setProgress(summary);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [user.id]);

  useEffect(() => {
    setCurrent(null);
    setProgress(null);
    void load();
  }, [load]);

  return (
    <section className="page">
      <h1>嗨,{user.name}!</h1>
      <p className="muted">
        {STAGE_LABELS[user.stage]} · 目前等級 {user.level}
      </p>

      {error && <p className="alert alert-error">{error}</p>}

      {!user.hasApiKey && (
        <div className="alert alert-warn">
          還沒有設定 Google API key,沒有它就無法上新課。
          <Link to="/settings"> 前往設定</Link>
        </div>
      )}

      <div className="card">
        {current ? (
          <>
            <h2>有一堂課還沒上完</h2>
            <p>{current.lesson.title}</p>
            <Link to="/lesson" className="button button-primary button-large">
              繼續上課
            </Link>
          </>
        ) : (
          <>
            <h2>今天的課</h2>
            <p className="muted">
              {progress?.todayScore != null ? `今天已經上過課了,當日分數 ${progress.todayScore} 分。想再上一堂也可以。` : '今天還沒上課。每堂課 20–40 分鐘,包含聽、說、讀、寫。'}
            </p>
            <Link to="/lesson" className="button button-primary button-large">
              開始上課
            </Link>
          </>
        )}
      </div>

      {progress && (
        <div className="stat-row">
          <Link to="/calendar" className="stat">
            <span className="stat-label">本月平均</span>
            <strong className="stat-value">{progress.monthAverage ?? '—'}</strong>
            <span className="muted small">看學習日曆</span>
          </Link>
          <Link to={progress.dueCount > 0 ? '/review/practice?mode=due' : '/review'} className="stat">
            <span className="stat-label">今天待複習</span>
            <strong className="stat-value">{progress.dueCount}</strong>
            <span className="muted small">{progress.dueCount > 0 ? '開始複習(不耗額度)' : '回顧不熟的部分'}</span>
          </Link>
        </div>
      )}
    </section>
  );
}
