import { monthOf } from './dates.ts';

// 日曆上的分數:每日分數與月分數。

export interface ScoredSession {
  localDate: string;
  score: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** 每日分數:當天所有完成課程的平均。 */
export function dailyScores(sessions: ScoredSession[]): Map<string, number> {
  const byDate = new Map<string, number[]>();
  for (const session of sessions) {
    const scores = byDate.get(session.localDate) ?? [];
    scores.push(session.score);
    byDate.set(session.localDate, scores);
  }
  return new Map([...byDate].map(([date, scores]) => [date, round1(mean(scores))]));
}

/** 月分數:該月「有上課的日子」的每日分數平均。沒上課的日子不計入;整個月沒上課回傳 null。 */
export function monthlyAverage(sessions: ScoredSession[], month: string): number | null {
  const days = [...dailyScores(sessions.filter((session) => monthOf(session.localDate) === month)).values()];
  return days.length === 0 ? null : round1(mean(days));
}
