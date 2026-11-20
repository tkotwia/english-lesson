import { countWords } from '../../shared/lesson.ts';
import type { ChatReply, Grade, Lesson } from '../../shared/schema.ts';
import type { MockFixtures } from './mock.ts';

/** 假資料模式使用的範例課程(A2 程度),結構與真實 AI 回傳的完全相同。 */
export const MOCK_LESSON: Lesson = {
  title: 'A Night Market Adventure',
  intro: '嗨!我是 Emma 老師。今天我們要讀一篇關於夜市的短文,學幾個實用的單字,還會練習「過去簡單式」。準備好了嗎?Let’s start!',
  passage: {
    text:
      'Last Saturday, Kevin went to the night market with his sister Amy. The market was crowded and noisy, but they loved it. ' +
      'First, they bought fried chicken and shared it. It was hot and delicious. Then Amy wanted bubble tea, so they waited in a long line. ' +
      'After that, Kevin played a ring toss game and won a small toy bear. He gave it to Amy because she was a little tired. ' +
      'They spent two hundred dollars and went home at nine o’clock. Kevin said it was the best night of the week.',
    translation:
      '上星期六,Kevin 和他的妹妹 Amy 去了夜市。夜市又擠又吵,但他們很喜歡。首先,他們買了炸雞一起分著吃,又燙又好吃。' +
      '接著 Amy 想喝珍珠奶茶,所以他們排了很長的隊。之後,Kevin 玩了套圈圈遊戲,贏得一隻小玩具熊。因為 Amy 有點累了,他把熊送給她。' +
      '他們花了兩百元,九點回家。Kevin 說這是這星期最棒的一晚。',
  },
  glossary: [
    { word: 'noisy', meaning: '吵鬧的' },
    { word: 'fried', meaning: '油炸的' },
    { word: 'bubble tea', meaning: '珍珠奶茶' },
    { word: 'ring toss', meaning: '套圈圈' },
    { word: 'tired', meaning: '累的' },
  ],
  listening: {
    questions: [
      {
        prompt: 'Where did Kevin and Amy go?',
        options: ['To a night market', 'To a school', 'To a zoo', 'To a library'],
        answerIndex: 0,
        explanation: '文章第一句就說他們去了 night market(夜市)。',
      },
      {
        prompt: 'How did Kevin feel about the night?',
        options: ['He was angry.', 'He was bored.', 'He thought it was great.', 'He was sad.'],
        answerIndex: 2,
        explanation: '最後一句說 it was the best night of the week,表示他覺得很棒。',
      },
    ],
    dictation: ['They bought fried chicken and shared it.', 'They went home at nine o’clock.'],
  },
  reading: {
    questions: [
      {
        prompt: 'What did they buy first?',
        options: ['Bubble tea', 'Fried chicken', 'A toy bear', 'Ice cream'],
        answerIndex: 1,
        explanation: '文中說 First, they bought fried chicken,所以最先買的是炸雞。',
      },
      {
        prompt: 'Why did Kevin give the toy bear to Amy?',
        options: ['Because she won the game.', 'Because she paid for it.', 'Because she was a little tired.', 'Because it was her birthday.'],
        answerIndex: 2,
        explanation: '文中說 He gave it to Amy because she was a little tired。',
      },
      {
        prompt: 'What time did they go home?',
        options: ['At seven o’clock', 'At eight o’clock', 'At nine o’clock', 'At ten o’clock'],
        answerIndex: 2,
        explanation: '文中說 went home at nine o’clock。',
      },
    ],
  },
  vocab: [
    {
      word: 'crowded',
      pos: 'adj.',
      meaning: '擁擠的',
      example: 'The bus is always crowded in the morning.',
      cloze: {
        sentence: 'The train station was very ___ during the holiday.',
        answers: ['crowded'],
        hint: '擁擠的(c 開頭)',
        explanation: 'crowded 形容人很多、很擠的地方。',
      },
    },
    {
      word: 'delicious',
      pos: 'adj.',
      meaning: '美味的',
      example: 'My mom makes delicious noodles.',
      cloze: {
        sentence: 'This cake is ___! Can I have another piece?',
        answers: ['delicious'],
        hint: '美味的(d 開頭)',
        explanation: 'delicious 用來形容食物很好吃。',
      },
    },
    {
      word: 'share',
      pos: 'v.',
      meaning: '分享',
      example: 'Please share your toys with your brother.',
      cloze: {
        sentence: 'We only have one pizza, so let’s ___ it.',
        answers: ['share'],
        hint: '分享(s 開頭)',
        explanation: 'share 是把東西分給別人一起用或一起吃。',
      },
    },
    {
      word: 'spend',
      pos: 'v.',
      meaning: '花(錢或時間)',
      example: 'I spend one hour on homework every day.',
      cloze: {
        sentence: 'How much money did you ___ on that jacket?',
        answers: ['spend'],
        hint: '花費(s 開頭)',
        explanation: 'did 後面接原形動詞,所以用 spend 而不是 spent。',
      },
    },
  ],
  grammar: {
    point: '過去簡單式(Past Simple)',
    explanation:
      '說「過去已經發生的事」時,動詞要改成過去式。規則動詞加 -ed(play → played、want → wanted);' +
      '不規則動詞要背(go → went、buy → bought、give → gave、win → won)。' +
      '常見錯誤:中文沒有時態變化,所以很容易忘記改動詞,例如把 I went 說成 I go。',
    examples: ['Kevin went to the night market last Saturday.', 'They bought fried chicken.', 'Amy wanted bubble tea.'],
    mcq: [
      {
        prompt: 'Yesterday I ___ to school by bus.',
        options: ['go', 'goes', 'went', 'going'],
        answerIndex: 2,
        explanation: 'yesterday 是過去的時間,go 的過去式是 went。',
      },
    ],
    cloze: [
      {
        sentence: 'She ___ a new bag last week. (buy)',
        answers: ['bought'],
        hint: 'buy 是不規則動詞,過去式不是加 -ed',
        explanation: 'buy 的過去式是 bought。',
      },
    ],
    reorder: [
      {
        sentence: 'We played basketball after school yesterday.',
        translation: '我們昨天放學後打了籃球。',
        explanation: '句型是「主詞 + 過去式動詞 + 受詞 + 時間」,play 的過去式是 played。',
      },
    ],
  },
  speaking: {
    readAloud: ['The market was crowded and noisy.', 'Kevin played a ring toss game and won a small toy bear.'],
    scenario: '你剛從夜市回來,老師想知道你去了哪裡、吃了什麼。',
    opening: 'Hi! I heard you went to a night market last weekend. What did you eat there?',
  },
  writing: {
    prompt: '寫 3 到 5 句話,描述你上個週末做了什麼。記得用過去式。',
    minWords: 20,
    tips: ['用 Last weekend, I … 開頭', '試著用今天學的單字:crowded、delicious、share、spend', '動詞記得改成過去式'],
  },
};

