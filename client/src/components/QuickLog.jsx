import { useState } from 'react';
import api, { errMsg, today } from '../services/api';
import { logDish } from '../services/dishes';
import ProductPicker, { NovaChip } from './ProductPicker';
import DecimalInput from './DecimalInput';
import { Sheet } from '../pages/Meals';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
const pad = (n) => String(n).padStart(2, '0');
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const toHM = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
export const mealForHour = (h) => (h >= 5 && h < 11 ? 'breakfast' : h >= 11 && h < 16 ? 'lunch' : h >= 18 && h < 23 ? 'dinner' : 'snack');
const kcalOf = (p, g) => Math.round(((p?.calories || 0) * g) / (p?.servingSize || 100));

/** Describe a meal in plain words -> review what was understood -> log everything at once. */
export default function QuickLog({ date, onLogged }) {
  const [text, setText] = useState('');
  const [items, setItems] = useState(null);
  const [time, setTime] = useState(nowHM());
  const [meal, setMeal] = useState(mealForHour(new Date().getHours()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [swap, setSwap] = useState(null); // index of item being re-matched via search

  const read = async () => {
    if (!text.trim()) return;
    setBusy(true); setError('');
    try {
      const r = (await api.post('/nutrition/parse', { text })).data;
      if (!r.items.length) { setError("I couldn't find any foods in that. Try e.g. “2 eggs, toast and a coffee”."); return; }
      setItems(r.items); setEngine(r.engine); setLogId(r.logId);
      if (r.minutes != null) setTime(toHM(r.minutes));
      setMeal(r.suggestedMeal || mealForHour(Number((r.minutes != null ? toHM(r.minutes) : time).split(':')[0])));
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  };

  // Brand suggestions from Open Food Facts aren't saved yet: import on pick
  const useAlt = async (i, a) => {
    let p = a;
    if (!a._id && a.barcode) { try { p = (await api.get(`/products/barcode/${a.barcode}`)).data; } catch (e) { setError(errMsg(e)); return; } }
    setItems(list => list.map((x, j) => (j === i ? { ...x, product: p, alternatives: [x.product, ...x.alternatives.filter(y => y !== a)].filter(Boolean) } : x)));
  };
  const [engine, setEngine] = useState(null);
  const [logId, setLogId] = useState(null);
  const update = (i, patch) => setItems(list => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const ready = items?.filter(i => (i.kind === 'dish') || (i.product && Number(i.grams) > 0)) || [];
  const total = ready.reduce((a, i) => a + (i.kind === 'food' ? kcalOf(i.product, Number(i.grams)) : 0), 0);

  const save = async () => {
    setBusy(true); setError('');
    try {
      const [y, m, d] = date.split('-').map(Number);
      const [hh, mm] = time.split(':').map(Number);
      const when = new Date(y, m - 1, d, hh, mm).toISOString();
      const planned = date > today();
      const foods = ready.filter(i => i.kind === 'food');
      if (foods.length) await api.post('/nutrition/batch', { mealType: meal, date: when, hasTime: true, planned, parseLogId: logId, dishCount: ready.length - foods.length,
        items: foods.map(i => ({ productId: i.product._id, quantity: Number(i.grams), portion: i.portion })) });
      for (const i of ready.filter(x => x.kind === 'dish')) {
        await logDish(i.dish._id, { mealType: meal, portions: Number(i.portions) || 1, days: [{ date: when, planned, hasTime: true }] });
      }
      setItems(null); setText(''); setTime(nowHM());
      onLogged?.(ready.length);
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <section className="card quicklog">
      {!items ? (
        <>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="go"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); read(); } }}
            placeholder="What did you eat? e.g. “2 eggs, toast and a coffee at 8am”" />
          {error && <p className="small" style={{ color: 'var(--poor)', marginTop: '.5rem' }}>{error}</p>}
          <div className="ql-actions">
            <span className="dim small">Write it like a message. Amounts and times are optional.</span>
            <button className="btn small" onClick={read} disabled={busy || !text.trim()}>{busy ? 'Reading…' : 'Continue'}</button>
          </div>
        </>
      ) : (
        <>
          <div className="ql-head">
            <p className="dim small">“{text}”{engine === 'ai' && <span className="ai-tag">AI</span>}</p>
            <button className="link" onClick={() => setItems(null)}>Edit</button>
          </div>
          <ul className="ql-items">
            {items.map((it, i) => (
              <li key={i} className={!it.product && it.kind === 'food' ? 'missing' : ''}>
                <div className="ql-main">
                  {it.kind === 'dish' ? (
                    <><strong>{it.dish.name}</strong> <span className="chip meal-chip">meal</span><div className="dim small">from your saved meals</div></>
                  ) : it.product ? (
                    <>
                      <button className="ql-name" onClick={() => setSwap(i)}><strong>{it.product.name}</strong>{it.product.brand && it.product.brand !== 'Generic' && <span className="muted"> · {it.product.brand}</span>} <span className="dim">▾</span></button>
                      <div className="dim small">“{it.food}” · {kcalOf(it.product, Number(it.grams))} kcal <NovaChip nova={it.product.novaGroup} /></div>
                      {it.alternatives?.length > 0 && (
                        <div className="ql-alts">{it.alternatives.slice(0, 2).map(a => (
                          <button key={a._id || a.barcode} onClick={() => useAlt(i, a)}>{a.name.length > 30 ? a.name.slice(0, 29) + '…' : a.name}{a.brand && a.brand !== 'Generic' ? ` · ${a.brand}` : ''}</button>
                        ))}</div>
                      )}
                    </>
                  ) : (
                    <><strong>“{it.food}”</strong><div className="small" style={{ color: 'var(--fair)' }}>Not found. <button className="link" onClick={() => setSwap(i)}>Search</button></div></>
                  )}
                </div>
                <div className="ql-amt">
                  {it.kind === 'dish' ? (
                    <div className="input-unit sm"><DecimalInput value={it.portions} onChange={(e) => update(i, { portions: e.target.value })} aria-label="Portions" /><span>port.</span></div>
                  ) : (
                    <div className="input-unit sm"><DecimalInput value={it.grams} onChange={(e) => update(i, { grams: e.target.value, portion: null })} aria-label="Grams" onFocus={(e) => e.target.select()} /><span>{it.product?.servingUnit || 'g'}</span></div>
                  )}
                  <button className="btn danger" onClick={() => setItems(list => list.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="ql-when">
            <div className="seg">{MEALS.map(m => <button key={m} className={meal === m ? 'on' : ''} onClick={() => setMeal(m)}>{m[0].toUpperCase() + m.slice(1)}</button>)}</div>
            <input type="time" value={time} onChange={(e) => { setTime(e.target.value); }} aria-label="Time eaten" />
          </div>
          {error && <div className="error">{error}</div>}
          <div className="row">
            <button className="btn" onClick={save} disabled={busy || !ready.length}>{busy ? 'Saving…' : `Log ${ready.length} item${ready.length === 1 ? '' : 's'} · ${total} kcal`}</button>
            <button className="btn secondary" onClick={() => { setItems(null); setText(''); }}>Cancel</button>
          </div>
        </>
      )}

      {swap != null && (
        <Sheet title={`Match “${items[swap].food}”`} onClose={() => setSwap(null)}>
          <ProductPicker initialQuery={items[swap].food} onPick={(p) => { update(swap, { product: p, kind: 'food', grams: items[swap].grams || p.servingSize || 100 }); setSwap(null); }} />
        </Sheet>
      )}
    </section>
  );
}
