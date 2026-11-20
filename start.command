#!/bin/bash
# 英文課啟動檔:在 Finder 點兩下即可啟動。
# 會建置網頁、啟動本機伺服器,並用 Chrome 開啟。關掉這個終端機視窗就會停止程式。

cd "$(dirname "$0")" || exit 1

pause_and_exit() {
  echo
  read -r -p "按 Enter 關閉這個視窗…"
  exit "$1"
}

if ! command -v node >/dev/null 2>&1; then
  echo "找不到 Node.js。請先到 https://nodejs.org 安裝 Node.js 24 以上的版本,再重新點兩下這個檔案。"
  pause_and_exit 1
fi

# 連接埠:優先用環境變數,其次用 .env 裡的設定,都沒有就用預設值。
PORT_FROM_FILE=$(grep -E '^PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '[:space:]')
PORT="${PORT:-${PORT_FROM_FILE:-3210}}"
export PORT
URL="http://localhost:${PORT}"

open_browser() {
  # 設定 NO_OPEN=1 可以只啟動伺服器、不開瀏覽器。
  [ -n "$NO_OPEN" ] && return
  open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL"
}

# 已經在執行中就直接開啟網頁,不重複啟動。
if curl -s -o /dev/null "http://127.0.0.1:${PORT}/api/users"; then
  echo "英文課已經在執行中,直接開啟 ${URL}"
  open_browser
  exit 0
fi

if [ ! -d node_modules ]; then
  echo "第一次啟動,正在安裝需要的套件(需要網路,約一兩分鐘)…"
  npm install || { echo "套件安裝失敗,請檢查網路連線後再試一次。"; pause_and_exit 1; }
fi

echo "正在準備網頁…"
npm run build --silent || { echo "網頁建置失敗,請把上面的錯誤訊息拿給維護的人看。"; pause_and_exit 1; }

# 等伺服器準備好再開瀏覽器,最多等 30 秒。
(
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null "http://127.0.0.1:${PORT}/api/users"; then
      open_browser
      exit 0
    fi
    sleep 0.5
  done
) &

echo "英文課啟動中。請用 Chrome 開啟 ${URL}"
echo "要停止程式,直接關掉這個視窗即可。"
echo
npm start --silent
STATUS=$?
if [ "$STATUS" -ne 0 ]; then
  echo "程式意外停止(代碼 ${STATUS})。"
  pause_and_exit "$STATUS"
fi
