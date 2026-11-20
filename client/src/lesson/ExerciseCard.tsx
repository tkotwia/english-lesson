import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { correctAnswerText, FLASHCARD_FORGOT, FLASHCARD_KNOWN, reorderWords, type Exercise } from '../../../shared/lesson.ts';
import { BLANK, type ExerciseAnswer, type Level } from '../../../shared/schema.ts';
import { ACCURACY_CORRECT, checkAnswer, gradeExercise, isExerciseDone, wordAccuracy } from '../../../shared/scoring.ts';
import { useSpeech } from '../speech/SpeechContext.tsx';
import { isMicUnavailable, listen, sttErrorMessage, type Listening } from '../speech/stt.ts';
import { speak, speechRate } from '../speech/tts.ts';
import { praise, teacherLine } from './lines.ts';

interface Props {
  exerciseKey: string;
  exercise: Exercise;
  answer: ExerciseAnswer | undefined;
  level: Level;
  onChange: (answer: ExerciseAnswer) => void;
  /** 克漏字的候選字。有提供時改成用點選的,不用打字(給國小學生)。 */
  choices?: string[];
}

const EMPTY: ExerciseAnswer = { attempts: [], hintUsed: false };

/** 一題練習:最多作答兩次(閃卡一次),作答完畢後顯示結果與老師的講解。 */
export function ExerciseCard({ exerciseKey, exercise, answer = EMPTY, level, onChange, choices }: Props) {
  const done = isExerciseDone(exercise, answer);
  const submit = (response: string) => {
    if (done) return;
    onChange({ ...answer, attempts: [...answer.attempts, response] });
  };
  const retrying = !done && answer.attempts.length > 0;
  // 沒有朗讀或麥克風時,聽寫與跟讀改由學生自評:記得算全對,不熟算兩次都沒過。
  const selfRate = (known: boolean) => {
    if (exercise.type !== 'dictation' && exercise.type !== 'readAloud') return;
    onChange({ attempts: known ? [exercise.sentence] : ['', ''], hintUsed: false });
  };

  return (
    <div className={`exercise${done ? ' is-done' : ''}`} data-key={exerciseKey}>
      {exercise.type === 'mcq' && <McqBody exercise={exercise} answer={answer} done={done} onSubmit={submit} />}
      {exercise.type === 'cloze' && (
        <ClozeBody exercise={exercise} answer={answer} done={done} onSubmit={submit} onHint={() => onChange({ ...answer, hintUsed: true })} choices={choices} />
      )}
      {exercise.type === 'reorder' && <ReorderBody exercise={exercise} answer={answer} done={done} onSubmit={submit} />}
      {exercise.type === 'flashcard' && <FlashcardBody exercise={exercise} done={done} onSubmit={submit} />}
      {exercise.type === 'dictation' && <DictationBody exercise={exercise} answer={answer} done={done} level={level} onSubmit={submit} onSelfRate={selfRate} />}
      {exercise.type === 'readAloud' && <ReadAloudBody exercise={exercise} answer={answer} done={done} level={level} onSubmit={submit} onSelfRate={selfRate} />}

      {retrying && <p className="feedback feedback-retry">{teacherLine(level, 'retry')}</p>}
      {done && <Result exerciseKey={exerciseKey} exercise={exercise} answer={answer} />}
    </div>
  );
}

