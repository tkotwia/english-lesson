import { addDays } from './dates.ts';

// 間隔重複:不會 / 不熟的項目隔 1 → 2 → 4 → 8 → 16 天再出現,越熟隔越久。

export type ItemStatus = 'unknown' | 'unfamiliar' | 'mastered';

export interface SrsState {
  status: ItemStatus;
  intervalDays: number;
  dueDate: string;
}

export const FIRST_INTERVAL = 1;
export const MASTERY_INTERVAL = 16;

/** 答錯或不熟:間隔歸零,明天再出現。 */
export function afterMiss(outcome: 'unknown' | 'unfamiliar', today: string): SrsState {
  return { status: outcome, intervalDays: FIRST_INTERVAL, dueDate: addDays(today, FIRST_INTERVAL) };
}

/**
 * 複習時答對:間隔加倍。間隔已達 16 天還答對,代表隔了半個月仍記得,標為已掌握,不再出現。
 * 答對一次後,「不會」降為「不熟」。
 */
export function afterCorrect(current: SrsState, today: string): SrsState {
  if (current.intervalDays >= MASTERY_INTERVAL) return { ...current, status: 'mastered' };
  const intervalDays = current.intervalDays * 2;
  return { status: 'unfamiliar', intervalDays, dueDate: addDays(today, intervalDays) };
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
