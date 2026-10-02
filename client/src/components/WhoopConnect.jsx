import { useEffect, useState } from 'react';
import { connectWhoop, disconnectWhoop, getWhoopStatus, syncWhoop } from '../services/whoop';
import { errMsg } from '../services/api';

const ago = (d) => {
  if (!d) return 'never';
  const m = Math.round((Date.now() - new Date(d)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

/** Minimal Whoop connection panel. Calls onChange() after connect/sync/disconnect. */
export default function WhoopConnect({ onChange }) {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = () => getWhoopStatus().then(setS).catch(e => setError(errMsg(e)));
  useEffect(() => { load(); }, []);

  const run = async (label, fn) => {
    setBusy(label); setError('');
    try { await fn(); await load(); onChange?.(); }
    catch (e) { setError(errMsg(e)); }
    finally { setBusy(''); }
  };

  if (!s) return null;

  return (
    <section className="whoop-connect">
      <div className="wc-row">
        <div>
          <span className={`dot ${s.connected ? (s.status === 'active' ? 'on' : 'warn') : ''}`} />
          <span className="label">
            {!s.connected ? 'Whoop · simulated data' : s.status === 'active' ? `Whoop · synced ${ago(s.lastSyncAt)}` : 'Whoop · reconnect needed'}
          </span>
        </div>
        <div className="row-inline">
          {!s.connected && (
            <button className="btn small" disabled={!s.configured || !!busy} onClick={() => run('connect', connectWhoop)}
              title={s.configured ? '' : 'Server is missing WHOOP_CLIENT_ID / SECRET'}>
              {busy === 'connect' ? '...' : 'Connect'}
            </button>
          )}
          {s.connected && s.status !== 'active' && (
            <button className="btn small" disabled={!!busy} onClick={() => run('connect', connectWhoop)}>Reconnect</button>
          )}
          {s.connected && s.status === 'active' && (
            <button className="link" disabled={!!busy} onClick={() => run('sync', () => syncWhoop(30))}>{busy === 'sync' ? 'Syncing...' : 'Sync'}</button>
          )}
          {s.connected && (
            <button className="link" disabled={!!busy} onClick={() => {
              if (confirm('Disconnect Whoop? Synced history stays unless you choose to delete it next.'))
                run('disc', () => disconnectWhoop(confirm('Also delete synced Whoop data from Nutri?')));
            }}>Disconnect</button>
          )}
        </div>
      </div>
      {!s.configured && !s.connected && <p className="muted small">Add your Whoop app credentials to <code>server/.env</code> to enable.</p>}
      {(error || s.lastSyncError) && <p className="small" style={{ color: 'var(--rec-red)' }}>{error || s.lastSyncError}</p>}
    </section>
  );
}
