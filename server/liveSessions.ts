import { randomUUID } from 'node:crypto';
import { LIVE_SILENCE_MS, LIVE_TURNS, type LiveEvent, type LiveSessionInfo } from '../shared/api.ts';
import type { Level, Stage } from '../shared/schema.ts';
import { pickTopic } from './ai/cefr.ts';
import { quotaScope, retryAfterSeconds } from './ai/gemini.ts';
import { LIVE_INPUT_RATE, LIVE_OUTPUT_RATE, type LiveStream, type LiveVoice } from './ai/live.ts';
import { livePrompt } from './ai/prompts.ts';
import { AiError } from './ai/provider.ts';
import { usageRecorder } from './ai/usage.ts';
import type { Db } from './db.ts';
import { HttpError } from './errors.ts';
import type { Notices } from './notices.ts';

// 進行中的即時語音對話:麥克風持續收音,學生停下來一會兒老師就接話。
// 瀏覽器一邊把聲音送進來,一邊從另一條串流收老師的回應。
// API key 只在這裡(伺服器)使用,瀏覽器拿到的只有對話的代號。

export interface LiveStudent {
  id: number;
  level: Level;
  stage: Stage;
  apiKey: string | null;
}

/** 一來一往:學生說的話與老師的回應(文字稿)。 */
export interface LiveExchange {
  student: string;
  teacher: string;
}

/**
 * 這場對話是為了什麼而進行的。沒有指定時是「即時對話」頁面的自由對話:不計分、不留紀錄。
 * 課程裡的情境對話會指定自己的情境、輪數,並把每一次來回記進上課紀錄。
 */
export interface LiveBinding {
  prompt: { system: string; opening: string };
  topic: string;
  /** 學生可以說幾輪。 */
  turns: number;
  /** 學生說了一句、老師回應完。回傳學生還可以說幾輪。 */
  onExchange: (exchange: LiveExchange) => number;
}

interface Session {
  userId: number;
  apiKey: string;
  stream: LiveStream;
  binding: LiveBinding;
  /** 老師開場了沒。 */
  opened: boolean;
  /** 目前這一次來回累積的文字稿。 */
  heard: string;
  said: string;
  /** 老師回應了、但沒有聽到學生說話內容的次數(雜音、或文字稿沒出來)。 */
  empty: number;
  /** 把內容送給瀏覽器;瀏覽器還沒接上串流時是 null。 */
  send: ((event: LiveEvent) => void) | null;
  /** 對話結束時通知串流那一端收尾。 */
  onEnd: (() => void) | null;
  timer: ReturnType<typeof setTimeout>;
}

/** 一場對話最長多久。麥克風一直開著,忘了關的話不能無限佔用連線與額度。 */
export const LIVE_LIMIT_MS = 5 * 60_000;

export function createLiveSessions(db: Db, voice: LiveVoice, notices: Notices) {
  const sessions = new Map<string, Session>();

  /** 即時對話被額度上限擋下時,也記成通知。 */
  const noteQuota = (apiKey: string, err: unknown) => {
    if (err instanceof AiError && err.code === 'quota') {
      const detail = err.detail ?? '';
      notices.add(apiKey, { model: voice.model, task: 'live', scope: quotaScope(detail), retryAfterSeconds: retryAfterSeconds(detail) });
    }
  };

  const close = (id: string) => {
    const session = sessions.get(id);
    if (!session) return;
    sessions.delete(id);
    clearTimeout(session.timer);
    session.stream.close();
    session.onEnd?.();
  };
  const find = (id: string): Session => {
    const session = sessions.get(id);
    if (!session) throw new HttpError(404, '這場對話已經結束,請重新開始。');
    return session;
  };

  return {
    /**
     * 開始一場對話。同一位使用者一次只有一場:開新的會關掉舊的。
     * binding 沒有指定時是自由對話:主題從學習階段的主題裡挑,學生可以說固定的幾輪。
     */
    async start(student: LiveStudent, given?: LiveBinding): Promise<LiveSessionInfo> {
      if (!student.apiKey) throw new AiError('no_key');
      for (const [id, session] of sessions) if (session.userId === student.id) close(id);

      const apiKey = student.apiKey;
      const id = randomUUID();
      let replies = 0;
      const freeTopic = pickTopic(student.stage, []);
      const binding: LiveBinding = given ?? {
        prompt: livePrompt({ level: student.level, stage: student.stage, topic: freeTopic }),
        topic: freeTopic,
        turns: LIVE_TURNS,
        onExchange: () => LIVE_TURNS - ++replies,
      };
      const emit = (event: LiveEvent) => sessions.get(id)?.send?.(event);
      const finish = () => {
        emit({ type: 'ended' });
        close(id);
      };

      const stream = await voice
        .stream(
          { apiKey, ...binding.prompt, silenceMs: LIVE_SILENCE_MS, onUsage: usageRecorder(db, student.id) },
          {
            onHeard: (text) => {
              const session = sessions.get(id);
              if (session) session.heard += text;
              emit({ type: 'heard', text });
            },
            onSaid: (text) => {
              const session = sessions.get(id);
              if (session) session.said += text;
              emit({ type: 'said', text });
            },
            onAudio: (pcm) => emit({ type: 'audio', data: pcm.toString('base64') }),
            onInterrupted: () => emit({ type: 'interrupted' }),
            onTurnComplete: () => {
              const session = sessions.get(id);
              if (!session) return;
              const exchange = { student: session.heard.trim(), teacher: session.said.trim() };
              session.heard = '';
              session.said = '';
              if (!session.opened) {
                session.opened = true;
                emit({ type: 'done', turnsLeft: binding.turns });
                return;
              }
              if (exchange.student === '') session.empty++;
              const turnsLeft = binding.onExchange(exchange);
              emit({ type: 'done', turnsLeft });
              // 一直聽不到學生說話內容(只有雜音,或文字稿出不來)時也要收尾,不能讓對話沒完沒了。
              if (turnsLeft <= 0 || session.empty > binding.turns) finish();
            },
            onFailure: (error) => {
              noteQuota(apiKey, error);
              emit({ type: 'error', code: error.code, message: error.message });
              close(id);
            },
          },
        )
        .catch((err: unknown) => {
          noteQuota(apiKey, err);
          throw err;
        });

      const timer = setTimeout(finish, LIVE_LIMIT_MS);
      sessions.set(id, { userId: student.id, apiKey, stream, binding, opened: false, heard: '', said: '', empty: 0, send: null, onEnd: null, timer });
      return { id, turns: binding.turns, topic: binding.topic, inputRate: LIVE_INPUT_RATE, outputRate: LIVE_OUTPUT_RATE };
    },

    /**
     * 瀏覽器接上串流,開始收老師的回應;接上之後才請老師開場,開場白才不會漏掉。
     * onEnd 在對話結束時呼叫一次(輪數用完、時間到、出錯,或被關掉)。
     */
    attach(id: string, send: (event: LiveEvent) => void, onEnd: () => void): void {
      const session = find(id);
      if (session.send) throw new HttpError(409, '這場對話已經在進行了。');
      session.send = send;
      session.onEnd = onEnd;
      session.stream.open();
    },

    /** 麥克風的一小段聲音。 */
    audio(id: string, pcm: Buffer): void {
      const session = find(id);
      if (pcm.length % 2 !== 0) throw new HttpError(400, '聲音的格式不正確。');
      session.stream.audio(pcm);
    },

    end(id: string): void {
      close(id);
    },

    /** 進行中的對話數(測試用)。 */
    count(): number {
      return sessions.size;
    },
  };
}

export type LiveSessions = ReturnType<typeof createLiveSessions>;