function Result({ exerciseKey, exercise, answer }: { exerciseKey: string; exercise: Exercise; answer: ExerciseAnswer }) {
  const { outcome } = gradeExercise(exercise, answer);
  if (exercise.type === 'flashcard') {
    return (
      <div className={`feedback feedback-${outcome}`}>
        <strong>{outcome === 'correct' ? '✓ 記得,很好!' : '✗ 沒關係,這個項目明天會再出現。'}</strong>
      </div>
    );
  }
  if (exercise.type === 'dictation' || exercise.type === 'readAloud') {
    const best = Math.max(0, ...answer.attempts.map((attempt) => wordAccuracy(exercise.sentence, attempt)));
    return (
      <div className={`feedback feedback-${outcome}`}>
        {outcome === 'correct' && <strong>✓ {praise(exerciseKey)}</strong>}
        {outcome === 'unfamiliar' && <strong>◐ {best >= ACCURACY_CORRECT ? '第二次才達標' : '差一點'}!這句會列入「不熟」,之後再練一次。</strong>}
        {outcome === 'unknown' && <strong>✗ 這句會列入「不會」,之後會再出現。</strong>}
        <p>
          單字正確率 {Math.round(best * 100)}%
          {(exercise.type === 'dictation' || outcome !== 'correct') && <>。正確的句子:{exercise.sentence}</>}
        </p>
      </div>
    );
  }
  return (
    <div className={`feedback feedback-${outcome}`}>
      {outcome === 'correct' && <strong>✓ {praise(exerciseKey)}</strong>}
      {outcome === 'unfamiliar' && <strong>◐ 答對了,不過這題會列入「不熟」,之後再複習一次。</strong>}
      {outcome === 'unknown' && (
        <strong>
          ✗ 正確答案:{correctAnswerText(exercise)}
          <br />
          這題會列入「不會」,之後會再出現。
        </strong>
      )}
      {exercise.explanation && <p>{exercise.explanation}</p>}
    </div>
  );
}

type SpokenExercise = Extract<Exercise, { type: 'dictation' | 'readAloud' }>;

interface SpokenBodyProps {
  exercise: SpokenExercise;
  answer: ExerciseAnswer;
  done: boolean;
  level: Level;
  onSubmit: (response: string) => void;
  onSelfRate: (known: boolean) => void;
}

/** 上一次作答的內容與正確率,讓學生知道差在哪裡。 */
function LastAttempt({ exercise, answer, label }: { exercise: SpokenExercise; answer: ExerciseAnswer; label: string }) {
  const last = answer.attempts.at(-1);
  if (last === undefined) return null;
  return (
    <p className="last-attempt">
      {label}:{last || '(沒有內容)'}
      <span className="muted">(單字正確率 {Math.round(wordAccuracy(exercise.sentence, last) * 100)}%)</span>
    </p>
  );
}

function SelfRate({ note, onSelfRate }: { note: string; onSelfRate: (known: boolean) => void }) {
  return (
    <>
      <p className="hint">{note}</p>
      <div className="exercise-actions">
        <button type="button" className="button button-primary" onClick={() => onSelfRate(true)}>
          我可以
        </button>
        <button type="button" className="button" onClick={() => onSelfRate(false)}>
          還不熟
        </button>
      </div>
    </>
  );
}

/** 聽寫:聽老師唸一句,把聽到的打出來。 */
function DictationBody({ exercise, answer, done, level, onSubmit, onSelfRate }: SpokenBodyProps) {
  const { tts } = useSpeech();
  const [draft, setDraft] = useState('');
  const play = () => speak(exercise.sentence, { rate: speechRate(level) });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    onSubmit(draft.trim());
    setDraft('');
  }

  if (!tts && !done) {
    return (
      <>
        <p className="exercise-prompt">{exercise.sentence}</p>
        <SelfRate note="這個瀏覽器無法朗讀,改成自己評量:蓋住句子,你能把它完整寫出來嗎?" onSelfRate={onSelfRate} />
      </>
    );
  }

  return (
    <form onSubmit={submit}>
      <p className="exercise-prompt">聽寫:把聽到的句子打出來</p>
      <LastAttempt exercise={exercise} answer={answer} label="你打的" />
      {!done && (
        <>
          <div className="exercise-actions">
            <button type="button" className="button" onClick={play}>
              🔊 播放句子
            </button>
          </div>
          <input
            className="dictation-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Type what you hear…"
            aria-label="聽寫內容"
          />
          <div className="exercise-actions">
            <button type="submit" className="button button-primary" disabled={!draft.trim()}>
              送出
            </button>
          </div>
        </>
      )}
    </form>
  );
}

