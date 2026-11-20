import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { KIND_LABELS, OUTCOME_LABELS, SECTION_LABELS, type LessonNovelty, type SessionView, type WeakPoint } from '../../../shared/schema.ts';
import { api, errorMessage } from '../api.ts';
import { FlagButton } from '../lesson/ExerciseSequence.tsx';
import { TeacherBubble } from '../lesson/TeacherBubble.tsx';

export function SessionSummary() {
  const { id } = useParams();
  const [session, setSession] = useState<SessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flags, setFlags] = useState<string[]>([]);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [retaking, setRetaking] = useState(false);
  const [retakeError, setRetakeError] = useState<string | null>(null);
  const navigate = useNavigate();

  // 重上:用同一份課文與題目開一堂新的練習,然後直接進入上課畫面。
  const retake = () => {
    setRetaking(true);
    setRetakeError(null);
    api
      .retakeSession(Number(id))
      .then(() => navigate('/lesson'))
      .catch((err) => {
        setRetakeError(errorMessage(err));
        setRetaking(false);
      });
  };

  const onFlag = (target: string) => {
    api
      .flagSession(Number(id), target)
      .then((updated) => {
        setFlags(updated.flags);
        setFlagError(null);
      })
      .catch((err) => setFlagError(errorMessage(err)));
  };

  useEffect(() => {
    let cancelled = false;
    setSession(null);
    api
      .getSession(Number(id))
      .then((loaded) => {
        if (cancelled) return;
        setSession(loaded);
        setFlags(loaded.state.flags);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <p className="alert alert-error">{error}</p>;
  if (!session) return <p className="muted center">載入中…</p>;
  if (!session.result) return <Navigate to="/lesson" replace />;

  const { result, lesson } = session;
  const unknown = result.weakPoints.filter((point) => point.outcome === 'unknown');
  const unfamiliar = result.weakPoints.filter((point) => point.outcome === 'unfamiliar');

  return (
    <section className="page">
      <h1>課程結果</h1>
      <p className="muted">
        {session.localDate} · {lesson.title} · {session.level}
      </p>

      {session.retakeOf !== null && (
        <p className="alert alert-warn">
          這是重上的課,只當練習:分數不計入日曆與月平均,不會與不熟的項目照常更新。
          <Link to={`/sessions/${session.retakeOf}`}> 查看原本那一堂的結果</Link>
        </p>
      )}

      <div className="card score-card">
        <div className="score-big" aria-label={`總分 ${result.score} 分`}>
          <strong>{Math.round(result.score)}</strong>
          <span>分</span>
        </div>
        <div className="score-sections">
          {result.sections.map((section) => (
            <div key={section.section} className="score-row">
              <span className="score-label">{SECTION_LABELS[section.section]}</span>
              <span className="bar" aria-hidden="true">
                <span className="bar-fill" style={{ width: `${section.percent}%` }} />
              </span>
              <span className="score-value">{Math.round(section.percent)}%</span>
            </div>
          ))}
          <p className="muted small">總分依各項配分加權:{result.sections.map((s) => `${SECTION_LABELS[s.section]} ${Math.round(s.weight)}`).join('、')}。</p>
        </div>
      </div>

      <TeacherBubble>{result.closing}</TeacherBubble>

      <div className="card">
        <h2>這堂課不會與不熟的地方</h2>
        {result.weakPoints.length === 0 ? (
          <p className="text-ok">這堂課沒有不會或不熟的地方,太棒了!</p>
        ) : (
          <>
            <WeakList title={OUTCOME_LABELS.unknown} points={unknown} tone="unknown" />
            <WeakList title={OUTCOME_LABELS.unfamiliar} points={unfamiliar} tone="unfamiliar" />
          </>
        )}
      </div>

      <div className="card">
        <h2>這堂課的單字</h2>
        <p className="muted">答對了但還是沒把握?按「我不熟」,明天的暖身複習會再出現。</p>
        {flagError && <p className="alert alert-error">{flagError}</p>}
        <ul className="weak-list">
          {lesson.vocab.map((vocab, index) => (
            <li key={vocab.word} className="vocab-row">
              <span>
                <strong>{vocab.word}</strong> <span className="muted">{vocab.pos}</span> {vocab.meaning}
              </span>
              <FlagButton target={`vocab.${index}`} flagging={{ flags, onFlag }} />
            </li>
          ))}
        </ul>
      </div>

      {result.speaking && (
        <div className="card">
          <h2>情境對話({Math.round(result.speaking.score)} 分)</h2>
          <div className="transcript">
            {session.state.chat.map((turn, index) => (
              <p key={index} className={turn.role === 'student' ? 'transcript-student' : 'transcript-teacher'}>
                <strong>{turn.role === 'student' ? '你' : 'Emma'}:</strong>
                {turn.text}
              </p>
            ))}
          </div>
          <h3>老師的評語</h3>
          <p>{result.speaking.comment}</p>
        </div>
      )}

      {result.writing && (
        <div className="card">
          <h2>寫作批改({Math.round(result.writing.score)} 分)</h2>
          <h3>你寫的</h3>
          <p className="writing-text">{session.state.writing}</p>
          <h3>修改後</h3>
          <p className="writing-text writing-corrected">{result.writing.corrected}</p>
          <h3>老師的評語</h3>
          <p>{result.writing.comment}</p>
        </div>
      )}

      <div className="card">
        <h2>重上這堂課</h2>
        <p className="muted">
          用同一份課文與題目再上一次。重上只當練習,分數不計入日曆與月平均;不需要 AI 重新備課,只有對話與批改會用到額度。
        </p>
        {session.retakes.length > 0 && (
          <ul className="retake-list">
            {session.retakes.map((item, index) => (
              <li key={item.id}>
                第 {index + 1} 次重上({item.date}):<strong>{Math.round(item.score)} 分</strong>
                <Link to={`/sessions/${item.id}`}>查看結果</Link>
              </li>
            ))}
          </ul>
        )}
        {retakeError && <p className="alert alert-error">{retakeError}</p>}
        <button type="button" className="button" onClick={retake} disabled={retaking}>
          {retaking ? '準備中…' : '重上這堂課'}
        </button>
      </div>

      {session.novelty && <NoveltyCard novelty={session.novelty} />}

      <div className="form-actions">
        <Link to="/" className="button button-primary">
          回首頁
        </Link>
      </div>
    </section>
  );
}

/** 產生這堂課時,程式和先前的課比對的結果:讓人看得到「有沒有重覆」,而不是只能相信 AI。 */
function NoveltyCard({ novelty }: { novelty: LessonNovelty }) {
  const percent = Math.round(novelty.passageSimilarity * 100);
  return (
    <div className="card novelty">
      <h2>重覆檢查</h2>
      {novelty.compared === 0 ? (
        <p className="muted">這是第一堂課,沒有先前的課可以比對。</p>
      ) : (
        <ul>
          <li>
            產生這堂課時,程式比對了先前的 {novelty.compared} 堂課。
            {novelty.similarTo ? (
              <>
                課文最像的是 {novelty.similarTo.date} 的「{novelty.similarTo.title}」,相似度 <strong>{percent}%</strong>。
              </>
            ) : (
              <>課文和它們沒有任何相同的片段。</>
            )}
          </li>
          <li>
            {novelty.repeatedVocab.length === 0
              ? '重點單字都是以前沒教過的。'
              : `以前教過、這次又出現的重點單字:${novelty.repeatedVocab.join('、')}。`}
          </li>
          {novelty.regenerated && <li>第一次產生的課文和舊課幾乎相同,程式已經要求 AI 重新產生一次,這是重新產生後的結果。</li>}
          {!novelty.regenerated && percent >= 50 && <li className="text-warn">課文和舊課很像,但重新產生沒有成功,所以沿用了這一份。</li>}
        </ul>
      )}
      <p className="muted small">相似度的算法:兩篇課文中「連續三個字」的片段有多少比例相同。同主題但重寫過的課文通常低於 10%,達 50% 會重新產生。</p>
    </div>
  );
}

function WeakList({ title, points, tone }: { title: string; points: WeakPoint[]; tone: 'unknown' | 'unfamiliar' }) {
  if (points.length === 0) return null;
  return (
    <div className="weak-group">
      <h3>
        <span className={`tag tag-${tone}`}>{title}</span> {points.length} 項
      </h3>
      <ul className="weak-list">
        {points.map((point, index) => (
          <li key={point.key ?? `ai-${index}`}>
            <div>
              <span className="tag">{KIND_LABELS[point.kind]}</span> <strong>{point.label}</strong>
            </div>
            <div className="weak-answer">→ {point.answer}</div>
            <div className="muted small">{point.explanation}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
