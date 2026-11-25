import type { LessonExercise } from '../../../shared/lesson.ts';
import { KIND_LABELS, type ExerciseAnswer, type Level } from '../../../shared/schema.ts';
import { gradeExercise, isExerciseDone } from '../../../shared/scoring.ts';
import { useSpeech } from '../speech/SpeechContext.tsx';
import { speak, speechRate } from '../speech/tts.ts';
import { ExerciseCard } from './ExerciseCard.tsx';

/** 「我不熟」的標記狀態與動作。沒有提供時不顯示標記按鈕。 */
export interface Flagging {
  flags: string[];
  onFlag: (target: string) => void;
}

interface Props {
  items: LessonExercise[];
  answers: Record<string, ExerciseAnswer>;
  level: Level;
  onAnswer: (key: string, answer: ExerciseAnswer) => void;
  flagging?: Flagging;
  /** 複習時題目離開了原本的課文,需要把課文附在題目上方。 */
  showContext?: boolean;
  /** 複習時顯示這一題屬於哪一類(單字、文法…)。 */
  showKind?: boolean;
  /** 克漏字的候選字;有提供時改成點選作答。 */
  choices?: string[];
  /** 跟讀題可以跳過。複習時才開:複習的時間地點不一定方便出聲,不讓跳過的話整份複習會卡在那一題。 */
  skippableSpeaking?: boolean;
}

/** 這組題目是否全部作答完畢。 */
export function allDone(items: LessonExercise[], answers: Record<string, ExerciseAnswer>): boolean {
  return items.every((item) => isExerciseDone(item.exercise, answers[item.key]));
}

export function FlagButton({ target, flagging }: { target: string; flagging: Flagging }) {
  const flagged = flagging.flags.includes(target);
  return (
    <button type="button" className={`flag-button${flagged ? ' is-flagged' : ''}`} disabled={flagged} onClick={() => flagging.onFlag(target)}>
      {flagged ? '✓ 已加入不熟' : '我不熟'}
    </button>
  );
}

/** 一題一題出:做完的題目留在上面,只多顯示下一題還沒做完的。 */
export function ExerciseSequence({ items, answers, level, onAnswer, flagging, showContext, showKind, choices, skippableSpeaking }: Props) {
  const { tts } = useSpeech();
  const firstOpen = items.findIndex((item) => !isExerciseDone(item.exercise, answers[item.key]));
  const visible = firstOpen === -1 ? items : items.slice(0, firstOpen + 1);

  return (
    <>
      {visible.map((item, index) => {
        const answer = answers[item.key];
        // 已經被判為不會或不熟的題目本來就會進入複習,只有答對的題目才需要手動標記。
        const canFlag = flagging && isExerciseDone(item.exercise, answer) && gradeExercise(item.exercise, answer).outcome === 'correct';
        return (
          <div key={item.key} className="exercise-wrap">
            <div className="exercise-top">
              <span className="exercise-number">
                第 {index + 1} / {items.length} 題
                {showKind && <span className="tag">{KIND_LABELS[item.kind]}</span>}
              </span>
              {canFlag && <FlagButton target={item.key} flagging={flagging} />}
            </div>
            {showContext && item.context && item.kind === 'listening' && tts && (
              <div className="context">
                <button type="button" className="button" onClick={() => speak(item.context!, { rate: speechRate(level) })}>
                  🔊 播放課文
                </button>
              </div>
            )}
            {showContext && item.context && !(item.kind === 'listening' && tts) && (
              <details className="context">
                <summary>查看課文</summary>
                <p>{item.context}</p>
              </details>
            )}
            <ExerciseCard
              exerciseKey={item.key}
              exercise={item.exercise}
              answer={answer}
              level={level}
              onChange={(next) => onAnswer(item.key, next)}
              choices={item.exercise.type === 'cloze' ? choices : undefined}
              skippable={skippableSpeaking}
            />
          </div>
        );
      })}
    </>
  );
}
