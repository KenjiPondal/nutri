import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api, { errMsg } from '../services/api';
import { MEDICAL_DISCLAIMER } from './Legal';

export function AuthForm({ mode }) {
  const isLogin = mode === 'login';
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [accept, setAccept] = useState(false);
  const [inviteOnly, setInviteOnly] = useState(false);
  const [error, setError] = useState(params.get('error') ? 'Google sign-in failed' : '');
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);

  useEffect(() => { api.get('/auth/providers').then(r => { setGoogle(r.data.google); setInviteOnly(r.data.inviteOnly); }).catch(() => {}); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (isLogin) await login(form.email, form.password);
      else await register(form.name, form.email, form.password, accept);
      navigate('/');
    } catch (err) { setError(errMsg(err)); }
    finally { setBusy(false); }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h1>nutri<span className="alpha">alpha</span></h1>
        <p className="tagline">Eat for how your body is actually doing.</p>
        <h2>{isLogin ? 'Sign in' : 'Create account'}</h2>
        {error && <div className="error">{error}</div>}
        {google && (
          <>
            <a className="btn google" href="/api/auth/google">Continue with Google</a>
            <div className="divider">or</div>
          </>
        )}
        {!isLogin && <input placeholder="Name" value={form.name} onChange={set('name')} required />}
        <input type="email" placeholder="Email" value={form.email} onChange={set('email')} required autoComplete="email" />
        <input type="password" placeholder={isLogin ? "Password" : "Password (min 8 characters)"} value={form.password} onChange={set('password')}
          required minLength={isLogin ? undefined : 8} autoComplete={isLogin ? 'current-password' : 'new-password'} />
        {!isLogin && (
          <label className="check terms">
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} required />
            <span>I understand Nutri gives general guidance, <b>not medical advice</b>, and I agree to the <Link to="/legal" target="_blank">privacy policy & disclaimer</Link>.</span>
          </label>
        )}
        <button className="btn" disabled={busy || (!isLogin && !accept)}>{busy ? '...' : isLogin ? 'Sign in' : 'Create account'}</button>
        {!isLogin && inviteOnly && <p className="dim small">Nutri is invite-only right now. Use the email you were invited with.</p>}
        <p className="muted">
          {isLogin ? <>Invited? <Link to="/register">Create your account</Link></> : <>Have an account? <Link to="/login">Sign in</Link></>}
        </p>
        <p className="auth-legal dim">{MEDICAL_DISCLAIMER.split('. ')[0]}. <Link to="/legal">Legal & privacy</Link></p>
      </form>
    </div>
  );
}

export default function Login() { return <AuthForm mode="login" />; }
