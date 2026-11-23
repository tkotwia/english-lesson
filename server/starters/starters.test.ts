import { describe, expect, it } from 'vitest';
import { countWords } from '../../shared/lesson.ts';
import { BLANK, LessonSchema, LEVELS, STAGES, ZH_SUPPORT, type Lesson, type Level, type Mcq, type Stage } from '../../shared/schema.ts';
import { normalizeAnswer } from '../../shared/scoring.ts';
import { lessonSize, LEVEL_GUIDES, pickGrammarPoint, pickTopic, STAGE_GUIDES } from '../ai/cefr.ts';
import { STARTER_MINUTES, starterFor } from './index.ts';

// 起始課是人工寫好、直接拿給學生上的課,沒有 AI 重新產生的機會,
// 所以這裡把「交給 AI 產生課程時要求的規則」同樣套在起始課上,寫錯就擋下來。

const ALL = LEVELS.flatMap((level) => STAGES.map((stage) => ({ level, stage, name: `${level}/${stage}`, ...starterFor(level, stage) })));

type Check = (starter: (typeof ALL)[number]) => string[];

/** 對 24 堂課逐一檢查,回傳所有違規(帶上是哪一堂),方便一次看完。 */
const problems = (check: Check): string[] => ALL.flatMap((starter) => check(starter).map((problem) => `${starter.name}: ${problem}`));

const CJK = /[㐀-鿿]/;
const words = (text: string): string[] => normalizeAnswer(text).split(' ').filter(Boolean);
const allMcqs = (lesson: Lesson): Mcq[] => [...lesson.listening.questions, ...lesson.reading.questions, ...lesson.grammar.mcq];

/** 題目結尾的提示括號(例如 (see))不是句子的一部分。 */
const withoutCue = (sentence: string): string => sentence.replace(/\s*\([^)]*\)\s*$/, '');

/** 把填空題還原成「答對時學生看到的完整句子」。 */
const fill = (sentence: string, answer: string): string => withoutCue(sentence).replace(BLANK, answer);

/** 答案連同空格前後各一個字。這一小段如果原封不動出現在別處,答案就是用抄的。 */
function aroundBlank(sentence: string, answer: string): string {
  const [before = '', after = ''] = withoutCue(sentence).split(BLANK);
  return [words(before).at(-1), ...words(answer), words(after)[0]].filter(Boolean).join(' ');
}

/** shown 裡是否原封不動地出現 phrase 這串連續的字。 */
const shows = (shown: string, phrase: string): boolean => ` ${words(shown).join(' ')} `.includes(` ${words(phrase).join(' ')} `);

/** text 的「連續三個字」片段,有多少比例出現在 shown 裡。整句照抄是 1,只是用了相同的常見字則接近 0。 */
function copied(text: string, shown: string): number {
  const list = words(text);
  const pieces = list.slice(0, Math.max(list.length - 2, 1)).map((_, index) => list.slice(index, index + 3).join(' '));
  return pieces.filter((piece) => shows(shown, piece)).length / pieces.length;
}

/** 目標單字以原形列出;課文裡是不規則變化形的,在這裡註明。 */
const IRREGULAR_FORMS: Record<string, string> = { find: 'found' };

/** 與上課畫面相同的比對方式:不分大小寫,而且要是完整的字。 */
const inPassage = (passage: string, term: string): boolean => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(passage);

