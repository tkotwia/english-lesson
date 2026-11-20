import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { PreparedStatus } from '../../../shared/api.ts';
import { LESSON_MINUTES, type Minutes, type SessionView } from '../../../shared/schema.ts';
import { api, errorCode, errorDetail, errorMessage } from '../api.ts';
import { LessonPlayer } from '../lesson/LessonPlayer.tsx';
import { TEACHER_NAME } from '../lesson/lines.ts';
import { useElapsedSeconds } from '../useElapsedSeconds.ts';
import { useActiveUser } from '../userContext.tsx';

export function Lesson() {
  const user = useActiveUser();
  const [session, setSession] = useState<SessionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .currentSession(user.id)
      .then((current) => {
        if (!cancelled) setSession(current);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  if (loading) return <p className="muted center">載入中…</p>;
  if (error) return <p className="alert alert-error">{error}</p>;
  if (!session) return <StartPanel onStarted={setSession} />;
  return <LessonPlayer key={session.id} session={session} onAbandoned={() => setSession(null)} />;
}

const MINUTES_HINT: Record<Minutes, string> = { 20: '精簡', 30: '標準', 40: '加強' };

function StartPanel({ onStarted }: { onStarted: (session: SessionView) => void }) {
  const user = useActiveUser();
  const [minutes, setMinutes] = useState<Minutes>(30);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<{ message: string; detail?: string; quota: boolean } | null>(null);
  const elapsed = useElapsedSeconds(starting);
  // 下一堂課有沒有預先備好;備好的長度可以馬上開始。
  const [prepared, setPrepared] = useState<PreparedStatus | null>(null);
  const [choseMinutes, setChoseMinutes] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const load = () => {
      api
        .getPrepared(user.id)
        .then((status) => {
          if (cancelled) return;
          setPrepared(status);
          // 背景還在準備時,隔幾秒再問一次,備好了畫面就會更新。
          if (status.state === 'preparing') timer = window.setTimeout(load, 3000);
        })
        .catch(() => {
          // 查不到備課狀態不影響開課,最多就是現場備課。
        });
    };
    load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [user.id]);

  // 還沒自己選過長度時,預設選已經備好的那個長度。
  useEffect(() => {
    if (!choseMinutes && prepared?.minutes) setMinutes(prepared.minutes);
  }, [prepared, choseMinutes]);

  const readyMinutes = prepared?.state === 'ready' ? prepared.minutes : null;

  async function start() {
    setStarting(true);
    setError(null);
    try {
      onStarted(await api.startSession(user.id, minutes));
    } catch (err) {
      setError({ message: errorMessage(err), detail: errorDetail(err), quota: errorCode(err) === 'quota' });
      setStarting(false);
    }
  }

  return (
    <section className="page">
      <h1>開始上課</h1>
      <div className="card narrow">
        <h2>這堂課要上多久?</h2>
        <div className="choice-row" role="radiogroup" aria-label="課程長度">
          {LESSON_MINUTES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={minutes === value}
              className={`choice${minutes === value ? ' is-selected' : ''}`}
              onClick={() => {
                setMinutes(value);
                setChoseMinutes(true);
              }}
              disabled={starting}
            >
              <strong>{value} 分鐘</strong>
              <small>{MINUTES_HINT[value]}</small>
              {readyMinutes === value && <span className="tag tag-mastered">已備好</span>}
            </button>
          ))}
        </div>
        <p className="muted prepared-note">
          {readyMinutes === minutes && <>這堂 {user.level} 的課已經備好,按「開始」馬上上課。</>}
          {readyMinutes !== null && readyMinutes !== minutes && (
            <>
              已經備好的是 {readyMinutes} 分鐘的課。改選 {minutes} 分鐘需要現場備課(實測約 40–80 秒),而且備好的那一堂會作廢。
            </>
          )}
          {prepared?.state === 'preparing' && (
            <>
              {TEACHER_NAME}正在準備一堂 {prepared.minutes} 分鐘的課。現在按「開始」,等她準備好就會開始。
            </>
          )}
          {(!prepared || prepared.state === 'none') && (
            <>
              按「開始」後,{TEACHER_NAME}會依你的等級({user.level})現場備課,實測約 40–80 秒。之後每次上課時,她都會先把下一堂備好。
            </>
          )}
        </p>

        {!user.hasApiKey ? (
          <p className="alert alert-warn">
            還沒有設定 Google API key,無法上新課。<Link to="/settings">前往設定</Link>
          </p>
        ) : (
          <button type="button" className="button button-primary button-large" onClick={start} disabled={starting}>
            {starting ? `${TEACHER_NAME}正在備課… 已等待 ${elapsed} 秒` : '開始'}
          </button>
        )}

        {starting && readyMinutes !== minutes && <p className="muted small">現場備課實測約 40–80 秒。模型忙線時會自動改用備援,可能更久。</p>}

        {error && (
          <div className="alert alert-error">
            {error.message}
            {error.quota && (
              <p>
                <Link to="/review">先去回顧與複習不熟的部分</Link>(不需要 AI,不耗額度)。
              </p>
            )}
            {error.detail && <pre className="detail">{error.detail}</pre>}
          </div>
        )}
      </div>
    </section>
  );
}
