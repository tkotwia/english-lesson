import type {
  CalendarMonth,
  PlacementAttempt,
  PlacementResult,
  PlacementStatus,
  PreparedStatus,
  ProgressSummary,
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
  Minutes,
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
  startSession: (userId: number, minutes: Minutes) => request<SessionView>('POST', '/sessions', { userId, minutes }),
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
