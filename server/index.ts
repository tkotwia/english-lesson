import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createProvider, geminiOptionsFromEnv } from './ai/index.ts';
import { createApp } from './app.ts';
import { openDb } from './db.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const port = Number(process.env.PORT ?? 3210);
const dataDir = resolve(process.env.DATA_DIR ?? './data');
const dbPath = join(dataDir, 'english.db');
const isProduction = process.env.NODE_ENV === 'production';
// 預設開啟預先備課;在 .env 設 AI_PREPARE_NEXT=off 可以關掉(每次按開始時才現場產生)。
const prepareAhead = (process.env.AI_PREPARE_NEXT ?? 'on').trim().toLowerCase() !== 'off';

const db = openDb(dbPath);
const ai = createProvider(process.env);
const app = createApp({
  db,
  ai,
  staticDir: isProduction ? resolve('dist/client') : undefined,
  prepareAhead,
});

// 只接受這台電腦自己的連線:資料庫裡有使用者的 API key,不對區域網路開放。
app.listen(port, '127.0.0.1', () => {
  console.log(`[server] 資料庫:${dbPath}`);
  console.log(`[server] AI 供應商:${ai.name}(品質類:${ai.models.quality.join(' → ')};對話類:${ai.models.chat.join(' → ')})`);
  if (ai.name === 'gemini') {
    const { thinking, timeoutMs } = geminiOptionsFromEnv(process.env);
    console.log(
      `[server] 思考程度:品質類 ${thinking.quality ?? '模型預設'}、對話類 ${thinking.chat ?? '模型預設'};逾時:品質類 ${timeoutMs.quality! / 1000} 秒、對話類 ${timeoutMs.chat! / 1000} 秒`,
    );
  }
  console.log(`[server] 預先備課:${prepareAhead ? '開啟(上課時在背景準備下一堂)' : '關閉'}`);
  if (isProduction) {
    console.log(`[server] 請用 Chrome 開啟 http://localhost:${port}`);
  } else {
    console.log(`[server] API 在 http://localhost:${port},開發時請開啟 Vite 顯示的網址`);
  }
});
