import { useState } from 'react';
import api, { errMsg } from '../services/api';
import LabelScanner from './LabelScanner';

const FIELDS = [
  ['calories', 'Calories', 'kcal'], ['protein', 'Protein', 'g'], ['carbs', 'Carbs', 'g'], ['sugar', 'of which sugar', 'g'],
  ['fat', 'Fat', 'g'], ['saturatedFat', 'of which saturated', 'g'], ['fiber', 'Fiber', 'g'], ['sodium', 'Sodium', 'mg']
];

export const FOOD_GROUPS = [
  ['vegetable', 'Vegetables'], ['fruit', 'Fruit'], ['legume', 'Legumes'], ['whole_grain', 'Whole grains'],
  ['refined_grain', 'Refined grains (white bread, pasta)'], ['lean_protein', 'Meat, fish & eggs'], ['processed_meat', 'Processed meat'],
  ['dairy', 'Dairy'], ['nuts_seeds', 'Nuts, seeds & nut butters'], ['oils_fats', 'Oils & fats'], ['sweets_snacks', 'Sweets & snacks'],
  ['sugary_drink', 'Sugary drinks & juice'], ['drink', 'Other drinks'], ['prepared_meal', 'Fast food & ready meals'],
  ['supplement', 'Supplements'], ['other', 'Other']
];

const NOVA = [
  ['', "Not sure"], ['1', 'Whole / unprocessed'], ['2', 'Basic ingredient (oil, butter, flour)'],
  ['3', 'Processed (bread, cheese, canned)'], ['4', 'Ultra-processed (long ingredient list, additives)']
];

/** Create a product in the shared database (optionally prefilled from a label photo). */
export default function ProductForm({ initial = {}, onSaved, onCancel }) {
  const [p, setP] = useState({ name: '', brand: '', barcode: '', servingSize: 100, servingUnit: 'g', foodGroup: '', novaGroup: '',
    ingredients: '', ...Object.fromEntries(FIELDS.map(([k]) => [k, ''])), ...initial });
  const [fromLabel, setFromLabel] = useState(false);
  const [highlight, setHighlight] = useState([]);
  const [error, setError] = useState('');
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });

  const onParsed = (fields, found) => {
    setP(prev => ({ ...prev, ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v)])) }));
    setHighlight([...found, ...(fields.servingSize ? ['servingSize'] : [])]);
    setFromLabel(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!p.foodGroup) { setError('Pick a food group: it powers your Fuel Score.'); return; }
    try {
      const body = { ...p, fromLabel, servingSize: Number(p.servingSize) || 100,
        novaGroup: p.novaGroup ? Number(p.novaGroup) : undefined,
        ...Object.fromEntries(FIELDS.map(([k]) => [k, p[k] === '' ? undefined : Number(p[k])])) };
      if (!body.barcode) delete body.barcode;
      const res = await api.post('/products', body);
      onSaved?.(res.data);
    } catch (err) { setError(errMsg(err)); }
  };

  const hl = (k) => (highlight.includes(k) ? 'from-label' : '');

  return (
    <form className="product-form" onSubmit={submit}>
      <LabelScanner onParsed={onParsed} />
      {error && <div className="error">{error}</div>}
      <div className="grid2">
        <label>Name<input value={p.name} onChange={set('name')} required placeholder="e.g. Smooth Peanut Butter" /></label>
        <label>Brand<input value={p.brand} onChange={set('brand')} placeholder="e.g. Skippy" /></label>
        <label>Barcode<input value={p.barcode} onChange={set('barcode')} inputMode="numeric" /></label>
        <label>Food group<select value={p.foodGroup} onChange={set('foodGroup')} required>
          <option value="">Choose…</option>{FOOD_GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>How processed?<select value={p.novaGroup} onChange={set('novaGroup')}>
          {NOVA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <div className="grid2 tight">
          <label className={hl('servingSize')}>Per<input type="number" min="1" step="any" value={p.servingSize} onChange={set('servingSize')} /></label>
          <label>Unit<select value={p.servingUnit} onChange={set('servingUnit')}><option>g</option><option>ml</option></select></label>
        </div>
      </div>
      <p className="muted small">Nutrition per {p.servingSize || 100} {p.servingUnit}{fromLabel && ' · highlighted values came from your photo; double-check them'}</p>
      <div className="grid4">
        {FIELDS.map(([k, label, unit]) => (
          <label key={k} className={hl(k)}><span>{label} <span className="unit">{unit}</span></span>
            <input type="number" min="0" step="any" value={p[k]} onChange={set(k)} required={k === 'calories'} />
          </label>
        ))}
      </div>
      <label>Ingredients<textarea rows={2} value={p.ingredients} onChange={set('ingredients')} placeholder="Optional" /></label>
      <div className="row">
        <button className="btn">Save to database</button>
        {onCancel && <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>}
      </div>
      <p className="muted small">Saved products are shared, so the next person who scans this barcode gets it instantly.</p>
    </form>
  );
}
