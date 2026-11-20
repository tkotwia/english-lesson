import { ZH_SUPPORT, type Level, type Minutes, type Stage, type ZhSupport } from '../../shared/schema.ts';

export interface LevelGuide {
  /** 這個等級的學生能做到什麼(CEFR 能力描述的摘要)。 */
  canDo: string;
  /** 適合這個等級的文法重點,大致由淺到深。每堂課由程式依序指定一個,不交給 AI 挑。 */
  grammar: string[];
  /** 30 分鐘課程的課文字數範圍。 */
  passageWords: [number, number];
  /** 寫作任務的最少字數。 */
  writingWords: number;
  /** 選擇題的選項數。 */
  mcqOptions: 3 | 4;
  zhSupport: ZhSupport;
}

export const LEVEL_GUIDES: Record<Level, LevelGuide> = {
  A1: {
    canDo: 'Understands and uses very basic everyday expressions; introduces themselves; simple questions about personal details; short, simple sentences with high-frequency words.',
    grammar: [
      "be (am/is/are)",
      "have/has",
      "present simple",
      "can/can’t",
      "there is/are",
      "this/that/these/those",
      "plural nouns",
      "possessive adjectives",
      "basic prepositions of place",
      "imperatives",
      "like + -ing",
    ],
    passageWords: [50, 80],
    writingWords: 15,
    mcqOptions: 3,
    zhSupport: ZH_SUPPORT.A1,
  },
  A2: {
    canDo: 'Understands frequently used expressions about family, shopping, school, local area; describes routine matters and past events in simple terms.',
    grammar: [
      "past simple (regular and irregular)",
      "present continuous",
      "be going to / will",
      "comparatives and superlatives",
      "adverbs of frequency",
      "countable/uncountable with some/any/much/many",
      "should/must/have to",
      "simple conjunctions (because, so, but, when)",
    ],
    passageWords: [90, 130],
    writingWords: 30,
    mcqOptions: 4,
    zhSupport: ZH_SUPPORT.A2,
  },
  B1: {
    canDo: 'Understands the main points of clear standard input on familiar matters; describes experiences, events, hopes and plans; gives brief reasons and explanations.',
    grammar: [
      "present perfect (vs past simple)",
      "past continuous",
      "first and second conditionals",
      "defining relative clauses",
      "simple passive",
      "used to",
      "reported speech (statements)",
      "modals of possibility",
      "gerunds and infinitives",
    ],
    passageWords: [140, 190],
    writingWords: 70,
    mcqOptions: 4,
    zhSupport: ZH_SUPPORT.B1,
  },
  B2: {
    canDo: 'Understands the main ideas of complex text on concrete and abstract topics; interacts with fluency; writes clear, detailed text and explains a viewpoint with advantages and disadvantages.',
    grammar: [
      "third and mixed conditionals",
      "passive in all tenses",
      "modals of deduction (must have, can’t have)",
      "wish / if only",
      "non-defining relative clauses",
      "reported questions",
      "future perfect and continuous",
      "participle clauses",
      "linking devices of contrast and concession",
    ],
    passageWords: [200, 260],
    writingWords: 120,
    mcqOptions: 4,
    zhSupport: ZH_SUPPORT.B2,
  },
  C1: {
    canDo: 'Understands demanding, longer texts and implicit meaning; expresses ideas fluently and precisely; uses language flexibly for social, academic and professional purposes.',
    grammar: [
      "inversion after negative adverbials",
      "cleft sentences",
      "advanced participle clauses",
      "subjunctive and formal structures",
      "nominalisation",
      "hedging and stance",
      "ellipsis and substitution",
      "complex noun phrases",
    ],
    passageWords: [280, 350],
    writingWords: 180,
    mcqOptions: 4,
    zhSupport: ZH_SUPPORT.C1,
  },
  C2: {
    canDo: 'Understands virtually everything with ease; summarises and reconstructs arguments; expresses fine shades of meaning precisely, even in complex situations.',
    grammar: [
      "register shifts and stylistic choice",
      "idiomatic and figurative language",
      "advanced discourse markers",
      "rhetorical inversion and fronting",
      "subtle modality",
      "cohesion across long texts",
    ],
    passageWords: [330, 400],
    writingWords: 220,
    mcqOptions: 4,
    zhSupport: ZH_SUPPORT.C2,
  },
};

export interface StageGuide {
  /** 年齡與語氣的說明。 */
  audience: string;
  topics: string[];
}