describe('內建起始課:24 個「等級 × 學習階段」都要有一堂可以直接上的 20 分鐘課', () => {
  it('每一堂都通過課程格式驗證(否則學生第一堂課就會壞掉,而且沒有 AI 可以重新產生)', () => {
    expect(ALL).toHaveLength(24);
    expect(problems(({ lesson }) => (LessonSchema.safeParse(lesson).success ? [] : ['不符合 LessonSchema']))).toEqual([]);
  });

  it('標題不重覆(切換等級後看到的應該是不同的課)', () => {
    const titles = ALL.map(({ lesson }) => lesson.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  // 起始課頂替的是「AI 產生的 20 分鐘課」。份量不同的話,上課時間與各部分配分的前提就不成立。
  it('份量與 AI 產生的 20 分鐘課相同', () => {
    expect(
      problems(({ level, lesson }) => {
        const size = lessonSize(level, STARTER_MINUTES);
        const count = countWords(lesson.passage.text);
        const { mcq, cloze, reorder } = lesson.grammar;
        return [
          count < size.passageWords[0] || count > size.passageWords[1] ? `課文 ${count} 字,應在 ${size.passageWords.join('–')} 之間` : '',
          lesson.listening.questions.length !== size.listeningQuestions ? `聽力題 ${lesson.listening.questions.length} 題` : '',
          lesson.listening.dictation.length !== size.dictation ? `聽寫 ${lesson.listening.dictation.length} 句` : '',
          lesson.reading.questions.length !== size.readingQuestions ? `閱讀題 ${lesson.reading.questions.length} 題` : '',
          lesson.vocab.length !== size.vocab ? `單字 ${lesson.vocab.length} 個` : '',
          mcq.length + cloze.length + reorder.length !== size.grammarExercises ? `文法練習 ${mcq.length + cloze.length + reorder.length} 題` : '',
          mcq.length === 0 || cloze.length === 0 || reorder.length === 0 ? '文法練習三種題型沒有各至少一題' : '',
          lesson.speaking.readAloud.length !== size.readAloud ? `跟讀 ${lesson.speaking.readAloud.length} 句` : '',
          lesson.grammar.examples.length !== 3 ? `文法例句 ${lesson.grammar.examples.length} 句,應為 3 句` : '',
          lesson.glossary.length < 6 || lesson.glossary.length > 12 ? `生字表 ${lesson.glossary.length} 個,應為 6–12 個` : '',
          lesson.writing.minWords !== LEVEL_GUIDES[level].writingWords ? `寫作最少 ${lesson.writing.minWords} 字,該等級應為 ${LEVEL_GUIDES[level].writingWords}` : '',
        ].filter(Boolean);
      }),
    ).toEqual([]);
  });

  // 之後的課由程式依「上過的主題與文法」輪替。起始課的標記若不在清單裡,下一堂 AI 課就可能又教同一個主題或文法。
  it('主題與文法重點接得上之後的輪替:下一堂課不會重覆起始課教過的', () => {
    expect(
      problems(({ level, stage, topic, grammarPoint, lesson }) => [
        ...(STAGE_GUIDES[stage].topics.includes(topic) ? [] : [`主題「${topic}」不在 ${stage} 的主題清單裡`]),
        ...(grammarPoint === LEVEL_GUIDES[level].grammar[0] ? [] : [`文法重點「${grammarPoint}」不是 ${level} 清單的第一項`]),
        ...(pickTopic(stage, [topic]) === topic ? ['下一堂課會挑到同一個主題'] : []),
        ...(pickGrammarPoint(level, [grammarPoint]) === grammarPoint ? ['下一堂課會挑到同一個文法重點'] : []),
        ...(lesson.grammar.point.trim() === '' ? ['沒有文法重點名稱'] : []),
      ]),
    ).toEqual([]);
  });

  // 聽寫是「聽課文裡的句子再打出來」,跟讀是「唸課文裡的句子」。句子不在課文裡,學生就是在練沒學過的內容。
  it('聽寫與跟讀的句子一字不差地出自課文;聽寫每句不超過 12 個字', () => {
    expect(
      problems(({ lesson }) => [
        ...lesson.listening.dictation.filter((sentence) => !lesson.passage.text.includes(sentence)).map((sentence) => `聽寫句不在課文裡:${sentence}`),
        ...lesson.listening.dictation.filter((sentence) => countWords(sentence) > 12).map((sentence) => `聽寫句超過 12 個字:${sentence}`),
        ...lesson.speaking.readAloud.filter((sentence) => !lesson.passage.text.includes(sentence)).map((sentence) => `跟讀句不在課文裡:${sentence}`),
      ]),
    ).toEqual([]);
  });

  // 生字表是讀課文時點得到的註解;目標單字是「從課文裡學」的字。兩者都必須真的在課文裡出現。
  it('生字表與目標單字都出現在課文裡;兩者不重覆,單字本身也不重覆', () => {
    expect(
      problems(({ lesson }) => {
        const passage = lesson.passage.text.toLowerCase();
        const targets = lesson.vocab.map((item) => item.word.toLowerCase());
        // 目標單字以原形列出,課文裡可能是變化形(realize → realized、admit → admitted),所以比對字幹。
        const stem = (word: string) => IRREGULAR_FORMS[word] ?? (word.endsWith('e') ? word.slice(0, -1) : word);
        return [
          ...lesson.glossary.filter((item) => !inPassage(lesson.passage.text, item.word)).map((item) => `生字「${item.word}」不在課文裡`),
          ...lesson.glossary.filter((item) => targets.includes(item.word.toLowerCase())).map((item) => `生字「${item.word}」同時是目標單字`),
          ...targets.filter((word) => !passage.includes(stem(word))).map((word) => `目標單字「${word}」不在課文裡`),
          ...(new Set(targets).size === targets.length ? [] : ['目標單字重覆']),
        ];
      }),
    ).toEqual([]);
  });

  // 正確答案老是在同一個位置的話,學生學到的是「選第幾個」而不是英文。
  it('選擇題:選項數符合該等級、選項不重覆、正確答案的位置有變化', () => {
    expect(
      problems(({ level, lesson }) => {
        const expected = LEVEL_GUIDES[level].mcqOptions;
        const mcqs = allMcqs(lesson);
        const positions = new Set(mcqs.map((item) => item.answerIndex));
        return [
          ...mcqs.filter((item) => item.options.length !== expected).map((item) => `選項數不是 ${expected}:${item.prompt}`),
          ...mcqs.filter((item) => new Set(item.options.map(normalizeAnswer)).size !== item.options.length).map((item) => `選項重覆:${item.prompt}`),
          ...(positions.size < 3 ? [`正確答案只出現在 ${positions.size} 種位置`] : []),
        ];
      }),
    ).toEqual([]);
  });

  // 文法例句就顯示在練習題的正上方。答案如果能直接從例句抄下來,這一題就沒有在考文法。
  it('文法練習的答案不能從上方的例句直接抄到', () => {
    expect(
      problems(({ lesson }) => {
        const { examples, mcq, cloze, reorder } = lesson.grammar;
        // 填空題:答案連同前後的字,不能原封不動出現在例句裡。
        const blanks = [
          ...mcq.filter((item) => item.prompt.includes(BLANK)).map((item) => ({ sentence: item.prompt, answers: [item.options[item.answerIndex]!] })),
          ...cloze.map((item) => ({ sentence: item.sentence, answers: item.answers })),
        ];
        // 重組句,以及沒有空格的選擇題(例如「哪一句最正式」):整句不能大半是例句的片段。
        const whole = [...mcq.filter((item) => !item.prompt.includes(BLANK)).map((item) => item.options[item.answerIndex]!), ...reorder.map((item) => item.sentence)];
        return [
          ...blanks
            .filter(({ sentence, answers }) => answers.some((answer) => examples.some((example) => shows(example, aroundBlank(sentence, answer)))))
            .map(({ sentence }) => `例句裡就有這一題的答案:${sentence}`),
          ...whole.filter((text) => examples.some((example) => copied(text, example) >= 0.5)).map((text) => `這一句大半出自例句:${text}`),
        ];
      }),
    ).toEqual([]);
  });

  // 單字卡上有例句,接著才做克漏字。兩者是同一句的話,學生只是在默寫剛看到的句子。
  it('單字的克漏字是新的句子,不是單字卡上的例句,而且答案就是這個單字', () => {
    expect(
      problems(({ lesson }) =>
        lesson.vocab.flatMap((item) => {
          const answer = item.cloze.answers[0]!;
          return [
            ...(copied(fill(item.cloze.sentence, answer), item.example) >= 0.5 ? [`「${item.word}」的克漏字與例句幾乎相同`] : []),
            ...(answer.toLowerCase().startsWith(item.word.toLowerCase().slice(0, 3)) ? [] : [`「${item.word}」的克漏字答案是「${answer}」`]),
            ...(lesson.passage.text.includes(fill(item.cloze.sentence, answer)) ? [`「${item.word}」的克漏字是課文原句`] : []),
          ];
        }),
      ),
    ).toEqual([]);
  });

  // 用了提示只拿半分、記為「不熟」。提示如果直接寫出答案,這個分類就沒有意義。
  it('克漏字的提示不會直接寫出答案', () => {
    expect(
      problems(({ lesson }) =>
        [...lesson.vocab.map((item) => item.cloze), ...lesson.grammar.cloze]
          .filter((item) => item.answers.some((answer) => words(item.hint).includes(normalizeAnswer(answer))))
          .map((item) => `提示「${item.hint}」裡有答案`),
      ),
    ).toEqual([]);
  });

  // 重組句子太短等於送分,太長則畫面上的字卡太多、難度不合理(與要求 AI 的規則相同)。
  it('重組句子的長度在 4–10 個字之間', () => {
    expect(
      problems(({ lesson }) => lesson.grammar.reorder.filter((item) => countWords(item.sentence) < 4 || countWords(item.sentence) > 10).map((item) => `${countWords(item.sentence)} 個字:${item.sentence}`)),
    ).toEqual([]);
  });

  // 中文輔助的多寡是依等級決定的教學設計:A1–A2 用中文解說,B1 中英並用,B2 以上全英文。
  it('中文輔助符合該等級的設定', () => {
    expect(
      problems(({ level, lesson }) => {
        const support = LEVEL_GUIDES[level].zhSupport;
        const hasChinese = CJK.test(JSON.stringify(lesson));
        if (support === ZH_SUPPORT.B2) {
          return [...(hasChinese ? ['B2 以上不該出現中文'] : []), ...(lesson.passage.translation === '' ? [] : ['B2 以上不提供課文翻譯'])];
        }
        return [
          ...(CJK.test(lesson.passage.translation) ? [] : ['缺少課文的中文翻譯']),
          ...(lesson.glossary.every((item) => CJK.test(item.meaning)) ? [] : ['生字表的意思應該是中文']),
          ...(lesson.vocab.every((item) => CJK.test(item.meaning)) ? [] : ['單字的意思應該是中文']),
          ...(CJK.test(lesson.grammar.explanation) ? [] : ['文法解說缺少中文']),
        ];
      }),
    ).toEqual([]);
  });

  // 情境對話由老師的第一句話開始。沒有以問句結尾,學生不知道該回答什麼。
  it('情境對話的開場白以問句結尾', () => {
    expect(problems(({ lesson }) => (lesson.speaking.opening.trim().endsWith('?') ? [] : [`開場白不是問句:${lesson.speaking.opening}`]))).toEqual([]);
  });
});

describe('起始課的適用範圍', () => {
  it('只有 20 分鐘有起始課', () => {
    expect(STARTER_MINUTES).toBe(20);
  });

  it.each(LEVELS.flatMap((level: Level) => STAGES.map((stage: Stage) => [level, stage] as const)))('%s × %s 拿得到起始課', (level, stage) => {
    expect(starterFor(level, stage).lesson.title).not.toBe('');
  });
});
