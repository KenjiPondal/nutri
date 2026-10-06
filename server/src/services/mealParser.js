// Natural-language meal parser: "2 eggs, a slice of toast and 30g of almonds at 8am"
// -> [{ query, quantity, unit, grams, product, alternatives }] + time / meal hints.
// Rule-based (no AI): splitting, numbers, units, then ranked food search that prefers foods you've eaten before.
import mongoose from 'mongoose';
import NutritionEntry from '../models/NutritionEntry.js';
import Dish from '../models/Dish.js';
import { searchFoods } from './foodSearch.js';
import Product from '../models/Product.js';

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
const FILLER = /\b(a|an|i|i've|ive|i'd|had|have|ate|eaten|eat|drank|drink|for|some|of|the|my|with|de|del|la|el|los|las|comí|comi|tomé|tome|bebí|un poco|about|around|approx|approximately|like|also|then|plus|today|yesterday)\b/g;
// Spanish -> English for common foods (the food database is English)
const ES = { huevos: 'egg', huevo: 'egg', 'plátano': 'banana', platano: 'banana', manzana: 'apple', naranja: 'orange', pollo: 'chicken',
  'pechuga de pollo': 'chicken breast', pechuga: 'chicken breast', ternera: 'beef', carne: 'beef', cerdo: 'pork', pescado: 'fish', salmón: 'salmon', salmon: 'salmon', 'atún': 'tuna', atun: 'tuna',
  arroz: 'rice', 'arroz integral': 'brown rice', pasta: 'pasta', fideos: 'noodles', pan: 'bread', tostada: 'toast', avena: 'oats', leche: 'milk',
  yogur: 'yogurt', queso: 'cheese', 'aceite de oliva': 'olive oil', aceite: 'olive oil', aguacate: 'avocado', tomate: 'tomato', lechuga: 'lettuce',
  ensalada: 'salad', patata: 'potato', patatas: 'potato', papas: 'potato', 'brócoli': 'broccoli', brocoli: 'broccoli', zanahoria: 'carrot',
  lentejas: 'lentils', garbanzos: 'chickpeas', almendras: 'almonds', nueces: 'walnuts', 'café': 'coffee', cafe: 'coffee', cerveza: 'beer', vino: 'wine', agua: 'water' };
const translate = (food) => ES[food] || food.split(' ').map(w => ES[w] || w).join(' ');

