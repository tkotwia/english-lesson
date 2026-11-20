import { describe, expect, it } from 'vitest';
import type { Exercise } from './lesson.ts';
import { checkAnswer, combineScore, gradeExercise, isExerciseDone, normalizeAnswer, wordAccuracy } from './scoring.ts';

const mcq: Exercise = { type: 'mcq', prompt: 'Pick B', options: ['A', 'B', 'C'], answerIndex: 1, explanation: 'because' };
const cloze: Exercise = { type: 'cloze', sentence: 'I ___ happy.', answers: ['am', "'m"], hint: 'be 動詞', explanation: 'because' };
const reorder: Exercise = { type: 'reorder', sentence: "We didn't play basketball yesterday.", translation: '…', explanation: 'because' };

describe('答案比對', () => {
  // 學生不該因為大小寫、句點或手機輸入法的彎撇號被判錯,這些不是英文能力的問題。
  it('忽略大小寫、標點、多餘空白,並把各種撇號視為相同', () => {
    expect(normalizeAnswer('  We  DIDN’T play, basketball yesterday!! ')).toBe("we didn't play basketball yesterday");
    expect(checkAnswer(reorder, 'we didn’t play basketball yesterday')).toBe(true);
  });

  it('克漏字接受題目列出的任何一個正確答案', () => {
    expect(checkAnswer(cloze, 'AM')).toBe(true);
    expect(checkAnswer(cloze, '’m')).toBe(true);
    expect(checkAnswer(cloze, 'is')).toBe(false);
  });

  it('空白作答不算對,即使正確選項剛好是第 0 個', () => {
    const firstOptionCorrect: Exercise = { ...mcq, answerIndex: 0 } as Exercise;
    expect(checkAnswer(firstOptionCorrect, '')).toBe(false);
    expect(checkAnswer(cloze, '   ')).toBe(false);
  });

  it('重組題字的順序錯就是錯', () => {
    expect(checkAnswer(reorder, "We didn't basketball play yesterday.")).toBe(false);
  });
});

describe('單題判定:分數要能區分「會」「不熟」「不會」', () => {
  it('第一次就答對且沒看提示:滿分,不列入弱點', () => {
    expect(gradeExercise(mcq, { attempts: ['1'], hintUsed: false })).toEqual({ outcome: 'correct', credit: 1 });
  });

  it('第二次才答對:半分,記為不熟', () => {
    expect(gradeExercise(mcq, { attempts: ['0', '1'], hintUsed: false })).toEqual({ outcome: 'unfamiliar', credit: 0.5 });
  });

  it('看了提示才答對:即使一次就對也只有半分,記為不熟', () => {
    expect(gradeExercise(cloze, { attempts: ['am'], hintUsed: true })).toEqual({ outcome: 'unfamiliar', credit: 0.5 });
  });

  it('兩次都錯:零分,記為不會', () => {
    expect(gradeExercise(mcq, { attempts: ['0', '2'], hintUsed: false })).toEqual({ outcome: 'unknown', credit: 0 });
  });

  // 否則學生可以跳過不會的題目來拉高分數,95 分的升級門檻就失去意義。
  it('沒作答視同不會,不能靠跳題拉高分數', () => {
    expect(gradeExercise(mcq, undefined)).toEqual({ outcome: 'unknown', credit: 0 });
    expect(gradeExercise(mcq, { attempts: [], hintUsed: false })).toEqual({ outcome: 'unknown', credit: 0 });
  });

  it('最多只算前兩次作答,第三次以後答對不給分', () => {
    expect(gradeExercise(mcq, { attempts: ['0', '2', '1'], hintUsed: false })).toEqual({ outcome: 'unknown', credit: 0 });
  });

  it('答對或用完兩次機會後,這一題就結束', () => {
    expect(isExerciseDone(mcq, undefined)).toBe(false);
    expect(isExerciseDone(mcq, { attempts: ['0'], hintUsed: false })).toBe(false);
    expect(isExerciseDone(mcq, { attempts: ['1'], hintUsed: false })).toBe(true);
    expect(isExerciseDone(mcq, { attempts: ['0', '2'], hintUsed: false })).toBe(true);
  });
});

