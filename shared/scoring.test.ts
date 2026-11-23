import { describe, expect, it } from 'vitest';
import { correctAnswerText, FLASHCARD_FORGOT, type Exercise } from './lesson.ts';
import { checkAnswer, combineScore, gradeExercise, isExerciseDone, markSolution, normalizeAnswer, wordAccuracy, wrongResponses } from './scoring.ts';

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

  // 否則學生可以跳過不會的題目來拉高分數,分數就不代表學會了多少。
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

// 訂正:老師指出的錯句,學生要自己把正確的說法打出來。
describe('訂正題', () => {
  const rewrite: Exercise = { type: 'rewrite', original: 'I go to the park yesterday.', sentence: 'I went to the park yesterday.', explanation: '過去式' };
  const once = (response: string) => gradeExercise(rewrite, { attempts: [response], hintUsed: false });

  it('打出正確的句子算答對;大小寫與標點不影響', () => {
    expect(once('i went to the park yesterday')).toEqual({ outcome: 'correct', credit: 1 });
  });

  // 訂正的重點就是那個改掉的字。照抄原句如果也能過關,這個練習就沒有意義。
  it('照抄原本錯的句子不算答對', () => {
    expect(checkAnswer(rewrite, rewrite.original)).toBe(false);
  });

  // 12 個字只改 1 個:照抄原句也有 92% 的字是對的。只看正確率的話,沒訂正也會過關。
  it('長句子照抄原句,即使大部分的字都對,也不算答對', () => {
    const long: Exercise = {
      type: 'rewrite',
      original: 'Last summer my family and I go to a small town near Hualien.',
      sentence: 'Last summer my family and I went to a small town near Hualien.',
      explanation: '過去式',
    };
    expect(checkAnswer(long, long.original)).toBe(false);
    // 改對了,但別的地方漏一個字:九成以上正確,算對。
    expect(checkAnswer(long, 'Last summer my family and I went to small town near Hualien.')).toBe(true);
    // 沒改到重點,只是別的地方不一樣:不算對。
    expect(checkAnswer(long, 'Last summer my family and I go to a town near Hualien.')).toBe(false);
  });

  it('訂正是刪掉多餘的字時,照抄原句同樣不算答對', () => {
    const extra: Exercise = {
      type: 'rewrite',
      original: 'I am agree with you about this plan very much.',
      sentence: 'I agree with you about this plan very much.',
      explanation: 'agree 是動詞,前面不加 am',
    };
    expect(checkAnswer(extra, extra.original)).toBe(false);
    expect(checkAnswer(extra, extra.sentence)).toBe(true);
  });

  it('和其他題目一樣有兩次機會,第二次才對算不熟', () => {
    expect(isExerciseDone(rewrite, { attempts: ['I go to the park yesterday.'], hintUsed: false })).toBe(false);
    expect(gradeExercise(rewrite, { attempts: ['I go to the park yesterday.', 'I went to the park yesterday.'], hintUsed: false }).outcome).toBe('unfamiliar');
  });

  it('答錯時,正確的句子裡標出改掉的那個字', () => {
    expect(markSolution(rewrite, rewrite.original).filter((part) => part.missed).map((part) => part.text)).toEqual(['went']);
  });
});

