import { LessonSchema, type Lesson, type LessonNovelty, type Level, type Minutes, type Stage } from '../shared/schema.ts';
import { pickGrammarPoint, pickTopic } from './ai/cefr.ts';
import { lessonPrompt } from './ai/prompts.ts';
import { AiError, type AiProvider } from './ai/provider.ts';
import { usageRecorder } from './ai/usage.ts';
import type { Db } from './db.ts';
import { weakVocabWords } from './items.ts';
import { checkNovelty, DUPLICATE_THRESHOLD, type PastLesson } from './novelty.ts';

// 產生一堂新課:決定主題與文法重點、請 AI 產生、再和舊課比對。
// 「按下開始時現場備課」與「上課時在背景預先備好下一堂」都走這裡。

/** 產生新課時,把最近幾堂課的重點單字告訴 AI 避開。設上限是為了不讓提示無限變長。 */
const AVOID_VOCAB_LESSONS = 60;
/** 每堂新課最多帶幾個還不熟的單字回到課文裡。 */
const RECYCLE_WORDS = 5;

/** 產生課程需要知道的學生資料。刻意不包含名稱:名稱不會送給 AI。 */
export interface LessonStudent {
  id: number;
  level: Level;
  stage: Stage;
  apiKey: string;
}

/** 一堂剛產生、還沒開始上的課。 */
export interface NewLesson {
  level: Level;
  stage: Stage;
  minutes: Minutes;
  topic: string;
  grammarPoint: string;
  lesson: Lesson;
  novelty: LessonNovelty;
}

interface HistoryLesson extends PastLesson {
  level: Level;
  topic: string;
  grammarPoint: string;
}

/**
 * 這位使用者上過的所有課(由新到舊),用來決定新課的主題與文法重點,並做重覆比對。
 * 包含正在上的那一堂;重上的課內容和原本那堂相同,不重覆計入。
 */
function lessonHistory(db: Db, userId: number): HistoryLesson[] {
  const rows = db
    .prepare('SELECT id, local_date, level, topic, grammar_point, lesson_json FROM sessions WHERE user_id = ? AND retake_of IS NULL ORDER BY id DESC')
    .all(userId) as unknown as { id: number; local_date: string; level: Level; topic: string; grammar_point: string | null; lesson_json: string }[];
  return rows.map((row) => {
    const lesson = JSON.parse(row.lesson_json) as Lesson;
    return {
      id: row.id,
      date: row.local_date,
      level: row.level,
      topic: row.topic,
      // 較早版本的課沒有記錄程式指定的文法重點,改用課程內容裡寫的名稱。
      grammarPoint: row.grammar_point ?? lesson.grammar.point,
      title: lesson.title,
      passage: lesson.passage.text,
      vocab: lesson.vocab.map((vocab) => vocab.word),
    };
  });
}

export async function createLesson(db: Db, ai: AiProvider, student: LessonStudent, minutes: Minutes): Promise<NewLesson> {
  // 主題與文法重點由程式輪流指定(最久沒上過的優先),不交給 AI 自己挑。
  const history = lessonHistory(db, student.id);
  const topic = pickTopic(
    student.stage,
    history.map((past) => past.topic),
  );
  const grammarPoint = pickGrammarPoint(
    student.level,
    history.filter((past) => past.level === student.level).map((past) => past.grammarPoint),
  );
  const plan = {
    level: student.level,
    stage: student.stage,
    minutes,
    topic,
    grammarPoint,
    avoidWords: [...new Set(history.slice(0, AVOID_VOCAB_LESSONS).flatMap((past) => past.vocab))],
    previousTitles: history.filter((past) => past.topic === topic).map((past) => past.title),
    recycleWords: weakVocabWords(db, student.id, RECYCLE_WORDS),
  };
  const generate = (tooSimilarTo?: string) =>
    ai.generateJson({
      tier: 'quality',
      task: 'lesson',
      apiKey: student.apiKey,
      ...lessonPrompt({ ...plan, tooSimilarTo }),
      schema: LessonSchema,
      onUsage: usageRecorder(db, student.id),
    });

  // 產生後由程式和所有舊課比對。課文幾乎相同就重新產生一次(只重試這一次)。
  let lesson = await generate();
  let check = checkNovelty(lesson, history);
  let regenerated = false;
  if (check.passageSimilarity >= DUPLICATE_THRESHOLD) {
    try {
      const second = await generate(check.similarTo?.title);
      lesson = second;
      check = checkNovelty(lesson, history);
      regenerated = true;
    } catch (err) {
      // 重新產生失敗(例如額度剛好用完)時沿用第一份,相似度照實記錄,不讓學生因此上不了課。
      if (!(err instanceof AiError)) throw err;
      console.warn(`[lesson] 課文與舊課相似度 ${check.passageSimilarity},重新產生失敗(${err.code}),沿用第一份`);
    }
  }

  return { level: student.level, stage: student.stage, minutes, topic, grammarPoint, lesson, novelty: { ...check, regenerated } };
}
