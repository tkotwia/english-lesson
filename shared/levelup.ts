import { monthOf, previousMonth } from './dates.ts';
import { LEVELS, type Level } from './schema.ts';

/** 月平均達到這個分數,就建議升到下一個 CEFR 等級。 */
export const LEVEL_UP_THRESHOLD = 95;

export interface ScoredSession {
  localDate: string;
  score: number;
  level: Level;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** 每日分數:當天所有完成課程的平均。 */
export function dailyScores(sessions: Pick<ScoredSession, 'localDate' | 'score'>[]): Map<string, number> {
  const byDate = new Map<string, number[]>();
  for (const session of sessions) {
    const scores = byDate.get(session.localDate) ?? [];
    scores.push(session.score);
    byDate.set(session.localDate, scores);
  }
  return new Map([...byDate].map(([date, scores]) => [date, round1(mean(scores))]));
}

/** 月分數:該月「有上課的日子」的每日分數平均。沒上課的日子不計入;整個月沒上課回傳 null。 */
export function monthlyAverage(sessions: Pick<ScoredSession, 'localDate' | 'score'>[], month: string): number | null {
  const days = [...dailyScores(sessions.filter((session) => monthOf(session.localDate) === month)).values()];
  return days.length === 0 ? null : round1(mean(days));
}

export function nextLevel(level: Level): Level | null {
  return LEVELS[LEVELS.indexOf(level) + 1] ?? null;
}

export interface LevelUpSuggestion {
  /** 據以判定的月份(YYYY-MM),也就是上個月。 */
  month: string;
  average: number;
  from: Level;
  to: Level;
}

export interface LevelUpInput {
  today: string;
  level: Level;
  sessions: ScoredSession[];
  /** 已經回應過升級建議的月份。 */
  decidedMonths: string[];
}

/**
 * 升級建議:上個月的月分數達 95 分,就建議升到下一級。
 * - 只在一個月結束後、針對上個月判定。
 * - 只計入在「目前等級」上的課:等級改過之後,舊等級的高分不代表新等級也已精熟。
 * - 已經是最高等級、或這個月份已經回應過,就不再建議。
 */
export function levelUpSuggestion({ today, level, sessions, decidedMonths }: LevelUpInput): LevelUpSuggestion | null {
  const to = nextLevel(level);
  if (!to) return null;
  const month = previousMonth(monthOf(today));
  if (decidedMonths.includes(month)) return null;
  const average = monthlyAverage(
    sessions.filter((session) => session.level === level),
    month,
  );
  if (average === null || average < LEVEL_UP_THRESHOLD) return null;
  return { month, average, from: level, to };
}
