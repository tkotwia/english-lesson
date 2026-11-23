import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { LengthStatus, PreparedStatus } from '../../../shared/api.ts';
import { LESSON_MINUTES, type Level, type Minutes, type SessionView } from '../../../shared/schema.ts';
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

const MINUTES_HINT: Record<Minutes, string> = { 20: '精簡', 30: '標準', 40: '加強' };

/** 還沒自己選過長度時的預設:先挑可以馬上開始的,依這個順序;都不能馬上開始就選標準的 30 分鐘。 */
const DEFAULT_ORDER: readonly Minutes[] = [30, 20, 40];

/** 查不到備課狀態時用的預估等待秒數(與伺服器沒有紀錄時的預設值相同)。 */
const FALLBACK_WAIT_SECONDS = 60;

/** 選定的長度現在是什麼狀況、按下開始會怎樣。 */
function describeLength(length: LengthStatus | undefined, level: Level): string {
  if (!length) return `按「開始」後,${TEACHER_NAME}會依你的等級(${level})備課。`;
  if (length.source === 'starter') return `這是 ${level} 的起始課(內建的第一堂 ${length.minutes} 分鐘課),按「開始」馬上上課,不用等。`;
  if (length.state === 'ready') return `這堂 ${level} 的 ${length.minutes} 分鐘課已經備好,按「開始」馬上上課,不用等。`;
  if (length.state === 'preparing') {
    return `${TEACHER_NAME}正在背景準備這堂課。現在按「開始」預估要等 ${formatSeconds(length.waitSeconds)};也可以等它顯示「已備好」再開始。`;
  }
  return `${length.minutes} 分鐘還沒有備好的課。按「開始」後${TEACHER_NAME}會現場備課,預估要等 ${formatSeconds(length.waitSeconds)}。`;
}

function StartPanel({ onStarted }: { onStarted: (session: SessionView) => void }) {
  const user = useActiveUser();
  const [minutes, setMinutes] = useState<Minutes>(30);
  // 按下開始之後預估要等幾秒;null 表示還沒按。0 表示課已經備好,不需要進度條。
  const [waitSeconds, setWaitSeconds] = useState<number | null>(null);
  const [error, setError] = useState<{ message: string; detail?: string; quota: boolean } | null>(null);
  // 各種長度的課有沒有備好;備好的可以馬上開始。
  const [prepared, setPrepared] = useState<PreparedStatus | null>(null);
  const pickedDefault = useRef(false);
  const starting = waitSeconds !== null;

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
          if (status.lengths.some((length) => length.state === 'preparing')) timer = window.setTimeout(load, 3000);
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
  }, [user.id, user.level, user.stage]);

  // 第一次拿到備課狀態時,預設選一個可以馬上開始的長度。只做一次,之後不會自己跳到別的選項。
  useEffect(() => {
    if (!prepared || pickedDefault.current) return;
    pickedDefault.current = true;
    const ready = DEFAULT_ORDER.find((value) => prepared.lengths.some((length) => length.minutes === value && length.state === 'ready'));
    if (ready) setMinutes(ready);
  }, [prepared]);

  const statusOf = (value: Minutes) => prepared?.lengths.find((length) => length.minutes === value);
  const selected = statusOf(minutes);

  async function start() {
    setWaitSeconds(selected ? selected.waitSeconds : FALLBACK_WAIT_SECONDS);
    setError(null);
    try {
      onStarted(await api.startSession(user.id, minutes));
    } catch (err) {
      setError({ message: errorMessage(err), detail: errorDetail(err), quota: errorCode(err) === 'quota' });
      setWaitSeconds(null);
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
                // 自己選過之後,就不再替他改成預設的長度。
                pickedDefault.current = true;
              }}
              disabled={starting}
            >
              <strong>{value} 分鐘</strong>
              <small>{MINUTES_HINT[value]}</small>
              {statusOf(value)?.state === 'ready' && <span className="tag tag-mastered">已備好</span>}
              {statusOf(value)?.state === 'preparing' && <span className="tag">準備中</span>}
            </button>
          ))}
        </div>
        <p className="muted prepared-note">
          {describeLength(selected, user.level)} 開始上課後,{TEACHER_NAME}會在背景把之後各種長度的課先備好。
        </p>

        {!user.hasApiKey ? (
          <p className="alert alert-warn">
            還沒有設定 Google API key,無法上新課。<Link to="/settings">前往設定</Link>
          </p>
        ) : (
          <button type="button" className="button button-primary button-large" onClick={start} disabled={starting}>
            {!starting ? '開始' : waitSeconds > 0 ? `${TEACHER_NAME}正在備課…` : '正在開始…'}
          </button>
        )}

        {starting && waitSeconds > 0 && <WaitProgress expectedSeconds={waitSeconds} />}

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
