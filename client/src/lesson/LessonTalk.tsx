import { useState } from 'react';
import type { ChatTurn, SessionView } from '../../../shared/schema.ts';
import { api } from '../api.ts';
import { Conversation, conversationFinished } from './Conversation.tsx';
import { LiveTalk, liveTalkSupported } from './LiveTalk.tsx';

interface Props {
  session: SessionView;
  chat: ChatTurn[];
  /** 打字對話時送出學生說的一句話。 */
  onSend: (message: string) => Promise<void>;
  /** AI 對話服務無法使用時,跳過對話(這部分不計分)。 */
  onSkip: () => void;
  /** 對話紀錄由伺服器寫入;語音對話每進行一輪,就請外層重新讀一次。 */
  onRefresh: () => void;
}

/**
 * 課程裡的情境對話。預設用即時語音:學生直接說,老師用聲音回答,文字稿由伺服器記進這堂課的對話紀錄。
 * 沒有麥克風、語音對話連不上或被額度擋下,或學生想用打字的,就改用原本一來一往的打字對話;兩種方式共用同一份紀錄與輪數。
 */
export function LessonTalk({ session, chat, onSend, onSkip, onRefresh }: Props) {
  const [typed, setTyped] = useState(() => !liveTalkSupported());
  const [notice, setNotice] = useState<string | null>(null);
  /** 語音對話正在進行(包含老師最後一句還沒播完)。這期間不切換畫面,否則老師的話會被切斷。 */
  const [talking, setTalking] = useState(false);
  const finished = conversationFinished(session, chat);
  const resumed = chat.some((turn) => turn.role === 'student');

  if (typed || (finished && !talking)) {
    return (
      <>
        {notice && !finished && <p className="alert alert-warn">{notice}</p>}
        <Conversation session={session} chat={chat} onSend={onSend} onSkip={onSkip} />
      </>
    );
  }

  return (
    <LiveTalk
      start={() => api.startLessonLive(session.id)}
      history={resumed ? chat.map(({ role, text }) => ({ role, text })) : []}
      startLabel={resumed ? '繼續對話' : '開始對話'}
      onStarted={() => setTalking(true)}
      onTurn={onRefresh}
      onEnded={() => {
        setTalking(false);
        onRefresh();
      }}
      onFailed={(message) => {
        setTalking(false);
        setNotice(`語音對話現在不能用(${message}),先改用打字的方式${resumed ? '繼續' : '進行'}。`);
        setTyped(true);
        onRefresh();
      }}
      extra={
        <button type="button" className="button button-ghost" onClick={() => setTyped(true)}>
          改用打字對話
        </button>
      }
    />
  );
}
