import { describe, expect, it } from 'vitest';
import { formatSeconds, waitPercent, waitRemaining } from './wait.ts';

describe('等待進度條:進度是用過去實際花費的時間推估的', () => {
  it('預估時間內等速前進', () => {
    expect(waitPercent(0, 60)).toBe(0);
    expect(waitPercent(20, 60)).toBe(30);
    expect(waitPercent(40, 60)).toBe(60);
  });

  // 預估只是推估。時間到了但 AI 還沒回應時顯示 100%,學生會以為做完了卻沒反應。
  it('還沒真正做完之前不會顯示 100%,即使已經等得比預估久很多', () => {
    expect(waitPercent(60, 60)).toBe(90);
    expect(waitPercent(600, 60)).toBeLessThan(100);
    expect(waitPercent(60_000, 60)).toBeLessThan(100);
  });

  // 超過預估時間後如果進度條停住不動,看起來就像當掉了。
  it('超過預估時間後仍然持續前進,不會倒退', () => {
    const samples = [60, 70, 90, 120, 180].map((elapsed) => waitPercent(elapsed, 60));
    expect(samples).toEqual([...samples].sort((a, b) => a - b));
    expect(new Set(samples).size).toBe(samples.length);
  });

  it('預估時間是 0(例如過去的紀錄幾乎不用等)時不會算出無意義的數字', () => {
    expect(waitPercent(1, 0)).toBe(90);
    expect(waitRemaining(1, 0)).toBe(0);
  });

  // 「還要 0 秒」卻還在等,或顯示負數,都會讓人困惑;超過預估時畫面改顯示別的說明。
  it('剩餘時間不會是負數', () => {
    expect(waitRemaining(0, 60)).toBe(60);
    expect(waitRemaining(59.2, 60)).toBe(1);
    expect(waitRemaining(75, 60)).toBe(0);
  });

  it('秒數寫成容易讀的樣子', () => {
    expect(formatSeconds(45)).toBe('45 秒');
    expect(formatSeconds(60)).toBe('1 分鐘');
    expect(formatSeconds(80)).toBe('1 分 20 秒');
    expect(formatSeconds(-3)).toBe('0 秒');
  });
});
