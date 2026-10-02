import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chart as ChartJS, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import api, { errMsg, today } from '../services/api';
import { getWhoopDays } from '../services/whoop';
import { getFuelDay, getFuelHistory, fuelColor, gradeColor, fuelVerdict, COMPONENT_LABELS } from '../services/fuel';
import { useAuth } from '../context/AuthContext';
import Ring from '../components/Ring';
import WhoopConnect from '../components/WhoopConnect';
import { listObjectives, getWeekly } from '../services/objectives';
import { ObjectiveRow } from './Goals';

ChartJS.register(BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip);
ChartJS.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const RANGE = 14;
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const resolve = (c) => c.replace(/var\((.+)\)/, (_, v) => css(v));
const fmt = (n) => (n == null ? '–' : Math.round(n).toLocaleString());
const shiftKey = (key, n) => { const d = new Date(`${key}T12:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
const dayLabel = (key) => {
  if (key === today()) return 'Today';
  if (key === shiftKey(today(), -1)) return 'Yesterday';
  return new Date(key + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
};
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const sleepFmt = (h) => (h == null ? '–' : `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}`);

function Bar1({ label, value, goal, unit = 'g', color = 'var(--text)' }) {
  const pct = Math.min(100, (value / (goal || 1)) * 100);
  return (
    <div className="macro">
      <div className="macro-top"><span>{label}</span><span><b>{fmt(value)}</b><span className="muted"> / {fmt(goal)}{unit}</span></span></div>
      <div className="track"><div style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const prefs = user.preferences || {};
  const [key, setKey] = useState(today());
  const [fuel, setFuel] = useState(null);
  const [history, setHistory] = useState([]);
  const [whoop, setWhoop] = useState({ days: {}, source: null });
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [objs, setObjs] = useState(null);
  const [weekly, setWeekly] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadWhoop = () => getWhoopDays(RANGE).then(setWhoop).catch(e => setError(errMsg(e)));
  const loadFuel = () => getFuelDay(key).then(setFuel).catch(e => setError(errMsg(e)));

  useEffect(() => {
    loadWhoop();
    getFuelHistory(7).then(setHistory).catch(() => {});
    listObjectives().then(setObjs).catch(() => {});
    getWeekly().then(setWeekly).catch(() => {});
    const q = new URLSearchParams(window.location.search).get('whoop');
    if (q) {
      setNotice({ connected: 'Whoop connected. Your data is synced.', denied: 'Whoop access was not granted.',
        invalid_state: 'Whoop connection expired, try again.', error: 'Could not connect Whoop.' }[q] || '');
      window.history.replaceState(null, '', '/');
    }
  }, []);
  useEffect(() => { setFuel(null); loadFuel(); }, [key]);

  const w = whoop.days[key] || {};
  const t = fuel?.totals || {};
  const target = fuel?.target;
  const oldest = shiftKey(today(), -(RANGE - 1));

  const chart = useMemo(() => ({
    labels: history.map(h => new Date(h.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'narrow' })),
    datasets: [
      { type: 'bar', label: 'Fuel', data: history.map(h => h.score), backgroundColor: history.map(h => resolve(fuelColor(h.score))),
        borderRadius: 6, barPercentage: 0.5, order: 2 },
      { type: 'line', label: 'Recovery', data: history.map(h => whoop.days[h.date]?.recovery ?? null), borderColor: resolve('var(--muted)'),
        borderWidth: 1.5, borderDash: [4, 4], pointRadius: 2.5, pointBackgroundColor: resolve('var(--muted)'), tension: 0.35, order: 1 }
    ]
  }), [history, whoop]);

  const basisText = !target ? '' : target.basis === 'goal' ? 'from your calorie goal'
    : `Whoop ${target.basis === 'whoop_day' ? 'burn' : '7-day avg'} ${fmt(target.base)}${target.adjust ? ` ${target.adjust > 0 ? '+' : '−'} ${fmt(Math.abs(target.adjust))} goal` : target.factor !== 1 ? ` · ${target.goal}` : ''}`;

  return (
    <div className="today">
      {error && <div className="error">{error}</div>}
      {notice && <div className="info" onClick={() => setNotice('')}>{notice}</div>}

      <header className="today-head">
        <p className="muted">{greeting()}, {user.name.split(' ')[0]}</p>
        <div className="daynav">
          <button onClick={() => setKey(k => shiftKey(k, -1))} disabled={key <= oldest} aria-label="Previous day">‹</button>
          <h1>{dayLabel(key)}</h1>
          <button onClick={() => setKey(k => shiftKey(k, 1))} disabled={key >= today()} aria-label="Next day">›</button>
        </div>
      </header>

      {/* Hero: Fuel Score */}
      <section className="hero">
        <Ring value={fuel?.score} color={fuelColor(fuel?.score)} size={212} stroke={12}>
          <div className="hero-score" style={{ color: fuel?.score == null ? 'var(--dim)' : 'var(--text)' }}>{fuel?.score ?? '–'}</div>
          <div className="hero-cap">Fuel score</div>
        </Ring>
        <p className="verdict">{fuel ? fuelVerdict(fuel.score, fuel.inProgress) : ' '}</p>
        {fuel?.score != null && (
          <button className="link" onClick={() => setShowBreakdown(s => !s)}>{showBreakdown ? 'Hide breakdown' : 'See breakdown'}</button>
        )}
        {showBreakdown && fuel?.components && (
          <div className="breakdown">
            {fuel.components.map(c => (
              <div key={c.key} className="bd-row">
                <span>{COMPONENT_LABELS[c.key]}</span>
                <div className="track thin"><div style={{ width: `${(c.points / c.max) * 100}%`, background: fuelColor((c.points / c.max) * 100) }} /></div>
                <span className="bd-pts">{Math.round(c.points)}<span className="dim">/{c.max}</span></span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Coach */}
      {fuel?.insights?.length > 0 && (
        <section className="card coach">
          <h3>Coach</h3>
          <ul>
            {fuel.insights.map((i, n) => (
              <li key={n} className={`insight ${i.kind}`}>
                <p className="insight-title">{i.title}</p>
                <p className="insight-body">{i.body}</p>
              </li>
            ))}
          </ul>
          {fuel.inProgress && <Link className="btn small" to="/nutrition">Log food</Link>}
        </section>
      )}

      {/* Goals */}
      {objs && (
        <section className="card">
          <div className="card-head"><h3>Goals</h3><Link className="link" to="/goals">{objs.length ? 'Manage' : ''}</Link></div>
          {objs.length ? (
            <div className="obj-list compact">{objs.map(o => <ObjectiveRow key={o._id} o={o} compact />)}</div>
          ) : (
            <div className="goal-cta">
              <p className="muted small">Set a goal (weight, protein, plants, recovery…) and your coaching will follow it.</p>
              <Link className="btn small" to="/goals">Set a goal</Link>
            </div>
          )}
        </section>
      )}

      {/* Weekly review */}
      {weekly && (weekly.thisWeek.logged > 0 || weekly.lastWeek.logged > 0) && (
        <section className="card coach">
          <div className="card-head"><h3>This week</h3><span className="dim small">vs last week</span></div>
          <div className="week-stats">
            <div><span className="num">{weekly.thisWeek.avgScore ?? '–'}</span><span className="muted small">avg Fuel{weekly.lastWeek.avgScore != null && <> · was {weekly.lastWeek.avgScore}</>}</span></div>
            <div><span className="num">{weekly.thisWeek.avgRecovery != null ? `${weekly.thisWeek.avgRecovery}%` : '–'}</span><span className="muted small">avg recovery{weekly.lastWeek.avgRecovery != null && <> · was {weekly.lastWeek.avgRecovery}%</>}</span></div>
          </div>
          {weekly.insights.length > 0 && (
            <ul>
              {weekly.insights.map((i, n) => (
                <li key={n} className={`insight ${i.kind}`}><p className="insight-title">{i.title}</p><p className="insight-body">{i.body}</p></li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Body (Whoop) */}
      <section className="card body-card">
        <div className="card-head">
          <h3>Body</h3>
          <span className="dim small">{whoop.source === 'mock' ? 'simulated' : 'from Whoop'}</span>
        </div>
        <div className="body-rings">
          <Ring value={w.recovery} color={gradeColor(w.recovery)} size={84} stroke={6} label="Recovery">
            <span className="mini-val">{w.recovery != null ? `${w.recovery}%` : '–'}</span>
          </Ring>
          <Ring value={w.strain} max={21} color="var(--strain)" size={84} stroke={6} label="Strain">
            <span className="mini-val">{w.strain != null ? w.strain.toFixed(1) : '–'}</span>
          </Ring>
          <Ring value={w.sleepPerf} color="var(--sleep)" size={84} stroke={6} label="Sleep">
            <span className="mini-val">{sleepFmt(w.sleepHours)}</span>
          </Ring>
        </div>
        <div className="body-stats">
          <span>HRV <b>{fmt(w.hrv)}</b> ms</span><span>RHR <b>{fmt(w.rhr)}</b></span><span>Burned <b>{fmt(w.burned)}</b> kcal</span>
        </div>
      </section>

      {/* Energy & macros */}
      <section className="card">
        <div className="card-head">
          <h3>Intake</h3>
          <Link className="link" to="/goals">Targets</Link>
        </div>
        <>
            <div className="intake">
              <div><span className="num">{fmt(t.kcal || 0)}</span><span className="muted"> / {fmt(target?.kcal)} kcal</span></div>
              <span className="dim small">{basisText}</span>
            </div>
            <div className="track"><div style={{ width: `${Math.min(100, ((t.kcal || 0) / (target?.kcal || 1)) * 100)}%`, background: 'var(--accent)' }} /></div>
            <Bar1 label="Protein" value={t.protein || 0} goal={prefs.proteinGoal} color="var(--text)" />
            <Bar1 label="Carbs" value={t.carbs || 0} goal={prefs.carbGoal} color="var(--muted)" />
            <Bar1 label="Fat" value={t.fat || 0} goal={prefs.fatGoal} color="var(--muted)" />
          </>
      </section>

      {/* Trend */}
      <section className="card">
        <div className="card-head">
          <h3>Fuel & recovery</h3>
          <span className="dim small">7 days</span>
        </div>
        <div className="chart">
          <Bar data={chart} options={{
            maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false }, tooltip: { backgroundColor: '#25221d', borderColor: '#36312a', borderWidth: 1, padding: 10} },
            scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: '#6b645b' } },
              y: { min: 0, max: 100, border: { display: false }, grid: { color: 'rgba(242,236,226,.05)' }, ticks: { maxTicksLimit: 3, color: '#6b645b' } } }
          }} />
        </div>
        <p className="dim small">Bars: Fuel score · Dashed: Whoop recovery</p>
      </section>

      <WhoopConnect onChange={() => { loadWhoop(); loadFuel(); }} />
    </div>
  );
}
