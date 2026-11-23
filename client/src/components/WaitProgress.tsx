import { useEffect, useState } from 'react';
import { formatSeconds, waitPercent, waitRemaining } from '../../../shared/wait.ts';

interface Props {
  /** 預估總共要等幾秒(由過去實際花費的時間推估)。 */
  expectedSeconds: number;
}

/** 等 AI 回應時的進度條:百分比與預估剩餘時間。從顯示的那一刻開始計時。 */
export function WaitProgress({ expectedSeconds }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 250);
    return () => window.clearInterval(timer);
  }, []);

  const percent = waitPercent(elapsed, expectedSeconds);
  const remaining = waitRemaining(elapsed, expectedSeconds);

  return (
    <div className="wait-progress">
      <div className="wait-bar" role="progressbar" aria-label="預估進度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className="wait-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="wait-text">
        <strong>{percent}%</strong>
        {remaining > 0 ? <span>預估還要 {formatSeconds(remaining)}</span> : <span>比預估的久,請再等一下(已等待 {formatSeconds(elapsed)})</span>}
      </p>
      <p className="muted small">進度與剩餘時間是依過去實際花費的時間推估的,不是精確值。模型忙線時會自動改用備援,可能更久。</p>
    </div>
  );
}