/** 假的批改結果:寫作字數夠給 88 分,不足給 55 分;對話固定給 90 分;各附一個示範錯誤。 */
function mockGrade(request: { input: string }): Grade {
  const match = request.input.match(/<student_writing>\n?([\s\S]*?)\n?<\/student_writing>/);
  const text = match?.[1]?.trim() ?? '';
  const enough = countWords(text) >= MOCK_LESSON.writing.minWords;
  return {
    writing: {
      score: enough ? 88 : 55,
      corrected: text,
      comment: enough ? '(假資料)句子通順,有用到過去式。下次可以多加一點細節。' : '(假資料)字數不足,請再多寫幾句。',
    },
    speaking: { score: 90, comment: '(假資料)回答切題,也能把話題接下去。注意過去式的動詞變化。' },
    errors: [
      {
        source: 'writing',
        original: 'I go to the park yesterday.',
        corrected: 'I went to the park yesterday.',
        explanation: '(假資料示範)yesterday 是過去的時間,動詞要用過去式 went。',
        severity: 'unfamiliar',
      },
      {
        source: 'speaking',
        original: 'I eat fried chicken there.',
        corrected: 'I ate fried chicken there.',
        explanation: '(假資料示範)在講上週末的事,eat 要改成過去式 ate。',
        severity: 'unfamiliar',
      },
    ],
    closing: '(假資料)今天表現很好!記得複習過去式的不規則動詞,下次見。',
  };
}

/** 假的對話回覆:依提示裡的剩餘輪數決定要不要收尾,學生的話裡有 eat 就示範一次糾正。 */
function mockChat(request: { input: string }): ChatReply {
  const lastTurn = request.input.includes("student's last turn");
  const message = request.input.split('\nStudent: ').at(-1)?.split('\n')[0] ?? '';
  return {
    reply: lastTurn ? '(mock) Thank you for telling me about it. Great talking with you!' : '(mock) That sounds fun! What else did you do there?',
    corrections: /\beat\b/i.test(message)
      ? [{ original: message, corrected: message.replace(/\beat\b/i, 'ate'), explanation: '(假資料示範)講過去的事要用過去式 ate。' }]
      : [],
  };
}

export const MOCK_FIXTURES: MockFixtures = {
  lesson: MOCK_LESSON,
  grade: mockGrade,
  chat: mockChat,
  ask: () => ({ answer: '(假資料)這是老師的回答示範:went 是 go 的過去式,例如 I went to school yesterday.' }),
};
