// 流暢度練習:用已經熟悉的內容(上一課的課文)練「快」,不是學新東西。
// 重聽、計時重讀、一分鐘重述。全部在本機進行,不呼叫 AI,也不計分。

/** 一分鐘重述的時間。 */
export const RETELL_SECONDS = 60;

/** 閱讀速度的合理上限(每分鐘幾個字)。比這更快,多半是沒讀就按了「讀完了」。 */
export const MAX_READING_WPM = 600;

/**
 * 計時重讀的速度:每分鐘讀幾個字。
 * 快得不合理時回傳 null,不記錄成績:否則直接按掉就會留下一個以後永遠追不上的「上次成績」。
 */
export function readingSpeed(words: number, elapsedMs: number): number | null {
  if (words <= 0 || elapsedMs <= 0) return null;
  const wpm = Math.round(words / (elapsedMs / 60_000));
  return wpm > MAX_READING_WPM ? null : wpm;
}
