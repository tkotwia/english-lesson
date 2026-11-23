import { describe, expect, it } from 'vitest';
import { MAX_READING_WPM, readingSpeed } from './fluency.ts';

describe('計時重讀的速度', () => {
  it('每分鐘幾個字 = 字數除以花掉的分鐘數', () => {
    expect(readingSpeed(120, 60_000)).toBe(120);
    expect(readingSpeed(120, 45_000)).toBe(160);
    expect(readingSpeed(90, 120_000)).toBe(45);
  });

  // 「上次成績」是下一次要超越的目標。沒讀就按掉留下的數字,之後怎麼認真讀都追不上,練習就失去意義。
  it('快得不合理(沒讀就按了讀完)不算成績', () => {
    expect(readingSpeed(120, 2_000)).toBeNull();
    expect(readingSpeed(MAX_READING_WPM, 60_000)).toBe(MAX_READING_WPM);
    expect(readingSpeed(MAX_READING_WPM + 1, 60_000)).toBeNull();
  });

  it('沒有課文或沒有計時,就沒有成績', () => {
    expect(readingSpeed(0, 30_000)).toBeNull();
    expect(readingSpeed(100, 0)).toBeNull();
  });
});
