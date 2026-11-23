import { useCallback, useEffect, useState } from 'react';
import type { PlacementAttempt, PlacementResult, PlacementStatus } from '../../../shared/api.ts';
import { nextQuestion, passMark, type PlacementAnswers, type PlacementQuestion } from '../../../shared/placement.ts';
import { LEVELS, type Level } from '../../../shared/schema.ts';
import { api, errorDetail, errorMessage } from '../api.ts';
import { WaitProgress } from '../components/WaitProgress.tsx';
import { speak, speechRate, stopSpeaking, ttsSupported } from '../speech/tts.ts';
import { useActiveUser, useUsers } from '../userContext.tsx';

const KIND_LABELS: Record<PlacementQuestion['kind'], string> = { vocab: '單字', grammar: '文法', reading: '閱讀', listening: '聽力' };

/** 分級測驗:隨時可以做。從 A1 開始一級一級作答,沒通過的那一級就是建議上課的等級。 */
export function Placement() {
  const user = useActiveUser();
  const { refresh } = useUsers();
  const [status, setStatus] = useState<PlacementStatus | null>(null);
  const [attempt, setAttempt] = useState<PlacementAttempt | null>(null);
  const [answers, setAnswers] = useState<PlacementAnswers>({});
  const [result, setResult] = useState<PlacementResult | null>(null);
  const [waitSeconds, setWaitSeconds] = useState<number | null>(null);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [switched, setSwitched] = useState(false);
  // 測驗開始時決定一次能不能朗讀,中途不變:聽力題的有無會影響每一級的題數與通過門檻。
  const [tts] = useState(ttsSupported);

  const loadStatus = useCallback(() => {
    api
      .getPlacement(user.id)
      .then(setStatus)
      .catch((err) => setError({ message: errorMessage(err) }));
  }, [user.id]);

  useEffect(() => {
    setAttempt(null);
    setResult(null);
    setAnswers({});
    loadStatus();
    return stopSpeaking;
  }, [loadStatus]);

  async function start() {
    setError(null);
    setSwitched(false);
    setWaitSeconds(status?.ready ? 0 : (status?.waitSeconds ?? 60));
    try {
      setAttempt(await api.startPlacement(user.id));
      setAnswers({});
      setResult(null);
    } catch (err) {
      setError({ message: errorMessage(err), detail: errorDetail(err) });
    } finally {
      setWaitSeconds(null);
    }
  }

  const question = attempt && !result ? nextQuestion(attempt.test, answers, tts) : null;

  // 沒有下一題了:交卷,由伺服器判分。
  useEffect(() => {
    if (!attempt || result || question) return;
    let cancelled = false;
    api
      .completePlacement(attempt.id, answers, tts)
      .then((done) => {
        if (cancelled) return;
        setResult(done);
        loadStatus();
      })
      .catch((err) => {
        if (!cancelled) setError({ message: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, result, question, answers, tts, loadStatus]);

  async function switchLevel(level: Level) {
    try {
      await api.updateUser(user.id, { level });
      await refresh();
      setSwitched(true);
    } catch (err) {
      setError({ message: errorMessage(err) });
    }
  }

  if (attempt && question) {
    const answered = Object.keys(answers).length;
    return (
      <section className="page lesson">
        <h1>分級測驗</h1>
        <p className="muted">
          第 {answered + 1} 題 · 目前在 {question.level} 這一級 · <span className="tag">{KIND_LABELS[question.kind]}</span>
        </p>
        <PlacementQuestionCard
          key={question.key}
          question={question}
          onAnswer={(index) => {
            stopSpeaking();
            setAnswers((current) => ({ ...current, [question.key]: index }));
          }}
        />
        <p className="muted small">每題只能作答一次,不會的請選最有可能的答案。這一級答完才會知道有沒有通過。</p>
        {attempt.repeatReason && (
          <p className="alert alert-warn">這次是和之前相同的內建題目({attempt.repeatReason})。題目看過了,結果可能比實際程度高。</p>
        )}
      </section>
    );
  }

  if (attempt && result) {
    return (
      <section className="page">
        <h1>分級測驗結果</h1>
        <div className="card">
          <p className="placement-level">
            建議的等級:<strong>{result.recommended}</strong>
          </p>
          <ResultTable result={result} />
          {switched ? (
            <p className="text-ok">已經切換到 {result.recommended}。下一堂課就會用這個等級。</p>
          ) : result.recommended === user.level ? (
            <p className="text-ok">和你現在的等級({user.level})相同,不需要調整。</p>
          ) : (
            <>
              <p>
                你現在的等級是 {user.level}。{LEVELS.indexOf(result.recommended) > LEVELS.indexOf(user.level) ? '測驗顯示你可以往上一點。' : '測驗顯示現在的等級可能偏難。'}
                要不要切換由你決定。
              </p>
              <div className="form-actions">
                <button type="button" className="button button-primary" onClick={() => void switchLevel(result.recommended)}>
                  切換到 {result.recommended}
                </button>
              </div>
            </>
          )}
          {error && <p className="alert alert-error">{error.message}</p>}
          <div className="form-actions">
            <button type="button" className="button" onClick={() => setAttempt(null)}>
              回到分級測驗
            </button>
          </div>
        </div>
      </section>
    );
  }

  const waiting = waitSeconds !== null;
  return (
    <section className="page">
      <h1>分級測驗</h1>
      <div className="card">
        <p>想知道現在適合在哪個等級上課,隨時可以來測。</p>
        <ul>
          <li>從 A1 開始,每個等級 8 題(單字、文法、閱讀、聽力),全部是選擇題。</li>
          <li>一個等級答對 6 題以上才會進到下一級;沒通過的那一級,就是建議上課的等級。</li>
          <li>程度越高題數越多,大約 5–15 分鐘。作答與判分都不耗 AI 額度,也不列入日曆分數。</li>
          <li>結果只是建議:要不要切換等級由你決定。這是粗略的分級,不是正式檢定。</li>
        </ul>
        {!tts && <p className="alert alert-warn">這個瀏覽器不能朗讀,所以這次沒有聽力題,每一級是 7 題、要答對 {passMark(7)} 題。</p>}
        {status?.repeatsBuiltin && <p className="alert alert-warn">還沒有設定 API key,老師沒辦法出新的題目,所以這次會是和之前相同的內建題目。</p>}
        {error && (
          <div className="alert alert-error">
            {error.message}
            {error.detail && <pre className="detail">{error.detail}</pre>}
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="button button-primary button-large" onClick={() => void start()} disabled={!status || waiting}>
            {waiting && waitSeconds > 0 ? 'Emma 老師正在出題…' : status?.inProgress ? '繼續上次的測驗(從第一題開始)' : '開始測驗'}
          </button>
          {status && !waiting && (status.ready ? <span className="tag tag-mastered">題目已備好</span> : <span className="muted small">題目還沒備好,按開始後要等老師出題。</span>)}
        </div>
        {waiting && waitSeconds > 0 && <WaitProgress expectedSeconds={waitSeconds} />}
      </div>

      {status && status.results.length > 0 && (
        <div className="card">
          <h2>做過的測驗</h2>
          <ul className="weak-list">
            {status.results.map((past) => (
              <li key={past.id}>
                <strong>{past.date}</strong>:建議 {past.recommended}(當時的等級是 {past.levelBefore})
                <div className="muted small">{past.bands.map((band) => `${band.level} ${band.correct}/${band.total}`).join(' · ')}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ResultTable({ result }: { result: PlacementResult }) {
  return (
    <table className="placement-table">
      <thead>
        <tr>
          <th>等級</th>
          <th>答對</th>
          <th>結果</th>
        </tr>
      </thead>
      <tbody>
        {result.bands.map((band) => (
          <tr key={band.level}>
            <td>{band.level}</td>
            <td>
              {band.correct} / {band.total}
            </td>
            <td>{band.passed ? <span className="text-ok">通過</span> : <span className="text-warn">沒通過(要答對 {passMark(band.total)} 題)</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 一題測驗題。閱讀題附短文;聽力題要先按播放,內容不顯示。只能作答一次,作答後不顯示對錯。 */
function PlacementQuestionCard({ question, onAnswer }: { question: PlacementQuestion; onAnswer: (index: number) => void }) {
  const [played, setPlayed] = useState(question.script === undefined);
  const rate = speechRate(question.level);

  return (
    <div className="exercise">
      {question.passage && <p className="placement-passage">{question.passage}</p>}
      {question.script && (
        <div className="exercise-actions">
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              setPlayed(true);
              speak(question.script!, { rate });
            }}
          >
            🔊 {played ? '再聽一次' : '播放'}
          </button>
          {!played && <span className="muted small">先聽一次,選項才會出現。可以重複聽。</span>}
        </div>
      )}
      <p className="exercise-prompt">{question.mcq.prompt}</p>
      {played && (
        <div className="options">
          {question.mcq.options.map((option, index) => (
            <button key={index} type="button" className="option" onClick={() => onAnswer(index)}>
              <span className="option-letter">{String.fromCharCode(65 + index)}</span>
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
