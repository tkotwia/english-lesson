#!/bin/bash
# 產生「英文課.app」:之後點 App(或從 Dock、Launchpad)就能啟動,不用開終端機。
#
# 用法:
#   ./scripts/make-app.sh                 App 產生在專案資料夾裡
#   ./scripts/make-app.sh /Applications   App 產生在「應用程式」,這台 Mac 的每個帳號都看得到
#
# App 裡記著這個專案資料夾的位置。之後如果搬動專案資料夾,請重新執行一次這個腳本。
# 只使用 macOS 內建的工具,不需要安裝 Xcode。

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="英文課"
OUT_DIR="${1:-$PROJECT_DIR}"
APP="$OUT_DIR/$APP_NAME.app"

if ! command -v osacompile >/dev/null 2>&1; then
  echo "找不到 osacompile。這個腳本只能在 macOS 上執行。" >&2
  exit 1
fi
if [ ! -d "$OUT_DIR" ]; then
  echo "找不到資料夾:$OUT_DIR" >&2
  exit 1
fi
chmod +x "$PROJECT_DIR/scripts/app-control.sh"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# App 的本體是一小段 AppleScript。它只負責:啟動、等伺服器準備好後開瀏覽器、被關閉時結束。
# 真正的工作都交給 scripts/app-control.sh。
cat > "$WORK/template.applescript" <<'APPLESCRIPT'
property projectDir : "__PROJECT_DIR__"
property browserOpened : false
property secondsWaiting : 0
property toldToWait : false

-- 執行控制腳本並取回它印出的結果。
on control(arguments)
	return do shell script quoted form of (projectDir & "/scripts/app-control.sh") & " " & arguments
end control

on run
	set browserOpened to false
	set secondsWaiting to 0
	set toldToWait to false
	try
		-- $PPID 是這個 App 自己的行程編號:App 結束時,控制腳本會跟著把伺服器停掉。
		control("launch $PPID")
	on error message
		display dialog "英文課無法啟動。" & return & return & message buttons {"好"} default button 1 with icon stop
		quit
	end try
end run

-- App 開著的期間,系統會定期呼叫這裡。回傳值是下次呼叫前要等的秒數。
on idle
	set state to "stopped"
	try
		set state to control("state")
	end try

	if state is "ready" then
		if not browserOpened then
			set browserOpened to true
			control("open")
		end if
		return 10
	end if

	if state is "starting" then
		set secondsWaiting to secondsWaiting + 1
		-- 平常幾秒就好。等比較久多半是第一次啟動正在安裝套件,這時才告訴使用者,並且只說一次。
		if secondsWaiting > 8 and not toldToWait then
			set toldToWait to true
			display dialog "英文課正在準備中。" & return & return & "第一次啟動需要安裝套件,大約一兩分鐘。準備好之後會自動開啟 Chrome。" buttons {"好"} default button 1 giving up after 8
		end if
		return 1
	end if

	-- 伺服器沒有在執行。如果連瀏覽器都還沒開過,表示啟動失敗,把原因告訴使用者。
	if not browserOpened then
		set details to ""
		try
			set details to control("log")
		end try
		display dialog "英文課沒有啟動成功。" & return & return & details buttons {"好"} default button 1 with icon stop
	end if
	quit
	return 1
end idle

-- 已經開著時再點一次 Dock 上的圖示:把網頁再開出來。
on reopen
	if browserOpened then
		try
			control("open")
		end try
	end if
end reopen

on quit
	continue quit
end quit
APPLESCRIPT

# 把專案位置寫進 AppleScript。路徑裡的反斜線與雙引號要先轉成 AppleScript 字串的寫法,
# 再避開 sed 取代字串裡有特殊意義的字元。
as_string=$(printf '%s' "$PROJECT_DIR" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')
sed_safe=$(printf '%s' "$as_string" | sed -e 's/[&|\\]/\\&/g')
sed "s|__PROJECT_DIR__|${sed_safe}|" "$WORK/template.applescript" > "$WORK/app.applescript"

rm -rf "$APP"
# -s:做成「保持開啟」的 App,這樣它會留在 Dock 上,關掉它就等於停止程式。
if ! osacompile -s -o "$APP" "$WORK/app.applescript" 2> "$WORK/osacompile.log"; then
  cat "$WORK/osacompile.log" >&2
  exit 1
fi
# osacompile 每次都會印一行「replacing existing signature」,那不是錯誤;其他訊息照常顯示。
grep -v "replacing existing signature" "$WORK/osacompile.log" >&2 || true

echo "已產生:$APP"
echo
echo "之後點兩下這個 App 就會啟動英文課並開啟 Chrome;要停止,結束這個 App(Cmd+Q)即可。"
echo "啟動紀錄在每個帳號的 ~/Library/Logs/english-lesson.log。"
if [ "$OUT_DIR" != "/Applications" ]; then
  echo
  echo "想讓這台 Mac 的每個帳號都在「應用程式」裡看到它,執行:"
  echo "  ./scripts/make-app.sh /Applications"
fi
