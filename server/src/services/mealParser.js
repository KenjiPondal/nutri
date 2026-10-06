// Natural-language meal parser: "2 eggs, a slice of toast and 30g of almonds at 8am"
// -> [{ query, quantity, unit, grams, product, alternatives }] + time / meal hints.
// Rule-based (no AI): splitting, numbers, units, then ranked food search that prefers foods you've eaten before.
import mongoose from 'mongoose';
import NutritionEntry from '../models/NutritionEntry.js';
import Dish from '../models/Dish.js';
import { searchFoods } from './foodSearch.js';
import Product from '../models/Product.js';
import { searchOff, importFromOff } from './openFoodFacts.js';

const WORD_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  half: 0.5, quarter: 0.25, couple: 2, few: 3, un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, medio: 0.5, media: 0.5 };

// unit -> canonical, plus a default gram weight when the food has no matching household portion
const UNITS = [
  [/^(g|gr|grs|gram|grams|gramos?)$/, 'g', 1],
  [/^(kg|kilos?|kilograms?)$/, 'kg', 1000],
  [/^(ml|milliliters?|millilitres?)$/, 'ml', 1],
  [/^(l|liters?|litres?|litros?)$/, 'l', 1000],
  [/^(oz|ounces?)$/, 'oz', 28.35],
  [/^(lb|lbs|pounds?)$/, 'lb', 453.6],
  [/^(cups?|tazas?)$/, 'cup', 200],
  [/^(tbsp|tablespoons?|cucharadas?)$/, 'tbsp', 15],
  [/^(tsp|teaspoons?|cucharaditas?)$/, 'tsp', 5],
  [/^(slices?|rebanadas?|lonchas?)$/, 'slice', 30],
  [/^(pieces?|pcs?|piezas?|trozos?)$/, 'piece', 100],
  [/^(servings?|portions?|porci[oó]n|porciones)$/, 'serving', 150],
  [/^(bowls?|bol|boles|plates?|platos?)$/, 'bowl', 300],
  [/^(glass(es)?|vasos?)$/, 'glass', 250],
  [/^(cans?|latas?)$/, 'can', 330],
  [/^(handfuls?|pu[nñ]ados?)$/, 'handful', 30],
  [/^(scoops?|cazos?)$/, 'scoop', 30],
  [/^(bars?|barritas?)$/, 'bar', 50]
];
// Typical weight of one unit of common countable foods (when USDA has no portion that fits)
const EACH = [
  [/sauce|dressing|ketchup|mayo/, 30], [/coffee|tea\b|espresso/, 240], [/^chicken$/, 150], [/\begg/, 50], [/banana/, 118], [/apple/, 180], [/orange/, 130], [/avocado/, 150], [/kiwi/, 75], [/peach/, 150],
  [/toast|bread/, 30], [/tortilla|wrap/, 45], [/bagel/, 100], [/croissant/, 60], [/cookie|biscuit/, 15],
  [/chicken breast/, 170], [/steak/, 200], [/burger|hamburger/, 230], [/sausage/, 75], [/fillet|filet/, 150],
  [/potato/, 170], [/tomato/, 120], [/carrot/, 60], [/onion/, 110], [/pizza/, 110], [/yogurt|yoghurt/, 150], [/date/, 8], [/almond/, 1.2]
];
// Typical serving when the person gives no amount ("butter", "a beer"). Checked before generic portions.
const SERVING = [
  [/whey|protein (shake|powder)|evowhey|^protein$/, 30], [/peanut butter|almond butter|nut butter|nutella/, 30],
  [/^butter$/, 10], [/honey|miel|jam|mermelada|syrup/, 20], [/walnut|almond|cashew|pistachio|peanuts|hazelnut|nuts|nueces|frutos secos/, 30], [/parmesan|parmigiano/, 10], [/cheese|queso|feta|mozzarella|cheddar|brie|goat cheese/, 30], [/bacon/, 30], [/olive oil|^oil$/, 10],
  [/beer|cerveza/, 330], [/cola|coke|soda|soft drink/, 330], [/juice|zumo/, 250], [/wine|vino/, 150], [/^milk$/, 200],
  [/chips|crisps/, 30], [/chocolate/, 45], [/cereal/, 40], [/oatmeal|porridge|^oats?$/, 50],
  [/salad|ensalada/, 300], [/tomato sauce|pasta sauce|marinara/, 120], [/soup|sopa/, 300], [/sandwich|bocadillo/, 200],
  [/pizza/, 220], [/sushi/, 200], [/^rice$|arroz/, 180], [/^pasta$|spaghetti/, 200], [/beans|lentils|chickpeas/, 150],
  [/^fries$|french fries/, 120], [/burger/, 230], [/^tea$|green tea|black tea/, 240]
];
// Weight of one unit for specific foods ("1 cup of oats" is 80 g, not 200)
const UNIT_FOR = [
  [/oat|cereal|granola|muesli/, { cup: 80, bowl: 40, scoop: 40 }], [/rice|arroz/, { cup: 160, bowl: 250 }],
  [/pizza/, { slice: 110, piece: 110 }], [/bread|toast|pan\b/, { slice: 30, piece: 30 }], [/cheese|queso/, { slice: 20 }],
  [/sushi/, { piece: 30 }], [/whey|protein/, { scoop: 30 }], [/milk|juice|beer|coffee|tea/, { cup: 240, glass: 250, can: 330 }],
  [/chocolate|bar\b/, { bar: 45, piece: 10 }]
];

