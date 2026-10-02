import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg, today } from '../services/api';
import ProductPicker, { NovaChip } from '../components/ProductPicker';
import QuantityInput from '../components/QuantityInput';
import DishEditor from '../components/DishEditor';
import LogDish from '../components/LogDish';
import Ring from '../components/Ring';
import { Sheet, DishCard } from './Meals';
import { getFuelDay, fuelColor, fuelVerdict } from '../services/fuel';
import { listDishes, noonISO } from '../services/dishes';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
const sum = (arr, k) => Math.round(arr.reduce((s, e) => s + (e[k] || 0), 0));
const r1 = (n) => Math.round(n * 10) / 10;

/** Entries of one meal -> rows: single foods, or one row per logged dish (its ingredients share dish.group). */
function toRows(items) {
  const rows = [], groups = {};
  for (const e of items) {
    const g = e.dish?.group;
    if (!g) { rows.push({ type: 'food', e }); continue; }
    if (!groups[g]) { groups[g] = { type: 'dish', group: g, dish: e.dish, items: [] }; rows.push(groups[g]); }
    groups[g].items.push(e);
  }
  return rows;
}

export default function Nutrition() {
  const [date, setDate] = useState(today());
  const [entries, setEntries] = useState([]);
  const [fuel, setFuel] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(null);      // meal slot being added to
  const [product, setProduct] = useState(null);    // picked food awaiting amount
  const [amount, setAmount] = useState({ grams: 0, text: null });
  const [planned, setPlanned] = useState(false);
  const [dishes, setDishes] = useState([]);
  const [loggingDish, setLoggingDish] = useState(null);
  const [savingAsDish, setSavingAsDish] = useState(null); // prefilled editor
  const [open, setOpen] = useState({});            // expanded dish rows
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    api.get('/nutrition', { params: { startDate: date, endDate: date } })
      .then(r => setEntries(r.data)).catch(e => setError(errMsg(e)));
    getFuelDay(date).then(setFuel).catch(() => {});
  }, [date]);
  useEffect(load, [load]);
  useEffect(() => { listDishes().then(setDishes).catch(() => {}); }, []);

  const isFuture = date > today();
  const openAdd = (meal) => { setAdding(meal); setProduct(null); setPlanned(isFuture); setError(''); };
  const closeAdd = () => { setAdding(null); setProduct(null); };

  const saveFood = async () => {
    try {
      await api.post('/nutrition', { productId: product._id, quantity: amount.grams, portion: amount.text,
        mealType: adding, planned, date: noonISO(date) });
      closeAdd(); load();
    } catch (e) { setError(errMsg(e)); }
  };

  const remove = async (id) => { await api.delete(`/nutrition/${id}`); load(); };
  const markEaten = async (id) => { await api.patch(`/nutrition/${id}`, { planned: false }); load(); };
  const removeGroup = async (g) => { await api.delete(`/nutrition/group/${g}`); load(); };
  const eatGroup = async (g) => { await api.patch(`/nutrition/group/${g}`, { planned: false }); load(); };

  const saveAsMeal = (items) => {
    const withProduct = items.filter(e => e.product && typeof e.product === 'object');
    const dishNames = [...new Set(items.map(e => e.dish?.name).filter(Boolean))];
    setSavingAsDish({
      name: dishNames.length === 1 ? dishNames[0] : '',
      ingredients: withProduct.map(e => ({ product: e.product, grams: e.quantity, portionText: e.portionText }))
    });
  };

  const eaten = entries.filter(e => !e.planned);
  const preview = useMemo(() => product && {
    calories: Math.round((product.calories || 0) * amount.grams / (product.servingSize || 100)),
    protein: r1((product.protein || 0) * amount.grams / (product.servingSize || 100)),
    carbs: r1((product.carbs || 0) * amount.grams / (product.servingSize || 100)),
    fat: r1((product.fat || 0) * amount.grams / (product.servingSize || 100))
  }, [product, amount]);

  return (
    <div>
      <div className="page-head">
        <h2>Log</h2>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </div>
      {error && <div className="error">{error}</div>}
      {notice && <div className="info" onClick={() => setNotice('')}>{notice}</div>}

      {fuel && date <= today() && (
        <Link to="/" className="fuel-strip">
          <Ring value={fuel.score} color={fuelColor(fuel.score)} size={52} stroke={4}>
            <span className="mini-val">{fuel.score ?? '–'}</span>
          </Ring>
          <div>
            <strong>{fuelVerdict(fuel.score, fuel.inProgress)}</strong>
            <p>{fuel.insights?.find(i => i.kind === 'fix')?.title || fuel.insights?.[0]?.title}</p>
          </div>
        </Link>
      )}

      <div className="card totals">
        <div><strong>{sum(eaten, 'calories')}</strong><span>of {fuel?.target?.kcal?.toLocaleString() ?? '–'} kcal</span></div>
        <div><strong>{sum(eaten, 'protein')}g</strong><span>protein</span></div>
        <div><strong>{sum(eaten, 'carbs')}g</strong><span>carbs</span></div>
        <div><strong>{sum(eaten, 'fat')}g</strong><span>fat</span></div>
        {entries.some(e => e.planned) && <div className="muted"><strong>{sum(entries.filter(e => e.planned), 'calories')}</strong><span>planned</span></div>}
      </div>

      {MEALS.map(meal => {
        const items = entries.filter(e => e.mealType === meal);
        return (
          <section key={meal} className="card meal">
            <div className="meal-head">
              <h3><span className="cap">{meal}</span> <span className="muted small">{sum(items.filter(i => !i.planned), 'calories')} kcal</span></h3>
              <button className="btn small" onClick={() => openAdd(meal)}>+ Add</button>
            </div>
            <ul className="list">
              {toRows(items).map(row => row.type === 'food' ? (
                <li key={row.e._id} className={row.e.planned ? 'planned' : ''}>
                  <div>
                    <strong>{row.e.productName}</strong> <NovaChip nova={row.e.novaGroup} />
                    <div className="muted small">{row.e.portionText ? `${row.e.portionText} · ` : ''}{Math.round(row.e.quantity)}{row.e.unit} · {Math.round(row.e.calories)} kcal · P {row.e.protein} · C {row.e.carbs} · F {row.e.fat}</div>
                  </div>
                  <div className="row-inline">
                    {row.e.planned && <button className="btn small secondary" onClick={() => markEaten(row.e._id)}>Eaten</button>}
                    <button className="btn danger" onClick={() => remove(row.e._id)} aria-label="Delete">✕</button>
                  </div>
                </li>
              ) : (
                <li key={row.group} className={`dish-row ${row.items.every(e => e.planned) ? 'planned' : ''}`}>
                  <div className="dish-row-main" onClick={() => setOpen(o => ({ ...o, [row.group]: !o[row.group] }))}>
                    <strong>{row.dish.name}</strong> <span className="chip meal-chip">meal</span>
                    <div className="muted small">{row.dish.amount} · {sum(row.items, 'calories')} kcal · P {sum(row.items, 'protein')} · C {sum(row.items, 'carbs')} · F {sum(row.items, 'fat')}
                      <span className="dim"> · {open[row.group] ? 'hide' : `${row.items.length} ingredients`}</span></div>
                    {open[row.group] && (
                      <ul className="ing-mini">
                        {row.items.map(e => <li key={e._id}>{e.productName} <span className="dim">{Math.round(e.quantity)} g · {Math.round(e.calories)} kcal</span></li>)}
                      </ul>
                    )}
                  </div>
                  <div className="row-inline">
                    {row.items.every(e => e.planned) && <button className="btn small secondary" onClick={() => eatGroup(row.group)}>Eaten</button>}
                    <button className="btn danger" onClick={() => removeGroup(row.group)} aria-label="Delete meal">✕</button>
                  </div>
                </li>
              ))}
            </ul>
            {items.length > 1 && items.some(e => e.product) && !(new Set(items.map(e => e.dish?.group)).size === 1 && items[0].dish) && (
              <button className="link save-meal" onClick={() => saveAsMeal(items)}>Save as meal</button>
            )}
          </section>
        );
      })}

      {adding && (
        <Sheet title={`Add to ${adding}`} onClose={closeAdd}>
          {!product ? (
            <ProductPicker onPick={(p) => setProduct(p)} extraTab={dishes.length ? {
              label: 'My meals',
              render: () => (
                <div className="dish-list compact">
                  {dishes.map(d => <DishCard key={d._id} d={d} onLog={() => setLoggingDish(d)} onEdit={() => setLoggingDish(d)} />)}
                </div>
              )
            } : null} />
          ) : (
            <div>
              <p className="qty-name"><strong>{product.name}</strong>{product.brand && product.brand !== 'Generic' && <span className="muted"> · {product.brand}</span>} <NovaChip nova={product.novaGroup} />
                <button className="link" style={{ marginLeft: '.5rem' }} onClick={() => setProduct(null)}>change</button></p>
              <QuantityInput product={product} autoFocus onChange={setAmount} />
              <p className="muted" style={{ margin: '.7rem 0' }}>{preview.calories} kcal · P {preview.protein} g · C {preview.carbs} g · F {preview.fat} g</p>
              <label className="check"><input type="checkbox" checked={planned} onChange={(e) => setPlanned(e.target.checked)} /> Plan only (not eaten yet)</label>
              <div className="row">
                <button className="btn" onClick={saveFood} disabled={!(amount.grams > 0)}>Add</button>
                <button className="btn secondary" onClick={closeAdd}>Cancel</button>
              </div>
            </div>
          )}
        </Sheet>
      )}

      {loggingDish && (
        <Sheet title={loggingDish.name} onClose={() => setLoggingDish(null)}>
          <LogDish dish={loggingDish} defaultMeal={adding || 'lunch'} defaultDate={date} onCancel={() => setLoggingDish(null)}
            onDone={({ days, planned: p }) => {
              setLoggingDish(null); closeAdd(); load();
              if (days > 1) setNotice(`Added to ${days} days${p ? ` (${p} planned)` : ''}.`);
            }} />
        </Sheet>
      )}

      {savingAsDish && (
        <Sheet title="Save as meal" onClose={() => setSavingAsDish(null)}>
          <DishEditor initial={savingAsDish} onCancel={() => setSavingAsDish(null)} onSaved={(d) => {
            setSavingAsDish(null); setDishes(list => [d, ...list]);
            setNotice(`Saved “${d.name}”. Find it under Meals, or in “My meals” when adding food.`);
          }} />
        </Sheet>
      )}
    </div>
  );
}
