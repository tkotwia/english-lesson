import { existsSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 開發時把 /api 轉給本機伺服器。連接埠和伺服器讀同一份設定,改了 .env 的 PORT 兩邊才對得上。
if (existsSync('.env')) process.loadEnvFile('.env');
const apiPort = process.env.PORT ?? '3210';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
  },
});
