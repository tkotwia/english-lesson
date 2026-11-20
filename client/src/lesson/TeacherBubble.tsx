import { useEffect, type ReactNode } from 'react';
import { requestAutoSpeak, speak, ttsSupported } from '../speech/tts.ts';
import { TEACHER_NAME } from './lines.ts';

interface Props {
  children: ReactNode;
  /** 要朗讀的文字。有提供時,泡泡出現會自動朗讀(可在課堂上方關閉),旁邊也有重聽的按鈕。 */
  speakText?: string;
  rate?: number;
}

export function TeacherBubble({ children, speakText, rate = 1 }: Props) {
  useEffect(() => {
    if (speakText) requestAutoSpeak(speakText, rate);
    // 只在泡泡第一次出現時朗讀一次。
  }, []);

  return (
    <div className="bubble-row">
      <span className="teacher-avatar" aria-hidden="true">
        E
      </span>
      <div className="bubble">
        <span className="bubble-name">
          {TEACHER_NAME}
          {speakText && ttsSupported() && (
            <button type="button" className="speak-button" onClick={() => speak(speakText, { rate })} aria-label="再聽一次" title="再聽一次">
              🔊
            </button>
          )}
        </span>
        <div className="bubble-body">{children}</div>
      </div>
    </div>
  );
}
