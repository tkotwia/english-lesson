import type { Level, Minutes, Stage } from '../../shared/schema.ts';
import { A1 } from './a1.ts';
import { A2 } from './a2.ts';
import { B1 } from './b1.ts';
import { B2 } from './b2.ts';
import { C1 } from './c1.ts';
import { C2 } from './c2.ts';
import type { StarterLesson } from './types.ts';

// 24 堂內建的起始課:6 個 CEFR 等級 × 4 個學習階段,每堂都是 20 分鐘的份量。
// 使用者在某個「等級 + 學習階段」還沒上過課時,第一堂 20 分鐘的課直接用這裡的內容,
// 不需要等 AI 產生,也不耗額度。內容是事先寫好的,每位使用者看到的都一樣。

/** 起始課的長度。30 與 40 分鐘沒有起始課。 */
export const STARTER_MINUTES: Minutes = 20;

export const STARTERS: Record<Level, Record<Stage, StarterLesson>> = { A1, A2, B1, B2, C1, C2 };

export function starterFor(level: Level, stage: Stage): StarterLesson {
  return STARTERS[level][stage];
}
