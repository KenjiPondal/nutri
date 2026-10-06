// Run the golden set of meal sentences through the rule-based parser and report what fails.
// Usage: node src/utils/parserEval.js [--verbose] [--filter word]   (uses MONGODB_URI or the local DB)
import 'dotenv/config';
import fs from 'fs';
import mongoose from 'mongoose';
import { parseMeal } from '../services/mealParser.js';

const cases = JSON.parse(fs.readFileSync(new URL('../../test/parser.golden.json', import.meta.url)));
const verbose = process.argv.includes('--verbose');
const fi = process.argv.indexOf('--filter'); const filter = fi > 0 ? process.argv[fi + 1] : null;
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fullcoach');
const ctx = { userId: new mongoose.Types.ObjectId(), boost: new Set(), history: [], dishes: [] }; // a brand-new user
const hm = (m) => (m == null ? null : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

let passCases = 0, passItems = 0, totalItems = 0;
for (const c of cases.filter(c => !filter || c.text.includes(filter))) {
  const r = await parseMeal(c.text, ctx.userId, ctx);
  const problems = [];
  if (c.time && hm(r.minutes) !== c.time) problems.push(`time ${hm(r.minutes)} ≠ ${c.time}`);
  if (c.meal && (r.meal || null) !== c.meal && !(c.time && !r.meal)) problems.push(`meal ${r.meal} ≠ ${c.meal}`);
  if (r.items.length !== c.items.length) problems.push(`${r.items.length} items ≠ ${c.items.length}`);
  c.items.forEach((exp, i) => {
    totalItems++;
    const got = r.items[i];
    const name = got?.product?.name || '', brand = got?.product?.brand || '';
    const okName = !exp.match || new RegExp(exp.match).test(name);
    const okBrand = !exp.brand || new RegExp(exp.brand, 'i').test(`${brand} ${name}`);
    const okGrams = got && got.grams >= exp.grams[0] && got.grams <= exp.grams[1];
    if (okName && okBrand && okGrams) passItems++;
    else problems.push(`#${i} "${got?.food}" -> ${name || 'NONE'}${brand && brand !== 'Generic' ? ` [${brand}]` : ''} ${got?.grams}g` +
      `${!okName ? ` (want /${exp.match}/)` : ''}${!okBrand ? ` (want brand ${exp.brand})` : ''}${!okGrams ? ` (want ${exp.grams.join('–')}g)` : ''}`);
  });
  if (!problems.length) passCases++;
  if (problems.length || verbose) console.log(`${problems.length ? 'FAIL' : 'ok  '}  "${c.text}"${problems.map(p => `\n        ${p}`).join('')}`);
}
const n = cases.filter(c => !filter || c.text.includes(filter)).length;
console.log(`\n${passCases}/${n} sentences fully correct · ${passItems}/${totalItems} foods correct`);
await mongoose.disconnect();
