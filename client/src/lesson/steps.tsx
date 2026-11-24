import { useEffect, useState } from 'react';
import { countWords, type LessonExercise } from '../../../shared/lesson.ts';
import type { ChatTurn, ExerciseAnswer, Level, SessionState, SessionView } from '../../../shared/schema.ts';
import { api } from '../api.ts';
import { WaitProgress } from '../components/WaitProgress.tsx';
import { useSpeech } from '../speech/SpeechContext.tsx';
import { speak, speechRate } from '../speech/tts.ts';
import { conversationFinished } from './Conversation.tsx';
import { allDone, ExerciseSequence, FlagButton, type Flagging } from './ExerciseSequence.tsx';
import { LessonTalk } from './LessonTalk.tsx';
import { teacherLine, type LineKey } from './lines.ts';
import { Passage } from './Passage.tsx';
import { TeacherBubble } from './TeacherBubble.tsx';

export interface StepProps {
  session: SessionView;
  state: SessionState;
  /** 這堂課所有的客觀題(含暖身複習);各階段自己挑出屬於它的題目。 */
  exercises: LessonExercise[];
  onAnswer: (key: string, answer: ExerciseAnswer) => void;
  onNext: () => void;
  /** 下一個階段的名稱,顯示在「下一步」按鈕上。 */
  nextLabel: string;
  flagging: Flagging;
  /** 這是不是整堂課的第一個階段;是的話先顯示老師的開場白。 */
  showIntro: boolean;
}

const hasAnswer = (items: LessonExercise[], answers: Record<string, ExerciseAnswer>) => items.some((item) => answers[item.key]);

function NextButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="step-next">
      <button type="button" className="button button-primary button-large" onClick={onClick}>
        {label}
      </button>
    </div>
  );
}

/** 老師的一句固定台詞,出現時會朗讀。 */
function Line({ level, id }: { level: Level; id: LineKey }) {
  const text = teacherLine(level, id);
  return (
    <TeacherBubble speakText={text} rate={speechRate(level)}>
      {text}
    </TeacherBubble>
  );
}

function Intro({ session }: { session: SessionView }) {
  return (
    <TeacherBubble speakText={session.lesson.intro} rate={speechRate(session.level)}>
      {session.lesson.intro}
    </TeacherBubble>
  );
}

/** 暖身複習:之前不會或不熟、今天到期的項目。 */
export function ReviewStep({ session, state, exercises, onAnswer, onNext, nextLabel, showIntro }: StepProps) {
  const { level } = session;
  const items = exercises.filter((item) => item.section === 'review');
  const done = allDone(items, state.answers);

  return (
    <>
      {showIntro && <Intro session={session} />}
      <Line level={level} id="reviewIntro" />
      <ExerciseSequence items={items} answers={state.answers} level={level} onAnswer={onAnswer} showContext showKind />
      {done && (
        <>
          <Line level={level} id="reviewDone" />
          <NextButton label={`下一步:${nextLabel}`} onClick={onNext} />
        </>
      )}
    </>
  );
}

/** 聽力:先聽課文(不顯示文字),回答大意題,再做聽寫。 */
export function ListeningStep({ session, state, exercises, onAnswer, onNext, nextLabel, flagging, showIntro }: StepProps) {
  const { lesson, level } = session;
  const questions = exercises.filter((item) => item.section === 'listening' && item.exercise.type === 'mcq');
  const dictation = exercises.filter((item) => item.section === 'listening' && item.exercise.type === 'dictation');
  // 已經答過題表示之前聽過了,回到這堂課時不用再強制聽一次。
  const [listened, setListened] = useState(() => hasAnswer(questions, state.answers));
  const [playing, setPlaying] = useState(false);
  const questionsDone = allDone(questions, state.answers);
  const dictationDone = allDone(dictation, state.answers);

  function play() {
    setPlaying(true);
    setListened(true);
    speak(lesson.passage.text, { rate: speechRate(level), onEnd: () => setPlaying(false) });
  }

  return (
    <>
      {showIntro && <Intro session={session} />}
      <Line level={level} id="listenFirst" />
      <div className="listen-box">
        <button type="button" className="button button-primary button-large" onClick={play}>
          🔊 {listened ? '再聽一次' : '播放課文'}
        </button>
        <span className="muted">{playing ? '播放中…' : '這個階段不顯示文字,請專心聽。'}</span>
      </div>

      {listened && (
        <>
          <Line level={level} id="listeningQuestions" />
          <ExerciseSequence items={questions} answers={state.answers} level={level} onAnswer={onAnswer} flagging={flagging} />
        </>
      )}
      {questionsDone && (
        <>
          <Line level={level} id="dictationIntro" />
          <ExerciseSequence items={dictation} answers={state.answers} level={level} onAnswer={onAnswer} />
        </>
      )}
      {questionsDone && dictationDone && (
        <>
          <Line level={level} id="listeningDone" />
          <NextButton label={`下一步:${nextLabel}`} onClick={onNext} />
        </>
      )}
    </>
  );
}

