import { useEffect } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { STAGE_LABELS } from '../../../shared/schema.ts';
import { useUsers } from '../userContext.tsx';
import { Avatar } from './Avatar.tsx';

export function Layout() {
  const { activeUser } = useUsers();

  // 國小學生用較大的字與按鈕。設定在根元素上,整個畫面一起放大。
  useEffect(() => {
    document.documentElement.dataset.stage = activeUser?.stage ?? '';
  }, [activeUser?.stage]);

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          英文課
        </Link>
        {activeUser && (
          <nav className="nav">
            <NavLink to="/" end>
              首頁
            </NavLink>
            <NavLink to="/lesson">上課</NavLink>
            <NavLink to="/calendar">日曆</NavLink>
            <NavLink to="/review">回顧</NavLink>
            <NavLink to="/settings">設定</NavLink>
          </nav>
        )}
        <div className="topbar-right">
          {activeUser && (
            <span className="user-chip">
              <Avatar user={activeUser} size={32} />
              <span>
                {activeUser.name}
                <small>
                  {STAGE_LABELS[activeUser.stage]} · {activeUser.level}
                </small>
              </span>
            </span>
          )}
          <Link to="/users" className="button button-ghost">
            {activeUser ? '切換使用者' : '選擇使用者'}
          </Link>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
