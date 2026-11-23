import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CalendarMonth, ProgressSummary, ReviewListItem, WordList } from '../shared/api.ts';
import { addDays, localDate, monthOf, monthRange, previousMonth } from '../shared/dates.ts';
import { FLASHCARD_FORGOT, FLASHCARD_KNOWN, lessonExercises, reviewKey, type Exercise, type ReviewItemView } from '../shared/lesson.ts';
import { SessionStateSchema, type ExerciseAnswer, type Level, type SessionResult, type SessionState, type SessionView } from '../shared/schema.ts';
import { lessonSize } from './ai/cefr.ts';
import { createMockProvider } from './ai/mock.ts';
import { MOCK_FIXTURES, MOCK_LESSON } from './ai/mockData.ts';
import { createApp } from './app.ts';
import { openDb, type Db } from './db.ts';
import { backfillResponses } from './items.ts';

let db: Db;
let server: Server;
let base: string;

const TODAY = localDate();
const TOMORROW = addDays(TODAY, 1);
const LAST_MONTH = previousMonth(monthOf(TODAY));

beforeEach(async () => {
  db = openDb(':memory:');
  const app = createApp({ db, ai: createMockProvider(MOCK_FIXTURES) });
  server = await new Promise<Server>((done) => {
    const listening = app.listen(0, '127.0.0.1', () => done(listening));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterEach(async () => {
  await new Promise((done) => server.close(done));
  db.close();
});

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

async function newUser(name = '小明', stage = 'junior'): Promise<number> {
  const user = (await call('POST', '/users', { name, stage })).json;
  await call('PUT', `/users/${user.id}/api-key`, { apiKey: 'key' });
  return user.id;
}

function correctResponse(exercise: Exercise): string {
  switch (exercise.type) {
    case 'mcq':
      return String(exercise.answerIndex);
    case 'cloze':
      return exercise.answers[0]!;
    case 'reorder':
      return exercise.sentence;
    case 'flashcard':
      return FLASHCARD_KNOWN;
    case 'dictation':
    case 'readAloud':
    case 'rewrite':
      return exercise.sentence;
  }
}

const right = (exercise: Exercise): ExerciseAnswer => ({ attempts: [correctResponse(exercise)], hintUsed: false });
const WRONG_TWICE: ExerciseAnswer = { attempts: ['zzz', 'yyy'], hintUsed: false };
const tried = (...attempts: string[]): ExerciseAnswer => ({ attempts, hintUsed: false });

/** 上完一堂課。overrides 可以覆蓋個別題目的作答;沒覆蓋的題目(含暖身複習)都第一次就答對。 */
async function takeLesson(userId: number, overrides: Record<string, ExerciseAnswer> = {}): Promise<SessionView> {
  const session: SessionView = (await call('POST', '/sessions', { userId, minutes: 30 })).json;
  const answers: Record<string, ExerciseAnswer> = {};
  for (const { key, exercise } of lessonExercises(session.lesson)) answers[key] = right(exercise);
  for (const item of session.review) answers[reviewKey(item.id)] = right(item.quiz);
  const state: SessionState = { ...SessionStateSchema.parse({}), answers: { ...answers, ...overrides } };
  const done = await call('POST', `/sessions/${session.id}/complete`, { state });
  expect(done.status).toBe(200);
  return done.json;
}

interface ItemRow {
  id: number;
  kind: string;
  item_key: string;
  status: string;
  wrong_count: number;
  interval_days: number;
  due_date: string;
}

const items = (userId: number) => db.prepare('SELECT * FROM items WHERE user_id = ? ORDER BY id').all(userId) as unknown as ItemRow[];
const itemByKey = (userId: number, key: string) => items(userId).find((item) => item.item_key === key);
/** 答錯、不熟或手動標記過的項目(不含第一次就答對、只是排進複習的新單字)。 */
const missedItems = (userId: number) => items(userId).filter((item) => item.status !== 'learning');
const makeDue = (itemId: number, date = TODAY) => db.prepare('UPDATE items SET due_date = ? WHERE id = ?').run(date, itemId);

/** 回顧頁列出的本月項目。 */
async function reviewList(userId: number): Promise<ReviewListItem[]> {
  const range = monthRange(monthOf(TODAY));
  return (await call('GET', `/review?userId=${userId}&from=${range.from}&to=${range.to}`)).json.items;
}
const wrongAnswersOf = async (userId: number, label: string) => (await reviewList(userId)).find((item) => item.label === label)?.wrongAnswers;

/** 閱讀第一題:兩次都選錯的作答,以及那兩個選項的文字。 */
const READING_QUESTION = MOCK_LESSON.reading.questions[0]!;
const WRONG_OPTIONS = READING_QUESTION.options.map((_, index) => index).filter((index) => index !== READING_QUESTION.answerIndex).slice(0, 2);

/** 直接在資料庫放一堂已完成的課,用來測試日曆(不必真的上完一個月的課)。 */
function insertCompleted(userId: number, date: string, score: number, level: Level = 'A2'): void {
  const result: SessionResult = { score, sections: [], weakPoints: [], writing: null, speaking: null, closing: '' };
  db.prepare(
    `INSERT INTO sessions (user_id, local_date, level, stage, minutes, topic, status, lesson_json, state_json, score, result_json)
     VALUES (?, ?, ?, 'junior', 30, 'seed', 'completed', ?, '{}', ?, ?)`,
  ).run(userId, date, level, JSON.stringify(MOCK_LESSON), score, JSON.stringify(result));
}

describe('弱點項目庫', () => {
  it('上課答錯與不熟的題目進入項目庫,明天到期', async () => {
    const userId = await newUser();
    await takeLesson(userId, {
      'vocab.0': WRONG_TWICE,
      'grammar.mcq.0': { attempts: ['0', '2'], hintUsed: false }, // 第二次才對
    });

    expect(itemByKey(userId, 'vocab:crowded')).toMatchObject({ kind: 'vocab', status: 'unknown', wrong_count: 1, interval_days: 1, due_date: TOMORROW });
    const grammar = items(userId).find((item) => item.kind === 'grammar');
    expect(grammar).toMatchObject({ status: 'unfamiliar', wrong_count: 1, due_date: TOMORROW });
    expect(missedItems(userId)).toHaveLength(2);
  });

  // 剛看完單字表就答對只代表短期記憶。以前這些字學過就不再出現,現在每個新單字都要隔天複習。
  it('第一次就答對的新單字也進入項目庫:記為新學、不算答錯、明天到期', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE });

    const learned = items(userId).filter((item) => item.status === 'learning');
    expect(learned.map((item) => item.item_key)).toEqual(MOCK_LESSON.vocab.slice(1).map((vocab) => `vocab:${vocab.word.toLowerCase()}`));
    expect(learned.every((item) => item.kind === 'vocab' && item.wrong_count === 0 && item.interval_days === 1 && item.due_date === TOMORROW)).toBe(true);
    // 只有單字:答對的文法題、閱讀題不會進項目庫。
    expect(items(userId).filter((item) => item.kind !== 'vocab')).toHaveLength(0);
  });

  it('新學的單字不是「不熟的部分」:不列在回顧裡', async () => {
    const userId = await newUser();
    await takeLesson(userId);
    expect(items(userId).length).toBeGreaterThan(0);
    expect(await reviewList(userId)).toEqual([]);
  });

  // 重上是同一份課文;已經在複習中的字不能因此被重設回第一天,也不能多出一筆。
  it('重上同一堂課不會重設或重複建立已經在複習中的單字', async () => {
    const userId = await newUser();
    const first = await takeLesson(userId);
    const word = itemByKey(userId, 'vocab:delicious')!;
    db.prepare(`UPDATE items SET interval_days = 16, due_date = ? WHERE id = ?`).run(addDays(TODAY, 9), word.id);
    const before = items(userId).length;

    const retake: SessionView = (await call('POST', `/sessions/${first.id}/retake`)).json;
    const answers: Record<string, ExerciseAnswer> = {};
    for (const { key, exercise } of lessonExercises(retake.lesson)) answers[key] = right(exercise);
    for (const item of retake.review) answers[reviewKey(item.id)] = right(item.quiz);
    await call('POST', `/sessions/${retake.id}/complete`, { state: { ...SessionStateSchema.parse({}), answers } });

    expect(items(userId)).toHaveLength(before);
    expect(itemByKey(userId, 'vocab:delicious')).toMatchObject({ status: 'learning', interval_days: 16, due_date: addDays(TODAY, 9) });
  });

  // 以前錯過的字,這次在課堂上答對了(剛看過單字表),不能因此把它當成新學的字、洗掉錯過的紀錄。
  it('以前錯過的單字再出現且答對,維持原本的複習進度', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE });
    await takeLesson(userId);
    expect(itemByKey(userId, 'vocab:crowded')).toMatchObject({ status: 'unknown', wrong_count: 1, interval_days: 1 });
  });

  // 同一個單字在不同課堂再錯,應該看得出「錯了幾次」,而不是變成兩筆互不相干的紀錄。
  it('同一個單字再錯一次,累加在同一個項目上', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE });
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE });

    const crowded = items(userId).filter((item) => item.item_key === 'vocab:crowded');
    expect(crowded).toHaveLength(1);
    expect(crowded[0]!.wrong_count).toBe(2);
  });

  // 只看老師改好的句子很快就忘。複習時要自己把正確的句子打出來,由程式判斷對不對。
  it('AI 批改找到的寫作錯誤做成訂正題進入項目庫', async () => {
    const userId = await newUser();
    const session: SessionView = (await call('POST', '/sessions', { userId, minutes: 30 })).json;
    const answers = Object.fromEntries(lessonExercises(session.lesson).map(({ key, exercise }) => [key, right(exercise)]));
    await call('POST', `/sessions/${session.id}/complete`, { state: { ...SessionStateSchema.parse({}), answers, writing: 'I go to the park yesterday.' } });

    const due: ReviewItemView[] = (await call('GET', `/review/due?userId=${userId}`)).json.items;
    expect(due).toEqual([]); // 明天才到期
    const writing = items(userId).find((item) => item.kind === 'writing')!;
    makeDue(writing.id);
    const [item] = (await call('GET', `/review/due?userId=${userId}`)).json.items as ReviewItemView[];
    expect(item!.quiz).toMatchObject({ type: 'rewrite', original: 'I go to the park yesterday.', sentence: 'I went to the park yesterday.' });
  });

  it('訂正題要打出正確的句子才算記得;照抄原本錯的句子不算', async () => {
    const userId = await newUser();
    const session: SessionView = (await call('POST', '/sessions', { userId, minutes: 30 })).json;
    const answers = Object.fromEntries(lessonExercises(session.lesson).map(({ key, exercise }) => [key, right(exercise)]));
    await call('POST', `/sessions/${session.id}/complete`, { state: { ...SessionStateSchema.parse({}), answers, writing: 'I go to the park yesterday.' } });
    const writing = items(userId).find((item) => item.kind === 'writing')!;
    makeDue(writing.id);

    const same = await call('POST', '/review/results', { userId, answers: { [writing.id]: tried('I go to the park yesterday.', 'I go to the park yesterday.') } });
    expect(same.json.results[0].outcome).not.toBe('correct');
    makeDue(writing.id);
    const fixed = await call('POST', '/review/results', { userId, answers: { [writing.id]: tried('i went to the park yesterday') } });
    expect(fixed.json.results[0].outcome).toBe('correct');
  });

  // 較早的版本把這類錯誤存成閃卡,由學生自己判斷記不記得。舊項目不能因此停在自評,也不必重建資料。
  it('舊版存成閃卡的寫作與對話錯誤,複習時也改成訂正題;生字閃卡維持閃卡', async () => {
    const userId = await newUser();
    const session: SessionView = (await call('POST', '/sessions', { userId, minutes: 30 })).json;
    await call('POST', `/sessions/${session.id}/flags`, { target: 'glossary.0' });
    const insert = db.prepare(
      `INSERT INTO items (user_id, kind, item_key, content_json, status, due_date, first_seen, last_seen) VALUES (?, 'writing', 'writing:old', ?, 'unfamiliar', ?, ?, ?)`,
    );
    const old = { label: 'She go home.', answer: 'She goes home.', explanation: '第三人稱單數', context: null, quiz: { type: 'flashcard', front: 'She go home.', back: 'She goes home.', explanation: '第三人稱單數' } };
    insert.run(userId, JSON.stringify(old), TODAY, TODAY, TODAY);
    makeDue(itemByKey(userId, 'vocab:noisy')!.id);

    const due: ReviewItemView[] = (await call('GET', `/review/due?userId=${userId}`)).json.items;
    expect(due.find((item) => item.kind === 'writing')!.quiz).toEqual({ type: 'rewrite', original: 'She go home.', sentence: 'She goes home.', explanation: '第三人稱單數' });
    expect(due.find((item) => item.kind === 'vocab')!.quiz.type).toBe('flashcard');

    const writing = itemByKey(userId, 'writing:old')!;
    // 以前按「我記得」就過關;現在要真的打出正確的句子。
    const selfRated = await call('POST', '/review/results', { userId, answers: { [writing.id]: tried(FLASHCARD_KNOWN) } });
    expect(selfRated.json.results[0].outcome).not.toBe('correct');
  });

  it('每位使用者的項目庫互不相干', async () => {
    const a = await newUser('小明');
    const b = await newUser('小華');
    await takeLesson(a, { 'vocab.0': WRONG_TWICE });
    expect(missedItems(a)).toHaveLength(1);
    expect(items(b)).toHaveLength(0);
  });
});