export const STAGE_GUIDES: Record<Stage, StageGuide> = {
  elementary: {
    audience: 'an elementary school student aged about 7–12. Be playful, concrete and very encouraging. Use short sentences and familiar, everyday situations.',
    topics: [
      'my pet', 'my family', 'a day at school', 'favorite food', 'at the zoo', 'playing in the park', 'my best friend', 'a birthday party',
      'the weather today', 'my room', 'weekend with grandparents', 'at the supermarket', 'my favorite toy', 'a rainy day', 'sports day at school',
      'going to the beach', 'my favorite cartoon', 'helping at home', 'a class trip', 'my school bag',
    ],
  },
  junior: {
    audience: 'a junior high school student aged about 13–15. Be friendly and relatable; connect to school life, friends and hobbies.',
    topics: [
      'a school club', 'my favorite sport', 'a night market visit', 'using a smartphone wisely', 'a school trip', 'video games and homework',
      'making a new friend', 'a family vacation', 'my dream job', 'saving pocket money', 'a favorite singer or band', 'cooking a simple meal',
      'a memorable holiday', 'riding public transport', 'taking care of a pet', 'a school festival', 'healthy habits', 'a funny mistake',
      'learning a musical instrument', 'helping a classmate',
    ],
  },
  senior: {
    audience: 'a senior high school student aged about 16–18. Be respectful and motivating; topics can touch on study, future plans and accessible social issues.',
    topics: [
      'preparing for a big exam', 'choosing a university major', 'social media and friendship', 'a part-time job experience', 'protecting the environment',
      'volunteering in the community', 'a book or film that changed my mind', 'time management', 'studying abroad', 'sleep and health',
      'technology in the classroom', 'a cultural festival', 'pressure and how to handle it', 'a science discovery', 'travelling on a budget',
      'learning from failure', 'online shopping', 'school uniforms: for and against', 'a local hero', 'the future of transport',
    ],
  },
  university: {
    audience: 'a university student (adult learner). Treat them as an adult; topics can cover campus life, careers, travel and current affairs.',
    topics: [
      'living in a dormitory', 'a job interview', 'an internship experience', 'working part-time while studying', 'backpacking abroad',
      'remote work and study', 'managing personal finances', 'artificial intelligence in daily life', 'a group project gone wrong', 'exchange programmes',
      'starting a small business', 'mental health on campus', 'renting an apartment', 'sustainable living', 'giving a presentation',
      'networking and careers', 'cultural differences when travelling', 'news and media literacy', 'graduate school or work', 'a life-changing course',
    ],
  },
};

export interface LessonSize {
  passageWords: [number, number];
  listeningQuestions: number;
  dictation: number;
  readingQuestions: number;
  vocab: number;
  grammarExercises: number;
  readAloud: number;
}

/** 依課程長度決定各部分的份量。 */
export function lessonSize(level: Level, minutes: Minutes): LessonSize {
  const [min, max] = LEVEL_GUIDES[level].passageWords;
  const scale = minutes === 20 ? 0.8 : minutes === 40 ? 1.25 : 1;
  const counts =
    minutes === 20
      ? { listeningQuestions: 2, dictation: 2, readingQuestions: 3, vocab: 5, grammarExercises: 4, readAloud: 3 }
      : minutes === 40
        ? { listeningQuestions: 3, dictation: 3, readingQuestions: 5, vocab: 8, grammarExercises: 8, readAloud: 5 }
        : { listeningQuestions: 3, dictation: 2, readingQuestions: 4, vocab: 6, grammarExercises: 6, readAloud: 4 };
  return { passageWords: [Math.round(min * scale), Math.round(max * scale)], ...counts };
}

/**
 * 從候選清單挑一個「最久沒用過」的。history 是過去用過的項目,由新到舊。
 * 還有沒用過的就從中挑(pick 決定挑哪一個);全部用過了,就挑上次使用距今最久的那一個。
 * 這樣在清單輪完一遍之前,同一個項目不會出現第二次。
 */
function pickLeastRecent(candidates: readonly string[], history: readonly string[], pick: (unused: string[]) => string): string {
  const lastUsed = new Map<string, number>();
  history.forEach((value, index) => {
    if (!lastUsed.has(value)) lastUsed.set(value, index);
  });
  const unused = candidates.filter((candidate) => !lastUsed.has(candidate));
  if (unused.length > 0) return pick(unused);
  return candidates.reduce((oldest, candidate) => (lastUsed.get(candidate)! > lastUsed.get(oldest)! ? candidate : oldest));
}

/** 這堂課的主題:該學習階段裡最久沒上過的。還沒上過的主題隨機挑一個。 */
export function pickTopic(stage: Stage, history: readonly string[], random: () => number = Math.random): string {
  return pickLeastRecent(STAGE_GUIDES[stage].topics, history, (unused) => unused[Math.floor(random() * unused.length)]!);
}

/** 這堂課的文法重點:該等級裡最久沒教過的。還沒教過的依清單順序(由淺到深)。 */
export function pickGrammarPoint(level: Level, history: readonly string[]): string {
  return pickLeastRecent(LEVEL_GUIDES[level].grammar, history, (unused) => unused[0]!);
}
