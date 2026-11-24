import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { PreparedStatus } from '../../../shared/api.ts';
import { STAGE_MINUTES, type Level, type SessionView, type Stage } from '../../../shared/schema.ts';
import { formatSeconds } from '../../../shared/wait.ts';
import { api, errorCode, errorDetail, errorMessage } from '../api.ts';
import { WaitProgress } from '../components/WaitProgress.tsx';
import { LessonPlayer } from '../lesson/LessonPlayer.tsx';
import { TEACHER_NAME } from '../lesson/lines.ts';
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

/** 查不到備課狀態時用的預估等待秒數(與伺服器沒有紀錄時的預設值相同)。 */
const FALLBACK_WAIT_SECONDS = 60;
/** 老師正在背景備課時,多久再問一次備好了沒。 */
const PREPARING_POLL_MS = 3000;

/** 下一堂課現在是什麼狀況、接下來要按什麼。 */
function describeNext(status: PreparedStatus | null, level: Level, stage: Stage): string {
  if (!status) return `按「開始」後,${TEACHER_NAME}會依你的等級(${level})備課。`;
  if (status.source === 'starter') {
    const later = STAGE_MINUTES[stage] === status.minutes ? '' : `之後的課是 ${STAGE_MINUTES[stage]} 分鐘。`;
    return `這是 ${level} 的起始課(內建的第一堂課,${status.minutes} 分鐘的份量),按「開始」馬上上課,不用等。${later}`;
  }
  if (status.state === 'ready') return `這堂 ${level} 的課已經備好,按「開始」馬上上課,不用等。`;
  if (status.state === 'preparing') return `${TEACHER_NAME}正在準備下一堂課,備好就可以開始。`;
  return `下一堂課還沒有備好。按「備課」請 ${TEACHER_NAME}準備,預估要等 ${formatSeconds(status.waitSeconds)};備好之後就可以開始。`;
}

function StartPanel({ onStarted }: { onStarted: (session: SessionView) => void }) {
  const user = useActiveUser();
  // 下一堂課備好了沒;null 表示還不知道(剛進來,或查不到)。
  const [prepared, setPrepared] = useState<PreparedStatus | null>(null);
  // 按了按鈕之後正在等什麼,以及預估要等幾秒(0 表示不需要進度條)。
  const [waiting, setWaiting] = useState<{ what: 'starting' | 'preparing'; seconds: number } | null>(null);
  // 老師在背景備課時,第一次看到的預估秒數;進度條從那時起算,不隨之後每次詢問重來。
  const [backgroundSeconds, setBackgroundSeconds] = useState<number | null>(null);
  const [error, setError] = useState<{ message: string; detail?: string; quota: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const load = () => {
      api
        .getPrepared(user.id)
        .then((status) => {
          if (cancelled) return;
          setPrepared(status);
          setBackgroundSeconds((current) => (status.state === 'preparing' ? (current ?? status.waitSeconds) : null));
          // 背景還在準備時,隔幾秒再問一次,備好了畫面就會換成「開始」。
          if (status.state === 'preparing') timer = window.setTimeout(load, PREPARING_POLL_MS);
        })
        .catch(() => {
          // 查不到備課狀態不影響開課:畫面照樣給「開始」,最多就是現場備課。
        });
    };
    load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [user.id, user.level, user.stage]);

  const failed = (err: unknown) => setError({ message: errorMessage(err), detail: errorDetail(err), quota: errorCode(err) === 'quota' });

  async function start() {
    setWaiting({ what: 'starting', seconds: prepared ? prepared.waitSeconds : FALLBACK_WAIT_SECONDS });
    setError(null);
    try {
      onStarted(await api.startSession(user.id));
    } catch (err) {
      failed(err);
      setWaiting(null);
    }
  }

  async function prepare() {
    setWaiting({ what: 'preparing', seconds: prepared?.waitSeconds || FALLBACK_WAIT_SECONDS });
    setError(null);
    try {
      setPrepared(await api.prepareLesson(user.id));
    } catch (err) {
      failed(err);
    } finally {
      setWaiting(null);
    }
  }

  const minutes = prepared?.minutes ?? STAGE_MINUTES[user.stage];
  // 按了「備課」之後,說明文字也要跟著變成「正在準備」,不再叫學生去按備課。
  const shown: PreparedStatus | null = prepared && waiting?.what === 'preparing' ? { ...prepared, state: 'preparing' } : prepared;
  // 進度條要顯示的預估秒數:自己按了按鈕在等,或老師正在背景備課。
  const progressSeconds = waiting ? waiting.seconds : prepared?.state === 'preparing' ? backgroundSeconds : null;

  return (
    <section className="page">
      <h1>開始上課</h1>
      <div className="card narrow">
        <h2>下一堂課:{minutes} 分鐘</h2>
        <p className="muted prepared-note">{describeNext(shown, user.level, user.stage)}</p>

        {!user.hasApiKey ? (
          <p className="alert alert-warn">
            還沒有設定 Google API key,無法上新課。<Link to="/settings">前往設定</Link>
          </p>
        ) : waiting?.what === 'preparing' || (!waiting && prepared?.state === 'preparing') ? (
          <button type="button" className="button button-primary button-large" disabled>
            {TEACHER_NAME}正在備課…
          </button>
        ) : prepared?.state === 'none' ? (
          <button type="button" className="button button-primary button-large" onClick={prepare}>
            備課
          </button>
        ) : (
          <button type="button" className="button button-primary button-large" onClick={start} disabled={waiting !== null}>
            {!waiting ? '開始' : waiting.seconds > 0 ? `${TEACHER_NAME}正在備課…` : '正在開始…'}
          </button>
        )}

        {progressSeconds !== null && progressSeconds > 0 && <WaitProgress expectedSeconds={progressSeconds} />}
        <p className="muted small">課程長度依學習階段固定:國小 20 分鐘、國中 25 分鐘、高中與大學 30 分鐘。</p>

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