// Everyday words -> the plain food people almost always mean (exact USDA/seed names)
const PREFER = [
  [/^eggs?$/, /^(Whole Egg|Egg, whole, raw, fresh)$/], [/^(fried )?eggs?$/, /^Egg, whole, cooked, fried$/],
  [/^(boiled|hard boiled) eggs?$/, /^Egg, whole, cooked, hard-boiled$/], [/^scrambled eggs?$/, /^Egg, whole, cooked, scrambled$/],
  [/^rice$|^white rice$/, /^Rice, white, long-grain, regular, (enriched, )?cooked/], [/^brown rice$/, /^Rice, brown, long-grain, cooked/],
  [/^toast$/, /^Bread, white, commercially prepared, toasted$/], [/^bread$/, /^Bread, white wheat$/],
  [/^(whole ?wheat|wholemeal|brown) (bread|toast)$/, /^(Whole Wheat Bread|Bread, whole-wheat, commercially prepared)$/],
  [/^steak$|^beef steak$/, /^Beef, steak, sirloin, lean only eaten$/], [/^chicken$/, /^Chicken Breast \(cooked\)$/],
  [/^milk$/, /^Milk, whole$|^Milk, whole, 3.25% milkfat/], [/^oats?$|^oatmeal$|^porridge$/, /^Rolled Oats$/],
  [/^pasta$|^spaghetti$/, /^Pasta \(cooked\)$/], [/^potato(es)?$/, /^Potatoes, boiled, cooked without skin, flesh, without salt$/],
  [/^coffee$/, /^Coffee, brewed/], [/^salmon$/, /^Salmon \(cooked\)$/], [/^tuna$/, /^Fish, tuna, light, canned in water, drained solids/],
  [/^(greek )?yogh?urt$/, /^Greek Yogurt 2%$/], [/^cheese$/, /^Cheese, cheddar, sharp, sliced$/], [/^butter$/, /^Butter, salted$/]
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

const stem = (w) => (w.length <= 3 ? w : w.endsWith('ies') ? w.slice(0, -3) : w.endsWith('oes') ? w.slice(0, -2)
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
    const num = s.match(/(?:^|\s)(\d+(?:\.\d+)?|\d+\/\d+)(?=\s)/);
    if (num) { quantity = num[1].includes('/') ? Number(num[1].split('/')[0]) / Number(num[1].split('/')[1]) : Number(num[1]); s = s.replace(num[0], ' '); }
    else {
      const w = s.match(new RegExp(`\\b(${Object.keys(WORD_NUM).join('|')})\\b`));
      if (w) { quantity = WORD_NUM[w[1]]; s = s.replace(w[0], ' '); }
    }
    const words = s.split(/\s+/).filter(Boolean);
    const ui = words.findIndex(w => UNITS.some(([re]) => re.test(w)));
    if (ui !== -1 && ui <= 1) { unit = UNITS.find(([re]) => re.test(words[ui]))[1]; words.splice(ui, 1); }
    const food = words.join(' ').replace(FILLER, ' ').replace(/[^\p{L}\p{N}\s%-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (food.length < 2) continue;
    items.push({ text: raw.trim(), food, quantity, unit });
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
  if (item.unit) {
    const p = find(new RegExp(`\\b${item.unit}`, 'i')) || (item.unit === 'slice' && find(/slice/i));
    if (p) return { grams: q * p.grams, portion: `${q === 1 ? '' : `${+q.toFixed(2)} × `}${p.label}` };
    return { grams: q * u[2], portion: `${+q.toFixed(2)} ${item.unit}` };
  }
  if (item.quantity == null) {
    // "rice", "a steak" without a number: one typical serving
    const each = EACH.find(([re]) => re.test(translate(item.food)));
    if (each) return { grams: each[1], portion: '1' };
    const p = find(/\b(1 serving|1 cup|1 medium|1 steak|1 breast|1 fillet)/i);
    if (p && p.grams >= 40 && p.grams <= 400) return { grams: p.grams, portion: p.label };
    return { grams: 100, portion: null };
  }
  // Counted items: "2 eggs", "3 cookies"
  const each = EACH.find(([re]) => re.test(translate(item.food)));
  const p = find(/\b(1 )?(medium|large|whole|egg|slice|piece|breast|steak|fillet|cookie|item)\b/i);
  const g = each ? each[1] : p && p.grams <= 400 ? p.grams : 100;
  return { grams: q * g, portion: `${+q.toFixed(2)} × ${each ? 'item' : p?.label || '100 g'}` };
}

/** Full parse: split, then match each item against your saved meals and the food database. */
export async function parseMeal(text, userId) {
  const { items, minutes, meal } = splitFoods(String(text).slice(0, 1000));
  const uid = new mongoose.Types.ObjectId(String(userId));
  const [usedIds, dishes] = await Promise.all([
    NutritionEntry.distinct('product', { user: uid, product: { $ne: null }, date: { $gte: new Date(Date.now() - 120 * 86400000) } }),
    Dish.find({ user: uid }, 'name portions').lean()
  ]);
  const boost = new Set(usedIds.map(String));
  const out = [];
  for (const it of items) {
    // A saved meal named like this? ("my yakisoba prep")
    const dish = dishes.find(d => { const n = d.name.toLowerCase(); return n.length > 2 && (it.food.includes(n) || n.includes(it.food)); });
    if (dish) { out.push({ ...it, kind: 'dish', dish: { _id: dish._id, name: dish.name }, portions: it.quantity || 1 }); continue; }
    const food = translate(it.food);
    const q = food.split(' ').map(stem).join(' ');
    let found = await searchFoods(q, userId, { boost, limit: 5 });
    const pref = PREFER.find(([re]) => re.test(food));
    // Something you've logged before always wins; otherwise use the everyday default
    if (pref && !(found[0] && boost.has(String(found[0]._id)))) {
      const best = await Product.findOne({ name: pref[1] }).lean();
      if (best) found = [best, ...found.filter(f => String(f._id) !== String(best._id))];
    }
    const product = found[0] || null;
    const { grams, portion } = gramsFor(it, product);
    out.push({ ...it, kind: 'food', product, alternatives: found.slice(1), grams: Math.round(grams * 10) / 10, portion });
  }
  return { items: out, minutes, meal };
}
