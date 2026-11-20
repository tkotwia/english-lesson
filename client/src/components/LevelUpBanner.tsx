import { useState } from 'react';
import { LEVEL_UP_THRESHOLD, type LevelUpSuggestion } from '../../../shared/levelup.ts';
import { api, errorMessage } from '../api.ts';
import { useActiveUser, useUsers } from '../userContext.tsx';

interface Props {
  suggestion: LevelUpSuggestion;
  /** 使用者回應(升級或先不要)之後呼叫,讓頁面重新載入進度。 */
  onDecided: () => void;
}

/** 上個月的月分數達標時出現的升級建議。 */
export function LevelUpBanner({ suggestion, onDecided }: Props) {
  const user = useActiveUser();
  const { refresh } = useUsers();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'accepted' | 'declined') {
    setBusy(true);
    setError(null);
    try {
      await api.decideLevel(user.id, suggestion.month, decision);
      await refresh();
      onDecided();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="levelup">
      <div>
        <strong>可以升級了!</strong>
        <p>
          {suggestion.month} 的月平均是 {suggestion.average} 分,達到 {LEVEL_UP_THRESHOLD} 分的標準。建議從 {suggestion.from} 升到 {suggestion.to}。
        </p>
        {error && <p className="alert alert-error">{error}</p>}
      </div>
      <div className="form-actions">
        <button type="button" className="button button-primary" onClick={() => decide('accepted')} disabled={busy}>
          升級到 {suggestion.to}
        </button>
        <button type="button" className="button" onClick={() => decide('declined')} disabled={busy}>
          先不要
        </button>
      </div>
    </div>
  );
}