describe('暖身複習(間隔重複)', () => {
  it('到期的項目成為下一堂課的暖身複習,而且暖身複習列入計分', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE });
    makeDue(itemByKey(userId, 'vocab:crowded')!.id);

    const next = await takeLesson(userId);
    expect(next.review.map((item) => item.label)).toEqual(['crowded']);
    expect(next.result!.sections.map((s) => s.section)).toContain('review');
  });

  it('還沒到期的項目不會出現在暖身複習', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE });
    const next = await takeLesson(userId);
    expect(next.review).toEqual([]);
    expect(next.result!.sections.map((s) => s.section)).not.toContain('review');
  });

  it('複習時答對,間隔從 1 天加倍成 2 天,「不會」降為「不熟」', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE });
    const item = itemByKey(userId, 'vocab:crowded')!;
    makeDue(item.id);
    await takeLesson(userId);

    expect(itemByKey(userId, 'vocab:crowded')).toMatchObject({ status: 'unfamiliar', interval_days: 2, due_date: addDays(TODAY, 2), wrong_count: 1 });
  });

  // 已經拉長到 8 天的項目如果又答錯,代表其實還沒學會,必須從頭來過。
  it('複習時又答錯,間隔從 8 天回到 1 天,錯誤次數加一', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE });
    const item = itemByKey(userId, 'vocab:crowded')!;
    db.prepare(`UPDATE items SET interval_days = 8, status = 'unfamiliar', due_date = ? WHERE id = ?`).run(TODAY, item.id);

    await takeLesson(userId, { [reviewKey(item.id)]: WRONG_TWICE });
    expect(itemByKey(userId, 'vocab:crowded')).toMatchObject({ status: 'unknown', interval_days: 1, due_date: TOMORROW, wrong_count: 2 });
  });

  // 每個新單字之後至少要複習 4 次。上限低於「每堂新單字數 × 4」的話,每天上課,到期的複習會越積越多。
  it('一堂課的暖身複習容納得下每天新單字帶來的複習量;超過上限的留到之後', async () => {
    const userId = await newUser();
    const insert = db.prepare(
      `INSERT INTO items (user_id, kind, item_key, content_json, status, due_date, first_seen, last_seen) VALUES (?, 'vocab', ?, ?, 'learning', ?, ?, ?)`,
    );
    for (let i = 0; i < 50; i++) {
      const quiz = { type: 'cloze', sentence: 'It is ___.', answers: [`word${i}`], hint: '', explanation: '' };
      insert.run(userId, `vocab:word${i}`, JSON.stringify({ label: `word${i}`, answer: 'x', explanation: '', context: null, quiz }), TODAY, TODAY, TODAY);
    }
    for (const minutes of [20, 30, 40] as const) {
      const session: SessionView = (await call('POST', '/sessions', { userId, minutes })).json;
      expect(session.review.length, `${minutes} 分鐘`).toBe(Math.min(50, 4 * lessonSize('A2', minutes).vocab));
      await call('DELETE', `/sessions/${session.id}`);
    }
    expect(((await call('GET', `/progress?userId=${userId}`)).json as ProgressSummary).dueCount).toBe(50);
  });

  it('間隔已達 64 天又答對,標為已掌握,之後不再出現', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE });
    const item = itemByKey(userId, 'vocab:crowded')!;
    db.prepare(`UPDATE items SET interval_days = 64, status = 'unfamiliar', due_date = ? WHERE id = ?`).run(TODAY, item.id);
    await takeLesson(userId);

    expect(itemByKey(userId, 'vocab:crowded')!.status).toBe('mastered');
    db.prepare('UPDATE items SET due_date = ? WHERE id = ?').run('2000-01-01', item.id);
    expect((await call('GET', `/review/due?userId=${userId}`)).json.items).toEqual([]);
  });
});

