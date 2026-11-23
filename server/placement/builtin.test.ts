import { describe, expect, it } from 'vitest';
import { countWords } from '../../shared/lesson.ts';
import { bandQuestions, hasAllBandsInOrder, PLACEMENT_COUNTS, PlacementTestSchema, type PlacementBand } from '../../shared/placement.ts';
import { BLANK } from '../../shared/schema.ts';
import { PLACEMENT_LENGTHS } from '../ai/prompts.ts';
import { BUILTIN_PLACEMENT_TEST } from './builtin.ts';

// 內建的分級測驗是寫死的資料,而且每位使用者的第一次測驗都用它。
// 這裡用和要求 AI 出題時相同的規則檢查它:規則改了,內建的題目也要跟著過關。

const { bands } = BUILTIN_PLACEMENT_TEST;
type Check = (band: PlacementBand) => string[];
const problems = (check: Check): string[] => bands.flatMap((band) => check(band).map((problem) => `${band.level}: ${problem}`));
const questionsOf = (band: PlacementBand) => bandQuestions(band, true);

describe('內建的分級測驗', () => {
  it('格式正確,而且依 A1 到 C2 的順序各有一組', () => {
    expect(PlacementTestSchema.safeParse(BUILTIN_PLACEMENT_TEST).success).toBe(true);
    expect(hasAllBandsInOrder(BUILTIN_PLACEMENT_TEST)).toBe(true);
  });

  // 通過門檻是「8 題對 6 題」。題數不一樣,每一級的難易就不一樣。
  it('每個等級都是單字 2 題、文法 3 題、閱讀 2 題、聽力 1 題', () => {
    expect(
      problems((band) => {
        const counts = { vocab: band.vocab.length, grammar: band.grammar.length, reading: band.reading.questions.length, listening: band.listening.questions.length };
        return JSON.stringify(counts) === JSON.stringify(PLACEMENT_COUNTS) ? [] : [JSON.stringify(counts)];
      }),
    ).toEqual([]);
  });

  // 門檻是照 4 個選項亂猜的機率訂的;選項少了或重複,就比較容易猜對。
  it('每題都是 4 個不重複的選項,答案指向存在的選項', () => {
    expect(
      problems((band) =>
        questionsOf(band)
          .filter(({ mcq }) => mcq.options.length !== 4 || new Set(mcq.options.map((option) => option.trim().toLowerCase())).size !== 4 || mcq.options[mcq.answerIndex] === undefined)
          .map(({ key }) => key),
      ),
    ).toEqual([]);
  });

  // 答案集中在某個位置的話,學生發現規律就能猜對。
  it('每個等級的正確答案平均分布在四個位置', () => {
    expect(
      problems((band) => {
        const positions = [0, 1, 2, 3].map((index) => questionsOf(band).filter(({ mcq }) => mcq.answerIndex === index).length);
        return positions.every((count) => count === 2) ? [] : [positions.join(',')];
      }),
    ).toEqual([]);
  });

  it('文法題都是一個空格的句子', () => {
    expect(problems((band) => band.grammar.filter((mcq) => mcq.prompt.split(BLANK).length !== 2).map((mcq) => mcq.prompt))).toEqual([]);
  });

  // 短文與朗讀內容的長度就是難度的一部分:太短考不出這一級的閱讀與聽力。
  it('閱讀短文與聽力內容的長度符合該等級的範圍', () => {
    expect(
      problems((band) => {
        const range = PLACEMENT_LENGTHS[band.level];
        const passage = countWords(band.reading.passage);
        const script = countWords(band.listening.script);
        return [
          ...(passage < range.passage[0] || passage > range.passage[1] ? [`短文 ${passage} 字`] : []),
          ...(script < range.script[0] || script > range.script[1] ? [`聽力 ${script} 字`] : []),
        ];
      }),
    ).toEqual([]);
  });

  // 聽力內容由單一的電腦語音唸出來,而且不顯示文字。
  it('聽力內容沒有對話標籤或唸不出來的符號', () => {
    expect(problems((band) => (/^\s*[A-Z][a-z]*:|[#*_<>|]|\d{5,}/m.test(band.listening.script) ? [band.listening.script] : []))).toEqual([]);
  });

  it('同一題不會出現兩次', () => {
    const prompts = bands.flatMap((band) => questionsOf(band).map(({ mcq }) => mcq.prompt.trim().toLowerCase()));
    expect(prompts.length - new Set(prompts).size).toBe(0);
  });

  it('每一題都有說明', () => {
    expect(problems((band) => questionsOf(band).filter(({ mcq }) => mcq.explanation.trim() === '').map(({ key }) => key))).toEqual([]);
  });
});
