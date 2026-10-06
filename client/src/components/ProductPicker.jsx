import { useCallback, useEffect, useState } from 'react';
import api, { errMsg } from '../services/api';
import BarcodeScanner from './BarcodeScanner';
import ProductForm from './ProductForm';

const NOVA_LABEL = { 1: 'Whole', 2: 'Basic', 3: 'Processed', 4: 'Ultra-processed' };
export const NovaChip = ({ nova }) => (nova ? <span className={`chip nova${nova}`}>{NOVA_LABEL[nova]}</span> : null);

/**
 * Pick a product by search or barcode scan. Unknown barcodes -> create (with label photo).
 * Search includes Open Food Facts results; picking one imports it into our database.
 */
export default function ProductPicker({ onPick, extraTab, initialQuery = '' }) {
  const [mode, setMode] = useState('search'); // search | scan | create
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(false);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [pendingBarcode, setPendingBarcode] = useState('');

  useEffect(() => {
    if (mode !== 'search') return;
    setLoading(true);
    let stale = false;
    const t = setTimeout(() => {
      api.get('/products', { params: q ? { search: q } : {} })
        .then(r => !stale && setResults(r.data)).catch(() => {}).finally(() => !stale && setLoading(false));
      // Branded products (Open Food Facts) load separately so plain foods show instantly
      setBrands([]);
      if (q.trim().length >= 3) {
        setBrandsLoading(true);
        api.get('/products/external', { params: { search: q } })
          .then(r => !stale && setBrands(r.data)).catch(() => {}).finally(() => !stale && setBrandsLoading(false));
      }
    }, 300);
    return () => { stale = true; clearTimeout(t); };
  }, [q, mode]);

  const pick = async (p) => {
    if (!p.external) return onPick(p);
    setMsg(`Adding ${p.name}…`);
    try { const r = await api.get(`/products/barcode/${p.barcode}`); setMsg(''); onPick(r.data); }
    catch (e) { setMsg(errMsg(e)); }
  };

  const onDetected = useCallback(async (code) => {
    setMsg(`Looking up ${code}…`);
    try {
      const r = await api.get(`/products/barcode/${code}`);
      setMsg(''); setMode('search');
      onPick(r.data);
    } catch (e) {
      if (e?.response?.status === 404) {
        setPendingBarcode(code); setMode('create');
        setMsg(`${code} isn't in any database yet. Snap the label and you'll be the first. Everyone after you gets it instantly.`);
      } else { setMsg(errMsg(e)); setMode('search'); }
    }
  }, [onPick]);

  const local = results;
  const haveCodes = new Set(local.map(p => p.barcode).filter(Boolean));
  const external = brands.filter(p => !haveCodes.has(p.barcode));
  const Item = ({ p }) => (
    <li onClick={() => pick(p)}>
      <div className="item-top">
        <span><strong>{p.name}</strong>{p.brand && p.brand !== 'Generic' && <span className="muted"> · {p.brand}</span>}</span>
        <NovaChip nova={p.novaGroup} />
      </div>
      <div className="muted small">{Math.round(p.calories)} kcal · P {p.protein} · C {p.carbs} · F {p.fat} <span className="dim">/ {p.servingSize}{p.servingUnit}</span></div>
    </li>
  );

  return (
    <div className="picker">
      <div className="tabs">
        {extraTab && <button className={mode === 'extra' ? 'active' : ''} onClick={() => setMode('extra')}>{extraTab.label}</button>}
        <button className={mode === 'search' ? 'active' : ''} onClick={() => setMode('search')}>Search</button>
        <button className={mode === 'scan' ? 'active' : ''} onClick={() => { setMsg(''); setMode('scan'); }}>Scan</button>
        <button className={mode === 'create' ? 'active' : ''} onClick={() => { setPendingBarcode(''); setMsg(''); setMode('create'); }}>Add new</button>
      </div>
      {msg && <div className="info">{msg}</div>}
      {mode === 'search' && (
        <>
          <input autoFocus placeholder="Search: “sirloin steak”, “soba noodles”, “skippy”" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="list">
            {local.map(p => <Item key={p._id} p={p} />)}
            {(external.length > 0 || brandsLoading) && <li className="section">Brands{brandsLoading && ' · searching…'}</li>}
            {external.map(p => <Item key={p.barcode} p={p} />)}
            {loading && !results.length && <li className="muted">Searching…</li>}
            {!loading && !brandsLoading && !results.length && !external.length && <li className="muted">Nothing found. Scan the barcode or add it with a label photo.</li>}
          </ul>
        </>
      )}
      {mode === 'extra' && extraTab.render()}
      {mode === 'scan' && <BarcodeScanner onDetected={onDetected} onClose={() => setMode('search')} />}
      {mode === 'create' && (
        <ProductForm key={pendingBarcode} initial={{ barcode: pendingBarcode }}
          onSaved={(p) => { setMsg(''); setMode('search'); onPick(p); }} onCancel={() => setMode('search')} />
      )}
    </div>
  );
}