describe('單獨做複習練習', () => {
  it('不呼叫 AI、不產生日曆分數,只更新複習間隔', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE });
    const item = itemByKey(userId, 'vocab:crowded')!;
    makeDue(item.id);
    const before = (await call('GET', `/settings/status?userId=${userId}`)).json.usage[0].calls;

    const res = await call('POST', '/review/results', { userId, answers: { [item.id]: { attempts: ['crowded'], hintUsed: false } } });
    expect(res.json.results).toEqual([{ itemId: item.id, outcome: 'correct' }]);
    expect(itemByKey(userId, 'vocab:crowded')).toMatchObject({ interval_days: 2 });
    expect((await call('GET', `/settings/status?userId=${userId}`)).json.usage[0].calls).toBe(before);
    const month: CalendarMonth = (await call('GET', `/calendar?userId=${userId}&month=${monthOf(TODAY)}`)).json;
    expect(month.days.flatMap((day) => day.sessions)).toHaveLength(1);
  });

  // 由伺服器依存好的題目判分,瀏覽器送什麼結果都改不了對錯。
  it('對錯由伺服器依題目判定:答錯就歸零', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE });
    const item = itemByKey(userId, 'vocab:crowded')!;
    const res = await call('POST', '/review/results', { userId, answers: { [item.id]: { attempts: ['nope', 'still nope'], hintUsed: false } } });
    expect(res.json.results[0].outcome).toBe('unknown');
    expect(itemByKey(userId, 'vocab:crowded')!.wrong_count).toBe(2);
  });

  it('閃卡由學生自評:記得就拉長間隔,不記得就歸零', async () => {
    const userId = await newUser();
    const session: SessionView = (await call('POST', '/sessions', { userId, minutes: 30 })).json;
    await call('POST', `/sessions/${session.id}/flags`, { target: 'glossary.0' });
    const card = itemByKey(userId, 'vocab:noisy')!;
    makeDue(card.id);

    await call('POST', '/review/results', { userId, answers: { [card.id]: { attempts: [FLASHCARD_KNOWN], hintUsed: false } } });
    expect(itemByKey(userId, 'vocab:noisy')!.interval_days).toBe(2);
    await call('POST', '/review/results', { userId, answers: { [card.id]: { attempts: [FLASHCARD_FORGOT], hintUsed: false } } });
    expect(itemByKey(userId, 'vocab:noisy')).toMatchObject({ interval_days: 1, status: 'unknown' });
  });

  // 否則同一天連續練習五次(1→2→4→8→16)就會被標為已掌握,根本沒有隔時間。
  it('還沒到期就提前練習答對,不會拉長間隔', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE });
    const item = itemByKey(userId, 'vocab:crowded')!; // 明天才到期
    for (let i = 0; i < 5; i++) {
      await call('POST', '/review/results', { userId, answers: { [item.id]: { attempts: ['crowded'], hintUsed: false } } });
    }
    expect(itemByKey(userId, 'vocab:crowded')).toMatchObject({ status: 'unknown', interval_days: 1, due_date: TOMORROW });
  });

  it('提前練習時答錯,仍然會歸零並記一次錯', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE });
    const item = itemByKey(userId, 'vocab:crowded')!;
    db.prepare(`UPDATE items SET interval_days = 8, due_date = ? WHERE id = ?`).run(addDays(TODAY, 5), item.id);
    await call('POST', '/review/results', { userId, answers: { [item.id]: WRONG_TWICE } });
    expect(itemByKey(userId, 'vocab:crowded')).toMatchObject({ interval_days: 1, due_date: TOMORROW, wrong_count: 2 });
  });

  it('不能替別人的項目回報複習結果', async () => {
    const owner = await newUser('小明');
    const other = await newUser('小華');
    await takeLesson(owner, { 'vocab.0': WRONG_TWICE });
    const item = itemByKey(owner, 'vocab:crowded')!;
    const res = await call('POST', '/review/results', { userId: other, answers: { [item.id]: { attempts: ['crowded'], hintUsed: false } } });
    expect(res.status).toBe(404);
    expect(itemByKey(owner, 'vocab:crowded')!.interval_days).toBe(1);
  });
});

