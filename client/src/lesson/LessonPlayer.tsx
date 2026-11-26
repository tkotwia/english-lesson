import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { LessonAudioInfo } from '../../../shared/api.ts';
import { lessonExercises, reviewExercises } from '../../../shared/lesson.ts';
import { SECTION_LABELS, type ExerciseAnswer, type Section, type SessionState, type SessionView } from '../../../shared/schema.ts';
import { api, errorDetail, errorMessage } from '../api.ts';
import { SpeechProvider, type SpeechAbility } from '../speech/SpeechContext.tsx';
import { sttSupported } from '../speech/stt.ts';
import { autoSpeakEnabled, setAutoSpeak, setRecordings, stopSpeaking, ttsSupported } from '../speech/tts.ts';
import { AskTeacher } from './AskTeacher.tsx';
import { FluencyStep } from './FluencyStep.tsx';
import { LanguageStep, ListeningStep, ReadingStep, ReviewStep, SpeakingStep, WritingStep } from './steps.tsx';

const WRITING_SAVE_DELAY_MS = 800;
/** 伺服器還在製作聽力音檔時,多久再問一次有沒有新做好的。 */
const AUDIO_POLL_MS = 15_000;

/** 課堂的階段:計分的六個部分,加上課前不計分的「重溫上一課」。 */
type StepId = 'fluency' | Section;
const STEP_LABELS: Record<StepId, string> = { fluency: '重溫上一課', ...SECTION_LABELS };

/**
 * 這堂課要上哪些階段。
 * 之前上過別的課才有重溫(重上的課不重溫,保持簡短);沒有到期的複習項目就沒有暖身複習;瀏覽器不能朗讀就沒有聽力。
 */
function stepsFor(session: SessionView, tts: boolean): StepId[] {
  return [
    ...(session.previous && session.retakeOf === null ? (['fluency'] as const) : []),
    ...(session.review.length > 0 ? (['review'] as const) : []),
    ...(tts ? (['listening'] as const) : []),
    'reading',
    'language',
    'speaking',
    'writing',
  ];
}

/** 還沒開始作答:這時才依瀏覽器的能力決定要不要有聽力與跟讀,開始之後就固定下來。 */
function notStarted(state: SessionState): boolean {
  return state.step === 0 && Object.keys(state.answers).length === 0 && !state.chat.some((turn) => turn.role === 'student');
}

interface Props {
  session: SessionView;
  onAbandoned: () => void;
}

