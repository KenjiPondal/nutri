// Import plain/generic foods from USDA FoodData Central (public domain):
//   SR Legacy (~7.8k ingredients: "Beef, top sirloin, cooked") and
//   FNDDS (~5.4k foods "as eaten": "Beef, steak, sirloin, lean only eaten", "Fried rice", "Soy sauce").
// Usage: npm run import:usda --workspace=server   (downloads ~17 MB, cached in ~/.cache/fullcoach)
import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import mongoose from 'mongoose';
import Product from '../models/Product.js';

const SOURCES = [
  { key: 'sr', url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip', root: 'SRLegacyFoods' },
  { key: 'fndds', url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip', root: 'SurveyFoods' }
];
const CACHE = path.join(os.homedir(), '.cache', 'fullcoach');

// USDA nutrient ids -> our fields (amounts are per 100 g)
const N = { kcal: 1008, protein: 1003, carbs: 1005, fat: 1004, sat: 1258, fiber: 1079, sugar: 2000, sodium: 1093,
  vitA: 1106, vitC: 1162, vitD: 1114, calcium: 1087, iron: 1089, potassium: 1092, magnesium: 1090, kj: 1062 };

const has = (s, re) => re.test(s.toLowerCase());

/** Category + name -> our food group. */
function foodGroup(cat, name) {
  const c = cat.toLowerCase(), n = name.toLowerCase();
  if (/juice|nectar/.test(n) && !/vegetable juice|tomato juice/.test(n)) return 'sugary_drink';
  if (/soft drink|fruit drink|sport and energy|lemonade|cola\b/.test(c + ' ' + n) && !/diet/.test(c)) return 'sugary_drink';
  if (/fast food|restaurant|burger|pizza|burrito|taco|nacho|sandwich|nugget|meals, entrees|frozen meal/.test(c + ' ' + n)) return 'prepared_meal';
  if (/sausage|luncheon|frankfurter|bacon|salami|bologna|cold cuts|cured|ham,|ham\b|pepperoni|hot dog/.test(c + ' ' + n)) return 'processed_meat';
  if (/fats and oils|butter and animal|margarine|mayonnaise|salad dressings and vegetable oils/.test(c) || /^(oil|olive oil)\b/.test(n)) return 'oils_fats';
  if (/sweets|candy|cake|cookie|brownie|doughnut|pastr|pie\b|pies|pudding|ice cream|gelatin|sorbet|jams|syrup|sugars and honey|snack|chips|pretzel|popcorn|cereal bar|nutrition bar/.test(c) ||
      /^(cookies?|cakes?|candies|candy|doughnuts?|brownies?|pastr|pies?\b|crackers?, (sweet|graham)|frosting|ice creams?)/.test(n)) return 'sweets_snacks';
  if (/protein and nutritional powder|nutritional beverage/.test(c)) return 'supplement';
  if (/nut and seed|nuts and seeds/.test(c) || /peanut butter/.test(n)) return 'nuts_seeds';
  if (/legume|beans, peas|bean, pea|soy and meat-alternative/.test(c)) return 'legume';
  if (/fruit|apple|banana|berr|citrus|grape|mango|melon|peach|pear|pineapple|strawberr|dried fruit/.test(c)) return 'fruit'; // juices handled above
  if (/vegetable|broccoli|cabbage|carrot|corn|lettuce|onion|spinach|string bean|tomatoes|dark green|red and orange|starchy|potato|coleslaw|olives, pickles/.test(c)) {
    return /fried|french fr|chips/.test(n) ? 'prepared_meal' : 'vegetable';
  }
  if (/egg/.test(c) && /^egg/.test(n)) return 'lean_protein';
  if (/beef|pork|lamb|veal|game|poultry|chicken|turkey|fish|shellfish|seafood|liver|organ/.test(c)) return 'lean_protein';
  if (/dairy|milk|cheese|yogurt|cream/.test(c)) return 'dairy';
  if (/cereal|grain|pasta|noodle|rice|oatmeal|grits|baked products|yeast bread|rolls|tortilla|bagel|biscuit|cracker|pancake/.test(c)) {
    return /whole|brown rice|oat|quinoa|barley|buckwheat|bulgur|millet|wild rice|soba|bran|rye/.test(n) ? 'whole_grain' : 'refined_grain';
  }
  if (/beverage|coffee|tea|water|wine|beer|liquor|diet/.test(c)) return 'drink';
  return 'other';
}

/** Estimated NOVA level (1 unprocessed ... 4 ultra-processed). Heuristic; USDA has no NOVA. */
function nova(group, cat, name) {
  const s = (cat + ' ' + name).toLowerCase();
  if (/fast food|restaurant|frozen|instant|ready-to-eat|candy|cookie|cake|doughnut|chips|soft drink|cola|nugget|frankfurter|bologna|luncheon|margarine|imitation|processed|flavored|(?<!un)sweetened|breaded|pop-?tart|snack|pudding|ice cream|cereal bar/.test(s)) return 4;
  if (['sweets_snacks', 'sugary_drink', 'prepared_meal', 'processed_meat'].includes(group)) return 4;
  if (group === 'oils_fats') return 2;
  if (/fried|mixed dish|dishes|lo\/chow|ramen|dumpling|sushi|casserole|stew|creamed|deviled|benedict|omelet|salad|sandwich|canned|smoked|salted|pickled|cheese|bread|roll|bagel|tortilla|cured|sauce|dressing|soup|gravy|mixed dish|with added/.test(s)) return 3;
  if (group === 'oils_fats' || /^(sugar|honey|salt|flour|butter)\b/.test(name.toLowerCase())) return 2;
  if (['vegetable', 'fruit', 'legume', 'lean_protein', 'nuts_seeds', 'whole_grain', 'refined_grain', 'dairy', 'drink'].includes(group)) return 1;
  return 3;
}

function portionsOf(f) {
  const out = [];
  for (const p of f.foodPortions || []) {
    if (!(p.gramWeight > 0)) continue;
    let label = p.portionDescription;
    if (!label || label === 'Quantity not specified') {
      const unit = p.measureUnit?.name && p.measureUnit.name !== 'undetermined' ? p.measureUnit.name : '';
      label = [p.amount ?? p.value ?? 1, unit, p.modifier && !/^\d+$/.test(p.modifier) ? p.modifier : ''].filter(Boolean).join(' ').trim();
    }
    if (!label || /quantity not specified/i.test(label)) continue;
    if (!out.some(o => o.label === label)) out.push({ label: label.slice(0, 60), grams: Math.round(p.gramWeight * 10) / 10 });
    if (out.length >= 14) break;
  }
  // Most useful portions first: cups/spoons/slices/pieces; odd ones ("1 cubic inch", "guideline amount") last.
  const useful = (l) => (/\b(cup|tbsp|tablespoon|tsp|teaspoon|slice|piece|medium|large|small|steak|breast|fillet|thigh|egg|serving|container|oz)\b/i.test(l) ? 2 : 0)
    - (/cubic|guideline|ns as to|yields|bunch|package|nlea|lb\b/i.test(l) ? 3 : 0);
  return out.sort((a, b) => useful(b.label) - useful(a.label)).slice(0, 8);
}

function toProduct(f, src) {
  const amt = Object.fromEntries((f.foodNutrients || []).filter(n => n.nutrient && n.amount != null).map(n => [n.nutrient.id, n.amount]));
  const kcal = amt[N.kcal] ?? (amt[N.kj] != null ? amt[N.kj] / 4.184 : null);
  if (kcal == null) return null;
  const cat = src === 'sr' ? f.foodCategory?.description || '' : f.wweiaFoodCategory?.wweiaFoodCategoryDescription || '';
  if (/baby|infant|formula|human milk|alaska native/i.test(cat)) return null;
  const group = foodGroup(cat, f.description);
  const r1 = (x) => (x == null ? undefined : Math.round(x * 10) / 10);
  return {
    name: f.description,
    brand: 'Generic',
    servingSize: 100,
    servingUnit: 'g',
    calories: Math.round(kcal),
    protein: r1(amt[N.protein]) ?? 0,
    carbs: r1(amt[N.carbs]) ?? 0,
    fat: r1(amt[N.fat]) ?? 0,
    saturatedFat: r1(amt[N.sat]),
    fiber: r1(amt[N.fiber]) ?? 0,
    sugar: r1(amt[N.sugar]) ?? 0,
    sodium: Math.round(amt[N.sodium] ?? 0),
    micros: { vitaminA: r1(amt[N.vitA]), vitaminC: r1(amt[N.vitC]), vitaminD: r1(amt[N.vitD]), calcium: r1(amt[N.calcium]),
      iron: r1(amt[N.iron]), potassium: r1(amt[N.potassium]), magnesium: r1(amt[N.magnesium]) },
    foodGroup: group,
    novaGroup: nova(group, cat, f.description),
    category: cat,
    portions: portionsOf(f),
    fdcId: f.fdcId,
    verified: true,
    source: 'usda'
  };
}

async function load(src) {
  fs.mkdirSync(CACHE, { recursive: true });
  const zipPath = path.join(CACHE, path.basename(src.url));
  if (!fs.existsSync(zipPath)) {
    console.log(`Downloading ${src.url}`);
    const r = await fetch(src.url);
    if (!r.ok) throw new Error(`Download failed: ${r.status}`);
    fs.writeFileSync(zipPath, Buffer.from(await r.arrayBuffer()));
  }
  const entry = new AdmZip(zipPath).getEntries().find(e => e.entryName.endsWith('.json'));
  return JSON.parse(entry.getData().toString('utf8'))[src.root];
}

export function _internals() { return { foodGroup, nova, portionsOf, toProduct }; }

if (import.meta.url === `file://${process.argv[1]}`) {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fullcoach');
  await Product.syncIndexes();
  let total = 0;
  for (const src of SOURCES) {
    const foods = await load(src);
    const docs = foods.map(f => toProduct(f, src.key)).filter(Boolean);
    for (let i = 0; i < docs.length; i += 1000) {
      const ops = docs.slice(i, i + 1000).map(d => ({ updateOne: { filter: { fdcId: d.fdcId }, update: { $set: d }, upsert: true } }));
      await Product.bulkWrite(ops, { ordered: false });
    }
    console.log(`${src.key}: ${docs.length} foods imported (of ${foods.length})`);
    total += docs.length;
  }
  console.log(`USDA import complete: ${total} foods`);
  await mongoose.disconnect();
}
