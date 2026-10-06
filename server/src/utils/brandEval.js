// Bulk brand test: build sentences from real branded products and check the parser lands on that brand/product.
// Usage: node src/utils/brandEval.js [perBrand=6] [--verbose]
// Products come from Open Food Facts (the same source the app uses for brands). Uses the local DB as a new user.
import 'dotenv/config';
import mongoose from 'mongoose';
import { parseMeal } from '../services/mealParser.js';

const BRANDS = ['Hacendado', 'HSN', 'Danone', 'Pascual', 'Central Lechera Asturiana', 'Bimbo', 'Kellogg\'s', 'Nestlé',
  'Gallo', 'Calvo', 'Campofrío', 'ElPozo', 'Alpro', 'Activia', 'Oreo', 'Coca-Cola', 'Nutella', 'Barilla', 'Myprotein', 'Lindt'];
const perBrand = Number(process.argv[2]) || 6;
const verbose = process.argv.includes('--verbose');
const UA = { 'User-Agent': 'Nutri/0.1-alpha (brand eval)' };

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const toks = (s) => norm(s).split(/[^a-z0-9]+/).filter(w => w.length > 2);
const short = (name, brand) => {
  const b = new Set(toks(brand));
  return toks(name).filter(w => !b.has(w) && !/^\d+$/.test(w)).slice(0, 3).join(' ');
};

async function productsFor(brand) {
  const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(`brands:"${brand}"`)}&page_size=40&fields=code,product_name,brands,nutriments`;
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10000) });
    const d = await r.json();
    return (d.hits || []).filter(h => h.code && h.product_name && h.nutriments?.['energy-kcal_100g'] != null && short(h.product_name, brand).length >= 3)
      .slice(0, perBrand).map(h => ({ code: h.code, name: h.product_name, brand }));
  } catch { return []; }
}

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fullcoach');
const ctx = { userId: new mongoose.Types.ObjectId(), boost: new Set(), history: [], dishes: [] };
const templates = [
  (n, b) => `150g ${n} ${b}`,
  (n, b) => `${b} ${n}`,
  (n, b) => `${n} from ${b}`,
  (n, b) => `${n} marca ${b}`
];
const stats = { total: 0, exact: 0, brand: 0, none: 0 };
const byBrand = {};
const fails = [];
for (const brand of BRANDS) {
  const prods = await productsFor(brand);
  byBrand[brand] = { n: 0, ok: 0, products: prods.length };
  const codes = new Set(prods.map(x => x.code));
  for (const p of prods) {
    const n = short(p.name, brand);
    for (const t of templates) {
      const text = t(n, brand.toLowerCase());
      const r = await parseMeal(text, ctx.userId, ctx);
      const got = r.items[0]?.product;
      const brandOk = got && (toks(`${got.brand} ${got.name}`).some(w => toks(brand).includes(w)) || codes.has(got.barcode));
      const exact = got?.barcode === p.code;
      stats.total++; byBrand[brand].n++;
      if (exact) stats.exact++;
      if (brandOk) { stats.brand++; byBrand[brand].ok++; }
      if (!got) stats.none++;
      if (!brandOk) fails.push(`"${text}" -> ${got ? `${got.name} [${got.brand}]` : 'NONE'}  (want ${p.name} [${brand}])`);
      if (verbose) console.log(`${brandOk ? 'ok  ' : 'FAIL'} ${exact ? '=' : ' '} "${text}" -> ${got?.name} [${got?.brand}]`);
    }
  }
}
console.log('\nPer brand (right brand / tries):');
for (const [b, v] of Object.entries(byBrand)) console.log(`  ${b.padEnd(26)} ${v.ok}/${v.n}${v.products ? '' : '  (no products fetched)'}`);
console.log(`\nFailures (first 40):\n  ${fails.slice(0, 40).join('\n  ')}`);
const pct = (x) => `${Math.round((x / stats.total) * 100)}%`;
console.log(`\n${stats.total} sentences · right brand ${stats.brand} (${pct(stats.brand)}) · exact product ${stats.exact} (${pct(stats.exact)}) · nothing found ${stats.none}`);
await mongoose.disconnect();