// 回顧時要讓學生看到「自己當時答了什麼」,才知道錯在哪裡。
describe('學生答錯的內容', () => {
  const answered = (...attempts: string[]) => ({ attempts, hintUsed: false });

  // 作答紀錄存的是第幾個選項;學生看到「0」不會知道自己選了什麼。
  it('選擇題列出選項的文字,不是選項的編號', () => {
    expect(wrongResponses(mcq, answered('0', '2'))).toEqual(['A', 'C']);
  });

  it('第二次才答對:只列第一次答錯的內容', () => {
    expect(wrongResponses(cloze, answered('is', 'am'))).toEqual(['is']);
  });

  it('兩次都錯就兩次都列;兩次答的一樣只列一次', () => {
    expect(wrongResponses(cloze, answered('is', 'are'))).toEqual(['is', 'are']);
    expect(wrongResponses(cloze, answered('is', ' is '))).toEqual(['is']);
  });

  // 這種情況被記為不熟,但學生並沒有答錯,不能憑空列出一個錯誤答案。
  it('看了提示才答對的,沒有答錯的內容', () => {
    expect(wrongResponses(cloze, { attempts: ['am'], hintUsed: true })).toEqual([]);
  });

  it('閃卡與自評沒有作答內容', () => {
    const card: Exercise = { type: 'flashcard', front: 'I go yesterday.', back: 'I went yesterday.', explanation: '' };
    const dictation: Exercise = { type: 'dictation', sentence: 'They went home.', explanation: '' };
    expect(wrongResponses(card, answered(FLASHCARD_FORGOT))).toEqual([]);
    expect(wrongResponses(dictation, answered('', ''))).toEqual([]);
    expect(wrongResponses(cloze, undefined)).toEqual([]);
  });
});

// 只給正確答案,學生還得自己逐字比對;標出錯的地方才看得到差在哪裡。
describe('在正確答案裡標出答錯的地方', () => {
  const dictation: Exercise = { type: 'dictation', sentence: 'I went to school yesterday.', explanation: '' };
  const missed = (exercise: Exercise, response: string | undefined) =>
    markSolution(exercise, response)
      .filter((part) => part.missed)
      .map((part) => part.text);

  it('克漏字:標出空格裡該填的字', () => {
    expect(markSolution(cloze, 'is')).toEqual([
      { text: 'I ', missed: false },
      { text: 'am', missed: true },
      { text: ' happy.', missed: false },
    ]);
  });

  it('聽寫與跟讀:只標沒有對上的字', () => {
    expect(missed(dictation, 'I go to school yesterday')).toEqual(['went']);
    expect(missed({ ...dictation, type: 'readAloud' }, 'I went to school')).toEqual(['yesterday.']);
  });

  // 判分時不計大小寫與標點,標示也要一致,否則會把算對的字標成錯的。
  it('大小寫與標點不同不算錯', () => {
    expect(missed(dictation, 'i WENT to school, yesterday!')).toEqual([]);
    expect(missed({ type: 'dictation', sentence: 'It’s nine o’clock.', explanation: '' }, "it's nine o'clock")).toEqual([]);
  });

  it('連續答錯的字標成一整段,不是一個字一段', () => {
    expect(missed(dictation, 'I yesterday')).toEqual(['went to school']);
  });

  it('重組:標出位置排錯的字', () => {
    expect(missed(reorder, "We didn't basketball play yesterday.")).toHaveLength(1);
    expect(missed(reorder, reorder.sentence)).toEqual([]);
  });

  // 畫面上是一個字,不能只標半個。
  it('帶連字號的字只要有一部分沒對上,整個字都標出來', () => {
    const exercise: Exercise = { type: 'dictation', sentence: 'She is a well-known writer.', explanation: '' };
    expect(missed(exercise, 'She is a well writer')).toEqual(['well-known']);
  });

  // 沒有可以比對的作答時(手動標記、自評、選擇題),整句都標起來沒有意義。
  it('沒有作答內容、選擇題、閃卡:什麼都不標', () => {
    expect(missed(dictation, undefined)).toEqual([]);
    expect(missed(dictation, '')).toEqual([]);
    expect(missed(cloze, undefined)).toEqual([]);
    expect(missed(mcq, '0')).toEqual([]);
  });

  // 標示只是加上記號,不能改掉答案本身。
  it('各段接起來就是原本的正確答案', () => {
    for (const [exercise, response] of [
      [cloze, 'is'],
      [reorder, 'yesterday We play'],
      [dictation, 'went I school to'],
      [mcq, '0'],
    ] as const) {
      const joined = markSolution(exercise, response)
        .map((part) => part.text)
        .join('');
      expect(joined).toBe(correctAnswerText(exercise));
    }
  });
});
