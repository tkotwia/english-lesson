import { useState } from 'react';
import { useNavigate } from 'react-router';
import { STAGE_LABELS, type PublicUser } from '../../../shared/schema.ts';
import { api, errorMessage } from '../api.ts';
import { Avatar } from '../components/Avatar.tsx';
import { UserForm, type UserFormValues } from '../components/UserForm.tsx';
import { useUsers } from '../userContext.tsx';

export function UserSelect() {
  const { users, activeUser, loading, error, selectUser, refresh } = useUsers();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function choose(user: PublicUser) {
    selectUser(user.id);
    navigate('/');
  }

  async function create(values: UserFormValues) {
    const created = await api.createUser(values);
    await refresh();
    setAdding(false);
    selectUser(created.id);
    navigate('/');
  }

  async function remove(user: PublicUser) {
    const confirmed = window.confirm(`確定要刪除「${user.name}」嗎?\n\n這位使用者的所有上課紀錄、分數與複習項目都會一併刪除,無法復原。`);
    if (!confirmed) return;
    try {
      await api.deleteUser(user.id);
      if (activeUser?.id === user.id) selectUser(null);
      await refresh();
      setActionError(null);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  if (loading) return <p className="muted center">載入中…</p>;

  return (
    <section className="page">
      <h1>誰要上課?</h1>
      {error && <p className="alert alert-error">{error}</p>}
      {actionError && <p className="alert alert-error">{actionError}</p>}

      {users.length === 0 && !adding && <p className="muted">還沒有任何使用者,先新增一位吧。</p>}

      <div className="user-grid">
        {users.map((user) => (
          <div key={user.id} className={`user-card${activeUser?.id === user.id ? ' is-active' : ''}`}>
            <button type="button" className="user-card-main" onClick={() => choose(user)}>
              <Avatar user={user} size={64} />
              <strong>{user.name}</strong>
              <span className="muted">
                {STAGE_LABELS[user.stage]} · {user.level}
              </span>
            </button>
            <button type="button" className="link-danger" onClick={() => remove(user)}>
              刪除
            </button>
          </div>
        ))}
        {!adding && (
          <button type="button" className="user-card user-card-add" onClick={() => setAdding(true)}>
            <span className="plus">+</span>
            新增使用者
          </button>
        )}
      </div>

      {adding && (
        <div className="card narrow">
          <h2>新增使用者</h2>
          <UserForm submitLabel="建立" onSubmit={create} onCancel={() => setAdding(false)} />
        </div>
      )}
    </section>
  );
}