describe('手動標記「我不熟」', () => {
  it('答對的題目也可以標記:進入項目庫、明天複習,但不算答錯', async () => {
    const userId = await newUser();
    const session: SessionView = (await call('POST', '/sessions', { userId, minutes: 30 })).json;
    const res = await call('POST', `/sessions/${session.id}/flags`, { target: 'vocab.1' });

    expect(res.json.flags).toEqual(['vocab.1']);
    expect(itemByKey(userId, 'vocab:delicious')).toMatchObject({ status: 'unfamiliar', wrong_count: 0, due_date: TOMORROW });
    expect((await call('GET', `/sessions/${session.id}`)).json.state.flags).toEqual(['vocab.1']);
  });

  it('重複標記同一個對象不會產生第二筆紀錄', async () => {
    const userId = await newUser();
    const session: SessionView = (await call('POST', '/sessions', { userId, minutes: 30 })).json;
    await call('POST', `/sessions/${session.id}/flags`, { target: 'vocab.1' });
    await call('POST', `/sessions/${session.id}/flags`, { target: 'vocab.1' });
    const events = db.prepare(`SELECT COUNT(*) AS n FROM item_events WHERE result = 'manual'`).get() as { n: number };
    expect(events.n).toBe(1);
  });

  it('課程完成後(在結果頁)仍然可以標記', async () => {
    const userId = await newUser();
    const done = await takeLesson(userId);
    const res = await call('POST', `/sessions/${done.id}/flags`, { target: 'grammar.mcq.0' });
    expect(res.status).toBe(200);
    expect(items(userId).filter((item) => item.kind === 'grammar')).toHaveLength(1);
  });

  it('這堂課裡不存在的題號會被拒絕', async () => {
    const userId = await newUser();
    const session: SessionView = (await call('POST', '/sessions', { userId, minutes: 30 })).json;
    expect((await call('POST', `/sessions/${session.id}/flags`, { target: 'vocab.99' })).status).toBe(400);
    expect((await call('POST', `/sessions/${session.id}/flags`, { target: 'glossary.99' })).status).toBe(400);
  });
});

