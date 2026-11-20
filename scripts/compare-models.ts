// 模型能力比較:用真實的 Gemini API,讓每個候選模型各產生 A1 與 B2 的課程,
// 檢查回傳內容是否通過驗證,並把課程存成檔案供人工檢查答案與難度。
//
// 用法:node scripts/compare-models.ts <使用者編號> [模型1,模型2,…]
//   - 使用者編號:用這位使用者在網頁上設定的 API key(編號可在使用者選擇頁依序數,或看資料庫)。
//   - 模型清單:不給就用 .env 裡品質類與對話類的所有模型。
//
// 注意:每個模型會呼叫 2 次(格式不對時最多再各 1 次),會消耗該模型當天的免費額度。
// 結果存在 DATA_DIR/model-comparison/ 裡。

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { LessonSchema, type Level } from '../shared/schema.ts';
import { LEVEL_GUIDES } from '../server/ai/cefr.ts';
import { createGeminiProvider } from '../server/ai/gemini.ts';
import { createProvider, geminiOptionsFromEnv } from '../server/ai/index.ts';
import { lessonPrompt } from '../server/ai/prompts.ts';
import { AiError, type AiUsage } from '../server/ai/provider.ts';
import { openDb } from '../server/db.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const userId = Number(process.argv[2]);
if (!Number.isInteger(userId) || userId <= 0) {
  console.error('用法:node scripts/compare-models.ts <使用者編號> [模型1,模型2,…]');
  process.exit(1);
}

const dataDir = resolve(process.env.DATA_DIR ?? './data');
const db = openDb(join(dataDir, 'english.db'));
const user = db.prepare('SELECT name, api_key FROM users WHERE id = ?').get(userId) as { name: string; api_key: string | null } | undefined;
db.close();
if (!user) {
  console.error(`找不到編號 ${userId} 的使用者。`);
  process.exit(1);
}
if (!user.api_key) {
  console.error(`使用者「${user.name}」還沒有設定 API key,請先在網頁的設定頁貼上。`);
  process.exit(1);
}
const apiKey = user.api_key;

const configured = createProvider({ ...process.env, AI_PROVIDER: 'gemini' }).models;
const models = process.argv[3]?.split(',').map((model) => model.trim()).filter(Boolean) ?? [...new Set([...configured.quality, ...configured.chat])];

const CASES: { level: Level; stage: 'elementary' | 'university'; topic: string }[] = [
  { level: 'A1', stage: 'elementary', topic: 'my pet' },
  { level: 'B2', stage: 'university', topic: 'remote work and study' },
];

const outDir = join(dataDir, 'model-comparison');
mkdirSync(outDir, { recursive: true });

console.log(`使用「${user.name}」的 key,比較模型:${models.join('、')}`);
console.log(`每個模型產生 ${CASES.length} 堂課,結果存到 ${outDir}\n`);

const rows: Record<string, string | number>[] = [];
for (const model of models) {
  // 只給一個模型,不讓它悄悄改用備援,才比得出每個模型自己的表現。
  const { thinking, timeoutMs } = geminiOptionsFromEnv(process.env);
  const provider = createGeminiProvider({ models: { quality: [model], chat: [model] }, thinking, timeoutMs });
  for (const { level, stage, topic } of CASES) {
    const usage: AiUsage[] = [];
    const started = Date.now();
    let outcome = '通過';
    let detail = '';
    try {
      const lesson = await provider.generateJson({
        tier: 'quality',
        task: 'lesson',
        apiKey,
        ...lessonPrompt({ level, stage, minutes: 30, topic, grammarPoint: LEVEL_GUIDES[level].grammar[0]!, avoidWords: [], previousTitles: [], recycleWords: [] }),
        schema: LessonSchema,
        onUsage: (item) => usage.push(item),
      });
      writeFileSync(join(outDir, `${model}-${level}.json`), JSON.stringify(lesson, null, 2));
      detail = `課文 ${lesson.passage.text.split(/\s+/).length} 字`;
    } catch (err) {
      outcome = err instanceof AiError ? `失敗(${err.code})` : '失敗';
      detail = err instanceof AiError ? (err.detail ?? err.message).slice(0, 120) : String(err).slice(0, 120);
    }
    rows.push({
      秒: Math.round(usage.reduce((sum, item) => sum + item.durationMs, 0) / 100) / 10,
      模型: model,
      等級: level,
      結果: outcome,
      呼叫次數: usage.length,
      輸入token: usage.reduce((sum, item) => sum + item.inputTokens, 0),
      輸出token: usage.reduce((sum, item) => sum + item.outputTokens, 0),
      秒數: Math.round((Date.now() - started) / 100) / 10,
      說明: detail,
    });
    console.log(`${model} / ${level}:${outcome} ${detail}`);
  }
}

console.log();
console.table(rows);
console.log('「通過」代表格式與題目結構正確(呼叫次數 2 表示第一次格式不對、重試後才通過)。');
console.log('答案是否正確、難度是否符合等級,請打開上面的 JSON 檔人工檢查。');
