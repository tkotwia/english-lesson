import { addDays } from './dates.ts';

// 間隔重複:學過的內容隔一段時間再考,越熟隔越久。
// - 答錯或不熟的項目:1 → 2 → 4 → 8 → 16 → 32 → 64 天。
// - 新學的單字(第一次就答對、之後也沒錯過):1 → 4 → 16 → 64 天。
//   每個新單字都要複習,所以複習的題數比新單字多好幾倍;沒錯過的字間隔拉得快一點,把時間留給會錯的字。

/** learning:新學的、還沒錯過;unknown:不會;unfamiliar:不熟;mastered:已掌握,不再出現。 */
export type ItemStatus = 'learning' | 'unknown' | 'unfamiliar' | 'mastered';

export interface SrsState {
  status: ItemStatus;
  intervalDays: number;
  dueDate: string;
}

export const FIRST_INTERVAL = 1;
export const MASTERY_INTERVAL = 64;
/** 複習答對後,間隔乘上的倍數。 */
const GROWTH = { learning: 4, missed: 2 } as const;

/**
 * 剛學的新單字,在課堂上第一次就答對:明天先複習一次。
 * 剛看完單字表就答對只代表短期記憶,要隔一段時間還答得出來才算記住。
 */
export function afterLearned(today: string): SrsState {
  return { status: 'learning', intervalDays: FIRST_INTERVAL, dueDate: addDays(today, FIRST_INTERVAL) };
}

/** 答錯或不熟:間隔歸零,明天再出現。 */
export function afterMiss(outcome: 'unknown' | 'unfamiliar', today: string): SrsState {
  return { status: outcome, intervalDays: FIRST_INTERVAL, dueDate: addDays(today, FIRST_INTERVAL) };
}

/**
 * 複習時答對:間隔拉長。間隔已達 64 天還答對,代表隔了兩個月仍記得,標為已掌握,不再出現。
 * 答對一次後,「不會」降為「不熟」;新學的單字只要沒錯過,就維持「新學」。
 */
export function afterCorrect(current: SrsState, today: string): SrsState {
  if (current.intervalDays >= MASTERY_INTERVAL) return { ...current, status: 'mastered' };
  const learning = current.status === 'learning';
  const intervalDays = Math.min(MASTERY_INTERVAL, current.intervalDays * (learning ? GROWTH.learning : GROWTH.missed));
  return { status: learning ? 'learning' : 'unfamiliar', intervalDays, dueDate: addDays(today, intervalDays) };
}

/**
 * 學生手動按「我不熟」:明天複習。
 * 原本就是「不會」的維持不會,不因為手動標記而變輕。
 */
export function afterManualFlag(current: SrsState | null, today: string): SrsState {
  return afterMiss(current?.status === 'unknown' ? 'unknown' : 'unfamiliar', today);
}

export function isDue(state: SrsState, today: string): boolean {
  return state.status !== 'mastered' && state.dueDate <= today;
}
