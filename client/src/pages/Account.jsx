import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { errMsg } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Account() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const exportData = async () => {
    try {
      const r = await api.get('/auth/export', { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = Object.assign(document.createElement('a'), { href: url, download: `nutri-export-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { setError(errMsg(e)); }
  };

  const remove = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.post('/auth/delete', { password });
      logout(); navigate('/login', { replace: true });
    } catch (err) { setError(errMsg(err)); setBusy(false); }
  };

  return (
    <div>
      <div className="page-head"><h2>Account</h2></div>
      {error && <div className="error">{error}</div>}

      <section className="card">
        <h3>{user.name}</h3>
        <p className="muted small">{user.email}</p>
      </section>

      <section className="card">
        <h3>Your data</h3>
        <p className="muted small" style={{ margin: '.4rem 0 .9rem' }}>Download everything Nutri stores about you as a JSON file: logs, meals, goals, weigh-ins and synced WHOOP data.</p>
        <button className="btn secondary" onClick={exportData}>Export my data</button>
      </section>

      <section className="card">
        <h3>Legal</h3>
        <p className="muted small" style={{ margin: '.4rem 0 .9rem' }}>Disclaimer, privacy and food-data sources.</p>
        <Link className="btn secondary" to="/legal">Legal & privacy</Link>
      </section>

      <section className="card danger-zone">
        <h3>Delete account</h3>
        <p className="muted small" style={{ margin: '.4rem 0 .9rem' }}>
          Permanently deletes your account, food log, meals, goals, weigh-ins and WHOOP data, and revokes Nutri's WHOOP access. This can't be undone.
          Products you added to the shared food database stay, without your name.
        </p>
        {!confirming ? (
          <button className="btn danger-solid" onClick={() => setConfirming(true)}>Delete my account</button>
        ) : (
          <form onSubmit={remove} className="delete-form">
            <label>Your password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            <label>Type <b>DELETE</b> to confirm<input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" /></label>
            <div className="row">
              <button className="btn danger-solid" disabled={busy || typed !== 'DELETE' || !password}>{busy ? 'Deleting…' : 'Delete forever'}</button>
              <button type="button" className="btn secondary" onClick={() => { setConfirming(false); setTyped(''); setPassword(''); }}>Cancel</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