describe('總分', () => {
  it('六個階段都有時,依 10/15/15/20/20/20 的配分加總', () => {
    const { score, sections } = combineScore({ review: 100, listening: 100, reading: 100, language: 100, speaking: 100, writing: 50 });
    expect(score).toBe(90);
    expect(sections.map((s) => s.weight)).toEqual([10, 15, 15, 20, 20, 20]);
  });

  // 第一天沒有複習項目、或沒有麥克風無法口說時,不該讓學生永遠拿不到滿分。
  it('缺少某些階段時,其餘配分等比例放大,滿分仍是 100', () => {
    const { score, sections } = combineScore({ reading: 100, language: 100, writing: 100 });
    expect(score).toBe(100);
    expect(sections.reduce((sum, s) => sum + s.weight, 0)).toBeCloseTo(100, 0);
  });

  it('放大後各階段之間的比例不變', () => {
    // 只有閱讀(15)與寫作(20):閱讀全對、寫作 0 分 → 15 / 35
    expect(combineScore({ reading: 100, writing: 0 }).score).toBe(42.9);
  });

  it('沒有任何可計分的階段時是 0 分,而不是除以零', () => {
    expect(combineScore({})).toEqual({ score: 0, sections: [] });
  });
});

describe('聽寫與跟讀:以單字正確率判定', () => {
  const dictation: Exercise = { type: 'dictation', sentence: 'They bought fried chicken and shared it.', explanation: '' };
  const once = (response: string) => gradeExercise(dictation, { attempts: [response], hintUsed: false });

  it('完全一樣是 100%;大小寫與標點不影響', () => {
    expect(wordAccuracy('They went home at nine o’clock.', "they went home at nine o'clock")).toBe(1);
  });

  it('少一個字、多一個字、錯一個字都會拉低正確率', () => {
    expect(wordAccuracy('one two three four five', 'one two four five')).toBeCloseTo(0.8);
    expect(wordAccuracy('one two three four', 'one two three extra four')).toBeCloseTo(0.8);
    expect(wordAccuracy('one two three four five', 'one two tree four five')).toBeCloseTo(0.8);
  });

  // 只把對的字打出來但順序全亂,不代表聽懂了句子。
  it('順序不對的字不算對', () => {
    expect(wordAccuracy('one two three four', 'four three two one')).toBeCloseTo(0.25);
  });

  it('沒有作答的正確率是 0', () => {
    expect(wordAccuracy('one two three', '')).toBe(0);
  });

  it('正確率 90% 以上算答對', () => {
    expect(once('they bought fried chicken and shared it')).toEqual({ outcome: 'correct', credit: 1 });
  });

  it('70% 到 90% 之間算不熟:大部分聽懂了,但有字沒抓到', () => {
    // 7 個字錯 1 個 → 約 86%
    expect(once('They bought fried chicken and share it')).toEqual({ outcome: 'unfamiliar', credit: 0.5 });
  });

  it('低於 70% 算不會', () => {
    // 7 個字只對 4 個 → 約 57%
    expect(once('They bought chicken it')).toEqual({ outcome: 'unknown', credit: 0 });
  });

  it('第一次沒到 90%,第二次才達標:和其他題目一樣算不熟', () => {
    const answer = { attempts: ['They bought chicken it', 'They bought fried chicken and shared it.'], hintUsed: false };
    expect(gradeExercise(dictation, answer)).toEqual({ outcome: 'unfamiliar', credit: 0.5 });
  });

  it('達標或用完兩次機會後,這一題就結束', () => {
    expect(isExerciseDone(dictation, { attempts: ['They bought chicken it'], hintUsed: false })).toBe(false);
    expect(isExerciseDone(dictation, { attempts: ['They bought fried chicken and shared it'], hintUsed: false })).toBe(true);
    expect(isExerciseDone(dictation, { attempts: ['x', 'y'], hintUsed: false })).toBe(true);
  });
});
