import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createLiveVoice, createProvider, createSpeechVoice, geminiOptionsFromEnv } from './ai/index.ts';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { backfillResponses } from './items.ts';
import { LESSON_MINUTES } from '../shared/schema.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const port = Number(process.env.PORT ?? 3210);
const dataDir = resolve(process.env.DATA_DIR ?? './data');
const dbPath = join(dataDir, 'english.db');
const isProduction = process.env.NODE_ENV === 'production';
// 預設開啟預先備課;在 .env 設 AI_PREPARE_NEXT=off 可以關掉(每次按開始時才現場產生)。
const prepareAhead = (process.env.AI_PREPARE_NEXT ?? 'on').trim().toLowerCase() !== 'off';
// 背景要備哪些長度的課。預設三種都備;只想省額度的話,可以設成例如 AI_PREPARE_MINUTES=20。
const requestedMinutes = (process.env.AI_PREPARE_MINUTES ?? '').split(',').map((value) => Number(value.trim()));
const chosenMinutes = LESSON_MINUTES.filter((minutes) => requestedMinutes.includes(minutes));
const prepareMinutes = chosenMinutes.length > 0 ? chosenMinutes : LESSON_MINUTES;

const db = openDb(dbPath);
const backfilled = backfillResponses(db);
if (backfilled > 0) console.log(`[server] 已從上課紀錄補回舊紀錄裡答錯的作答(檢查了 ${backfilled} 筆)`);
const ai = createProvider(process.env);
const speech = createSpeechVoice(process.env);
const app = createApp({
  db,
  ai,
  staticDir: isProduction ? resolve('dist/client') : undefined,
  prepareAhead,
  prepareMinutes,
  live: createLiveVoice(process.env),
  speech: speech ? { voice: speech, dir: join(dataDir, 'audio') } : undefined,
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
  console.log(`[server] 聽力音檔:${speech ? `用語音合成事先唸好(${speech.models.join(' → ')}),還沒做好或額度用完時由瀏覽器朗讀` : '不使用,由瀏覽器朗讀'}`);
  console.log(`[server] 預先備課:${prepareAhead ? `開啟(上課時在背景準備 ${prepareMinutes.join('、')} 分鐘的課)` : '關閉'};每個等級的第一堂 20 分鐘課使用內建的起始課`);
  if (isProduction) {
    console.log(`[server] 請用 Chrome 開啟 http://localhost:${port}`);
  } else {
    console.log(`[server] API 在 http://localhost:${port},開發時請開啟 Vite 顯示的網址`);
  }
});
