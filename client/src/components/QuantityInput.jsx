import { useEffect, useState } from 'react';
import DecimalInput from './DecimalInput';

const fmt = (n) => String(Math.round(n * 10) / 10);

/**
 * Grams-first amount input. Household portions ("1 cup", "1 steak") are optional quick-pick chips that
 * fill in the grams. Calls onChange({ grams, text }) — text is e.g. "2 × 1 cup" when a chip was used.
 */
export default function QuantityInput({ product, initialGrams, onChange, autoFocus }) {
  const unit = product.servingUnit || 'g';
  // Skip unlabeled portions (USDA has some that are just "1")
  const portions = (product.portions || []).filter(p => p.grams > 0 && /[a-z]/i.test(p.label)).slice(0, 4);
  const [grams, setGrams] = useState(fmt(initialGrams || product.servingSize || 100));
  const [chip, setChip] = useState(null); // { label, count }

  useEffect(() => {
    onChange({ grams: Number(grams) || 0, text: chip ? (chip.count === 1 ? chip.label : `${fmt(chip.count)} × ${chip.label}`) : null });
  }, [grams, chip]); // eslint-disable-line react-hooks/exhaustive-deps

  const usePortion = (p, count) => { setChip({ label: p.label, count }); setGrams(fmt(p.grams * count)); };
  const step = (d) => { setChip(null); setGrams(g => fmt(Math.max(0, (Number(g) || 0) + d))); };

  return (
    <div className="qty">
      <div className="qty-main">
        <button type="button" className="qty-step" onClick={() => step(-10)} aria-label="Less">−</button>
        <div className="qty-field">
          <DecimalInput inputMode="decimal" min="0" step="any" value={grams} autoFocus={autoFocus}
            onChange={(e) => { setChip(null); setGrams(e.target.value); }} onFocus={(e) => e.target.select()} aria-label={`Amount in ${unit}`} />
          <span>{unit}</span>
        </div>
        <button type="button" className="qty-step" onClick={() => step(10)} aria-label="More">+</button>
      </div>
      {portions.length > 0 && (
        <div className="qty-chips">
          {portions.map((p, i) => {
            const on = chip?.label === p.label;
            return (
              <div key={i} className={`qty-chip ${on ? 'on' : ''}`}>
                <button type="button" onClick={() => usePortion(p, on ? chip.count : 1)}>
                  {on && chip.count !== 1 ? `${fmt(chip.count)} × ` : ''}{p.label}<span> · {Math.round(p.grams)} {unit}</span>
                </button>
                {on && (
                  <span className="qty-mult">
                    {[0.5, 1, 2].map(m => <button key={m} type="button" className={chip.count === m ? 'on' : ''} onClick={() => usePortion(p, m)}>{m === 0.5 ? '½' : `×${m}`}</button>)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
