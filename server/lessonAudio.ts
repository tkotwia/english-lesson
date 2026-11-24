import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LessonAudioInfo } from '../shared/api.ts';
import type { Lesson, Level } from '../shared/schema.ts';
import { AiError } from './ai/provider.ts';
import type { SpeechVoice } from './ai/speech.ts';
import { usageRecorder } from './ai/usage.ts';
import type { Db } from './db.ts';
import type { Notices } from './notices.ts';

// 聽力課文與聽寫句子的音檔:用語音合成模型事先唸好存成檔案,上課時直接播放,聲音比瀏覽器的朗讀自然。
//
// 免費方案每個語音合成模型每天只能用 10 次(2026-11-24),所以:
// - 只做聽力課文和聽寫句子;單字、跟讀示範、老師的話仍然用瀏覽器朗讀(不耗額度)。
// - 全部在背景做,從不讓學生等。還沒做好、額度用完或產生失敗的那一段,網頁就用瀏覽器朗讀。
// - 音檔以「怎麼唸 + 文字」命名,同樣的內容只做一次(重上同一課、兩位使用者上同一堂起始課都共用)。
// - 只保留還用得到的:進行中的課、備好的課、每位使用者上完的最近一堂(下一堂課前的「重聽上一課」會用到)。

/** 依等級決定怎麼唸:初學者聽慢一點。等級對應的語速和瀏覽器朗讀(speechRate)一致。 */
export function readingStyle(level: Level): string {
  if (level === 'A1' || level === 'A2') return 'Read slowly and very clearly, like a teacher reading aloud to beginner learners of English. Pause briefly between sentences.';
  if (level === 'B1') return 'Read clearly at a calm, moderate pace, like a teacher reading aloud to intermediate learners of English.';
  return 'Read clearly at a natural pace, like a narrator.';
}

/** 一段音檔的編號:由「怎麼唸 + 文字」算出來,所以同樣的內容一定對到同一個檔。 */
export function clipId(text: string, level: Level): string {
  return createHash('sha256').update(`${readingStyle(level)}\n${text}`).digest('hex').slice(0, 32);
}

const CLIP_ID = /^[0-9a-f]{32}$/;

/** 一段要唸的文字,以及它所屬課程的等級(決定怎麼唸)。 */
export interface SpokenText {
  text: string;
  level: Level;
}

interface Clip extends SpokenText {
  id: string;
}

const clip = ({ text, level }: SpokenText): Clip => ({ id: clipId(text, level), text, level });
const passageOf = (lesson: Lesson, level: Level): Clip => clip({ text: lesson.passage.text, level });
const dictationOf = (lesson: Lesson, level: Level): Clip[] => lesson.listening.dictation.map((text) => clip({ text, level }));

/** 一堂課裡用音檔唸的內容:聽力課文與聽寫句子。 */
export const lessonTexts = (lesson: Lesson, level: Level): SpokenText[] => [passageOf(lesson, level), ...dictationOf(lesson, level)];

interface LessonRow {
  lesson_json: string;
  level: Level;
}

export interface LessonAudioOptions {
  voice: SpeechVoice;
  /** 音檔存放的資料夾。 */
  dir: string;
}

export interface LessonAudio {
  /** 這些文字裡現在已經有音檔的,以及這位使用者的音檔是否還在背景製作。 */
  info(userId: number, texts: SpokenText[]): LessonAudioInfo;
  /** 在背景把這位使用者還缺的音檔做出來,並清掉用不到的。不會等它完成。 */
  ensure(userId: number): void;
  /** 音檔的路徑;沒有這個音檔時回傳 null。 */
  file(id: string): string | null;
  /** 等這位使用者的背景工作做完(測試用)。 */
  idle(userId: number): Promise<void>;
}

