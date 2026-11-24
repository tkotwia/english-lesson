import type {
  CalendarMonth,
  LessonAudioInfo,
  LiveEvent,
  LiveSessionInfo,
  PlacementAttempt,
  PlacementResult,
  PlacementStatus,
  PreparedStatus,
  ProgressSummary,
  QuotaNotice,
  ReviewListItem,
  TaskTimings,
  WordList,
} from '../../shared/api.ts';
import type { PlacementAnswers } from '../../shared/placement.ts';
import type { ReviewItemView } from '../../shared/lesson.ts';
import type {
  ChatTurn,
  ExerciseAnswer,
  KeyTestResult,
  Level,
  NewUser,
  Outcome,
  PublicUser,
  SessionState,
  SessionView,
  SettingsStatus,
  UserPatch,
} from '../../shared/schema.ts';

export class ApiError extends Error {
  status: number;
  code: string;
  detail: string | undefined;

  constructor(status: number, code: string, message: string, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', '無法連線到本機伺服器,請確認程式是否已啟動。');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? 'unknown',
      data?.error?.message ?? `請求失敗(狀態碼 ${res.status})`,
      data?.error?.detail,
    );
  }
  return data as T;
}

export const api = {
  listUsers: () => request<PublicUser[]>('GET', '/users'),
  createUser: (user: NewUser) => request<PublicUser>('POST', '/users', user),
  updateUser: (id: number, patch: UserPatch) => request<PublicUser>('PATCH', `/users/${id}`, patch),
  deleteUser: (id: number) => request<void>('DELETE', `/users/${id}`),
  setApiKey: (id: number, apiKey: string) => request<PublicUser>('PUT', `/users/${id}/api-key`, { apiKey }),
  testApiKey: (id: number) => request<KeyTestResult>('POST', `/users/${id}/api-key/test`),
  getStatus: (userId: number) => request<SettingsStatus>('GET', `/settings/status?userId=${userId}`),

  currentSession: (userId: number) => request<SessionView | null>('GET', `/sessions/current?userId=${userId}`),
  startSession: (userId: number) => request<SessionView>('POST', '/sessions', { userId }),
  /** 「備課」:請老師把下一堂課備好;備好才回應。 */
  prepareLesson: (userId: number) => request<PreparedStatus>('POST', '/sessions/prepare', { userId }),
  getSession: (id: number) => request<SessionView>('GET', `/sessions/${id}`),
  saveSessionState: (id: number, state: SessionState) => request<void>('PUT', `/sessions/${id}/state`, state),
  completeSession: (id: number, state: SessionState) => request<SessionView>('POST', `/sessions/${id}/complete`, { state }),
  abandonSession: (id: number) => request<void>('DELETE', `/sessions/${id}`),
  retakeSession: (id: number) => request<SessionView>('POST', `/sessions/${id}/retake`),
  getPrepared: (userId: number) => request<PreparedStatus>('GET', `/sessions/prepared?userId=${userId}`),
  getTimings: () => request<TaskTimings>('GET', '/sessions/timings'),
  flagSession: (id: number, target: string) => request<{ flags: string[] }>('POST', `/sessions/${id}/flags`, { target }),
  chatSession: (id: number, message: string) => request<{ chat: ChatTurn[] }>('POST', `/sessions/${id}/chat`, { message }),
  askSession: (id: number, question: string) =>
    request<{ asks: { question: string; answer: string }[] }>('POST', `/sessions/${id}/ask`, { question }),

  getProgress: (userId: number) => request<ProgressSummary>('GET', `/progress?userId=${userId}`),
  getCalendar: (userId: number, month: string) => request<CalendarMonth>('GET', `/calendar?userId=${userId}&month=${month}`),

  getReview: (userId: number, from: string, to: string) =>
    request<{ items: ReviewListItem[] }>('GET', `/review?userId=${userId}&from=${from}&to=${to}`),
  getDueItems: (userId: number) => request<{ items: ReviewItemView[] }>('GET', `/review/due?userId=${userId}`),

  getWords: (userId: number, level: Level) => request<WordList>('GET', `/words?userId=${userId}&level=${level}`),
  getNotices: (userId: number, after: number) => request<{ notices: QuotaNotice[] }>('GET', `/notices?userId=${userId}&after=${after}`),

  startLive: (userId: number) => request<LiveSessionInfo>('POST', '/live', { userId }),
  startLessonLive: (sessionId: number) => request<LiveSessionInfo>('POST', `/sessions/${sessionId}/live`),
  getLessonAudio: (sessionId: number) => request<LessonAudioInfo>('GET', `/sessions/${sessionId}/audio`),
  prepareLessonAudio: (sessionId: number) => request<LessonAudioInfo>('POST', `/sessions/${sessionId}/audio`),
  endLive: (id: string) => request<void>('DELETE', `/live/${id}`),

  getPlacement: (userId: number) => request<PlacementStatus>('GET', `/placement?userId=${userId}`),
  startPlacement: (userId: number) => request<PlacementAttempt>('POST', '/placement', { userId }),
  completePlacement: (id: number, answers: PlacementAnswers, tts: boolean) => request<PlacementResult>('POST', `/placement/${id}/complete`, { answers, tts }),
  postReviewResults: (userId: number, answers: Record<string, ExerciseAnswer>) =>
    request<{ results: { itemId: number; outcome: Outcome }[] }>('POST', '/review/results', { userId, answers }),
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : '發生未知的錯誤';
}

/** 伺服器回報的錯誤代碼(例如 quota、no_key);不是 API 錯誤時回傳 undefined。 */
export function errorCode(err: unknown): string | undefined {
  return err instanceof ApiError ? err.code : undefined;
}

/** 供應商回傳的原始錯誤內容,除錯用;沒有就回傳 undefined。 */
export function errorDetail(err: unknown): string | undefined {
  return err instanceof ApiError ? err.detail : undefined;
}

/** 伺服器沒有照預期回應時,把它的錯誤內容轉成 ApiError。 */
async function liveFailure(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; detail?: string } } | null;
  return new ApiError(res.status, body?.error?.code ?? 'http', body?.error?.message ?? '對話沒有成功,請再試一次。', body?.error?.detail);
}

/** 讀一行一個 JSON 的串流。一次收到的內容可能切在一行的中間,所以先接起來再逐行處理。 */
async function readEvents(res: Response, onEvent: (event: LiveEvent) => void): Promise<void> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  for (;;) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as LiveEvent);
    if (done) break;
  }
  if (pending.trim()) onEvent(JSON.parse(pending) as LiveEvent);
}

const NETWORK_ERROR = new ApiError(0, 'network', '無法連線到本機伺服器,請確認程式是否已啟動。');

/**
 * 接上整場即時對話的串流,直到對話結束(或用 signal 中斷)才返回。
 * 伺服器在瀏覽器接上之後才請老師開場。
 */
export async function liveEvents(id: string, onEvent: (event: LiveEvent) => void, signal: AbortSignal): Promise<void> {
  const res = await fetch(`/api/live/${id}/events`, { signal }).catch((err: unknown) => {
    if (signal.aborted) throw err;
    throw NETWORK_ERROR;
  });
  if (!res.ok || !res.body) throw await liveFailure(res);
  await readEvents(res, onEvent);
}

/** 送出麥克風的一小段聲音。 */
export async function liveAudio(id: string, audio: Int16Array): Promise<void> {
  const res = await fetch(`/api/live/${id}/audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new Blob([audio.buffer as ArrayBuffer]),
  });
  if (!res.ok) throw await liveFailure(res);
}
