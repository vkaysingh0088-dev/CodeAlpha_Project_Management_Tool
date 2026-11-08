import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { closeSocket, getSocket } from './socket.js';

const AuthCtx = createContext(null);
const ToastCtx = createContext(() => {});
export const useAuth = () => useContext(AuthCtx);
export const useToast = () => useContext(ToastCtx);

export function Providers({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still checking
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, kind = 'info') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  useEffect(() => {
    api.get('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);

  // One socket per signed-in session.
  useEffect(() => {
    if (user) getSocket(); else closeSocket();
  }, [user]);

  const auth = {
    user,
    login: async (email, password) => setUser((await api.post('/auth/login', { email, password })).user),
    register: async (name, email, password) => setUser((await api.post('/auth/register', { name, email, password })).user),
    logout: async () => { await api.post('/auth/logout'); setUser(null); },
  };

  return (
    <AuthCtx.Provider value={auth}>
      <ToastCtx.Provider value={toast}>
        {children}
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>)}
        </div>
      </ToastCtx.Provider>
    </AuthCtx.Provider>
  );
}
