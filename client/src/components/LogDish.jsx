import { useMemo, useState } from 'react';
import { errMsg, today } from '../services/api';
import { logDish, noonISO, addDays } from '../services/dishes';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // Monday-first
const dow = (key) => (new Date(`${key}T12:00`).getDay() + 6) % 7; // 0 = Monday
const short = (key) => new Date(`${key}T12:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });

/** Log or plan a saved meal on one or many days. */
export default function LogDish({ dish, defaultMeal = 'lunch', defaultDate = today(), onDone, onCancel }) {
  const [meal, setMeal] = useState(defaultMeal);
  const [byWeight, setByWeight] = useState(false);
  const [portions, setPortions] = useState(1);
  const [grams, setGrams] = useState(dish.perPortion?.grams || '');
  const [start, setStart] = useState(defaultDate);
  const [pattern, setPattern] = useState('once'); // once | weekdays | daily | custom
  const [weeks, setWeeks] = useState(1);
  const [custom, setCustom] = useState([0, 2, 4]);
  const [eatenToday, setEatenToday] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const days = useMemo(() => {
    if (pattern === 'once') return [start];
    const out = [];
    for (let i = 0; i < 7 * weeks; i++) {
      const k = addDays(start, i), d = dow(k);
      if (pattern === 'daily' || (pattern === 'weekdays' && d < 5) || (pattern === 'custom' && custom.includes(d))) out.push(k);
    }
    return out;
  }, [start, pattern, weeks, custom]);

  const t = today();
  const plan = days.map(k => ({ key: k, planned: k > t || (k === t && !eatenToday) }));
  const plannedCount = plan.filter(p => p.planned).length;
  const servings = byWeight && dish.cookedWeight ? (Number(grams) / dish.cookedWeight) * dish.portions : portions;
  const totalServings = Math.round(servings * days.length * 10) / 10;
  const kcal = Math.round((dish.perPortion?.calories || 0) * servings);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await logDish(dish._id, {
        mealType: meal,
        ...(byWeight ? { grams: Number(grams) } : { portions }),
        days: plan.map(p => ({ date: noonISO(p.key), planned: p.planned }))
      });
      onDone?.({ days: days.length, planned: plannedCount });
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="log-dish">
      {error && <div className="error">{error}</div>}

      <label>Meal
        <div className="seg">{MEALS.map(m => <button key={m} type="button" className={meal === m ? 'on' : ''} onClick={() => setMeal(m)}>{m[0].toUpperCase() + m.slice(1)}</button>)}</div>
      </label>

      <label style={{ marginTop: '.9rem' }}>Amount
        {dish.cookedWeight ? (
          <div className="seg small-seg">
            <button type="button" className={!byWeight ? 'on' : ''} onClick={() => setByWeight(false)}>Portions</button>
            <button type="button" className={byWeight ? 'on' : ''} onClick={() => setByWeight(true)}>Weighed (g)</button>
          </div>
        ) : null}
        {byWeight ? (
          <div className="input-unit"><input type="number" min="1" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} placeholder="on your plate" /><span>g</span></div>
        ) : (
          <div className="stepper">
            <button type="button" onClick={() => setPortions(p => Math.max(0.5, p - 0.5))} aria-label="Less">−</button>
            <span>{portions} portion{portions === 1 ? '' : 's'}</span>
            <button type="button" onClick={() => setPortions(p => Math.min(10, p + 0.5))} aria-label="More">+</button>
          </div>
        )}
      </label>
      <p className="dim small" style={{ marginTop: '.35rem' }}>{kcal} kcal each time</p>

      <label style={{ marginTop: '.9rem' }}>When
        <div className="seg">
          {[['once', 'One day'], ['weekdays', 'Weekdays'], ['daily', 'Every day'], ['custom', 'Custom']].map(([v, l]) => (
            <button key={v} type="button" className={pattern === v ? 'on' : ''} onClick={() => setPattern(v)}>{l}</button>
          ))}
        </div>
      </label>
      <div className="grid2" style={{ marginTop: '.6rem' }}>
        <label>{pattern === 'once' ? 'Date' : 'Starting'}<input type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} /></label>
        {pattern !== 'once' && (
          <label>For
            <div className="seg">{[1, 2].map(w => <button key={w} type="button" className={weeks === w ? 'on' : ''} onClick={() => setWeeks(w)}>{w} week{w > 1 ? 's' : ''}</button>)}</div>
          </label>
        )}
      </div>
      {pattern === 'custom' && (
        <div className="weekdays">
          {WEEKDAYS.map((d, i) => (
            <button key={i} type="button" className={custom.includes(i) ? 'on' : ''}
              onClick={() => setCustom(c => (c.includes(i) ? c.filter(x => x !== i) : [...c, i]))}>{d}</button>
          ))}
        </div>
      )}
      {days.includes(t) && (
        <label className="check" style={{ marginTop: '.7rem' }}>
          <input type="checkbox" checked={eatenToday} onChange={(e) => setEatenToday(e.target.checked)} /> Today's is already eaten
        </label>
      )}

      <div className="plan-preview">
        <p><strong>{days.length} {meal}{days.length === 1 ? '' : meal === 'lunch' ? 'es' : 's'}</strong>
          {plannedCount > 0 && <span className="muted"> · {plannedCount} planned (mark eaten as you go)</span>}</p>
        <div className="day-chips">{plan.map(p => <span key={p.key} className={`day-chip ${p.planned ? 'planned' : ''}`}>{short(p.key)}</span>)}</div>
        {dish.portions > 1 && totalServings > dish.portions && (
          <p className="warn small">Your batch makes {dish.portions} portions, this uses {totalServings}. Cook a bigger batch or adjust.</p>
        )}
      </div>

      <div className="row">
        <button className="btn" onClick={submit} disabled={busy || !days.length || !(servings > 0)}>
          {busy ? 'Saving…' : days.length > 1 ? `Add to ${days.length} days` : plannedCount ? 'Plan it' : 'Log it'}
        </button>
        {onCancel && <button className="btn secondary" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}
