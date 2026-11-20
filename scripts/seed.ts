// 產生示範資料:建立一位示範使用者,並在「上個月」放入一整個月已完成的課,
// 用來查看日曆、月平均與升級建議,不需要真的上完一個月的課。
//
// 用法:node scripts/seed.ts [月平均分數,預設 96]
// 資料寫入 DATA_DIR(預設 ./data)裡的 english.db。示範使用者可以在網頁上刪除。

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { addDays, localDate, monthOf, monthRange, previousMonth } from '../shared/dates.ts';
import type { SessionResult } from '../shared/schema.ts';
import { MOCK_LESSON } from '../server/ai/mockData.ts';
import { openDb } from '../server/db.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const average = Number(process.argv[2] ?? 96);
if (!Number.isFinite(average) || average < 0 || average > 100) {
  console.error('月平均分數必須是 0 到 100 之間的數字');
  process.exit(1);
}

const dbPath = join(resolve(process.env.DATA_DIR ?? './data'), 'english.db');
const db = openDb(dbPath);

const user = db.prepare(`INSERT INTO users (name, stage, level) VALUES ('示範學生', 'junior', 'A2')`).run();
const userId = Number(user.lastInsertRowid);

const lastMonth = previousMonth(monthOf(localDate()));
const { from, to } = monthRange(lastMonth);
// 每隔一天上一堂課;分數在平均值上下各 2 分交替,平均剛好是指定的數字。
const insert = db.prepare(
  `INSERT INTO sessions (user_id, local_date, level, stage, minutes, topic, status, lesson_json, state_json, score, result_json)
   VALUES (?, ?, 'A2', 'junior', 30, 'seed', 'completed', ?, '{}', ?, ?)`,
);
const dates: string[] = [];
for (let date = from; date <= to; date = addDays(date, 2)) dates.push(date);
if (dates.length % 2 === 1) dates.pop(); // 取偶數堂,上下交替才會剛好平均

dates.forEach((date, index) => {
  const spread = Math.min(2, 100 - average, average);
  const score = Math.round((average + (index % 2 === 0 ? spread : -spread)) * 10) / 10;
  const result: SessionResult = {
    score,
    sections: [
      { section: 'reading', percent: score, weight: 27.3 },
      { section: 'language', percent: score, weight: 36.4 },
      { section: 'writing', percent: score, weight: 36.4 },
    ],
    weakPoints: [],
    writing: null,
    speaking: null,
    closing: '(示範資料)',
  };
  insert.run(userId, date, JSON.stringify(MOCK_LESSON), score, JSON.stringify(result));
});

db.close();
console.log(`已在 ${dbPath} 建立「示範學生」,${lastMonth} 共 ${dates.length} 堂課,月平均 ${average} 分。`);
console.log(average >= 95 ? '開啟網頁選擇「示範學生」,首頁與日曆會出現升級建議。' : '月平均未達 95 分,不會出現升級建議。');
