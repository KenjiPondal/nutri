import { useEffect, useState } from 'react';
import { Chart as ChartJS, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import api, { errMsg, today } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { listObjectives, createObjective, removeObjective, listWeighIns, addWeighIn, OBJECTIVES } from '../services/objectives';
import { Sheet } from './Meals';

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler);

const STATUS = { on_track: ['On track', 'good'], behind: ['Behind', 'fair'], done: ['Reached', 'good'], needs_data: ['Needs data', 'dim'] };
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };

export function ObjectiveRow({ o, compact }) {
  const [label, tone] = STATUS[o.status] || ['', 'dim'];
  return (
    <div className="obj-row">
      <div className="obj-top">
        <span className="obj-title">{o.title}</span>
        <span className={`obj-status ${tone}`}>{label}</span>
      </div>
      <div className="obj-values"><b>{o.valueText}</b><span className="muted"> · goal {o.targetText}</span>
        {o.trend === 'better' && <span className="trend up"> ↑</span>}{o.trend === 'worse' && <span className="trend down"> ↓</span>}</div>
      {o.progress != null && <div className="track thin"><div style={{ width: `${o.progress * 100}%`, background: `var(--${tone === 'dim' ? 'dim' : tone})` }} /></div>}
      {!compact && o.detail && <p className="dim small">{o.detail}</p>}
      {!compact && o.why && <p className="obj-why">“{o.why}”</p>}
    </div>
  );
}

function NewObjective({ existing, latestKg, onDone }) {
  const [type, setType] = useState(null);
  const [f, setF] = useState({});
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const pick = (t) => {
    setType(t);
    setF({
      weight: { currentKg: latestKg ?? '', targetKg: '', deadline: addDays(84) },
      protein: { grams: 140, daysPerWeek: 5 },
      plants: { servings: 5, daysPerWeek: 5 },
      upf: { maxPct: 20 },
      fuel: { score: 75 },
      recovery: { score: 66 }
    }[t]);
  };

  const save = async () => {
    try { setError(''); await createObjective({ type, ...f }); onDone(); }
    catch (e) { setError(errMsg(e)); }
  };

  if (!type) {
    return (
      <div className="obj-types">
        {Object.entries(OBJECTIVES).map(([t, o]) => (
          <button key={t} className="obj-type" onClick={() => pick(t)}>
            <strong>{o.title}</strong><span>{o.blurb}</span>
            {existing.includes(t) && <em>Replaces your current one</em>}
          </button>
        ))}
      </div>
    );
  }

  // Plain render helpers (not components) so inputs keep focus while typing.
  const num = ({ k, label, unit, min, max, step = 1 }) => (
    <label key={k}>{label}<div className="input-unit"><input type="number" inputMode="decimal" min={min} max={max} step={step} value={f[k] ?? ''} onChange={set(k)} /><span>{unit}</span></div></label>
  );
  const days = () => (
    <label key="days">Days per week
      <div className="seg">{[3, 4, 5, 6, 7].map(n => <button key={n} type="button" className={Number(f.daysPerWeek) === n ? 'on' : ''} onClick={() => setF({ ...f, daysPerWeek: n })}>{n}</button>)}</div>
    </label>
  );

  return (
    <div className="obj-form">
      <button className="link" onClick={() => setType(null)}>‹ All goals</button>
      <h4>{OBJECTIVES[type].title}</h4>
      <p className="muted small">{OBJECTIVES[type].blurb}</p>
      {error && <div className="error">{error}</div>}
      <div className="grid2">
        {type === 'weight' && <>
          {num({ k: 'currentKg', label: 'Current weight', unit: 'kg', min: 30, max: 300, step: 0.1 })}
          {num({ k: 'targetKg', label: 'Target weight', unit: 'kg', min: 30, max: 300, step: 0.1 })}
          <label className="full">By (optional)<input type="date" min={addDays(7)} value={f.deadline || ''} onChange={set('deadline')} /></label>
        </>}
        {type === 'protein' && <>{num({ k: 'grams', label: 'Protein per day', unit: 'g', min: 20, max: 400 })}{days()}</>}
        {type === 'plants' && <>{num({ k: 'servings', label: 'Servings per day', unit: '×80 g', min: 1, max: 15 })}{days()}</>}
        {type === 'upf' && num({ k: 'maxPct', label: 'Ultra-processed under', unit: '% kcal', min: 0, max: 100 })}
        {type === 'fuel' && num({ k: 'score', label: 'Weekly average', unit: '/ 100', min: 1, max: 100 })}
        {type === 'recovery' && num({ k: 'score', label: 'Average recovery', unit: '%', min: 1, max: 100 })}
        <label className="full">Why does this matter to you? <span className="unit">optional</span>
          <input maxLength={200} value={f.why || ''} onChange={set('why')} placeholder="e.g. More energy for my kids" /></label>
      </div>
      {type === 'weight' && (
        <p className="dim small" style={{ marginTop: '.6rem' }}>
          We cap the pace at a conservative rate (max ~1% of body weight per week when losing, 0.5 kg when gaining) and never set intake below 1,200 kcal.
          This is general guidance, not medical advice. Check with a doctor first if you're pregnant, under 18, have a medical condition, or have a history of disordered eating.
        </p>
      )}
      <div className="row"><button className="btn" onClick={save}>Set goal</button></div>
    </div>
  );
}

