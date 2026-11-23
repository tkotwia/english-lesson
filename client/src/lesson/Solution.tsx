import type { Exercise } from '../../../shared/lesson.ts';
import { markSolution } from '../../../shared/scoring.ts';

interface Props {
  exercise: Exercise;
  /** 學生答錯的那一次作答;沒有的話就只顯示正確答案,不標示。 */
  response: string | undefined;
  /** 有標示時,在後面加一句說明黃底代表什麼。 */
  legend?: boolean;
}

/** 正確答案,並把學生答錯的地方用黃底標出來,讓學生一眼看到差在哪裡。 */
export function Solution({ exercise, response, legend }: Props) {
  const parts = markSolution(exercise, response);
  return (
    <>
      {parts.map((part, index) =>
        part.missed ? (
          <mark key={index} className="missed">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
      {legend && parts.some((part) => part.missed) && <span className="missed-legend">(黃底是答錯的地方)</span>}
    </>
  );
}