/** 跟讀:看著句子唸出來,由語音辨識判斷能不能被聽懂。 */
function ReadAloudBody({ exercise, answer, done, level, onSubmit, onSelfRate }: SpokenBodyProps) {
  const { tts, stt, disableStt } = useSpeech();
  const [heard, setHeard] = useState('');
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listening = useRef<Listening | null>(null);

  useEffect(() => () => listening.current?.stop(), []);

  function start() {
    setError(null);
    setHeard('');
    setRecording(true);
    listening.current = listen({
      onText: setHeard,
      onEnd: (finalText) => {
        setRecording(false);
        // 沒收到聲音不算一次作答,讓學生再試。
        if (!finalText) setError('沒有聽到聲音,請再試一次。');
        else onSubmit(finalText);
      },
      onError: (code) => {
        setRecording(false);
        setError(sttErrorMessage(code));
        if (isMicUnavailable(code)) disableStt();
      },
    });
  }

  return (
    <>
      <p className="muted small">跟讀:大聲唸出這個句子</p>
      <p className="exercise-prompt read-aloud-sentence">{exercise.sentence}</p>
      <LastAttempt exercise={exercise} answer={answer} label="我聽到的" />
      {!done && !stt && <SelfRate note="這個瀏覽器無法錄音,改成自己評量:大聲唸一遍,你唸得順嗎?" onSelfRate={onSelfRate} />}
      {!done && stt && (
        <>
          <div className="exercise-actions">
            {tts && (
              <button type="button" className="button" onClick={() => speak(exercise.sentence, { rate: speechRate(level) })} disabled={recording}>
                🔊 聽示範
              </button>
            )}
            {recording ? (
              <button type="button" className="button button-recording" onClick={() => listening.current?.stop()}>
                ■ 唸完了
              </button>
            ) : (
              <button type="button" className="button button-primary" onClick={start}>
                🎤 開始唸
              </button>
            )}
          </div>
          {recording && <p className="heard">{heard || '正在聽…'}</p>}
          {error && <p className="feedback feedback-retry">{error}</p>}
        </>
      )}
    </>
  );
}

function McqBody({
  exercise,
  answer,
  done,
  onSubmit,
}: {
  exercise: Extract<Exercise, { type: 'mcq' }>;
  answer: ExerciseAnswer;
  done: boolean;
  onSubmit: (response: string) => void;
}) {
  const tried = new Set(answer.attempts.map(Number));
  return (
    <>
      <p className="exercise-prompt">{exercise.prompt}</p>
      <div className="options">
        {exercise.options.map((option, index) => {
          const isAnswer = index === exercise.answerIndex;
          const state = done && isAnswer ? ' is-correct' : tried.has(index) && !isAnswer ? ' is-wrong' : '';
          return (
            <button key={index} type="button" className={`option${state}`} disabled={done || tried.has(index)} onClick={() => onSubmit(String(index))}>
              <span className="option-letter">{String.fromCharCode(65 + index)}</span>
              {option}
            </button>
          );
        })}
      </div>
    </>
  );
}

function ClozeBody({
  exercise,
  answer,
  done,
  onSubmit,
  onHint,
  choices,
}: {
  exercise: Extract<Exercise, { type: 'cloze' }>;
  answer: ExerciseAnswer;
  done: boolean;
  onSubmit: (response: string) => void;
  onHint: () => void;
  choices?: string[];
}) {
  const [draft, setDraft] = useState('');
  const bank = useMemo(() => (choices ? seededShuffle(choices, exercise.sentence) : null), [choices, exercise.sentence]);
  const [before, after] = exercise.sentence.split(BLANK);
  const lastAttempt = answer.attempts.at(-1) ?? '';
  const solved = done && checkAnswer(exercise, lastAttempt);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    onSubmit(draft.trim());
    setDraft('');
  }

  return (
    <form onSubmit={submit}>
      <p className="exercise-prompt cloze">
        {before}
        {done ? (
          <span className={`cloze-filled${solved ? ' is-correct' : ' is-wrong'}`}>{lastAttempt || '—'}</span>
        ) : bank ? (
          <span className="cloze-gap" aria-label="空格" />
        ) : (
          <input
            className="cloze-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="填入空格"
          />
        )}
        {after}
      </p>
      {answer.hintUsed && <p className="hint">提示:{exercise.hint}</p>}
      {!done && bank && (
        <div className="tile-bank">
          {bank.map((word) => (
            <button key={word} type="button" className="tile" disabled={answer.attempts.includes(word)} onClick={() => onSubmit(word)}>
              {word}
            </button>
          ))}
        </div>
      )}
      {!done && (
        <div className="exercise-actions">
          {!bank && (
            <button type="submit" className="button button-primary" disabled={!draft.trim()}>
              送出
            </button>
          )}
          {!answer.hintUsed && (
            <button type="button" className="button button-ghost" onClick={onHint}>
              看提示(只能拿半分)
            </button>
          )}
        </div>
      )}
    </form>
  );
}

