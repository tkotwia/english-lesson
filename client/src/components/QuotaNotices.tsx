import { useEffect, useRef, useState } from 'react';
import type { QuotaNotice } from '../../../shared/api.ts';
import { api } from '../api.ts';
import { useUsers } from '../userContext.tsx';

/** 多久問一次伺服器有沒有新的通知。背景備課遇到的 429 沒有任何畫面在等,只能靠定時去問。 */
const POLL_MS = 10_000;
/** 畫面上最多同時留幾則。 */
const MAX_SHOWN = 3;

const TASK_LABELS: Record<string, string> = {
  lesson: '備課',
  grade: '批改',
  chat: '對話',
  ask: '回答「問老師」',
  placement: '出分級測驗的題目',
  live: '即時對話',
  speech: '製作聽力音檔',
};

function scopeText(notice: QuotaNotice): string {
  if (notice.scope === 'day') return '超過每日的請求數上限。台灣時間下午 3–4 點(太平洋時間午夜)重置,在那之前程式不會再用這個模型。';
  const wait = notice.retryAfterSeconds ? `約 ${notice.retryAfterSeconds} 秒後恢復` : '約一分鐘後恢復';
  if (notice.scope === 'minute') return `超過每分鐘的上限(請求數或 token 數),${wait}。`;
  return '超過額度上限,訊息裡看不出是每分鐘還是每日的;程式一分鐘後會再試一次。';
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * 免費額度的上限到了(Google 回 429)時的通知,任何頁面都看得到。
 * 遇到 429 時程式會自動改用後面的模型,不通知的話使用者不會知道現在用的是品質較差的備援模型。
 */
export function QuotaNotices() {
  const { activeUser } = useUsers();
  const userId = activeUser?.id;
  const [notices, setNotices] = useState<QuotaNotice[]>([]);
  const lastId = useRef(0);

  useEffect(() => {
    lastId.current = 0;
    setNotices([]);
    if (userId === undefined) return;
    let cancelled = false;
    const poll = () => {
      api
        .getNotices(userId, lastId.current)
        .then(({ notices: fresh }) => {
          if (cancelled || fresh.length === 0) return;
          lastId.current = fresh.at(-1)!.id;
          setNotices((current) => [...current, ...fresh].slice(-MAX_SHOWN));
        })
        .catch(() => {
          // 問不到就下次再問;通知不該自己變成另一個錯誤訊息。
        });
    };
    poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [userId]);

  if (notices.length === 0) return null;
  return (
    <div className="quota-notices" role="status" aria-live="polite">
      {notices.map((notice) => (
        <div key={notice.id} className="quota-notice">
          <strong>免費額度的上限到了</strong>
          <p>
            {timeOf(notice.at)},{TASK_LABELS[notice.task] ?? '使用 AI'}時,<code>{notice.model}</code> {scopeText(notice)}
          </p>
          <p className="small">
            {notice.task === 'speech' ? '還沒做好的聽力音檔會改由瀏覽器朗讀,不影響上課。' : '程式會自動改用後面的模型;如果畫面出現錯誤,請稍後再試。'}
            額度以 Google 專案為單位,共用同一個專案的 key 會一起計算。
          </p>
          <button type="button" className="button button-ghost" onClick={() => setNotices((current) => current.filter((item) => item.id !== notice.id))}>
            知道了
          </button>
        </div>
      ))}
    </div>
  );
}