const FILLER = /\b(a|an|i|i've|ive|i'd|had|have|ate|eaten|eat|drank|drink|for|some|of|the|my|with|de|del|la|el|los|las|comí|comi|tomé|tome|bebí|un poco|about|around|approx|approximately|like|also|then|plus|today|yesterday)\b/g;
// Spanish -> English for common foods (the food database is English)
const ES = { huevos: 'egg', huevo: 'egg', 'plátano': 'banana', platano: 'banana', manzana: 'apple', naranja: 'orange', pollo: 'chicken',
  'pechuga de pollo': 'chicken breast', picada: 'ground', galletas: 'cookies', galleta: 'cookie', miel: 'honey', picado: 'ground', cerdo: 'pork', salmón: 'salmon', cerveza: 'beer', zumo: 'juice', ensalada: 'salad', pechuga: 'chicken breast', ternera: 'beef', carne: 'beef', cerdo: 'pork', pescado: 'fish', salmón: 'salmon', salmon: 'salmon', 'atún': 'tuna', atun: 'tuna',
  arroz: 'rice', 'arroz integral': 'brown rice', pasta: 'pasta', fideos: 'noodles', pan: 'bread', tostada: 'toast', avena: 'oats', leche: 'milk',
  yogur: 'yogurt', queso: 'cheese', 'aceite de oliva': 'olive oil', aceite: 'olive oil', aguacate: 'avocado', tomate: 'tomato', lechuga: 'lettuce',
  ensalada: 'salad', patata: 'potato', patatas: 'potato', papas: 'potato', 'brócoli': 'broccoli', brocoli: 'broccoli', zanahoria: 'carrot',
  lentejas: 'lentils', garbanzos: 'chickpeas', almendras: 'almonds', nueces: 'walnuts', 'café': 'coffee', cafe: 'coffee', cerveza: 'beer', vino: 'wine', agua: 'water' };
const ES_PHRASES = [[/carne picada (de )?cerdo/, 'ground pork'], [/carne picada (de )?ternera|carne picada/, 'ground beef'],
  [/queso fresco/, 'queso fresco'], [/tostadas?/, 'toast'], [/batido de proteinas?|batido de proteínas?/, 'protein shake']];
export const translate = (food) => {
  let f = food;
  for (const [re, en] of ES_PHRASES) f = f.replace(re, en);
  return ES[f] || f.split(' ').map(w => ES[w] || w).join(' ');
};