describe('回顧:整週或整月不熟的部分', () => {
  it('只列出日期範圍內出過錯或被標記的項目,並算出次數', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE, 'vocab.1': WRONG_TWICE });
    // 把其中一筆事件改到上個月,模擬上個月出的錯。
    const delicious = itemByKey(userId, 'vocab:delicious')!;
    db.prepare('UPDATE item_events SET date = ? WHERE item_id = ?').run(`${LAST_MONTH}-10`, delicious.id);

    const thisMonth = monthRange(monthOf(TODAY));
    const current: ReviewListItem[] = (await call('GET', `/review?userId=${userId}&from=${thisMonth.from}&to=${thisMonth.to}`)).json.items;
    const lastMonth = monthRange(LAST_MONTH);
    const earlier: ReviewListItem[] = (await call('GET', `/review?userId=${userId}&from=${lastMonth.from}&to=${lastMonth.to}`)).json.items;

    expect(current.map((item) => item.label)).toEqual(['crowded']);
    expect(current[0]).toMatchObject({ kind: 'vocab', status: 'unknown', misses: 1 });
    expect(earlier.map((item) => item.label)).toEqual(['delicious']);
  });

  it('複習時答對不算在「不熟的部分」裡', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE });
    const item = itemByKey(userId, 'vocab:crowded')!;
    await call('POST', '/review/results', { userId, answers: { [item.id]: { attempts: ['crowded'], hintUsed: false } } });

    const range = monthRange(monthOf(TODAY));
    const list: ReviewListItem[] = (await call('GET', `/review?userId=${userId}&from=${range.from}&to=${range.to}`)).json.items;
    expect(list[0]!.misses).toBe(1);
  });

  it('日期格式錯誤或起訖顛倒會被拒絕', async () => {
    const userId = await newUser();
    expect((await call('GET', `/review?userId=${userId}&from=2026-13-01&to=2026-11-30`)).status).toBe(400);
    expect((await call('GET', `/review?userId=${userId}&from=2026-11-30&to=2026-11-01`)).status).toBe(400);
  });
});

