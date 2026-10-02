import { useMemo, useState } from 'react';
import { errMsg } from '../services/api';
import { saveDish, sumIngredients } from '../services/dishes';
import ProductPicker, { NovaChip } from './ProductPicker';
import QuantityInput from './QuantityInput';

const r = (n) => Math.round(n);

/**
 * Create/edit a saved meal (single plate or meal-prep batch).
 * initial: existing dish from the API, or { ingredients: [{ product, grams, portionText }] } to prefill.
 */
export default function DishEditor({ initial = {}, onSaved, onCancel }) {
  const [name, setName] = useState(initial.name || '');
  const [portions, setPortions] = useState(initial.portions || 1);
  const [cookedWeight, setCookedWeight] = useState(initial.cookedWeight || '');
  const [ingredients, setIngredients] = useState(initial.ingredients?.filter(i => i.product) || []);
  const [view, setView] = useState('form'); // form | pick | qty
  const [pending, setPending] = useState(null); // { product, grams, text }
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const t = useMemo(() => sumIngredients(ingredients), [ingredients]);
  const n = Math.max(1, Number(portions) || 1);

  const save = async () => {
    setSaving(true); setError('');
    try {
      const dish = await saveDish({
        _id: initial._id, name, portions: n, cookedWeight: Number(cookedWeight) || undefined,
        ingredients: ingredients.map(i => ({ productId: i.product._id, grams: i.grams, portionText: i.portionText }))
      });
      onSaved?.(dish);
    } catch (e) { setError(errMsg(e)); }
    finally { setSaving(false); }
  };

  if (view === 'pick') {
    return (
      <div>
        <button className="link" onClick={() => setView('form')}>‹ Back to meal</button>
        <div style={{ height: '.8rem' }} />
        <ProductPicker onPick={(p) => { setPending({ product: p, grams: 0, text: null }); setView('qty'); }} />
      </div>
    );
  }

  if (view === 'qty' && pending) {
    const p = pending.product;
    const kcal = (p.calories || 0) * pending.grams / (p.servingSize || 100);
    return (
      <div className="dish-qty">
        <button className="link" onClick={() => setView('pick')}>‹ Choose another</button>
        <p className="qty-name"><strong>{p.name}</strong>{p.brand && p.brand !== 'Generic' && <span className="muted"> · {p.brand}</span>} <NovaChip nova={p.novaGroup} /></p>
        <p className="muted small">How much goes into the {n > 1 ? 'whole batch' : 'meal'}?</p>
        <QuantityInput product={p} autoFocus onChange={({ grams, text }) => setPending(x => ({ ...x, grams, text }))} />
        <p className="muted small" style={{ marginTop: '.5rem' }}>{r(kcal)} kcal</p>
        <div className="row">
          <button className="btn" disabled={!(pending.grams > 0)} onClick={() => {
            setIngredients(list => [...list, { product: p, grams: Math.round(pending.grams * 10) / 10, portionText: pending.text }]);
            setPending(null); setView('form');
          }}>Add ingredient</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dish-editor">
      {error && <div className="error">{error}</div>}
      <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Steak yakisoba" maxLength={80} /></label>

      <div className="grid2" style={{ marginTop: '.7rem' }}>
        <label>Makes
          <div className="stepper">
            <button type="button" onClick={() => setPortions(Math.max(1, n - 1))} aria-label="Fewer portions">−</button>
            <span>{n} portion{n > 1 ? 's' : ''}</span>
            <button type="button" onClick={() => setPortions(Math.min(50, n + 1))} aria-label="More portions">+</button>
          </div>
        </label>
        <label>Cooked weight <span className="unit">optional</span>
          <div className="input-unit"><input type="number" min="0" inputMode="decimal" value={cookedWeight} onChange={(e) => setCookedWeight(e.target.value)} placeholder="Weigh the batch" /><span>g</span></div>
        </label>
      </div>
      {cookedWeight > 0 && <p className="dim small" style={{ marginTop: '.4rem' }}>You'll be able to log by weight: one portion ≈ {r(cookedWeight / n)} g.</p>}

      <h4 className="sub">Ingredients {n > 1 && <span className="dim small">· whole batch</span>}</h4>
      <ul className="list ing-list">
        {ingredients.map((i, idx) => (
          <li key={idx}>
            <div>
              <strong>{i.product.name}</strong>
              <div className="muted small">{i.portionText ? `${i.portionText} · ` : ''}{r(i.grams)} {i.product.servingUnit || 'g'} · {r((i.product.calories || 0) * i.grams / (i.product.servingSize || 100))} kcal</div>
            </div>
            <div className="row-inline">
              <div className="input-unit sm">
                <input type="number" min="0" inputMode="decimal" value={i.grams} aria-label="Grams" onFocus={(e) => e.target.select()}
                  onChange={(e) => setIngredients(list => list.map((x, j) => (j === idx ? { ...x, grams: Number(e.target.value), portionText: undefined } : x)))} />
                <span>{i.product.servingUnit || 'g'}</span>
              </div>
              <button className="btn danger" onClick={() => setIngredients(list => list.filter((_, j) => j !== idx))} aria-label="Remove">✕</button>
            </div>
          </li>
        ))}
      </ul>
      <button className="btn secondary wide" onClick={() => setView('pick')}>+ Add ingredient</button>

      {ingredients.length > 0 && (
        <div className="dish-summary">
          <div className="dish-summary-main">
            <span className="num">{r(t.calories / n)}</span><span className="muted"> kcal per portion</span>
          </div>
          <div className="muted small">P {r(t.protein / n)} g · C {r(t.carbs / n)} g · F {r(t.fat / n)} g
            {' · '}{Math.round((t.plantGrams / 80 / n) * 10) / 10} plant servings
            {t.knownKcal > 0 && ` · ${r((t.upfKcal / t.knownKcal) * 100)}% ultra-processed`}</div>
        </div>
      )}

      <div className="row">
        <button className="btn" onClick={save} disabled={saving || !name.trim() || !ingredients.length}>{saving ? 'Saving…' : initial._id ? 'Save changes' : 'Save meal'}</button>
        {onCancel && <button className="btn secondary" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}
