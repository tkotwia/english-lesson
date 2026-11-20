import { describe, expect, it } from 'vitest';
import { MOCK_LESSON } from './ai/mockData.ts';
import { checkNovelty, DUPLICATE_THRESHOLD, passageSimilarity, type PastLesson } from './novelty.ts';

const MARKET = MOCK_LESSON.passage.text;

// 同一個主題(夜市),但重新寫過的另一篇課文。
const MARKET_REWRITTEN =
  'On Friday evening, Lily visited a busy night market near her school with two classmates. They tried stinky tofu for the first time and laughed a lot. ' +
  'Later Lily bought a pair of socks for her brother. A sudden rain started, so the girls ran to the bus stop and shared one small umbrella.';

const SCHOOL =
  'Every morning Tom rides his bike to school. His first class is math, and he likes it because the teacher tells funny stories. ' +
  'At lunch he eats rice and vegetables with his friends in the classroom.';

describe('課文相似度', () => {
  it('完全相同的課文是 1', () => {
    expect(passageSimilarity(MARKET, MARKET)).toBe(1);
  });

  it('大小寫與標點不同不影響', () => {
    expect(passageSimilarity(MARKET, MARKET.toUpperCase().replaceAll('.', ' !'))).toBe(1);
  });

  it('完全不同的課文接近 0', () => {
    expect(passageSimilarity(MARKET, SCHOOL)).toBeLessThan(0.02);
  });

  // 這是門檻要分得開的兩種情況:換幾個字的「假新課」要被抓到,同主題但重寫過的不能被誤判。
  it('只改了幾個字的課文仍然高於重覆門檻', () => {
    const tweaked = MARKET.replace('Kevin', 'Jason').replace('fried chicken', 'grilled corn').replace('two hundred', 'three hundred');
    expect(passageSimilarity(MARKET, tweaked)).toBeGreaterThan(DUPLICATE_THRESHOLD);
  });

  it('同一個主題但重新寫過的課文遠低於重覆門檻', () => {
    expect(passageSimilarity(MARKET, MARKET_REWRITTEN)).toBeLessThan(0.1);
  });

  it('空的課文不會被當成相同', () => {
    expect(passageSimilarity('', '')).toBe(0);
    expect(passageSimilarity(MARKET, '')).toBe(0);
  });
});

describe('新課與舊課的比對', () => {
  const past = (id: number, passage: string, vocab: string[] = []): PastLesson => ({ id, date: `2026-11-${10 + id}`, title: `Lesson ${id}`, passage, vocab });

  it('沒有舊課時:比對 0 堂,相似度 0', () => {
    expect(checkNovelty(MOCK_LESSON, [])).toEqual({ compared: 0, passageSimilarity: 0, similarTo: null, repeatedVocab: [] });
  });

  it('回報最相似的那一堂舊課,而不是最近的一堂', () => {
    const result = checkNovelty(MOCK_LESSON, [past(3, SCHOOL), past(2, MARKET), past(1, MARKET_REWRITTEN)]);
    expect(result.compared).toBe(3);
    expect(result.passageSimilarity).toBe(1);
    expect(result.similarTo).toEqual({ sessionId: 2, title: 'Lesson 2', date: '2026-11-12' });
  });

  it('列出以前當過重點單字的字,不分大小寫', () => {
    const result = checkNovelty(MOCK_LESSON, [past(1, SCHOOL, ['Crowded', 'bicycle']), past(2, SCHOOL, ['spend'])]);
    expect(result.repeatedVocab).toEqual(['crowded', 'spend']);
  });

  it('和舊課完全沒有重疊時,不指出任何相似的課', () => {
    const result = checkNovelty(MOCK_LESSON, [past(1, 'Completely unrelated words appear here only once.')]);
    expect(result).toMatchObject({ compared: 1, passageSimilarity: 0, similarTo: null });
  });
});
