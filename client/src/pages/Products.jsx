import { useState } from 'react';
import ProductPicker, { NovaChip } from '../components/ProductPicker';
import { FOOD_GROUPS } from '../components/ProductForm';

const GROUP = Object.fromEntries(FOOD_GROUPS);

export default function Products() {
  const [selected, setSelected] = useState(null);

  return (
    <div className="split">
      <div className="card">
        <h2>Foods</h2>
        <p className="muted small" style={{ margin: '.3rem 0 1rem' }}>Search millions of branded products, scan a barcode, or scan a nutrition label to add one for everyone.</p>
        <ProductPicker onPick={setSelected} />
        <p className="fineprint">Food data from <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a> (ODbL)
          and <a href="https://fdc.nal.usda.gov" target="_blank" rel="noreferrer">USDA FoodData Central</a>. <a href="/legal#data-sources">Details</a></p>
      </div>
      <div className="card">
        {!selected ? <p className="muted">Pick a food to see its nutrition and quality.</p> : (
          <div>
            <h2>{selected.name}</h2>
            <p className="muted">{selected.brand}{selected.foodGroup && ` · ${GROUP[selected.foodGroup]}`}</p>
            <p style={{ marginTop: '.5rem' }}>
              <NovaChip nova={selected.novaGroup} />
              {selected.nutriScore && <span className="tag">Nutri-Score {selected.nutriScore.toUpperCase()}</span>}
              {selected.verified && <span className="tag">verified</span>}
              <span className="tag">{{ openfoodfacts: 'Open Food Facts', seed: 'Nutri', label: 'from label photo', user: 'community' }[selected.source] || selected.source}</span>
            </p>
            {selected.barcode && <p>Barcode: <code>{selected.barcode}</code></p>}
            <table className="facts">
              <caption>Per {selected.servingSize}{selected.servingUnit}</caption>
              <tbody>
                {[['Calories', selected.calories, 'kcal'], ['Protein', selected.protein, 'g'], ['Carbohydrates', selected.carbs, 'g'],
                  ['  of which sugar', selected.sugar, 'g'], ['Fat', selected.fat, 'g'], ['  of which saturated', selected.saturatedFat, 'g'], ['Fiber', selected.fiber, 'g'],
                  ['Sodium', selected.sodium, 'mg']].map(([k, v, u]) => (
                  <tr key={k}><td>{k}</td><td>{Math.round((v || 0) * 10) / 10} {u}</td></tr>
                ))}
              </tbody>
            </table>
            {selected.ingredients && <><h4>Ingredients</h4><p className="small">{selected.ingredients}</p></>}
            {selected.source === 'openfoodfacts' && selected.barcode && (
              <p className="fineprint">Source: <a href={`https://world.openfoodfacts.org/product/${selected.barcode}`} target="_blank" rel="noreferrer">Open Food Facts</a> (ODbL). Check the package if something looks off.</p>
            )}
            {selected.source === 'usda' && <p className="fineprint">Source: USDA FoodData Central (public domain).</p>}
            {(selected.source === 'user' || selected.source === 'label') && <p className="fineprint">Added by a Nutri user, not verified. Check the package if something looks off.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