// Everyday words -> the plain food people almost always mean (exact USDA/seed names)
const PREFER = [
  [/^eggs?$/, /^(Whole Egg|Egg, whole, raw, fresh)$/], [/^(fried )?eggs?$/, /^Egg, whole, cooked, fried$/],
  [/^(boiled|hard boiled) eggs?$/, /^Egg, whole, cooked, hard-boiled$/], [/^scrambled eggs?$/, /^Egg, whole, cooked, scrambled$/],
  [/^rice$|^white rice$/, /^Rice, white, long-grain, regular, (enriched, )?cooked/], [/^brown rice$/, /^Rice, brown, long-grain, cooked/],
  [/^toasts?$/, /^Bread, white, commercially prepared, toasted$/], [/^bread$/, /^Bread, white wheat$/],
  [/^(whole ?wheat|wholemeal|brown) (bread|toast)$/, /^(Whole Wheat Bread|Bread, whole-wheat, commercially prepared)$/],
  [/^steak$|^beef steak$/, /^Beef, steak, sirloin, lean only eaten$/], [/^chicken$/, /^Chicken Breast \(cooked\)$/],
  [/^milk$/, /^Milk, whole$|^Milk, whole, 3.25% milkfat/], [/^oats?$|^oatmeal$|^porridge$/, /^Rolled Oats$/],
  [/^pasta$|^spaghetti$/, /^Pasta \(cooked\)$/], [/^potato(es)?$/, /^Potatoes, boiled, cooked without skin, flesh, without salt$/],
  [/^coffee$/, /^Coffee, brewed/], [/^salmon$/, /^Salmon \(cooked\)$/], [/^tuna$/, /^Fish, tuna, light, canned in water, drained solids/],
  [/^(greek )?yogh?urt$/, /^Greek Yogurt 2%$/], [/^salmon( fillet| filet| steak)?$/, /^Salmon \(cooked\)$/],
  [/^(whey|whey protein|protein)( shake| powder)?$|^protein shake$/, /^Whey Protein Powder$/], [/^(potato )?(chips|crisps)$/, /^Potato Chips$/],
  [/^beer$/, /^Beer$|^Alcoholic beverage, beer, regular, all$/], [/^(chocolate|chocolate bar)$/, /^Milk Chocolate$/],
  [/^(coke|cola|soda)$/, /^Cola$/], [/^bacon$/, /^Bacon \(cooked\)$/], [/^honey$/, /^Honey$/], [/^(french )?(fries|fry)$/, /^French Fries \(fast food\)$/], [/^parmesan( cheese)?$/, /^Cheese, parmesan, grated$/],
  [/^(cereal|cereals)$/, /^Cereal, corn flakes, plain$/],
  [/^lentils?$/, /^Lentils \(cooked\)$/], [/^(white )?rice cooked$/, /^Rice, white, long-grain, regular, (enriched, )?cooked/], [/^cheese$/, /^Cheese, cheddar, sharp, sliced$/], [/^butter$/, /^Butter, salted$/]
];

const MEAL_WORDS = [[/\bbreakfast|desayun/, 'breakfast'], [/\blunch|almuerzo|comida\b/, 'lunch'], [/\bdinner|supper|cena/, 'dinner'], [/\bsnack|merienda|tentempi/, 'snack']];

export function mealForHour(h) {
  if (h >= 5 && h < 11) return 'breakfast';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 18 && h < 23) return 'dinner';
  return 'snack';
}

/** "8am", "8:30 pm", "13:30", "at 7", "noon", "this morning" -> minutes since midnight */
export function parseTime(text) {
  const t = text.toLowerCase();
  const done = (h, min, ap, match) => {
    if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
    return h < 24 && min < 60 ? { minutes: h * 60 + min, match } : null;
  };
  let m = t.match(/(?:\b(?:at|a las)\s+|@\s*|\b)(\d{1,2})[:.h](\d{2})\s*(am|pm)?\b/);
  if (m) { const r = done(Number(m[1]), Number(m[2]), m[3], m[0]); if (r) return r; }
  m = t.match(/(?:\b(?:at|a las)\s+|\b)(\d{1,2})\s*(am|pm)\b/);
  if (m) { const r = done(Number(m[1]), 0, m[2], m[0]); if (r) return r; }
  m = t.match(/\b(?:at|a las)\s+(\d{1,2})\b(?!\s*(?:g|gr|ml|kg|oz)\b)/);
  if (m && Number(m[1]) < 24) { let h = Number(m[1]); if (h >= 1 && h <= 6) h += 12; return { minutes: h * 60, match: m[0] }; }
  for (const [re, mins] of [[/\bnoon|mediod[ií]a\b/, 720], [/\bmidnight\b/, 0], [/\bthis morning|esta ma[nñ]ana\b/, 480], [/\bthis evening|tonight|esta noche\b/, 1230]]) {
    const x = t.match(re); if (x) return { minutes: mins, match: x[0] };
  }
  return null;
}

