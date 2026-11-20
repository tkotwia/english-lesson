#!/bin/bash
# 給「英文課.app」用的控制腳本。App 本身只是一層薄薄的外殼,實際的啟動與停止都在這裡。
#
#   launch [擁有者行程編號]  在背景啟動伺服器(已經在執行就不重複啟動)
#   state                   ready(可以用了)、starting(啟動中)或 stopped(沒有在執行)
#   open                    用 Chrome 開啟網站
#   stop                    停止這個帳號啟動的伺服器
#   log                     最近幾行啟動紀錄(啟動失敗時顯示給使用者看)

set -u
# 用實體路徑(-P):之後要拿它和系統回報的行程工作目錄比對,兩邊寫法必須一致。
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
SELF="$PROJECT_DIR/scripts/app-control.sh"
cd "$PROJECT_DIR" || exit 1

# 從 Finder 或 Dock 啟動的 App 只有最基本的 PATH,找不到 node。
# 補上常見的安裝位置;還是找不到的話,再借用登入 shell 的設定。
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  LOGIN_PATH="$(/bin/zsh -lc 'printf %s "$PATH"' 2>/dev/null)"
  [ -n "$LOGIN_PATH" ] && export PATH="$LOGIN_PATH:$PATH"
fi

# 連接埠的決定方式和 start.command 相同:環境變數 → .env → 預設值。
PORT_FROM_FILE=$(grep -E '^PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '[:space:]')
PORT="${PORT:-${PORT_FROM_FILE:-3210}}"
export PORT
URL="http://localhost:${PORT}"

# 沒有終端機視窗可以看訊息,所以寫到每個帳號自己的紀錄檔。
LOG="$HOME/Library/Logs/english-lesson.log"
PID_FILE="${TMPDIR:-/tmp}/english-lesson-launcher-${PORT}.pid"

# 伺服器是否已經可以用。只看「連得上」不夠:同一個連接埠可能是別的程式,
# 所以還要確認回應的是英文課的使用者清單(JSON 陣列)。
server_up() {
  [ "$(curl -s --max-time 2 "http://127.0.0.1:${PORT}/api/users" | head -c 1)" = "[" ]
}

# 紀錄檔裡記的行程編號,而且確認它現在仍然是我們啟動的 start.command。
# 行程結束後,系統可能把同一個編號發給別的程式;不確認就使用,會誤判狀態,甚至停錯對象。
launcher_pid() {
  [ -f "$PID_FILE" ] || return 1
  local pid
  pid=$(cat "$PID_FILE" 2>/dev/null)
  [ -n "$pid" ] || return 1
  ps -p "$pid" -o command= 2>/dev/null | grep -q "start.command" || return 1
  echo "$pid"
}

launcher_alive() {
  launcher_pid > /dev/null
}

# 佔用我們連接埠、而且確定是「這個專案的英文課伺服器」的行程。
# 同一個連接埠也可能被不相干的程式佔用,那種行程不能動。
server_pids() {
  local pid
  for pid in $(lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null); do
    ps -p "$pid" -o command= 2>/dev/null | grep -q "server/index.ts" || continue
    lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | grep -qx "n${PROJECT_DIR}" || continue
    echo "$pid"
  done
}

case "${1:-}" in
  launch)
    owner="${2:-}"
    # 已經在執行(可能是自己先前開的,也可能是這台電腦上別的帳號開的):直接用那一份。
    if server_up; then
      echo already
      exit 0
    fi
    if launcher_alive; then
      echo starting
      exit 0
    fi

    mkdir -p "$(dirname "$LOG")"
    echo "===== $(date '+%Y-%m-%d %H:%M:%S') 啟動英文課 =====" >> "$LOG"
    # 瀏覽器由 App 在伺服器準備好之後開啟,所以這裡不讓 start.command 自己開。
    NO_OPEN=1 nohup ./start.command >> "$LOG" 2>&1 &
    echo $! > "$PID_FILE"

    # 看門狗:App 結束(正常結束、當掉、登出都算)就把伺服器停掉。
    # 這樣「App 開著 = 程式在執行,App 關掉 = 程式停止」,不必依賴 App 被正常關閉。
    if [ -n "$owner" ]; then
      (
        while kill -0 "$owner" 2>/dev/null; do sleep 2; done
        "$SELF" stop
      ) > /dev/null 2>&1 &
    fi
    echo starting
    ;;

  state)
    if server_up; then
      echo ready
    elif launcher_alive; then
      echo starting
    else
      echo stopped
    fi
    ;;

  open)
    echo "$(date '+%H:%M:%S') 開啟瀏覽器 ${URL}" >> "$LOG"
    # 設定 NO_OPEN=1 可以不開瀏覽器(測試用)。
    [ -n "${NO_OPEN:-}" ] && exit 0
    open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL"
    ;;

  stop)
    # 只會停掉這個帳號自己啟動的英文課:別的帳號的行程在這裡看不到,不相干的程式也不會被動到。
    pids=$(server_pids)
    [ -n "$pids" ] && kill $pids 2>/dev/null
    if launcher=$(launcher_pid); then
      pkill -P "$launcher" 2>/dev/null
      kill "$launcher" 2>/dev/null
    fi
    rm -f "$PID_FILE"
    echo "$(date '+%H:%M:%S') 已停止" >> "$LOG" 2>/dev/null
    ;;

  log)
    tail -n 12 "$LOG" 2>/dev/null
    ;;

  *)
    echo "用法:$0 launch [行程編號] | state | open | stop | log" >&2
    exit 2
    ;;
esac