export function createLessonAudio(db: Db, notices: Notices, { voice, dir }: LessonAudioOptions): LessonAudio {
  mkdirSync(dir, { recursive: true });
  const pathOf = (id: string) => join(dir, `${id}.wav`);
  const has = (id: string) => existsSync(pathOf(id));
  // 背景工作:每位使用者最多一個,而且所有使用者排成一列、一次只做一段。
  // 共用同一把 key 的使用者額度也共用,同時送出會超過每分鐘的上限。
  const workers = new Map<number, Promise<void>>();
  let queue: Promise<void> = Promise.resolve();
  // 模型做不出來的那幾段(例如文字太長被拒絕)。再試也一樣,而且每試一次都用掉一天只有 10 次的額度,
  // 所以程式這次執行期間不再試;那幾段由瀏覽器朗讀。
  const rejected = new Set<string>();

  const currentSession = (userId: number) =>
    db.prepare(`SELECT lesson_json, level FROM sessions WHERE user_id = ? AND status = 'in_progress' ORDER BY id DESC LIMIT 1`).get(userId) as LessonRow | undefined;

  /** 上完的最近一堂(不含重上的):下一堂課前的「重聽上一課」唸的就是它的課文。 */
  const lastCompleted = (userId: number) =>
    db.prepare(`SELECT lesson_json, level FROM sessions WHERE user_id = ? AND status = 'completed' AND retake_of IS NULL ORDER BY id DESC LIMIT 1`).get(userId) as
      | LessonRow
      | undefined;

  const stock = (userId: number) =>
    db.prepare('SELECT lesson_json, level, stage, minutes FROM prepared_lessons WHERE user_id = ? ORDER BY minutes').all(userId) as unknown as (LessonRow & { stage: string })[];

  /**
   * 這位使用者要做的音檔,依先後順序:正在上的課最急(課文 → 聽寫),接著是備好的課;
   * 備好的課先把每一堂的課文都做完,再做聽寫,因為額度不夠時,整篇課文用自然的聲音比幾句聽寫重要。
   */
  function wanted(userId: number): Clip[] {
    const user = db.prepare('SELECT level, stage FROM users WHERE id = ?').get(userId) as { level: Level; stage: string } | undefined;
    if (!user) return [];
    const clips: Clip[] = [];
    const current = currentSession(userId);
    if (current) {
      const lesson = JSON.parse(current.lesson_json) as Lesson;
      clips.push(passageOf(lesson, current.level), ...dictationOf(lesson, current.level));
    }
    // 換過等級的話,舊等級備好的課先不做(可能再也用不到),等切回去、開始上那堂課時才做。
    const lessons = stock(userId)
      .filter((row) => row.level === user.level && row.stage === user.stage)
      .map((row) => ({ lesson: JSON.parse(row.lesson_json) as Lesson, level: row.level }));
    clips.push(...lessons.map(({ lesson, level }) => passageOf(lesson, level)));
    clips.push(...lessons.flatMap(({ lesson, level }) => dictationOf(lesson, level)));
    return clips.filter((item, index) => clips.findIndex((other) => other.id === item.id) === index);
  }

  /** 所有使用者還用得到的音檔編號。 */
  function needed(): Set<string> {
    const ids = new Set<string>();
    const addLesson = (row: LessonRow) => {
      const lesson = JSON.parse(row.lesson_json) as Lesson;
      for (const item of [passageOf(lesson, row.level), ...dictationOf(lesson, row.level)]) ids.add(item.id);
    };
    const users = db.prepare('SELECT id FROM users').all() as unknown as { id: number }[];
    for (const { id } of users) {
      const current = currentSession(id);
      if (current) addLesson(current);
      stock(id).forEach(addLesson);
      const last = lastCompleted(id);
      if (last) ids.add(passageOf(JSON.parse(last.lesson_json) as Lesson, last.level).id);
    }
    return ids;
  }

  function prune(): void {
    const keep = needed();
    for (const name of readdirSync(dir)) {
      const id = name.replace(/\.wav$/, '');
      if (!name.endsWith('.wav') || !CLIP_ID.test(id) || keep.has(id)) continue;
      rmSync(join(dir, name), { force: true });
    }
  }

  async function work(userId: number): Promise<void> {
    prune();
    for (;;) {
      // 每做完一段就重新看一次:這段時間裡可能開始了新的課,或又備好了一堂。
      const user = db.prepare('SELECT api_key FROM users WHERE id = ?').get(userId) as { api_key: string | null } | undefined;
      const next = wanted(userId).find((item) => !has(item.id) && !rejected.has(item.id));
      if (!user?.api_key || !next) return;
      const apiKey = user.api_key;
      try {
        const wav = await voice.synthesize({
          apiKey,
          text: next.text,
          style: readingStyle(next.level),
          onUsage: usageRecorder(db, userId),
          onQuota: (event) => notices.add(apiKey, { ...event, task: 'speech' }),
        });
        // 先寫到暫存檔再改名:寫到一半的檔案不會被當成做好的音檔播出去。
        writeFileSync(`${pathOf(next.id)}.tmp`, wav);
        renameSync(`${pathOf(next.id)}.tmp`, pathOf(next.id));
      } catch (err) {
        const reason = err instanceof AiError ? `${err.code}:${err.detail ?? err.message}` : String(err);
        console.warn(`[speech] 使用者 ${userId}:音檔沒有做好(${reason.slice(0, 200)}),這一段由瀏覽器朗讀`);
        // 這一段本身做不出來:跳過它,繼續做其他的。
        if (err instanceof AiError && err.code === 'bad_output') {
          rejected.add(next.id);
          continue;
        }
        // 其餘多半是今天的額度用完了。剩下的先不做,避免一直碰壁;下次進入課堂、換到下一個步驟或備好新課時會再試。
        return;
      }
    }
  }

  return {
    info(userId, texts) {
      const ready = texts.map(clip).filter((item) => has(item.id));
      return {
        clips: Object.fromEntries(ready.map((item) => [item.text, `/api/audio/${item.id}`])),
        working: workers.has(userId),
      };
    },

    ensure(userId) {
      if (workers.has(userId)) return;
      const worker = queue
        .then(() => work(userId))
        .catch((err) => console.error(`[speech] 使用者 ${userId}:背景工作發生未預期的錯誤`, err))
        .finally(() => workers.delete(userId));
      workers.set(userId, worker);
      queue = worker;
    },

    file: (id) => (CLIP_ID.test(id) && has(id) ? pathOf(id) : null),

    idle: (userId) => workers.get(userId) ?? Promise.resolve(),
  };
}
