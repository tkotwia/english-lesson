import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { KeyTestResult, SettingsStatus } from '../../../shared/schema.ts';
import { api, errorMessage } from '../api.ts';
import { UserForm, type UserFormValues } from '../components/UserForm.tsx';
import { useActiveUser, useUsers } from '../userContext.tsx';

export function Settings() {
  const user = useActiveUser();
  const { refresh } = useUsers();
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api.getStatus(user.id));
      setStatusError(null);
    } catch (err) {
      setStatusError(errorMessage(err));
    }
  }, [user.id]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  return (
    <section className="page">
      <h1>設定</h1>
      <ProfileCard key={`profile-${user.id}`} onSaved={refresh} />
      <ApiKeyCard key={`key-${user.id}`} onChanged={refresh} onTested={loadStatus} />
      <UsageCard status={status} error={statusError} />
    </section>
  );
}

function ProfileCard({ onSaved }: { onSaved: () => Promise<void> }) {
  const user = useActiveUser();
  const [saved, setSaved] = useState(false);

  async function save(values: UserFormValues) {
    setSaved(false);
    await api.updateUser(user.id, values);
    await onSaved();
    setSaved(true);
  }

  return (
    <div className="card">
      <h2>基本資料</h2>
      <UserForm initial={{ name: user.name, stage: user.stage, level: user.level }} submitLabel="儲存" onSubmit={save} />
      {saved && <p className="alert alert-ok">已儲存。</p>}
    </div>
  );
}

function ApiKeyCard({ onChanged, onTested }: { onChanged: () => Promise<void>; onTested: () => Promise<void> }) {
  const user = useActiveUser();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<KeyTestResult | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    void run(async () => {
      await api.setApiKey(user.id, draft.trim());
      setDraft('');
      setTest(null);
      await onChanged();
    });
  }

  function clear() {
    if (!window.confirm('確定要清除這把 API key 嗎?清除後無法上新課,直到重新貼上。')) return;
    void run(async () => {
      await api.setApiKey(user.id, '');
      setTest(null);
      await onChanged();
    });
  }

  function runTest() {
    void run(async () => {
      setTest(null);
      setTest(await api.testApiKey(user.id));
      await onTested();
    });
  }

  return (
    <div className="card">
      <h2>Google API key</h2>
      <p>
        目前狀態:
        {user.hasApiKey ? (
          <strong className="text-ok"> 已設定(末四碼 {user.apiKeyLast4})</strong>
        ) : (
          <strong className="text-warn"> 尚未設定</strong>
        )}
      </p>

      <form className="form" onSubmit={save}>
        <label>
          {user.hasApiKey ? '換一把新的 key' : '貼上 API key'}
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="AIza…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="form-actions">
          <button type="submit" className="button button-primary" disabled={busy || !draft.trim()}>
            儲存
          </button>
          <button type="button" className="button" onClick={runTest} disabled={busy || !user.hasApiKey}>
            {busy ? '處理中…' : '測試連線'}
          </button>
          {user.hasApiKey && (
            <button type="button" className="button button-ghost" onClick={clear} disabled={busy}>
              清除
            </button>
          )}
        </div>
      </form>

      {error && <p className="alert alert-error">{error}</p>}
      {test?.ok && <p className="alert alert-ok">連線成功,使用模型 {test.model} 測試通過。</p>}
      {test && !test.ok && (
        <div className="alert alert-error">
          {test.message}
          {test.detail && <pre className="detail">{test.detail}</pre>}
        </div>
      )}

      <ul className="notes">
        <li>
          到{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            Google AI Studio
          </a>{' '}
          建立 key。key 必須由成年人的 Google 帳號建立。
        </li>
        <li>key 只存在這台電腦的資料庫裡,儲存後畫面只會顯示末四碼。測試連線會用掉 1 次對話類額度。</li>
        <li>免費額度以 Google 專案計算。多位使用者的 key 若來自同一個專案,額度是共用的。</li>
        <li>使用免費額度時,送出的內容可能被 Google 用來改進產品並由人工審閱,作答時請不要輸入姓名、地址等個人資料。</li>
      </ul>
    </div>
  );
}

const TIER_LABELS = { quality: '品質類(產生課程、批改)', chat: '對話類(情境對話、問老師)' } as const;

function UsageCard({ status, error }: { status: SettingsStatus | null; error: string | null }) {
  return (
    <div className="card">
      <h2>AI 模型與用量</h2>
      {error && <p className="alert alert-error">{error}</p>}
      {status && (
        <>
          <table className="table">
            <tbody>
              <tr>
                <th>供應商</th>
                <td>{status.provider === 'mock' ? '假資料模式(不連網、不耗額度)' : status.provider}</td>
              </tr>
              {(['quality', 'chat'] as const).map((tier) => (
                <tr key={tier}>
                  <th>{TIER_LABELS[tier]}</th>
                  <td>{status.models[tier].join(' → ')}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>本次額度週期的用量</h3>
          <p className="muted">
            週期日期 {status.quotaDate}(太平洋時間)。每日額度在台灣時間下午 3–4 點重置;實際上限請到 AI Studio 查看。
          </p>
          {status.usage.length === 0 ? (
            <p className="muted">這個週期還沒有呼叫過 AI。</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>模型</th>
                  <th className="num">呼叫次數</th>
                  <th className="num">輸入 token</th>
                  <th className="num">輸出 token</th>
                  <th className="num">平均每次</th>
                </tr>
              </thead>
              <tbody>
                {status.usage.map((row) => (
                  <tr key={row.model}>
                    <td>{row.model}</td>
                    <td className="num">{row.calls}</td>
                    <td className="num">{row.inputTokens.toLocaleString()}</td>
                    <td className="num">{row.outputTokens.toLocaleString()}</td>
                    <td className="num">{row.totalMs > 0 ? `${(row.totalMs / row.calls / 1000).toFixed(1)} 秒` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
