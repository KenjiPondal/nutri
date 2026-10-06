import { useEffect, useState } from 'react';
import api, { errMsg } from '../services/api';

/** Admin-only (alpha): what testers typed, what Nutri understood, and what they logged. */
export default function MealLogs() {
  const [logs, setLogs] = useState(null);
  const [issues, setIssues] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setLogs(null);
    api.get('/admin/parse-logs', { params: { days: 14, onlyIssues: issues ? 1 : 0 } }).then(r => setLogs(r.data)).catch(e => setError(errMsg(e)));
  }, [issues]);
  const t = (d) => new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <div>
      <div className="page-head"><h2>Meal descriptions</h2>
        <label className="check"><input type="checkbox" checked={issues} onChange={(e) => setIssues(e.target.checked)} /> Only problems</label></div>
      <p className="dim small" style={{ marginBottom: '.8rem' }}>Last 14 days, all testers. Kept 30 days. “Changed” = the person fixed the result before logging.</p>
      {error && <div className="error">{error}</div>}
      {logs && !logs.length && <p className="muted">Nothing yet.</p>}
      {logs?.map(l => (
        <section key={l._id} className="card plog">
          <div className="plog-head">
            <span className="dim small">{t(l.createdAt)} · {l.user?.name || l.user?.email} · {l.engine}{l.ms ? ` · ${l.ms} ms` : ''}</span>
            <span className={`obj-status ${!l.outcome?.logged ? 'dim' : l.outcome.changed ? 'fair' : 'good'}`}>{!l.outcome?.logged ? 'Not logged' : l.outcome.changed ? 'Changed' : 'OK'}</span>
          </div>
          <p className="plog-text">“{l.text}”</p>
          {l.aiError && <p className="small" style={{ color: 'var(--poor)' }}>AI error: {l.aiError}</p>}
          <div className="plog-cols">
            <div><p className="dim small">Understood</p>{l.parsed.map((p, i) => <p key={i} className="small">{p.food}{p.brand ? ` (${p.brand})` : ''} → <b>{p.productName || 'nothing'}</b> {p.grams != null && `${Math.round(p.grams)} g`}</p>)}</div>
            {l.outcome?.logged && <div><p className="dim small">Logged</p>{l.outcome.items.map((p, i) => <p key={i} className="small"><b>{p.productName}</b> {Math.round(p.grams)} g</p>)}</div>}
          </div>
        </section>
      ))}
    </div>
  );
}