// 只列正確答案的話,學生不知道自己當時錯在哪裡,回顧就少了一半的用處。
describe('回顧:學生當時答錯的內容', () => {
  it('列出上課時答錯的作答', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': tried('crowd', 'crowding') });
    expect(await wrongAnswersOf(userId, 'crowded')).toEqual(['crowd', 'crowding']);
  });

  it('第二次才答對的,只列答錯的那一次', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': tried('crowd', 'crowded') });
    expect(await wrongAnswersOf(userId, 'crowded')).toEqual(['crowd']);
  });

  // 作答紀錄存的是第幾個選項,直接顯示的話學生看不懂。
  it('選擇題列出學生選的選項文字', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'reading.0': tried(...WRONG_OPTIONS.map(String)) });
    expect(await wrongAnswersOf(userId, READING_QUESTION.prompt)).toEqual(WRONG_OPTIONS.map((index) => READING_QUESTION.options[index]));
  });

  it('之後複習又答錯:改成顯示最近這一次的作答', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': tried('crowd', 'crowding') });
    const item = itemByKey(userId, 'vocab:crowded')!;
    await call('POST', '/review/results', { userId, answers: { [item.id]: tried('nope', 'still nope') } });
    expect(await wrongAnswersOf(userId, 'crowded')).toEqual(['nope', 'still nope']);
  });

  // 答對不代表之前的錯誤不值得看:項目還列在回顧裡,就要看得到當時錯在哪裡。
  it('之後複習答對了:仍然看得到先前答錯的作答', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': tried('crowd', 'crowding') });
    const item = itemByKey(userId, 'vocab:crowded')!;
    await call('POST', '/review/results', { userId, answers: { [item.id]: tried('crowded') } });
    expect(await wrongAnswersOf(userId, 'crowded')).toEqual(['crowd', 'crowding']);
  });

  it('手動標記「我不熟」的項目沒有答錯的作答', async () => {
    const userId = await newUser();
    const session: SessionView = (await call('POST', '/sessions', { userId, minutes: 30 })).json;
    await call('POST', `/sessions/${session.id}/flags`, { target: 'vocab.1' });
    expect(await wrongAnswersOf(userId, 'delicious')).toEqual([]);
  });
});

// 更新之前犯的錯,作答還留在當時的上課紀錄裡。不補的話,回顧頁上舊的項目永遠看不到當時答了什麼。
describe('舊版留下的紀錄:補上當時答錯的內容', () => {
  /** 模擬舊版:當時沒有記下作答。 */
  const forget = () => db.exec('UPDATE item_events SET responses_json = NULL');
  /** 上課時留下、還沒補過的紀錄有幾筆。 */
  const pendingEvents = () =>
    (db.prepare('SELECT COUNT(*) AS n FROM item_events WHERE responses_json IS NULL AND session_id IS NOT NULL').get() as { n: number }).n;

  it('從上課紀錄找回課程題目的作答', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': tried('crowd', 'crowding'), 'reading.0': tried(...WRONG_OPTIONS.map(String)) });
    forget();
    expect(await wrongAnswersOf(userId, 'crowded')).toEqual([]);

    const pending = pendingEvents();
    expect(pending).toBeGreaterThan(0);
    expect(backfillResponses(db)).toBe(pending);
    expect(pendingEvents()).toBe(0);
    expect(await wrongAnswersOf(userId, 'crowded')).toEqual(['crowd', 'crowding']);
    expect(await wrongAnswersOf(userId, READING_QUESTION.prompt)).toEqual(WRONG_OPTIONS.map((index) => READING_QUESTION.options[index]));
  });

  // 第二堂課裡「crowded」出現兩次:課程的單字題(答對)與暖身複習(答錯)。要找回的是答錯的那一題。
  it('暖身複習時答錯的也找得回來,不會和同一堂課裡答對的題目弄混', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': tried('crowd', 'crowding') });
    const item = itemByKey(userId, 'vocab:crowded')!;
    makeDue(item.id);
    await takeLesson(userId, { [reviewKey(item.id)]: tried('nope', 'still nope') });
    forget();

    backfillResponses(db);
    expect(await wrongAnswersOf(userId, 'crowded')).toEqual(['nope', 'still nope']);
  });

  // 每次啟動都會執行;補過的不能再算一次,也不能蓋掉之後新記下的作答。
  it('只補還沒補過的紀錄', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': tried('crowd', 'crowding') });
    expect(backfillResponses(db)).toBe(0);
    forget();
    expect(backfillResponses(db)).toBeGreaterThan(0);
    expect(backfillResponses(db)).toBe(0);
  });

  it('手動標記沒有作答可找;單獨複習練習的紀錄當時沒有存,維持原狀', async () => {
    const userId = await newUser();
    const session: SessionView = (await call('POST', '/sessions', { userId, minutes: 30 })).json;
    await call('POST', `/sessions/${session.id}/flags`, { target: 'vocab.1' });
    const flagged = itemByKey(userId, 'vocab:delicious')!;
    await call('POST', '/review/results', { userId, answers: { [flagged.id]: tried('nope', 'still nope') } });
    forget();

    expect(backfillResponses(db)).toBe(1);
    const events = db.prepare('SELECT session_id, responses_json FROM item_events ORDER BY id').all() as unknown as { session_id: number | null; responses_json: string | null }[];
    expect(events).toEqual([
      { session_id: session.id, responses_json: '[]' },
      { session_id: null, responses_json: null },
    ]);
  });

  it('舊資料庫沒有這個欄位:開啟時補上,原有的紀錄不變', () => {
    const dir = mkdtempSync(join(tmpdir(), 'english-lesson-test-'));
    const path = join(dir, 'english.db');
    try {
      const old = openDb(path);
      old.exec(`INSERT INTO users (name, stage, level) VALUES ('小明', 'junior', 'A2')`);
      old.exec(`INSERT INTO items (user_id, kind, item_key, content_json, status, due_date, first_seen, last_seen)
                VALUES (1, 'vocab', 'vocab:crowded', '{}', 'unknown', '2026-11-02', '2026-11-01', '2026-11-01')`);
      old.exec(`INSERT INTO item_events (item_id, date, result) VALUES (1, '2026-11-01', 'unknown')`);
      old.exec('ALTER TABLE item_events DROP COLUMN responses_json');
      old.close();

      const upgraded = openDb(path);
      expect(upgraded.prepare('SELECT item_id, date, result, responses_json FROM item_events').all()).toEqual([
        { item_id: 1, date: '2026-11-01', result: 'unknown', responses_json: null },
      ]);
      expect(backfillResponses(upgraded)).toBe(0);
      upgraded.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('日曆', () => {
  it('每天顯示當日分數(當天課程的平均),月分數是每日分數的平均', async () => {
    const userId = await newUser();
    insertCompleted(userId, `${LAST_MONTH}-05`, 100);
    insertCompleted(userId, `${LAST_MONTH}-05`, 80);
    insertCompleted(userId, `${LAST_MONTH}-06`, 70);

    const month: CalendarMonth = (await call('GET', `/calendar?userId=${userId}&month=${LAST_MONTH}`)).json;
    expect(month.days.map((day) => [day.date, day.score, day.sessions.length])).toEqual([
      [`${LAST_MONTH}-05`, 90, 2],
      [`${LAST_MONTH}-06`, 70, 1],
    ]);
    expect(month.average).toBe(80);
  });

  it('進行中還沒完成的課不會出現在日曆上', async () => {
    const userId = await newUser();
    await call('POST', '/sessions', { userId, minutes: 30 });
    const month: CalendarMonth = (await call('GET', `/calendar?userId=${userId}&month=${monthOf(TODAY)}`)).json;
    expect(month).toMatchObject({ days: [], average: null });
  });

  it('切換使用者後看到的是各自的日曆', async () => {
    const a = await newUser('小明');
    const b = await newUser('小華');
    insertCompleted(a, `${LAST_MONTH}-05`, 90);
    expect((await call('GET', `/calendar?userId=${b}&month=${LAST_MONTH}`)).json.days).toEqual([]);
  });

  it('首頁摘要包含今天的分數、本月平均與待複習數量', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE });
    makeDue(itemByKey(userId, 'vocab:crowded')!.id);
    const summary: ProgressSummary = (await call('GET', `/progress?userId=${userId}`)).json;

    expect(summary.today).toBe(TODAY);
    expect(summary.todayScore).not.toBeNull();
    expect(summary.monthAverage).toBe(summary.todayScore);
    expect(summary.dueCount).toBe(1);
  });
});

