import { describe, expect, it } from 'vitest';
import {
  bandQuestions,
  hasAllBandsInOrder,
  nextQuestion,
  passMark,
  placementOutcome,
  shuffleOptions,
  type PlacementAnswers,
  type PlacementBand,
  type PlacementTest,
} from './placement.ts';
import { LEVELS, type Level, type Mcq } from './schema.ts';

const mcq = (prompt: string): Mcq => ({ prompt, options: ['right', 'wrong 1', 'wrong 2', 'wrong 3'], answerIndex: 0, explanation: 'because' });

const band = (level: Level): PlacementBand => ({
  level,
  vocab: [mcq('v0'), mcq('v1')],
  grammar: [mcq('g0'), mcq('g1'), mcq('g2')],
  reading: { passage: 'A short passage.', questions: [mcq('r0'), mcq('r1')] },
  listening: { script: 'A short script.', questions: [mcq('l0')] },
});

const TEST: PlacementTest = { bands: LEVELS.map(band) };

/** 每個等級答對幾題(其餘答錯);沒列出的等級沒有作答。 */
function answering(correct: Partial<Record<Level, number>>, tts = true): PlacementAnswers {
  const answers: PlacementAnswers = {};
  for (const item of TEST.bands) {
    const count = correct[item.level];
    if (count === undefined) continue;
    bandQuestions(item, tts).forEach((question, index) => {
      answers[question.key] = index < count ? 0 : 1;
    });
  }
  return answers;
}

describe('分級測驗:建議的等級', () => {
  // 沒通過的那一級,內容還沒掌握,正好是要學的;通過的等級再上一遍只是複習。
  it('第一個沒通過的等級,就是建議上課的等級', () => {
    const outcome = placementOutcome(TEST, answering({ A1: 8, A2: 7, B1: 4 }), true);
    expect(outcome.level).toBe('B1');
    expect(outcome.bands.map((result) => `${result.level}:${result.correct}/${result.total}:${result.passed}`)).toEqual(['A1:8/8:true', 'A2:7/8:true', 'B1:4/8:false']);
  });

  it('連 A1 都沒通過,就從 A1 開始', () => {
    expect(placementOutcome(TEST, answering({ A1: 3 }), true).level).toBe('A1');
  });

  it('全部通過就是最高的 C2', () => {
    const all = Object.fromEntries(LEVELS.map((level) => [level, 8]));
    expect(placementOutcome(TEST, answering(all), true)).toMatchObject({ level: 'C2' });
  });

  // 4 個選項亂猜 8 題,猜對 6 題以上的機率不到 1%;門檻再低,靠猜就可能跳級。
  it('8 題要答對 6 題才算通過', () => {
    expect(passMark(8)).toBe(6);
    expect(placementOutcome(TEST, answering({ A1: 6, A2: 0 }), true).level).toBe('A2');
    expect(placementOutcome(TEST, answering({ A1: 5, A2: 8 }), true).level).toBe('A1');
  });

  // 較難的等級靠猜也可能湊到分數。基礎沒過卻被放到高等級,課文會完全看不懂。
  it('後面的等級答得再好,也不能抵消前面沒通過的等級', () => {
    const outcome = placementOutcome(TEST, answering({ A1: 8, A2: 2, B1: 8, B2: 8, C1: 8, C2: 8 }), true);
    expect(outcome.level).toBe('A2');
    expect(outcome.bands).toHaveLength(2);
  });

  it('沒作答的題目算錯', () => {
    expect(placementOutcome(TEST, {}, true)).toMatchObject({ level: 'A1', bands: [{ correct: 0, total: 8, passed: false }] });
  });

  // 瀏覽器不能朗讀時考不了聽力。不能把沒辦法作答的題目算成答錯。
  it('不能朗讀時沒有聽力題,門檻依剩下的題數計算', () => {
    expect(bandQuestions(TEST.bands[0]!, false).map((question) => question.kind)).not.toContain('listening');
    expect(passMark(7)).toBe(6);
    expect(placementOutcome(TEST, answering({ A1: 6, A2: 5 }, false), false)).toMatchObject({ level: 'A2', bands: [{ total: 7, passed: true }, { total: 7, passed: false }] });
  });
});