export default function Goals() {
  const { user, setUser } = useAuth();
  const [objs, setObjs] = useState(null);
  const [weighIns, setWeighIns] = useState([]);
  const [adding, setAdding] = useState(false);
  const [kg, setKg] = useState('');
  const [targets, setTargets] = useState(user.preferences || {});
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    listObjectives().then(setObjs).catch(e => setError(errMsg(e)));
    listWeighIns().then(setWeighIns).catch(() => {});
  };
  useEffect(load, []);

  const weightObj = objs?.find(o => o.type === 'weight');
  const latest = weighIns.at(-1);

  const logWeight = async (e) => {
    e.preventDefault();
    try { await addWeighIn(Number(kg)); setKg(''); load(); } catch (err) { setError(errMsg(err)); }
  };
  const saveTargets = async (e) => {
    e.preventDefault();
    const r = await api.put('/auth/preferences', targets);
    setUser(r.data); setSaved('Saved'); setTimeout(() => setSaved(''), 1500); load();
  };

  return (
    <div>
      <div className="page-head"><h2>Goals</h2><button className="btn small" onClick={() => setAdding(true)}>+ Add goal</button></div>
      {error && <div className="error">{error}</div>}

      {objs && !objs.length && (
        <div className="card empty">
          <p><strong>What are you working towards?</strong></p>
          <p className="muted small">Set one or two goals. Your daily target, Fuel coaching and weekly review will follow them.</p>
          <button className="btn" style={{ marginTop: '.9rem' }} onClick={() => setAdding(true)}>Choose a goal</button>
        </div>
      )}
      {objs?.length > 0 && (
        <section className="card">
          <p className="dim small" style={{ marginBottom: '.6rem' }}>Last 7 complete days</p>
          <div className="obj-list">
            {objs.map(o => (
              <div key={o._id} className="obj-item">
                <ObjectiveRow o={o} />
                <button className="link small" onClick={async () => { if (confirm(`Remove “${o.title}”?`)) { await removeObjective(o._id); load(); } }}>Remove</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {(weightObj || weighIns.length > 0) && (
        <section className="card">
          <div className="card-head"><h3>Weight</h3>{latest && <span className="dim small">last: {latest.kg} kg · {latest.date === today() ? 'today' : latest.date}</span>}</div>
          <form className="weigh-form" onSubmit={logWeight}>
            <div className="input-unit"><input type="number" inputMode="decimal" step="0.1" min="20" max="400" placeholder={latest ? String(latest.kg) : 'Weight'} value={kg} onChange={(e) => setKg(e.target.value)} /><span>kg</span></div>
            <button className="btn" disabled={!kg}>Log weight</button>
          </form>
          {weighIns.length > 1 && (
            <div className="chart" style={{ marginTop: '1rem' }}>
              <Line data={{
                labels: weighIns.map(w => new Date(w.date + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
                datasets: [
                  { data: weighIns.map(w => w.kg), borderColor: getComputedStyle(document.documentElement).getPropertyValue('--text').trim(), borderWidth: 2, pointRadius: 2, tension: 0.3 },
                  ...(weightObj ? [{ data: weighIns.map(() => weightObj.plan?.targetKg), borderColor: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0 }] : [])
                ]
              }} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } },
                scales: { x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 5, color: '#8a837a' } },
                  y: { border: { display: false }, grid: { color: 'rgba(242,236,226,.05)' }, ticks: { maxTicksLimit: 4, color: '#8a837a' } } } }} />
            </div>
          )}
          <p className="dim small" style={{ marginTop: '.5rem' }}>Weigh in a few times a week, ideally same time of day. We use a 7-day average so daily swings don't matter.</p>
        </section>
      )}

      <section className="card">
        <div className="card-head"><h3>Daily targets</h3>{saved && <span className="good small">{saved}</span>}</div>
        <form className="goals-form" onSubmit={saveTargets}>
          {[['proteinGoal', 'Protein', 'g'], ['carbGoal', 'Carbs', 'g'], ['fatGoal', 'Fat', 'g'], ['calorieGoal', 'Calories without Whoop', 'kcal']].map(([k, l, u]) => (
            <label key={k}>{l}<div className="input-unit"><input type="number" min="0" value={targets[k] ?? ''} onChange={(e) => setTargets({ ...targets, [k]: e.target.value })} /><span>{u}</span></div></label>
          ))}
          {!weightObj && (
            <label className="full">Calorie direction
              <div className="seg">{['lose', 'maintain', 'gain'].map(g => (
                <button type="button" key={g} className={(targets.goal || 'maintain') === g ? 'on' : ''} onClick={() => setTargets({ ...targets, goal: g })}>
                  {g === 'lose' ? 'Lose fat' : g === 'gain' ? 'Build' : 'Maintain'}</button>))}
              </div>
            </label>
          )}
          <button className="btn">Save</button>
        </form>
        <p className="dim small" style={{ marginTop: '.6rem' }}>
          {weightObj ? 'Your calorie target follows your weight goal: Whoop burn ± the daily adjustment.' : 'Your calorie target is your Whoop burn, adjusted for this direction.'}
        </p>
      </section>

      {adding && (
        <Sheet title="New goal" onClose={() => setAdding(false)}>
          <NewObjective existing={(objs || []).map(o => o.type)} latestKg={latest?.kg} onDone={() => { setAdding(false); load(); }} />
        </Sheet>
      )}
    </div>
  );
}
