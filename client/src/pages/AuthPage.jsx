import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context.jsx';

export default function AuthPage() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <main className="auth">
      <section className="auth-pitch">
        <div className="brand big"><span className="brand-mark" aria-hidden /> Plank</div>
        <h1>Put the work on the board. Keep the talk on the card.</h1>
        <p>Shared projects, assigned tasks and comment threads that live next to the work they're about.</p>
        <div className="mini-board" aria-hidden>
          <div><i style={{ width: '70%' }} /><i style={{ width: '45%' }} /></div>
          <div><i style={{ width: '55%' }} className="hot" /><i style={{ width: '65%' }} /></div>
          <div><i style={{ width: '40%' }} /></div>
        </div>
      </section>
      <form className="auth-card" onSubmit={submit}>
        <h2>{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>
        {mode === 'register' && (
          <label>Name<input value={form.name} onChange={set('name')} autoComplete="name" required /></label>
        )}
        <label>Email<input type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></label>
        <label>Password<input type="password" value={form.password} onChange={set('password')} minLength={mode === 'register' ? 8 : undefined}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
          {mode === 'register' && <small className="muted">At least 8 characters</small>}
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </main>
  );
}