describe('分級測驗:作答順序', () => {
  it('從 A1 的第一題開始,閱讀題附短文,聽力題附朗讀內容', () => {
    expect(nextQuestion(TEST, {}, true)).toMatchObject({ key: 'A1.vocab.0', level: 'A1' });
    const kinds = bandQuestions(TEST.bands[0]!, true);
    expect(kinds.map((question) => question.kind)).toEqual(['vocab', 'vocab', 'grammar', 'grammar', 'grammar', 'reading', 'reading', 'listening']);
    expect(kinds[5]).toMatchObject({ passage: 'A short passage.' });
    expect(kinds[7]).toMatchObject({ script: 'A short script.' });
  });

  it('通過一個等級,接著做下一個等級', () => {
    expect(nextQuestion(TEST, answering({ A1: 8 }), true)).toMatchObject({ key: 'A2.vocab.0' });
  });

  // 沒通過就停,不必把更難、多半只能用猜的題目做完。
  it('一個等級沒通過,測驗就結束', () => {
    expect(nextQuestion(TEST, answering({ A1: 8, A2: 3 }), true)).toBeNull();
  });

  // 前幾題錯了不代表這一級過不了;整組答完才看得出來。
  it('一個等級的題目全部答完才判定,不會做到一半就結束', () => {
    const answers: PlacementAnswers = { 'A1.vocab.0': 1, 'A1.vocab.1': 1, 'A1.grammar.0': 1 };
    expect(nextQuestion(TEST, answers, true)).toMatchObject({ key: 'A1.grammar.1' });
  });

  it('全部等級都通過後結束', () => {
    const all = Object.fromEntries(LEVELS.map((level) => [level, 8]));
    expect(nextQuestion(TEST, answering(all), true)).toBeNull();
  });
});

// 實測有一份 AI 出的 48 題,沒有任何一題的答案在第四個選項。學生發現規律就能靠猜過關。
describe('分級測驗:選項順序由程式打亂', () => {
  /** 固定的亂數序列,讓測試結果每次相同。 */
  const sequence = () => {
    let state = 7;
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
  };
  const all = (test: PlacementTest) => test.bands.flatMap((item) => bandQuestions(item, true));

  it('打亂之後,每一題的正確答案仍然是同一個選項的文字', () => {
    const shuffled = shuffleOptions(TEST, sequence());
    expect(all(shuffled).every((question) => question.mcq.options[question.mcq.answerIndex] === 'right')).toBe(true);
    expect(all(shuffled).every((question) => [...question.mcq.options].sort().join() === ['right', 'wrong 1', 'wrong 2', 'wrong 3'].join())).toBe(true);
  });

  it('原本答案全部在第一個選項的題目,打亂後四個位置都有', () => {
    expect(new Set(all(TEST).map((question) => question.mcq.answerIndex))).toEqual(new Set([0]));
    const positions = all(shuffleOptions(TEST, sequence())).map((question) => question.mcq.answerIndex);
    expect(new Set(positions)).toEqual(new Set([0, 1, 2, 3]));
    for (const index of [0, 1, 2, 3]) expect(positions.filter((position) => position === index).length).toBeLessThan(positions.length / 2);
  });

  it('只動選項的順序,題目、短文與聽力內容不變', () => {
    const shuffled = shuffleOptions(TEST, sequence());
    expect(all(shuffled).map((question) => [question.key, question.mcq.prompt, question.passage, question.script])).toEqual(
      all(TEST).map((question) => [question.key, question.mcq.prompt, question.passage, question.script]),
    );
  });
});

describe('分級測驗:題目的完整性', () => {
  // 判定是由低到高一級一級看的;少一級或順序不對,結果就沒有意義。
  it('必須依 A1 到 C2 的順序各有一組', () => {
    expect(hasAllBandsInOrder(TEST)).toBe(true);
    expect(hasAllBandsInOrder({ bands: [...TEST.bands].reverse() })).toBe(false);
  });
});
