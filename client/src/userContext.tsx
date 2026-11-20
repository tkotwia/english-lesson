import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PublicUser } from '../../shared/schema.ts';
import { api, errorMessage } from './api.ts';

const STORAGE_KEY = 'activeUserId';

interface UserContextValue {
  users: PublicUser[];
  activeUser: PublicUser | null;
  loading: boolean;
  error: string | null;
  selectUser: (id: number | null) => void;
  refresh: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);

function readStoredId(): number | null {
  const stored = Number(localStorage.getItem(STORAGE_KEY));
  return Number.isInteger(stored) && stored > 0 ? stored : null;
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [activeId, setActiveId] = useState<number | null>(readStoredId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setUsers(await api.listUsers());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectUser = useCallback((id: number | null) => {
    setActiveId(id);
    if (id === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(id));
  }, []);

  const value = useMemo<UserContextValue>(
    () => ({
      users,
      activeUser: users.find((user) => user.id === activeId) ?? null,
      loading,
      error,
      selectUser,
      refresh,
    }),
    [users, activeId, loading, error, selectUser, refresh],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUsers(): UserContextValue {
  const value = useContext(UserContext);
  if (!value) throw new Error('useUsers 必須在 UserProvider 內使用');
  return value;
}

/** 給需要登入使用者的頁面使用;這些頁面由 RequireUser 保證 activeUser 存在。 */
export function useActiveUser(): PublicUser {
  const { activeUser } = useUsers();
  if (!activeUser) throw new Error('這個頁面需要先選擇使用者');
  return activeUser;
}
