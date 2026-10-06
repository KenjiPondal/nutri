// AI meal understanding (Google Gemini). Two small calls:
//  1) extract: free text -> [{ food (generic English), brand, quantity, unit, grams estimate }], time, meal
//  2) choose:  for each item, pick the best candidate from OUR database / Open Food Facts and the grams
// Nutrition numbers always come from the database, never from the model.
// Only the meal text and candidate names are sent to Google; nothing about the user.
import { loadParseContext, candidatesFor, materialize, findDish, gramsFor } from './mealParser.js';

const MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
export const aiEnabled = () => Boolean(process.env.GEMINI_API_KEY);

async function gemini(prompt) {
  const base = process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com';
  const url = `${base}/v1beta/models/${MODEL()}:generateContent`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' }
    }),
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  const txt = d.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  return JSON.parse(txt.replace(/^```(json)?|```$/g, '').trim());
}

const EXTRACT = (text, dishNames) => `You turn a person's description of what they ate into structured data.
Text (any language): """${text}"""
Their saved meals (match one if the text clearly refers to it): ${JSON.stringify(dishNames)}
Return JSON: {"time":"HH:MM" or null (24h, only if a time is stated or clearly implied),"meal":"breakfast"|"lunch"|"dinner"|"snack"|null,
"items":[{"original":"the words used","food":"short generic food name in English, e.g. 'ground pork', 'whey protein shake', 'white rice cooked'",
"brand":"brand name or null","dish":"exact saved meal name or null","quantity":number or null,"unit":"g"|"ml"|"cup"|"tbsp"|"tsp"|"slice"|"piece"|"scoop"|"serving"|"can"|"bowl"|"glass"|null,
"grams":best estimate of grams/ml eaten (number)}]}
Rules: one item per distinct food; sauces/oils/drinks are separate items; keep brand separate from food; estimate realistic portions when no amount is given.`;

const CHOOSE = (items) => `Pick the database product that best matches each food a person ate, and the amount in grams.
${items.map((it, i) => `Item ${i}: "${it.original}" (food: ${it.food}${it.brand ? `, brand: ${it.brand}` : ''}, estimated ${it.grams} g)
${it.cands.map((c, j) => `  [${j}] ${c.name}${c.brand && c.brand !== 'Generic' ? ` | brand ${c.brand}` : ''} | ${Math.round(c.calories)} kcal per ${c.servingSize || 100}${c.servingUnit || 'g'}${c.portions?.length ? ` | portions: ${c.portions.slice(0, 4).map(p => `${p.label}=${p.grams}g`).join('; ')}` : ''}${c.mine ? ' | LOGGED BEFORE BY THIS USER' : ''}`).join('\n') || '  (no candidates)'}`).join('\n\n')}

Return JSON {"choices":[{"item":index,"candidate":index or -1 if none is a reasonable match,"grams":number}]}.
Prefer: same brand when a brand is named; products the user LOGGED BEFORE when they match; plain/raw forms over prepared dishes unless described;
correct food type over wording similarity. For grams use the stated amount, converting units with the portions listed; for scoops of protein powder ~30 g.`;

export async function aiParseMeal(text, userId) {
  const ctx = await loadParseContext(userId);
  const ex = await gemini(EXTRACT(String(text).slice(0, 1000), ctx.dishes.map(d => d.name)));
  const raw = Array.isArray(ex.items) ? ex.items.slice(0, 20) : [];
  const mineIds = new Set(ctx.history.map(p => String(p._id)));

  const work = [];
  for (const it of raw) {
    const dish = it.dish && ctx.dishes.find(d => d.name.toLowerCase() === String(it.dish).toLowerCase()) || (it.food && findDish(it.food, ctx));
    if (dish) { work.push({ ...it, dish }); continue; }
    const cands = await candidatesFor({ food: String(it.food || it.original || ''), brand: it.brand || null }, ctx);
    work.push({ ...it, grams: Number(it.grams) || 100, cands: cands.map(c => ({ ...c, mine: c._id && mineIds.has(String(c._id)) })) });
  }

  const foods = work.filter(w => !w.dish);
  let choices = [];
  if (foods.length) choices = (await gemini(CHOOSE(foods))).choices || [];

  const items = [];
  let fi = 0;
  for (const w of work) {
    if (w.dish) { items.push({ text: w.original, food: w.food, kind: 'dish', dish: { _id: w.dish._id, name: w.dish.name }, portions: Number(w.quantity) || 1 }); continue; }
    const idx = fi++;
    const ch = choices.find(c => c.item === idx) || {};
    const pick = ch.candidate >= 0 ? w.cands[ch.candidate] : null;
    const product = pick ? await materialize(pick) : null;
    let grams = Number(ch.grams) || w.grams;
    if (!(grams > 0 && grams < 3000)) grams = gramsFor({ food: w.food, quantity: w.quantity, unit: w.unit }, product).grams;
    const unitText = w.quantity && w.unit && !['g', 'ml'].includes(w.unit) ? `${w.quantity} ${w.unit}` : null;
    items.push({ text: w.original, food: w.food, brand: w.brand, kind: 'food', product,
      alternatives: w.cands.filter(c => c !== pick).slice(0, 4), grams: Math.round(grams * 10) / 10, portion: unitText });
  }
  const minutes = /^\d{1,2}:\d{2}$/.test(ex.time || '') ? Number(ex.time.split(':')[0]) * 60 + Number(ex.time.split(':')[1]) : null;
  return { items, minutes, meal: ['breakfast', 'lunch', 'dinner', 'snack'].includes(ex.meal) ? ex.meal : null, engine: 'ai' };
}