/** 依字串內容決定的洗牌順序:同一題每次打開的排列都一樣。 */
function seededShuffle<T>(items: T[], seed: string): T[] {
  let state = 0;
  for (const char of seed) state = (state * 31 + char.charCodeAt(0)) >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function ReorderBody({
  exercise,
  answer,
  done,
  onSubmit,
}: {
  exercise: Extract<Exercise, { type: 'reorder' }>;
  answer: ExerciseAnswer;
  done: boolean;
  onSubmit: (response: string) => void;
}) {
  const { words, ending } = useMemo(() => reorderWords(exercise.sentence), [exercise.sentence]);
  const bank = useMemo(() => {
    const indexed = words.map((word, index) => ({ word, index }));
    const shuffled = seededShuffle(indexed, exercise.sentence);
    // 洗完剛好和原句相同時,把第一個字移到最後,避免題目直接給出答案。
    const unchanged = shuffled.every((item, i) => item.index === i);
    return unchanged && shuffled.length > 1 ? [...shuffled.slice(1), shuffled[0]!] : shuffled;
  }, [words, exercise.sentence]);
  const [picked, setPicked] = useState<number[]>([]);

  const pickedWords = picked.map((index) => words[index]!);
  const lastAttempt = answer.attempts.at(-1) ?? '';

  function submit() {
    onSubmit(pickedWords.join(' ') + ending);
    setPicked([]);
  }

  return (
    <>
      <p className="exercise-prompt">把單字排成正確的句子:{exercise.translation}</p>
      {done ? (
        <p className="reorder-line">{lastAttempt}</p>
      ) : (
        <>
          <div className="reorder-line" aria-label="你排的句子">
            {picked.length === 0 && <span className="muted">點下面的單字開始排列</span>}
            {picked.map((index) => (
              <button key={index} type="button" className="tile is-picked" onClick={() => setPicked(picked.filter((i) => i !== index))}>
                {words[index]}
              </button>
            ))}
            {picked.length > 0 && ending && <span className="tile-ending">{ending}</span>}
          </div>
          <div className="tile-bank">
            {bank.map(({ word, index }) => (
              <button key={index} type="button" className="tile" disabled={picked.includes(index)} onClick={() => setPicked([...picked, index])}>
                {word}
              </button>
            ))}
          </div>
          <div className="exercise-actions">
            <button type="button" className="button button-primary" disabled={picked.length !== words.length} onClick={submit}>
              送出
            </button>
            <button type="button" className="button button-ghost" disabled={picked.length === 0} onClick={() => setPicked([])}>
              重排
            </button>
          </div>
        </>
      )}
    </>
  );
}

/** 閃卡:先自己回想,翻開答案後自己判斷記不記得。 */
function FlashcardBody({
  exercise,
  done,
  onSubmit,
}: {
  exercise: Extract<Exercise, { type: 'flashcard' }>;
  done: boolean;
  onSubmit: (response: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const showBack = revealed || done;

  return (
    <>
      <p className="muted small">先自己想一想,再翻開答案。</p>
      <p className="exercise-prompt flashcard-front">{exercise.front}</p>
      {!showBack && (
        <div className="exercise-actions">
          <button type="button" className="button button-primary" onClick={() => setRevealed(true)}>
            翻開答案
          </button>
        </div>
      )}
      {showBack && (
        <div className="flashcard-back">
          <strong>{exercise.back}</strong>
          {exercise.explanation !== exercise.back && <p>{exercise.explanation}</p>}
        </div>
      )}
      {showBack && !done && (
        <div className="exercise-actions">
          <button type="button" className="button button-primary" onClick={() => onSubmit(FLASHCARD_KNOWN)}>
            我記得
          </button>
          <button type="button" className="button" onClick={() => onSubmit(FLASHCARD_FORGOT)}>
            還不熟
          </button>
        </div>
      )}
    </>
  );
}