export function LessonPlayer({ session, onAbandoned }: Props) {
  const navigate = useNavigate();
  const [state, setState] = useState<SessionState>(() => {
    const detected = { tts: ttsSupported(), stt: sttSupported() };
    return notStarted(session.state) ? { ...session.state, capabilities: detected } : session.state;
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{ message: string; detail?: string } | null>(null);
  const [autoSpeak, setAutoSpeakState] = useState(autoSpeakEnabled);

  const exercises = useMemo(() => [...reviewExercises(session.review), ...lessonExercises(session.lesson)], [session.lesson, session.review]);
  const steps = useMemo(() => stepsFor(session, state.capabilities.tts), [session, state.capabilities.tts]);
  const stepIndex = Math.min(state.step, steps.length - 1);
  const step = steps[stepIndex]!;

  // 存檔一律送出最新的完整進度,並依序進行,避免較舊的進度蓋掉較新的。
  const latest = useRef(state);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const writingTimer = useRef<number | undefined>(undefined);

  const save = useCallback(() => {
    window.clearTimeout(writingTimer.current);
    saveChain.current = saveChain.current
      .then(() => api.saveSessionState(session.id, latest.current))
      .then(() => setSaveError(null))
      .catch((err) => setSaveError(errorMessage(err)));
    return saveChain.current;
  }, [session.id]);

  const update = useCallback(
    (patch: Partial<SessionState>, mode: 'now' | 'debounced' | 'local' = 'now') => {
      latest.current = { ...latest.current, ...patch };
      setState(latest.current);
      if (mode === 'now') {
        void save();
      } else if (mode === 'debounced') {
        window.clearTimeout(writingTimer.current);
        writingTimer.current = window.setTimeout(() => void save(), WRITING_SAVE_DELAY_MS);
      }
    },
    [save],
  );

  useEffect(
    () => () => {
      window.clearTimeout(writingTimer.current);
      stopSpeaking();
      setRecordings({});
    },
    [],
  );

  // 聽力課文與聽寫句子:伺服器在背景用自然的聲音唸好的音檔。進入這堂課、每換一個步驟,都請伺服器把還缺的做出來;
  // 伺服器還在製作時每隔一段時間再問有沒有新的。還沒做好或問不到的,朗讀時自動改用瀏覽器的聲音。
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const load = (ask: (sessionId: number) => Promise<LessonAudioInfo>) => {
      ask(session.id)
        .then(({ clips, working }) => {
          if (cancelled) return;
          setRecordings(clips);
          if (working) timer = window.setTimeout(() => load(api.getLessonAudio), AUDIO_POLL_MS);
        })
        .catch(() => {
          // 問不到就維持現狀;沒有音檔的內容由瀏覽器朗讀。
        });
    };
    load(api.prepareLessonAudio);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [session.id, stepIndex]);

  // 把偵測到的語音能力存起來,計分時才知道哪些部分沒辦法進行。
  useEffect(() => {
    const stored = session.state.capabilities;
    if (stored.tts !== state.capabilities.tts || stored.stt !== state.capabilities.stt) void save();
    // 只在進入這堂課時檢查一次。
  }, []);

  const onAnswer = (key: string, answer: ExerciseAnswer) => update({ answers: { ...latest.current.answers, [key]: answer } });

  // 「我不熟」、對話、問老師都由伺服器寫入並回傳最新內容;這裡只更新畫面,不需要再存一次。
  const onFlag = (target: string) => {
    api
      .flagSession(session.id, target)
      .then(({ flags }) => {
        update({ flags }, 'local');
        setSaveError(null);
      })
      .catch((err) => setSaveError(errorMessage(err)));
  };
  const onChat = async (message: string) => {
    const { chat } = await api.chatSession(session.id, message);
    update({ chat }, 'local');
  };
  // 語音對話的紀錄由伺服器依聽到的內容寫入;每進行一輪就重新讀一次,畫面與「對話是否完成」才會跟上。
  const onChatRefresh = () => {
    api
      .getSession(session.id)
      .then((fresh) => update({ chat: fresh.state.chat }, 'local'))
      .catch((err) => setSaveError(errorMessage(err)));
  };
  const onAsk = async (question: string) => {
    const { asks } = await api.askSession(session.id, question);
    update({ asks }, 'local');
  };

  const speech = useMemo<SpeechAbility>(
    () => ({
      tts: state.capabilities.tts,
      stt: state.capabilities.stt,
      // 麥克風確定不能用:之後跳過跟讀,對話改用打字,跟讀不計分。
      disableStt: () => update({ capabilities: { ...latest.current.capabilities, stt: false } }),
    }),
    [state.capabilities.tts, state.capabilities.stt, update],
  );

  // 換階段時回到頁面頂端;階段內有新內容出現時捲到最下面,像聊天一樣。
  const endRef = useRef<HTMLDivElement>(null);
  const progress = Object.values(state.answers).reduce((sum, answer) => sum + answer.attempts.length + (answer.hintUsed ? 1 : 0), 0) + state.chat.length;
  const firstRender = useRef(true);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    stopSpeaking();
  }, [stepIndex]);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [progress]);

  async function complete() {
    setSubmitting(true);
    setSubmitError(null);
    window.clearTimeout(writingTimer.current);
    try {
      await saveChain.current;
      const done = await api.completeSession(session.id, latest.current);
      navigate(`/sessions/${done.id}`);
    } catch (err) {
      setSubmitError({ message: errorMessage(err), detail: errorDetail(err) });
      setSubmitting(false);
    }
  }

  async function abandon() {
    if (!window.confirm('確定要放棄這堂課嗎?目前的作答不會保留,也不會計分。')) return;
    try {
      window.clearTimeout(writingTimer.current);
      await saveChain.current;
      await api.abandonSession(session.id);
      onAbandoned();
    } catch (err) {
      setSaveError(errorMessage(err));
    }
  }

  function toggleAutoSpeak() {
    setAutoSpeak(!autoSpeak);
    setAutoSpeakState(!autoSpeak);
  }

  const nextStep = steps[stepIndex + 1];
  const stepProps = {
    session,
    state,
    exercises,
    onAnswer,
    onNext: () => update({ step: stepIndex + 1 }),
    nextLabel: nextStep ? STEP_LABELS[nextStep] : '',
    flagging: { flags: state.flags, onFlag },
    showIntro: stepIndex === 0,
  };

  return (
    <SpeechProvider value={speech}>
      <section className="lesson">
        <header className="lesson-header">
          <div>
            <h1>{session.lesson.title}</h1>
            <span className="muted">
              {session.level} · {session.minutes} 分鐘課程
            </span>
            {session.retakeOf !== null && <span className="tag tag-unfamiliar retake-tag">重上(練習,不計入日曆)</span>}
          </div>
          <div className="lesson-tools">
            {state.capabilities.tts && (
              <label className="toggle">
                <input type="checkbox" checked={autoSpeak} onChange={toggleAutoSpeak} />
                自動朗讀老師的話
              </label>
            )}
            <button type="button" className="link-danger" onClick={abandon} disabled={submitting}>
              放棄這堂課
            </button>
          </div>
        </header>

        <ol className="steps" aria-label="課程進度">
          {steps.map((id, index) => (
            <li key={id} className={index === stepIndex ? 'is-current' : index < stepIndex ? 'is-done' : ''}>
              <span className="step-dot">{index < stepIndex ? '✓' : index + 1}</span>
              {STEP_LABELS[id]}
            </li>
          ))}
        </ol>

        {saveError && <p className="alert alert-error">進度沒有存成功:{saveError}</p>}

        <div className="thread">
          {step === 'fluency' && (
            <FluencyStep
              key="fluency"
              session={session}
              state={state}
              onFluency={(record) => update({ fluency: { ...latest.current.fluency, ...record } })}
              onNext={stepProps.onNext}
              nextLabel={stepProps.nextLabel}
              showIntro={stepProps.showIntro}
            />
          )}
          {step === 'review' && <ReviewStep key="review" {...stepProps} />}
          {step === 'listening' && <ListeningStep key="listening" {...stepProps} />}
          {step === 'reading' && <ReadingStep key="reading" {...stepProps} />}
          {step === 'language' && <LanguageStep key="language" {...stepProps} />}
          {step === 'speaking' && (
            <SpeakingStep
              key="speaking"
              {...stepProps}
              chat={state.chat}
              onChat={onChat}
              onSkipChat={() => update({ chatUnavailable: true })}
              onChatRefresh={onChatRefresh}
            />
          )}
          {step === 'writing' && (
            <WritingStep
              session={session}
              writing={state.writing}
              talked={state.chat.some((turn) => turn.role === 'student')}
              submitting={submitting}
              onWriting={(text) => update({ writing: text }, 'debounced')}
              onSubmit={complete}
            />
          )}
          {submitError && (
            <div className="alert alert-error">
              {submitError.message}
              <br />
              你的作答已經保留,可以稍後再按一次「交給老師批改」。
              {submitError.detail && <pre className="detail">{submitError.detail}</pre>}
            </div>
          )}
          <div ref={endRef} />
        </div>

        <AskTeacher asks={state.asks} onAsk={onAsk} />
      </section>
    </SpeechProvider>
  );
}
