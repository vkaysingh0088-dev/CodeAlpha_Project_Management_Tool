import { Navigate, Route, Routes } from 'react-router-dom';
import { Providers, useAuth } from './context.jsx';
import Header from './components/Header.jsx';
import AuthPage from './pages/AuthPage.jsx';
import Projects from './pages/Projects.jsx';
import Board from './pages/Board.jsx';

function Protected({ children }) {
  const { user } = useAuth();
  if (user === undefined) return <p className="center-note">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <><Header />{children}</>;
}

export default function App() {
  return (
    <Providers>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/" element={<Protected><Projects /></Protected>} />
        <Route path="/projects/:id" element={<Protected><Board /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Providers>
  );
}