describe('刪除使用者', () => {
  it('一併刪除他的課程、弱點項目、複習紀錄與用量紀錄', async () => {
    const userId = await newUser();
    insertCompleted(userId, `${LAST_MONTH}-10`, 96);
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE });
    await call('DELETE', `/users/${userId}`);

    for (const table of ['sessions', 'items', 'item_events', 'api_usage']) {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
      expect(row.n, table).toBe(0);
    }
  });
});

// 流暢度練習用的是學生已經熟悉的內容:上一堂上完的課文。
describe('課前重溫上一課', () => {
  const retitle = (sessionId: number, title: string) => db.prepare(`UPDATE sessions SET lesson_json = json_set(lesson_json, '$.title', ?) WHERE id = ?`).run(title, sessionId);
  const start = async (userId: number): Promise<SessionView> => (await call('POST', '/sessions', { userId, minutes: 30 })).json;

  it('第一堂課沒有上一課可以重溫', async () => {
    const userId = await newUser();
    expect((await start(userId)).previous).toBeNull();
  });

  it('之後的課重溫最近一堂上完的課文', async () => {
    const userId = await newUser();
    const first = await takeLesson(userId);
    retitle(first.id, 'First lesson');
    const second = await takeLesson(userId);
    retitle(second.id, 'Second lesson');

    const third = await start(userId);
    expect(third.previous).toMatchObject({ title: 'Second lesson', text: MOCK_LESSON.passage.text });
  });

  // 重上用的是同一份課文。拿它自己來「重溫」,等於在聽力之前就先把今天的課文看完了。
  it('重上的課不會拿原本那一堂的課文來重溫', async () => {
    const userId = await newUser();
    const first = await takeLesson(userId);
    retitle(first.id, 'First lesson');
    const second = await takeLesson(userId);
    retitle(second.id, 'Second lesson');

    const retake: SessionView = (await call('POST', `/sessions/${second.id}/retake`)).json;
    expect(retake.previous!.title).toBe('First lesson');
  });

  // 別人的課文不是這位學生熟悉的內容。
  it('只用自己上過的課', async () => {
    const other = await newUser('小華');
    await takeLesson(other);
    const userId = await newUser('小明');
    expect((await start(userId)).previous).toBeNull();
  });

  // 流暢度練習的重點是和自己比、越來越快,所以要知道上次的成績。某一堂跳過了,就往前找最近一次有紀錄的。
  it('附上最近一次有紀錄的成績;中間跳過的課不會把它洗掉', async () => {
    const userId = await newUser();
    const first = await start(userId);
    const answers = Object.fromEntries(lessonExercises(first.lesson).map(({ key, exercise }) => [key, right(exercise)]));
    const state: SessionState = { ...SessionStateSchema.parse({}), answers, fluency: { readingWpm: 150, retellWords: 42 } };
    await call('POST', `/sessions/${first.id}/complete`, { state });
    expect((await call('GET', `/sessions/${first.id}`)).json.state.fluency).toEqual({ readingWpm: 150, retellWords: 42 });

    await takeLesson(userId); // 這一堂跳過了重溫
    const third = await start(userId);
    expect(third.previous).toMatchObject({ lastReadingWpm: 150, lastRetellWords: 42 });
  });
});

