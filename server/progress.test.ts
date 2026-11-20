import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CalendarMonth, ProgressSummary, ReviewListItem } from '../shared/api.ts';
import { addDays, localDate, monthOf, monthRange, previousMonth } from '../shared/dates.ts';
import { FLASHCARD_FORGOT, FLASHCARD_KNOWN, lessonExercises, reviewKey, type Exercise, type ReviewItemView } from '../shared/lesson.ts';
import { SessionStateSchema, type ExerciseAnswer, type Level, type SessionResult, type SessionState, type SessionView } from '../shared/schema.ts';
import { createMockProvider } from './ai/mock.ts';
import { MOCK_FIXTURES, MOCK_LESSON } from './ai/mockData.ts';
import { createApp } from './app.ts';
import { openDb, type Db } from './db.ts';

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
      return exercise.sentence;
  }
}

const right = (exercise: Exercise): ExerciseAnswer => ({ attempts: [correctResponse(exercise)], hintUsed: false });
const WRONG_TWICE: ExerciseAnswer = { attempts: ['zzz', 'yyy'], hintUsed: false };

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
const makeDue = (itemId: number, date = TODAY) => db.prepare('UPDATE items SET due_date = ? WHERE id = ?').run(date, itemId);

/** 直接在資料庫放一堂已完成的課,用來測試日曆與升級(不必真的上完一個月的課)。 */
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
    expect(items(userId)).toHaveLength(2);
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

  it('AI 批改找到的寫作錯誤做成閃卡進入項目庫', async () => {
    const userId = await newUser();
    const session: SessionView = (await call('POST', '/sessions', { userId, minutes: 30 })).json;
    const answers = Object.fromEntries(lessonExercises(session.lesson).map(({ key, exercise }) => [key, right(exercise)]));
    await call('POST', `/sessions/${session.id}/complete`, { state: { ...SessionStateSchema.parse({}), answers, writing: 'I go to the park yesterday.' } });

    const due: ReviewItemView[] = (await call('GET', `/review/due?userId=${userId}`)).json.items;
    expect(due).toEqual([]); // 明天才到期
    const writing = items(userId).find((item) => item.kind === 'writing')!;
    makeDue(writing.id);
    const [item] = (await call('GET', `/review/due?userId=${userId}`)).json.items as ReviewItemView[];
    expect(item!.quiz).toMatchObject({ type: 'flashcard', front: 'I go to the park yesterday.', back: 'I went to the park yesterday.' });
  });

  it('每位使用者的項目庫互不相干', async () => {
    const a = await newUser('小明');
    const b = await newUser('小華');
    await takeLesson(a, { 'vocab.0': WRONG_TWICE });
    expect(items(a)).toHaveLength(1);
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

  it('間隔已達 16 天又答對,標為已掌握,之後不再出現', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE });
    const item = itemByKey(userId, 'vocab:crowded')!;
    db.prepare(`UPDATE items SET interval_days = 16, status = 'unfamiliar', due_date = ? WHERE id = ?`).run(TODAY, item.id);
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
});

describe('升級建議', () => {
  const progress = async (userId: number): Promise<ProgressSummary> => (await call('GET', `/progress?userId=${userId}`)).json;

  it('上個月平均達 95 分時出現升級建議', async () => {
    const userId = await newUser();
    insertCompleted(userId, `${LAST_MONTH}-10`, 96);
    expect((await progress(userId)).suggestion).toEqual({ month: LAST_MONTH, average: 96, from: 'A2', to: 'B1' });
  });

  it('上個月平均不到 95 分時沒有建議', async () => {
    const userId = await newUser();
    insertCompleted(userId, `${LAST_MONTH}-10`, 94.9);
    expect((await progress(userId)).suggestion).toBeNull();
  });

  it('接受建議後等級升一級,而且不再出現同一個建議', async () => {
    const userId = await newUser();
    insertCompleted(userId, `${LAST_MONTH}-10`, 96);
    const res = await call('POST', '/level-decisions', { userId, month: LAST_MONTH, decision: 'accepted' });

    expect(res.json.level).toBe('B1');
    expect((await progress(userId)).suggestion).toBeNull();
  });

  it('選「先不要」時等級不變,這個月份也不再詢問', async () => {
    const userId = await newUser();
    insertCompleted(userId, `${LAST_MONTH}-10`, 96);
    const res = await call('POST', '/level-decisions', { userId, month: LAST_MONTH, decision: 'declined' });

    expect(res.json.level).toBe('A2');
    expect((await progress(userId)).suggestion).toBeNull();
  });

  // 防止沒有達標卻直接呼叫 API 升級。
  it('沒有升級建議時,不能送出升級決定', async () => {
    const userId = await newUser();
    insertCompleted(userId, `${LAST_MONTH}-10`, 80);
    const res = await call('POST', '/level-decisions', { userId, month: LAST_MONTH, decision: 'accepted' });
    expect(res.status).toBe(409);
    expect((await call('GET', '/users')).json[0].level).toBe('A2');
  });

  it('首頁摘要包含今天的分數、本月平均與待複習數量', async () => {
    const userId = await newUser();
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE });
    makeDue(itemByKey(userId, 'vocab:crowded')!.id);
    const summary = await progress(userId);

    expect(summary.today).toBe(TODAY);
    expect(summary.todayScore).not.toBeNull();
    expect(summary.monthAverage).toBe(summary.todayScore);
    expect(summary.dueCount).toBe(1);
  });
});

describe('刪除使用者', () => {
  it('一併刪除他的課程、弱點項目、複習紀錄與升級決定', async () => {
    const userId = await newUser();
    insertCompleted(userId, `${LAST_MONTH}-10`, 96);
    await call('POST', '/level-decisions', { userId, month: LAST_MONTH, decision: 'declined' });
    await takeLesson(userId, { 'vocab.0': WRONG_TWICE });
    await call('DELETE', `/users/${userId}`);

    for (const table of ['sessions', 'items', 'item_events', 'level_decisions', 'api_usage']) {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
      expect(row.n, table).toBe(0);
    }
  });
});
