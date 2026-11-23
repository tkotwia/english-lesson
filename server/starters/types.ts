import type { Lesson } from '../../shared/schema.ts';

/** 內建的起始課:不必呼叫 AI 就能直接上的一堂課。 */
export interface StarterLesson {
  /** 主題,必須是該學習階段主題清單裡的一項,之後的主題輪替才接得上。 */
  topic: string;
  /** 文法重點,是該等級清單的第一項,之後的課會從第二項接著教。 */
  grammarPoint: string;
  lesson: Lesson;
}
