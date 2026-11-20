const pad = (n: number) => String(n).padStart(2, '0');

/** 這台電腦所在時區的日期(YYYY-MM-DD)。日曆與「今天是否已上課」都以此為準。 */
export function localDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// 以下函式只處理 YYYY-MM-DD / YYYY-MM 字串,用 UTC 計算以避開時區與日光節約時間的影響。

function toUtc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function fromUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDays(date: string, days: number): string {
  const utc = toUtc(date);
  utc.setUTCDate(utc.getUTCDate() + days);
  return fromUtc(utc);
}

/** 日期所屬的月份(YYYY-MM)。 */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const utc = new Date(Date.UTC(year!, m! - 1 + delta, 1));
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}`;
}

export function previousMonth(month: string): string {
  return addMonths(month, -1);
}

export interface DateRange {
  from: string;
  to: string;
}

/** 該月的第一天到最後一天。 */
export function monthRange(month: string): DateRange {
  const from = `${month}-01`;
  return { from, to: addDays(`${addMonths(month, 1)}-01`, -1) };
}

/** 包含該日期的一週,週日到週六(與月曆的排列一致)。 */
export function weekRange(date: string): DateRange {
  const from = addDays(date, -toUtc(date).getUTCDay());
  return { from, to: addDays(from, 6) };
}

/** 星期幾:0 是週日,6 是週六。 */
export function weekday(date: string): number {
  return toUtc(date).getUTCDay();
}

export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && fromUtc(toUtc(date)) === date;
}

export function isValidMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}
