import { useState, type FormEvent } from 'react';
import { DEFAULT_LEVEL_BY_STAGE, LEVELS, STAGES, STAGE_LABELS, type Level, type Stage } from '../../../shared/schema.ts';
import { errorMessage } from '../api.ts';

export interface UserFormValues {
  name: string;
  stage: Stage;
  level: Level;
}

interface Props {
  initial?: UserFormValues;
  submitLabel: string;
  onSubmit: (values: UserFormValues) => Promise<void>;
  onCancel?: () => void;
}

const LEVEL_HINTS: Record<Level, string> = {
  A1: '入門',
  A2: '基礎',
  B1: '中級',
  B2: '中高級',
  C1: '高級',
  C2: '精通',
};

export function UserForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [stage, setStage] = useState<Stage>(initial?.stage ?? 'junior');
  const [level, setLevel] = useState<Level>(initial?.level ?? DEFAULT_LEVEL_BY_STAGE.junior);
  // 新增時,等級跟著學習階段的預設值走;一旦手動選過等級就不再自動改。
  const [levelTouched, setLevelTouched] = useState(Boolean(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeStage(next: Stage) {
    setStage(next);
    if (!levelTouched) setLevel(DEFAULT_LEVEL_BY_STAGE[next]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('請輸入名稱');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), stage, level });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        名稱
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="例如:小明" autoFocus />
      </label>
      <label>
        學習階段
        <select value={stage} onChange={(e) => changeStage(e.target.value as Stage)}>
          {STAGES.map((value) => (
            <option key={value} value={value}>
              {STAGE_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        CEFR 等級
        <select
          value={level}
          onChange={(e) => {
            setLevel(e.target.value as Level);
            setLevelTouched(true);
          }}
        >
          {LEVELS.map((value) => (
            <option key={value} value={value}>
              {value}({LEVEL_HINTS[value]})
            </option>
          ))}
        </select>
        <small className="muted">學習階段決定課程主題與語氣,CEFR 等級決定英文難度。</small>
      </label>
      {error && <p className="alert alert-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button button-primary" disabled={saving}>
          {saving ? '儲存中…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="button button-ghost" onClick={onCancel} disabled={saving}>
            取消
          </button>
        )}
      </div>
    </form>
  );
}