const stem = (w) => (w.length <= 3 ? w : w.endsWith('ies') ? w.slice(0, -1) : w.endsWith('oes') ? w.slice(0, -2)
  : w.endsWith('es') && /(ch|sh|x|ss)es$/.test(w) ? w.slice(0, -2) : w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

/** Split free text into food chunks with quantity/unit. Pure function. */
export function splitFoods(text) {
  let t = ` ${text.toLowerCase()} `.replace(/½/g, ' 0.5 ').replace(/¼/g, ' 0.25 ').replace(/(\d),(\d)/g, '$1.$2');
  const time = parseTime(t); if (time) t = t.replace(time.match, ' ');
  let meal = null;
  for (const [re, m] of MEAL_WORDS) if (re.test(t)) { meal = m; t = t.replace(new RegExp(re.source + '\\w*', 'g'), ' '); break; }
  t = t.replace(/\b(in the morning|in the evening|at night|for (a )?snack)\b/g, ' ');
  const parts = t.split(/[\n,;+]|\band\b|\bwith\b|\by\b|\bcon\b|\bplus\b|&/).map(s => s.trim()).filter(Boolean);
  const items = [];
  for (let raw of parts) {
    let s = ` ${raw} `.replace(/\b(\d+(?:\.\d+)?)(g|gr|kg|ml|l|oz|lb)\b/g, '$1 $2');
    let quantity = null, unit = null;
    // "200 g", "1.5 cups", "2 tbsp" anywhere in the phrase (number directly followed by a unit)
    const unitWords = 'g|gr|grs|grams?|gramos?|kg|kilos?|ml|l|liters?|litres?|litros?|oz|ounces?|lb|lbs|pounds?|cups?|tazas?|tbsp|tablespoons?|cucharadas?|tsp|teaspoons?|cucharaditas?|slices?|rebanadas?|lonchas?|pieces?|piezas?|trozos?|servings?|portions?|bowls?|plates?|platos?|glass(?:es)?|vasos?|cans?|latas?|handfuls?|scoops?|cazos?|bars?';
    const nu = s.match(new RegExp(`(?:^|\\s)(\\d+(?:\\.\\d+)?|\\d+/\\d+)\\s+(${unitWords})(?=\\s)`));
    if (nu) {
      quantity = nu[1].includes('/') ? Number(nu[1].split('/')[0]) / Number(nu[1].split('/')[1]) : Number(nu[1]);
      unit = UNITS.find(([re]) => re.test(nu[2]))[1];
      s = s.replace(nu[0], ' ');
    } else {
      const num = s.match(/(?:^|\s)(\d+(?:\.\d+)?|\d+\/\d+)(?=\s)/);
      if (num) { quantity = num[1].includes('/') ? Number(num[1].split('/')[0]) / Number(num[1].split('/')[1]) : Number(num[1]); s = s.replace(num[0], ' '); }
      else {
        const w = s.match(new RegExp(`\\b(${Object.keys(WORD_NUM).join('|')})\\b`));
        if (w) { quantity = WORD_NUM[w[1]]; s = s.replace(w[0], ' '); }
      }
    }
    const words = s.split(/\s+/).filter(Boolean);
    if (!unit) {
      const ui = words.findIndex(w => UNITS.some(([re]) => re.test(w)));
      if (ui !== -1 && ui <= 1) { unit = UNITS.find(([re]) => re.test(words[ui]))[1]; words.splice(ui, 1); }
    }
    // "hsn brand", "brand hsn", "marca hsn", "from hsn" -> brand
    let brand = null, rest = words.join(' ');
    const bm = rest.match(/\b(?:brand|marca|by|from|de la marca)\s+([\p{L}\p{N}'&!.-]+)/u) || rest.match(/\b([\p{L}\p{N}'&!.-]+)\s+(?:brand|marca)\b/u);
    if (bm) { brand = bm[1]; rest = rest.replace(bm[0], ' '); }
    const food = rest.replace(FILLER, ' ').replace(/[^\p{L}\p{N}\s%-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (food.length < 2) continue;
    items.push({ text: raw.trim(), food, brand, quantity, unit });
  }
  return { items: items.slice(0, 20), minutes: time?.minutes ?? null, meal };
}

/** Grams for a parsed item and chosen product. */
export function gramsFor(item, product) {
  const q = item.quantity ?? 1;
  const u = UNITS.find(([, c]) => c === item.unit);
  if (['g', 'kg', 'ml', 'l', 'oz', 'lb'].includes(item.unit)) return { grams: q * u[2], portion: null };
  const portions = (product?.portions || []).filter(p => p.grams > 0 && /[a-z]/i.test(p.label));
  const find = (re) => portions.find(p => re.test(p.label));
  const foodEn = translate(item.food);
  if (item.unit) {
    const special = UNIT_FOR.find(([re, units]) => re.test(foodEn) && units[item.unit]);
    if (special) return { grams: q * special[1][item.unit], portion: `${+q.toFixed(2)} ${item.unit}` };
    const p = find(new RegExp(`\\b${item.unit}`, 'i')) || (item.unit === 'slice' && find(/slice/i));
    if (p) return { grams: q * p.grams, portion: `${q === 1 ? '' : `${+q.toFixed(2)} × `}${p.label}` };
    return { grams: q * u[2], portion: `${+q.toFixed(2)} ${item.unit}` };
  }
  if (item.quantity == null) {
    // "rice", "a steak" without a number: one typical serving
    const serving = SERVING.find(([re]) => re.test(foodEn));
    if (serving) return { grams: serving[1], portion: null };
    const each = EACH.find(([re]) => re.test(translate(item.food)));
    if (each) return { grams: each[1], portion: '1' };
    const p = find(/\b(1 serving|1 cup|1 medium|1 steak|1 breast|1 fillet)/i);
    if (p && p.grams >= 40 && p.grams <= 400) return { grams: p.grams, portion: p.label };
    return { grams: 100, portion: null };
  }
  // Counted items: "2 eggs", "3 cookies", "2 beers"
  const serving1 = SERVING.find(([re]) => re.test(foodEn)) ;
  if (serving1 && !EACH.some(([re]) => re.test(foodEn))) return { grams: q * serving1[1], portion: `${+q.toFixed(2)} × serving` };
  const each = EACH.find(([re]) => re.test(translate(item.food)));
  const p = find(/\b(1 )?(medium|large|whole|egg|slice|piece|breast|steak|fillet|cookie|item)\b/i);
  const g = each ? each[1] : p && p.grams <= 400 ? p.grams : 100;
  return { grams: q * g, portion: `${+q.toFixed(2)} × ${each ? 'item' : p?.label || '100 g'}` };
}

const tokens = (s) => translate(String(s || '').toLowerCase()).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .split(/[^a-z0-9]+/).filter(w => w.length > 1 && !/^(of|the|and|with|de|la|el|raw|g|ml)$/.test(w)).map(stem);
const LEAN = 'name brand servingSize servingUnit calories protein carbs fat fiber sugar saturatedFat sodium foodGroup novaGroup portions barcode source';

/** Everything matching needs about a user: foods they've logged, their saved meals. */
export async function loadParseContext(userId) {
  const uid = new mongoose.Types.ObjectId(String(userId));
  const [usedIds, dishes] = await Promise.all([
    NutritionEntry.distinct('product', { user: uid, product: { $ne: null }, date: { $gte: new Date(Date.now() - 180 * 86400000) } }),
    Dish.find({ user: uid }, 'name portions').lean()
  ]);
  const history = await Product.find({ _id: { $in: usedIds } }, LEAN).lean();
  const own = await Product.find({ createdBy: uid }, LEAN).lean();
  const seen = new Set(); const mine = [...history, ...own].filter(p => !seen.has(String(p._id)) && seen.add(String(p._id)));
  return { userId, boost: new Set(usedIds.map(String)), history: mine, dishes };
}

/**
 * Candidate products for one food mention, best first:
 * your own history (word overlap on name + brand), the local database, and Open Food Facts when a brand is named.
 */
export async function candidatesFor({ food, brand }, ctx, { external = true } = {}) {
  const want = tokens(`${food} ${brand || ''}`);
  const scored = ctx.history.map(p => {
    const have = new Set(tokens(`${p.name} ${p.brand || ''}`));
    const hit = want.filter(w => have.has(w) || (w.length >= 4 && [...have].some(h => h.length >= 4 && (h.startsWith(w) || w.startsWith(h))))).length;
    const brandHit = brand && tokens(brand).some(b => tokens(p.brand || p.name).includes(b));
    return [hit / Math.max(1, want.length) + (brandHit ? 0.5 : 0), p];
  }).filter(([s]) => s >= 0.5).sort((a, b) => b[0] - a[0]).map(([, p]) => p);

  const DESCRIPTORS = /\b(fillet|filet|fillets|piece|pieces|portion|bar|homemade|casero|plain|stir[ -]?fry|stir[ -]?fried|salteado|grilled|a la plancha)\b/g;
  const q = translate(food).replace(DESCRIPTORS, ' ').trim().split(/\s+/).map(stem).join(' ') || translate(food);
  const local = await searchFoods(q, ctx.userId, { boost: ctx.boost, limit: 6 });
  const pref = PREFER.find(([re]) => re.test(translate(food)));
  if (pref) { const best = await Product.findOne({ name: pref[1] }, LEAN).lean(); if (best) local.unshift(best); }
  let branded = [];
  if (brand) {
    branded = await searchFoods(`${brand} ${q}`, ctx.userId, { boost: ctx.boost, limit: 4 });
    if (external) branded = [...branded, ...(await searchOff(`${brand} ${translate(food)}`, 5))];
    const bt = tokens(brand);
    const keep = (list) => list.filter(p => bt.some(b => tokens(`${p.brand || ''} ${p.name}`).includes(b)));
    branded = keep(branded);
    if (!branded.length && external) branded = keep(await searchOff(brand, 10));   // e.g. "hsn" alone
  }
  let offGeneric = [];
  const head = stem(translate(food).split(' ').at(-1) || '');
  if (external && !brand && !pref && !scored.length && (!local.length || !tokens(local[0].name).some(t => t.startsWith(head) || head.startsWith(t)))) {
    offGeneric = await searchOff(translate(food), 5);                                 // "hsn evowhey": not in the local DB
  }
  const out = [], ids = new Set();
  for (const p of [...scored.slice(0, 3), ...branded, ...local, ...offGeneric]) {
    const id = p._id ? String(p._id) : `off:${p.barcode}`;
    if (!ids.has(id)) { ids.add(id); out.push(p); }
  }
  return out.slice(0, 8);
}

/** Make sure a chosen Open Food Facts result is saved locally (so it has an _id). */
export async function materialize(p) {
  if (!p || p._id || !p.barcode) return p;
  const saved = await importFromOff(p.barcode);
  return saved ? saved.toObject?.() ?? saved : null;
}

export function findDish(food, ctx) {
  const f = food.toLowerCase();
  return ctx.dishes.find(d => { const n = d.name.toLowerCase(); return n.length > 2 && (f.includes(n) || n.includes(f)); });
}

/** Rule-based parse (also the fallback when AI is unavailable). */
export async function parseMeal(text, userId, ctx) {
  ctx ||= await loadParseContext(userId);
  const { items, minutes, meal } = splitFoods(String(text).slice(0, 1000));
  const out = [];
  for (const it of items) {
    const dish = findDish(it.food, ctx);
    if (dish) { out.push({ ...it, kind: 'dish', dish: { _id: dish._id, name: dish.name }, portions: it.quantity || 1 }); continue; }
    const cands = await candidatesFor(it, ctx);
    const product = await materialize(cands[0]) || null;
    const { grams, portion } = gramsFor(it, product);
    out.push({ ...it, kind: 'food', product, alternatives: cands.slice(1), grams: Math.round(grams * 10) / 10, portion });
  }
  return { items: out, minutes, meal, engine: 'rules' };
}
