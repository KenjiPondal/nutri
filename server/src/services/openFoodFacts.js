// Open Food Facts: branded products (ODbL). Lookups send only the search text / barcode.
import Product from '../models/Product.js';
import { groupFromOffTags } from '../utils/foodQuality.js';

const OFF = 'https://world.openfoodfacts.org';
const UA = { 'User-Agent': 'Nutri/0.1-alpha (nutrition coaching app)' };
const OFF_FIELDS = 'code,product_name,product_name_en,brands,nutriments,nova_group,nutriscore_grade,categories_tags,categories,ingredients_text,ingredients_text_en';

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));
const mg = (g) => (num(g) == null ? undefined : +(Number(g) * 1000).toFixed(2));
const ug = (g) => (num(g) == null ? undefined : +(Number(g) * 1e6).toFixed(2));

/** Open Food Facts product -> our Product fields (per 100 g). */
export function fromOff(p) {
  const n = p.nutriments || {};
  const kcal = num(n['energy-kcal_100g']) ?? (num(n.energy_100g) != null ? Math.round(n.energy_100g / 4.184) : 0);
  return {
    name: p.product_name_en || p.product_name || 'Unknown product',
    brand: (Array.isArray(p.brands) ? p.brands.at(-1) : p.brands?.split(',')[0])?.trim(),
    barcode: p.code,
    servingSize: 100,
    servingUnit: 'g',
    calories: kcal,
    protein: num(n.proteins_100g) ?? 0,
    carbs: num(n.carbohydrates_100g) ?? 0,
    fat: num(n.fat_100g) ?? 0,
    saturatedFat: num(n['saturated-fat_100g']),
    fiber: num(n.fiber_100g) ?? 0,
    sugar: num(n.sugars_100g) ?? 0,
    sodium: mg(n.sodium_100g) ?? (num(n.salt_100g) != null ? +(n.salt_100g * 400).toFixed(0) : 0),
    micros: {
      vitaminA: ug(n['vitamin-a_100g']), vitaminC: mg(n['vitamin-c_100g']), vitaminD: ug(n['vitamin-d_100g']),
      calcium: mg(n.calcium_100g), iron: mg(n.iron_100g), potassium: mg(n.potassium_100g), magnesium: mg(n.magnesium_100g)
    },
    foodGroup: groupFromOffTags(p.categories_tags || []),
    novaGroup: num(p.nova_group),
    nutriScore: /^[a-e]$/.test(p.nutriscore_grade || '') ? p.nutriscore_grade : undefined,
    ingredients: p.ingredients_text_en || p.ingredients_text,
    category: typeof p.categories === 'string' ? p.categories.split(',').pop()?.trim() : undefined,
    source: 'openfoodfacts'
  };
}

async function offFetch(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`OFF ${r.status}`);
  return r.json();
}

export async function importFromOff(barcode) {
  try {
    const data = await offFetch(`${OFF}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}`);
    if (data.status !== 1 || !data.product) return null;
    const doc = fromOff({ ...data.product, code: barcode });
    return await Product.findOneAndUpdate({ barcode }, { $setOnInsert: doc }, { upsert: true, new: true });
  } catch {
    return null;
  }
}


/** Search branded products. Not saved until picked (importFromOff). */
export async function searchOff(q, limit = 10) {
  try {
    let products;
    try {
      const d = await offFetch(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=15&fields=${OFF_FIELDS}`);
      products = d.hits || [];
    } catch {
      const d = await offFetch(`${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=15&sort_by=unique_scans_n&fields=${OFF_FIELDS}`);
      products = d.products || [];
    }
    const codes = products.map(p => p.code).filter(Boolean);
    const have = new Set((await Product.find({ barcode: { $in: codes } }, 'barcode').lean()).map(p => p.barcode));
    return products.filter(p => p.code && (p.product_name || p.product_name_en) && p.nutriments?.['energy-kcal_100g'] != null)
      .slice(0, limit).map(p => ({ ...fromOff(p), external: true, cached: have.has(p.code) }));
  } catch { return []; }
}
