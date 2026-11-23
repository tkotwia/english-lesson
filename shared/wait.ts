// 等 AI 回應時的進度條。
// AI 是一次回傳整個結果,過程中拿不到真正的進度,所以進度是用「過去實際花費的時間」推估的。

/** 等到預估時間時進度條走到的百分比。真正做完之前不會顯示 100%。 */
const PERCENT_AT_EXPECTED = 90;
/** 等得比預估久時,進度逐漸接近但不會超過的百分比。 */
const PERCENT_LIMIT = 99;

/**
 * 已經等了 elapsed 秒、預估總共要 expected 秒時,進度條該顯示的百分比(整數)。
 * 預估時間內等速走到 90%;超過之後越走越慢,但仍然持續前進,讓人知道沒有當掉。
 */
export function waitPercent(elapsed: number, expected: number): number {
  if (elapsed <= 0) return 0;
  if (expected <= 0) return PERCENT_AT_EXPECTED;
  if (elapsed <= expected) return Math.floor((elapsed / expected) * PERCENT_AT_EXPECTED);
  return Math.floor(PERCENT_AT_EXPECTED + (PERCENT_LIMIT - PERCENT_AT_EXPECTED) * (1 - Math.exp(-(elapsed - expected) / expected)));
}

/** 預估還要等幾秒(無條件進位);已經超過預估時間時是 0。 */
export function waitRemaining(elapsed: number, expected: number): number {
  return Math.max(0, Math.ceil(expected - elapsed));
}

/** 把秒數寫成容易讀的樣子:45 秒、1 分鐘、1 分 20 秒。 */
export function formatSeconds(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} 秒`;
  const rest = total % 60;
  return rest === 0 ? `${Math.floor(total / 60)} 分鐘` : `${Math.floor(total / 60)} 分 ${rest} 秒`;
}
