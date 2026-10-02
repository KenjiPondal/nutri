import express from 'express';
import Product from '../models/Product.js';
import { auth } from '../middleware/auth.js';
import { groupFromOffTags, FOOD_GROUP_KEYS } from '../utils/foodQuality.js';

const router = express.Router();
const OFF = 'https://world.openfoodfacts.org';
const UA = { 'User-Agent': 'Nutri/0.1-alpha (nutrition coaching app)' };
const OFF_FIELDS = 'code,product_name,product_name_en,brands,nutriments,nova_group,nutriscore_grade,categories_tags,categories,ingredients_text,ingredients_text_en';

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));
const mg = (g) => (num(g) == null ? undefined : +(Number(g) * 1000).toFixed(2));
const ug = (g) => (num(g) == null ? undefined : +(Number(g) * 1e6).toFixed(2));

/** Open Food Facts product -> our Product fields (per 100 g). */
function fromOff(p) {
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

async function importFromOff(barcode) {
  try {
    const data = await offFetch(`${OFF}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}`);
    if (data.status !== 1 || !data.product) return null;
    const doc = fromOff({ ...data.product, code: barcode });
    return await Product.findOneAndUpdate({ barcode }, { $setOnInsert: doc }, { upsert: true, new: true });
  } catch {
    return null;
  }
}

router.get('/barcode/:code', auth, async (req, res) => {
  const code = req.params.code.trim();
  if (!/^\d{6,14}$/.test(code)) return res.status(400).json({ message: 'Invalid barcode' });
  const product = (await Product.findOne({ barcode: code })) || (await importFromOff(code));
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
});

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Relevance for plain-food search: simple, whole foods whose main noun is the query win. */
function rank(p, words, userId, headNoun = false) {
  const name = p.name.toLowerCase();
  const segs = name.split(',').map(x => x.trim());
  let score = 0;
  words.forEach((w, i) => {
    // In "wheat noodles" the last word is the food; weigh it double when not every word can match.
    const k = headNoun && i === words.length - 1 ? 2 : 1;
    if (segs[0] === w || segs[1] === w) score += 4 * k;              // "Rice, white…", "Beef, steak, …"
    else if (segs.slice(0, 2).some(sg => sg.split(/[\s-]/).includes(w))) score += 2 * k;
    else if (name.includes(w)) score += 0.5 * k;
  });
  if (/\b(raw|cooked|boiled|whole|plain|fresh|grilled|baked|roasted)\b/.test(name)) score += 1.5;   // plain preparations
  if (name.startsWith(words[0])) score += 1.5;
  score += ({ 1: 3, 2: 1, 3: 0, 4: -3 })[p.novaGroup] ?? 0;          // plain foods first
  if (String(p.createdBy) === String(userId)) score += 6;           // your own products
  score += Math.min(6, Math.log2((p.useCount || 0) + 1) * 2);       // frequently logged
  if (p.source === 'seed') score += 2;
  if (/^[^a-z,]{3,},/.test(p.name)) score -= 5;                       // "T.G.I. FRIDAY'S, ...", "DENNY'S, ..."
  if (/fast foods?|restaurant|school lunch|\bnfs\b|ns as to|babyfood/i.test(p.name)) score -= 2;
  score -= name.length / 30;
  return score;
}

// Local search: every query word must prefix-match a word of the name (or brand). Results are ranked.
router.get('/', auth, async (req, res) => {
  const q = String(req.query.search || '').trim().slice(0, 80);
  if (!q) {
    // No query: the user's most-used foods, then recently added
    const recent = await Product.find({ useCount: { $gt: 0 } }).sort({ useCount: -1 }).limit(20);
    return res.json(recent.length ? recent : await Product.find({ source: 'seed' }).sort({ name: 1 }).limit(30));
  }
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const res_ = words.map(w => new RegExp(`(^|[\\s,(-])${escapeRe(w)}`, 'i'));
  const match = (list) => list.map(re => ({ $or: [{ name: re }, { brand: re }] }));
  let candidates = await Product.find({ $and: match(res_) }).limit(500).lean();
  // Nothing matches every word ("wheat noodles")? Fall back to any word; ranking puts the best overlap first.
  let fallback = false;
  if (!candidates.length && words.length > 1) { fallback = true; candidates = await Product.find({ $or: match(res_) }).limit(800).lean(); }
  const seen = new Set();
  const ranked = candidates.map(p => [rank(p, words, req.user.id, fallback), p]).sort((a, b) => b[0] - a[0])
    .map(([, p]) => p).filter(p => !seen.has(p.name.toLowerCase()) && seen.add(p.name.toLowerCase())).slice(0, 30);
  res.json(ranked);
});

// Branded products from Open Food Facts (separate request so local results render instantly).
// Results are not saved until the user picks one (GET /barcode/:code imports it).
router.get('/external', auth, async (req, res) => {
  const q = String(req.query.search || '').trim().slice(0, 80);
  if (q.length < 3) return res.json([]);
  try {
    let products;
    try {
      const d = await offFetch(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=15&fields=${OFF_FIELDS}`);
      products = d.hits || [];
    } catch {
      const d = await offFetch(`${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=15&sort_by=unique_scans_n&fields=${OFF_FIELDS}`);
      products = d.products || [];
    }
    const d = { products };
    const codes = (d.products || []).map(p => p.code).filter(Boolean);
    const have = new Set((await Product.find({ barcode: { $in: codes } }, 'barcode').lean()).map(p => p.barcode));
    res.json((d.products || [])
      .filter(p => p.code && (p.product_name || p.product_name_en) && p.nutriments?.['energy-kcal_100g'] != null)
      .slice(0, 10).map(p => ({ ...fromOff(p), external: true, cached: have.has(p.code) })));
  } catch {
    res.json([]); // OFF down/slow
  }
});

const ALLOWED = ['name', 'brand', 'barcode', 'servingSize', 'servingUnit', 'calories', 'protein', 'carbs', 'fat', 'saturatedFat',
  'fiber', 'sugar', 'sodium', 'micros', 'foodGroup', 'novaGroup', 'ingredients', 'category', 'portions'];

router.post('/', auth, async (req, res) => {
  try {
    const data = Object.fromEntries(ALLOWED.filter(k => req.body[k] !== undefined && req.body[k] !== '').map(k => [k, req.body[k]]));
    if (data.foodGroup && !FOOD_GROUP_KEYS.includes(data.foodGroup)) delete data.foodGroup;
    if (data.barcode && !/^\d{6,14}$/.test(String(data.barcode))) return res.status(400).json({ message: 'Invalid barcode' });
    const source = req.body.fromLabel ? 'label' : 'user'; // users can never mark products verified
    const product = await Product.create({ ...data, source, createdBy: req.user.id });
    res.status(201).json(product);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'A product with this barcode already exists' });
    res.status(400).json({ message: err.message });
  }
});

export default router;
