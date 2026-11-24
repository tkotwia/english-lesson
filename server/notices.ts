import type { QuotaNotice } from '../shared/api.ts';
import type { AiJsonRequest, AiProvider, QuotaEvent } from './ai/provider.ts';

// 額度上限(429)的通知。
// 遇到 429 時程式會自動改用後面的模型,學生多半不會察覺;但備援模型的品質較差,而且背景備課的失敗
// 完全沒有畫面可看。所以把每一次 429 記下來,由網頁定時來問、顯示給使用者。
//
// 額度是跟著 Google 專案(也就是 API key)走的,所以通知以 key 為單位:共用同一把 key 的使用者都看得到。
// 只放在記憶體裡:這是當下的狀況通知,不是紀錄,重新啟動後不需要保留。

/** 每把 key 最多保留幾筆。 */
const KEEP = 50;
/** 同一個模型、同一種上限,這麼短的時間內重複發生只通知一次(背景連續失敗時不洗版)。 */
const REPEAT_WINDOW_MS = 60_000;
/** 通知只在這段時間內有意義:剛打開網頁時不必看到很久以前的。 */
const MAX_AGE_MS = 10 * 60_000;

export function createNotices(now: () => number = Date.now) {
  const byKey = new Map<string, QuotaNotice[]>();
  let nextId = 1;

  return {
    add(apiKey: string, event: QuotaEvent & { task: string }): void {
      const list = byKey.get(apiKey) ?? [];
      const repeated = list.some((notice) => notice.model === event.model && notice.scope === event.scope && now() - Date.parse(notice.at) < REPEAT_WINDOW_MS);
      if (repeated) return;
      list.push({ id: nextId++, at: new Date(now()).toISOString(), model: event.model, task: event.task, scope: event.scope, retryAfterSeconds: event.retryAfterSeconds });
      byKey.set(apiKey, list.slice(-KEEP));
    },

    /** 這把 key 在編號 after 之後、而且還不算太久以前的通知,由舊到新。 */
    since(apiKey: string, after: number): QuotaNotice[] {
      return (byKey.get(apiKey) ?? []).filter((notice) => notice.id > after && now() - Date.parse(notice.at) <= MAX_AGE_MS);
    },
  };
}

export type Notices = ReturnType<typeof createNotices>;

/** 包住 AI 供應商:任何一次呼叫遇到 429 都記成通知,呼叫的地方不必各自處理。 */
export function withQuotaNotices(ai: AiProvider, notices: Notices): AiProvider {
  return {
    name: ai.name,
    models: ai.models,
    testKey: (apiKey, onUsage) => ai.testKey(apiKey, onUsage),
    generateJson: <T>(request: AiJsonRequest<T>) =>
      ai.generateJson({
        ...request,
        onQuota: (event) => {
          notices.add(request.apiKey, { ...event, task: request.task });
          request.onQuota?.(event);
        },
      }),
  };
}