export function ReadingStep({ session, state, exercises, onAnswer, onNext, nextLabel, flagging, showIntro }: StepProps) {
  const { lesson, level } = session;
  const items = exercises.filter((item) => item.section === 'reading');
  // 已經答過題表示之前讀過了,回到這堂課時不用再按一次「我讀完了」。
  const [finishedReading, setFinishedReading] = useState(() => hasAnswer(items, state.answers));
  const done = allDone(items, state.answers);

  return (
    <>
      {showIntro && <Intro session={session} />}
      <Line level={level} id={state.capabilities.tts ? 'readAfterListening' : 'readFirst'} />
      <Passage lesson={lesson} allowTranslation={done} flagging={flagging} />

      {!finishedReading && <NextButton label="我讀完了" onClick={() => setFinishedReading(true)} />}
      {finishedReading && (
        <>
          <Line level={level} id="readingQuestions" />
          <ExerciseSequence items={items} answers={state.answers} level={level} onAnswer={onAnswer} flagging={flagging} />
        </>
      )}
      {done && (
        <>
          <Line level={level} id="readingDone" />
          <NextButton label={`下一步:${nextLabel}`} onClick={onNext} />
        </>
      )}
    </>
  );
}

export function LanguageStep({ session, state, exercises, onAnswer, onNext, nextLabel, flagging }: StepProps) {
  const { lesson, level } = session;
  const vocabItems = exercises.filter((item) => item.section === 'language' && item.kind === 'vocab');
  const grammarItems = exercises.filter((item) => item.section === 'language' && item.kind === 'grammar');
  const [practising, setPractising] = useState(() => hasAnswer(vocabItems, state.answers));
  const vocabDone = allDone(vocabItems, state.answers);
  const grammarDone = allDone(grammarItems, state.answers);
  const { tts } = useSpeech();
  // 國小學生打字慢,單字題改成從今天的單字裡點選;要選對仍然得知道意思。
  const wordBank = session.stage === 'elementary' ? lesson.vocab.map((vocab) => vocab.word) : undefined;
  // 練習單字時把單字表收起來:看著表作答只是照抄,要自己回想才記得住。做完再顯示,方便對照與標記不熟。
  const wordsHidden = practising && !vocabDone;

  return (
    <>
      <Line level={level} id="vocabIntro" />
      {wordsHidden && <p className="vocab-hidden muted">單字表先收起來了,請靠自己回想。做完下面的單字練習,它會再出現。</p>}
      {!wordsHidden && (
        <div className="vocab-list">
          {lesson.vocab.map((vocab, index) => (
            <div key={vocab.word} className="vocab-card">
              <div className="vocab-head">
                <span>
                  <strong className="vocab-word">{vocab.word}</strong> <span className="muted">{vocab.pos}</span>
                  {tts && (
                    <button type="button" className="speak-button" onClick={() => speak(`${vocab.word}. ${vocab.example}`, { rate: speechRate(level) })} aria-label={`聽 ${vocab.word} 的發音`}>
                      🔊
                    </button>
                  )}
                </span>
                <FlagButton target={`vocab.${index}`} flagging={flagging} />
              </div>
              <div>{vocab.meaning}</div>
              <div className="vocab-example">{vocab.example}</div>
            </div>
          ))}
        </div>
      )}

      {!practising && <NextButton label="記住了,開始練習" onClick={() => setPractising(true)} />}
      {practising && (
        <>
          <Line level={level} id={wordBank ? 'vocabPick' : 'vocabPractice'} />
          <ExerciseSequence items={vocabItems} answers={state.answers} level={level} onAnswer={onAnswer} choices={wordBank} />
        </>
      )}

      {vocabDone && (
        <>
          <Line level={level} id="grammarIntro" />
          <TeacherBubble>
            <strong>{lesson.grammar.point}</strong>
            <p>{lesson.grammar.explanation}</p>
            <ul className="examples">
              {lesson.grammar.examples.map((example) => (
                <li key={example}>{example}</li>
              ))}
            </ul>
          </TeacherBubble>
          <Line level={level} id="grammarPractice" />
          <ExerciseSequence items={grammarItems} answers={state.answers} level={level} onAnswer={onAnswer} flagging={flagging} />
        </>
      )}

      {vocabDone && grammarDone && (
        <>
          <Line level={level} id="languageDone" />
          <NextButton label={`下一步:${nextLabel}`} onClick={onNext} />
        </>
      )}
    </>
  );
}

