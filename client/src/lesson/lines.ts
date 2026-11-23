import { ZH_SUPPORT, type Level } from '../../../shared/schema.ts';

// 老師在各階段之間說的固定台詞。課文、題目與講解由 AI 產生;這些串場的話寫死在這裡,不耗額度。
// 中文輔助隨等級遞減:A1–A2 用中文,B1 以上用英文。

export const TEACHER_NAME = 'Emma 老師';

const LINES = {
  fluencyIntro: {
    zh: '開始新課之前,先花兩三分鐘重溫上一課的課文。內容你已經熟了,所以這次的目標是「快」:聽得懂、讀得快、說得順。這部分不計分,也可以跳過。',
    en: 'Before the new lesson, let’s spend two or three minutes on the passage from last time. You already know it, so the goal now is speed: follow it by ear, read it faster, and say it smoothly. This part is not scored, and you can skip it.',
  },
  fluencyRead: {
    zh: '按「開始計時」後課文會出現。讀懂就好,盡量快,讀完按「讀完了」。',
    en: 'Press “開始計時” and the passage will appear. Read for meaning as fast as you comfortably can, then press “讀完了”.',
  },
  fluencyRetell: {
    zh: '不看課文,用英文說出這篇課文在講什麼。不用完美,想到什麼就說什麼,說得越多越好。',
    en: 'Without looking at the passage, say in English what it was about. It does not need to be perfect. Keep going and say as much as you can.',
  },
  fluencyDone: {
    zh: '很好!熱身完成,開始今天的課。',
    en: 'Nice work! Now for today’s lesson.',
  },
  reviewIntro: {
    zh: '上課前先暖身一下:這些是今天該複習的內容,有之前學過的單字,也有之前不會或不熟的地方。看看現在還記不記得。',
    en: 'Let’s warm up first with today’s review: words you learned earlier and things you found hard before. Let’s see what you remember now.',
  },
  reviewDone: {
    zh: '暖身完成!答對的會隔久一點再出現,還不熟的明天會再複習。',
    en: 'Warm-up done! What you got right will come back later; what you missed will return tomorrow.',
  },
  listenFirst: {
    zh: '先不要看課文,用聽的。按「播放課文」聽我唸一遍,可以重複聽,聽完再回答問題。',
    en: 'Listening first — no reading yet. Press “Play” to hear me read the passage. You can listen again. Then answer the questions.',
  },
  listeningQuestions: {
    zh: '現在回答幾個問題,看看你聽懂了多少。',
    en: 'Now a few questions to see how much you understood.',
  },
  dictationIntro: {
    zh: '接下來是聽寫:聽我唸一句,把聽到的英文打出來。可以重複聽。',
    en: 'Next, dictation: listen to a sentence and type what you hear. You can listen again.',
  },
  listeningDone: {
    zh: '聽力完成!接下來把這篇課文讀一遍。',
    en: 'Listening done! Now let’s read the passage.',
  },
  readAfterListening: {
    zh: '這就是剛才聽到的課文。讀完後按「我讀完了」,我會問你幾個問題。',
    en: 'Here is the passage you just heard. When you finish reading, press the button and I will ask you a few questions.',
  },
  readAloudIntro: {
    zh: '現在換你開口。先聽我唸,再按麥克風跟著唸一遍。',
    en: 'Now it’s your turn to speak. Listen to me first, then press the microphone and read the sentence aloud.',
  },
  noMic: {
    zh: '這台電腦目前不能使用麥克風,所以跳過跟讀,對話改用打字。',
    en: 'The microphone is not available on this computer, so we will skip reading aloud and you can type in the conversation.',
  },
  conversationIntro: {
    zh: '接著我們來聊聊天。用英文回答我,可以用說的,也可以用打的。說錯沒關係,我會幫你。',
    en: 'Now let’s have a chat. Answer me in English — speak or type. Mistakes are fine; I will help you.',
  },
  speakingDone: {
    zh: '口說完成,你很棒!最後一關是寫作。',
    en: 'Speaking done — great job! The last part is writing.',
  },
  readFirst: {
    zh: '先讀下面這篇短文。讀完後按「我讀完了」,我會問你幾個問題。',
    en: 'Read the passage below. When you finish, press the button and I will ask you a few questions.',
  },
  readingQuestions: {
    zh: '很好!現在回答幾個關於短文的問題。需要的話可以回頭看短文。',
    en: 'Good! Now answer a few questions about the passage. You can look back at it if you need to.',
  },
  readingDone: {
    zh: '閱讀的部分完成了,做得好!接下來學今天的單字與文法。',
    en: 'That’s the reading done — well done! Next, today’s vocabulary and grammar.',
  },
  vocabIntro: {
    zh: '這些是今天的重點單字。先看意思和例句,準備好就開始練習。',
    en: 'Here are today’s key words. Look at the meanings and examples, then start the practice when you are ready.',
  },
  vocabPractice: {
    zh: '把正確的單字填進空格。想不起來可以看提示,但看了提示只能拿一半分數喔。',
    en: 'Fill each gap with the right word. You can ask for a hint, but a hint means half marks.',
  },
  vocabPick: {
    zh: '從下面的單字裡,點選正確的那一個填進空格。想不起來可以看提示,但看了提示只能拿一半分數喔。',
    en: 'Tap the right word to fill each gap. You can ask for a hint, but a hint means half marks.',
  },
  grammarIntro: {
    zh: '單字練習完成!現在來看今天的文法重點。',
    en: 'Vocabulary done! Now for today’s grammar point.',
  },
  grammarPractice: {
    zh: '換你練習了。每一題有兩次機會。',
    en: 'Your turn to practise. You have two tries for each question.',
  },
  languageDone: {
    zh: '單字與文法都完成了!接下來開口練習。',
    en: 'Vocabulary and grammar are done! Next, some speaking practice.',
  },
  writingIntro: {
    zh: '現在用今天學到的單字和文法寫一小段。寫完後交給我批改。',
    en: 'Now write a short piece using today’s vocabulary and grammar. Hand it in when you are done and I will mark it.',
  },
  retry: {
    zh: '不太對,再想想看,還有一次機會。',
    en: 'Not quite. Think again — you have one more try.',
  },
} as const;

export type LineKey = keyof typeof LINES;

export function teacherLine(level: Level, key: LineKey): string {
  return ZH_SUPPORT[level] === 'full' ? LINES[key].zh : LINES[key].en;
}

const PRAISE = ['Great!', 'Exactly!', 'Well done!', 'Perfect!', 'Nice work!', 'That’s right!'];

/** 依題號挑一句稱讚,同一題每次顯示的都一樣。 */
export function praise(seed: string): string {
  let sum = 0;
  for (const char of seed) sum += char.charCodeAt(0);
  return PRAISE[sum % PRAISE.length]!;
}
