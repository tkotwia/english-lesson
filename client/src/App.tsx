import { Navigate, Outlet, Route, Routes } from 'react-router';
import { Layout } from './components/Layout.tsx';
import { Calendar } from './pages/Calendar.tsx';
import { Home } from './pages/Home.tsx';
import { Lesson } from './pages/Lesson.tsx';
import { Placement } from './pages/Placement.tsx';
import { Review } from './pages/Review.tsx';
import { ReviewPractice } from './pages/ReviewPractice.tsx';
import { SessionSummary } from './pages/SessionSummary.tsx';
import { Settings } from './pages/Settings.tsx';
import { UserSelect } from './pages/UserSelect.tsx';
import { Words } from './pages/Words.tsx';
import { useUsers } from './userContext.tsx';

function RequireUser() {
  const { activeUser, loading, error } = useUsers();
  if (loading) return <p className="muted center">載入中…</p>;
  if (error) return <p className="alert alert-error">{error}</p>;
  if (!activeUser) return <Navigate to="/users" replace />;
  return <Outlet />;
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/users" element={<UserSelect />} />
        <Route element={<RequireUser />}>
          <Route path="/" element={<Home />} />
          <Route path="/lesson" element={<Lesson />} />
          <Route path="/sessions/:id" element={<SessionSummary />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/review" element={<Review />} />
          <Route path="/review/practice" element={<ReviewPractice />} />
          <Route path="/words" element={<Words />} />
          <Route path="/placement" element={<Placement />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