export interface SpeakingStepProps extends StepProps {
  chat: ChatTurn[];
  onChat: (message: string) => Promise<void>;
  onSkipChat: () => void;
  /** 對話紀錄由伺服器寫入;語音對話進行時,請外層重新讀一次。 */
  onChatRefresh: () => void;
}

/** 口說:跟讀課文句子(需要麥克風),再與老師做情境對話(預設用即時語音,也可以改用打字)。 */
export function SpeakingStep({ session, state, exercises, onAnswer, onNext, nextLabel, chat, onChat, onSkipChat, onChatRefresh }: SpeakingStepProps) {
  const { lesson, level } = session;
  const { stt } = useSpeech();
  const readAloud = exercises.filter((item) => item.section === 'speaking');
  // 麥克風不能用時跳過跟讀,這部分不計分。
  const readAloudDone = !stt || allDone(readAloud, state.answers);
  const chatDone = state.chatUnavailable || conversationFinished(session, chat);

  return (
    <>
      {stt ? (
        <>
          <Line level={level} id="readAloudIntro" />
          <ExerciseSequence items={readAloud} answers={state.answers} level={level} onAnswer={onAnswer} />
        </>
      ) : (
        <Line level={level} id="noMic" />
      )}

      {readAloudDone && (
        <>
          <Line level={level} id="conversationIntro" />
          <TeacherBubble>
            <strong>情境:</strong>
            {lesson.speaking.scenario}
          </TeacherBubble>
          {state.chatUnavailable ? (
            <p className="alert alert-warn">這堂課跳過了對話,口說的這一部分不計分。</p>
          ) : (
            <LessonTalk session={session} chat={chat} onSend={onChat} onSkip={onSkipChat} onRefresh={onChatRefresh} />
          )}
        </>
      )}

      {readAloudDone && chatDone && (
        <>
          <Line level={level} id="speakingDone" />
          <NextButton label={`下一步:${nextLabel}`} onClick={onNext} />
        </>
      )}
    </>
  );
}

export interface WritingStepProps {
  session: SessionView;
  writing: string;
  submitting: boolean;
  onWriting: (text: string) => void;
  onSubmit: () => void;
}

export function WritingStep({ session, writing, submitting, onWriting, onSubmit }: WritingStepProps) {
  const { lesson, level } = session;
  const words = countWords(writing);
  const enough = words >= lesson.writing.minWords;
  // 批改預估要等幾秒(由過去實際花費的時間推估),用來顯示進度條。查不到就不顯示進度條。
  const [gradeSeconds, setGradeSeconds] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getTimings()
      .then((timings) => {
        if (!cancelled) setGradeSeconds(timings.grade);
      })
      .catch(() => {
        // 沒有預估時間不影響交卷。
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function submit() {
    if (words === 0 && !window.confirm('你還沒有寫任何內容。沒有交寫作的話,寫作這一項會是 0 分。確定要直接結束嗎?')) return;
    if (words > 0 && !enough && !window.confirm(`目前 ${words} 個字,還不到建議的 ${lesson.writing.minWords} 個字,分數可能會比較低。確定要交了嗎?`)) return;
    onSubmit();
  }

  return (
    <>
      <Line level={level} id="writingIntro" />
      <TeacherBubble>
        <strong>{lesson.writing.prompt}</strong>
        {lesson.writing.tips.length > 0 && (
          <ul className="examples">
            {lesson.writing.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        )}
      </TeacherBubble>

      <div className="writing-box">
        <textarea
          value={writing}
          onChange={(e) => onWriting(e.target.value)}
          rows={8}
          maxLength={5000}
          disabled={submitting}
          placeholder="Write here in English…"
          spellCheck={false}
          aria-label="寫作內容"
        />
        <div className="writing-meta">
          <span className={enough ? 'text-ok' : 'muted'}>
            {words} / {lesson.writing.minWords} 字
          </span>
          <span className="muted small">請不要寫出真實姓名、地址等個人資料。</span>
        </div>
      </div>

      <div className="step-next">
        <button type="button" className="button button-primary button-large" onClick={submit} disabled={submitting}>
          {submitting ? 'Emma 老師正在批改…' : '交給老師批改'}
        </button>
      </div>
      {submitting && gradeSeconds !== null && gradeSeconds > 0 && <WaitProgress expectedSeconds={gradeSeconds} />}
    </>
  );
}