// 單字表:讓學生回頭看這個等級學過哪些字,以及哪些是當初就沒學好的。
describe('單字表', () => {
  const words = async (userId: number, level?: string): Promise<WordList> =>
    (await call('GET', `/words?userId=${userId}${level ? `&level=${level}` : ''}`)).json;
  const entry = (list: WordList, word: string) => list.words.find((item) => item.word === word)!;

  it('列出這個等級上過的重點單字,並標出當初答錯或不熟的,連同當時填的內容', async () => {
    const userId = await newUser();
    const lesson = await takeLesson(userId, { 'vocab.0': tried('crowd', 'crowding'), 'vocab.1': tried('tasty', 'delicious') });
    const list = await words(userId);

    expect(list.level).toBe('A2');
    expect(list.words.map((item) => item.word)).toEqual(MOCK_LESSON.vocab.map((vocab) => vocab.word));
    expect(entry(list, 'crowded')).toMatchObject({ outcome: 'unknown', wrongAnswers: ['crowd', 'crowding'], status: 'unknown', sessionId: lesson.id, date: TODAY });
    expect(entry(list, 'delicious')).toMatchObject({ outcome: 'unfamiliar', wrongAnswers: ['tasty'], status: 'unfamiliar' });
    const fine = list.words.filter((item) => item.word !== 'crowded' && item.word !== 'delicious');
    expect(fine.every((item) => item.outcome === 'correct' && item.wrongAnswers.length === 0 && item.status === 'learning')).toBe(true);
    expect(entry(list, 'crowded')).toMatchObject({ meaning: MOCK_LESSON.vocab[0]!.meaning, example: MOCK_LESSON.vocab[0]!.example, lessonTitle: MOCK_LESSON.title });
  });

  // 重上用的是同一份題目,第二次當然會對。那不代表當初就會,標記不能因此消失;同一個字也不該列兩次。
  it('重上時答對,不會把「當初答錯」的標記洗掉,也不會重複列出', async () => {
    const userId = await newUser();
    const original = await takeLesson(userId, { 'vocab.0': tried('crowd', 'crowding') });
    const retake: SessionView = (await call('POST', `/sessions/${original.id}/retake`)).json;
    const answers = Object.fromEntries(lessonExercises(retake.lesson).map(({ key, exercise }) => [key, right(exercise)]));
    for (const item of retake.review) answers[reviewKey(item.id)] = right(item.quiz);
    await call('POST', `/sessions/${retake.id}/complete`, { state: { ...SessionStateSchema.parse({}), answers } });

    const list = await words(userId);
    expect(list.words).toHaveLength(MOCK_LESSON.vocab.length);
    expect(entry(list, 'crowded')).toMatchObject({ outcome: 'unknown', wrongAnswers: ['crowd', 'crowding'], sessionId: original.id });
  });

  it('只列出指定等級的單字;沒有指定時用目前的等級', async () => {
    const userId = await newUser();
    await takeLesson(userId);
    expect((await words(userId, 'B1')).words).toEqual([]);
    expect((await words(userId, 'A2')).words).toHaveLength(MOCK_LESSON.vocab.length);

    await call('PATCH', `/users/${userId}`, { level: 'B1' });
    expect(await words(userId)).toMatchObject({ level: 'B1', words: [] });
  });

  it('還沒上完的課不列入;課後手動標過「我不熟」的會註明', async () => {
    const userId = await newUser();
    const session: SessionView = (await call('POST', '/sessions', { userId, minutes: 30 })).json;
    expect((await words(userId)).words).toEqual([]);

    const answers = Object.fromEntries(lessonExercises(session.lesson).map(({ key, exercise }) => [key, right(exercise)]));
    await call('POST', `/sessions/${session.id}/complete`, { state: { ...SessionStateSchema.parse({}), answers } });
    await call('POST', `/sessions/${session.id}/flags`, { target: 'vocab.2' });
    const list = await words(userId);
    expect(list.words[2]).toMatchObject({ outcome: 'correct', flagged: true, status: 'unfamiliar' });
    expect(list.words[3]).toMatchObject({ flagged: false });
  });

  it('只看得到自己的單字;等級不正確會被拒絕', async () => {
    const other = await newUser('小華');
    await takeLesson(other);
    const userId = await newUser('小明');
    expect((await words(userId)).words).toEqual([]);
    expect((await call('GET', `/words?userId=${userId}&level=Z9`)).status).toBe(400);
  });
});
