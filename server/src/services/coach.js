// Coach: turns a scored day into a few specific, food-level insights.
// Ranked by how many Fuel Score points each issue costs, so the first tip is always the biggest lever.
import { WEIGHTS } from './fuelScore.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const pct = (x) => `${Math.round(x * 100)}%`;
// Merge repeated foods (two cheeseburgers -> one line) before picking the top offenders.
const merge = (items) => Object.values(items.reduce((acc, i) => {
  const m = (acc[i.name] ||= { ...i, kcal: 0, sugar: 0, sodium: 0, satFat: 0 });
  m.kcal += i.kcal; m.sugar += i.sugar || 0; m.sodium += i.sodium || 0; m.satFat += i.satFat || 0;
  return acc;
}, {}));
const top = (items, f, n = 2) => merge(items).filter(i => f(i) > 0).sort((a, b) => f(b) - f(a)).slice(0, n);
// "Cheeseburger (fast food)" -> "Cheeseburger" so we don't print double parentheses.
const short = (n) => n.replace(/\s*\([^)]*\)\s*$/, '');
const names = (list, f, unit) => list.map(i => `${short(i.name)} (${fmt(f(i))}${unit})`).join(' and ');

const PROTEIN_IDEAS = [
  { min: 35, text: '150 g chicken breast (~46 g)' },
  { min: 20, text: '120 g salmon or 4 eggs (~25 g)' },
  { min: 0, text: '200 g Greek yogurt (~20 g)' }
];

export function coach({ result, items, target, whoopDay, proteinGoal, inProgress }) {
  if (result.score == null) {
    return [{ kind: 'tip', title: inProgress ? 'Nothing logged yet' : 'No food logged', body: 'Log meals to get your Fuel Score and coaching.' }];
  }
  const { stats: s, totals: t } = result;
  const lost = Object.fromEntries(result.components.map(c => [c.key, c.max - c.points]));
  const out = [];
  const add = (kind, key, title, body, weight = lost[key] ?? 0) => out.push({ kind, key, title, body, weight });

  // Food quality / ultra-processed
  if (s.upfShare != null && s.upfShare >= 0.2) {
    const upf = top(items.filter(i => i.nova === 4), i => i.kcal);
    add('fix', 'quality', `${pct(s.upfShare)} of calories from ultra-processed food`,
      `Mostly ${names(upf, i => i.kcal, ' kcal')}. Swapping one of these for a whole-food meal is your biggest lever.`);
  }

  // Plants (+ fiber)
  if (s.plantServings < 5) {
    const need = Math.ceil(5 - s.plantServings);
    add('fix', 'plants', `${s.plantServings} of 5 servings of plants`,
      `${inProgress ? `Add ${need} more` : `You were ${need} short`}: a side salad, a piece of fruit, or a cup of lentils each count as ~1–2. ` +
      `Plants drive fiber (${fmt(t.fiber)} of ${s.fiberTarget} g), potassium and most vitamins.`,
      lost.plants + lost.fiber);
  }

  // Protein
  const gap = proteinGoal - t.protein;
  if (gap >= 15) {
    const idea = PROTEIN_IDEAS.find(p => gap >= p.min);
    add('fix', 'protein', `${fmt(gap)} g short on protein`, `${inProgress ? 'Close it with' : 'Next time add'} ${idea.text}. Protein protects muscle, especially in a deficit.`);
  }

  // Energy balance (judge under-eating only once the day is over)
  const diff = t.kcal - target.kcal;
  const basis = (target.basis === 'goal' ? 'your calorie goal'
    : `Whoop ${target.basis === 'whoop_day' ? 'burn' : '7-day avg burn'} ${fmt(target.base)} kcal${target.factor !== 1 ? `, ${target.goal} goal` : ''}`)
    + (target.adjust ? ` ${target.adjust > 0 ? '+' : '−'} ${fmt(Math.abs(target.adjust))} for your weight goal` : '');
  if (diff > target.kcal * 0.07) {
    add('fix', 'energy', `${fmt(diff)} kcal over target`, `Target ${fmt(target.kcal)} kcal (${basis}).`);
  } else if (!inProgress && diff < -target.kcal * 0.15) {
    const strain = whoopDay?.strain;
    if (strain >= 14) {
      add('fix', 'energy', 'Under-fueled on a high-strain day',
        `Strain ${strain} burned ~${fmt(whoopDay.burned)} kcal but you ate ${fmt(t.kcal)}. Big deficits on hard days slow recovery — add carbs around training.`);
    } else {
      add('fix', 'energy', `${fmt(-diff)} kcal under target`,
        `A ${pct(-diff / target.kcal)} deficit (${basis}). Fine for fat loss if planned; beyond ~25% you risk muscle loss and poor recovery.`);
    }
  }

  // Limits: name the culprit
  if (s.sugarPct > 0.10) {
    const src = top(items.filter(i => !['fruit', 'vegetable', 'dairy', 'legume'].includes(i.group)), i => i.sugar, 1);
    add('fix', 'limits', `Added sugar ${fmt(t.addedSugar)} g`, `${pct(s.sugarPct)} of calories (aim under 10%). Biggest source: ${names(src, i => i.sugar, ' g')}.`, (1 - s.limitParts.sugar) * WEIGHTS.limits / 3);
  }
  if (t.sodium > 2300) {
    const src = top(items, i => i.sodium || 0, 1);
    add('fix', 'limits', `Sodium ${fmt(t.sodium)} mg`, `Over the 2,300 mg limit. Biggest source: ${names(src, i => i.sodium, ' mg')}.`, (1 - s.limitParts.sodium) * WEIGHTS.limits / 3);
  }
  if (s.satPct > 0.10) {
    const src = top(items, i => i.satFat || 0, 1);
    add('fix', 'limits', `Saturated fat ${pct(s.satPct)} of calories`, `Aim under 10%. Biggest source: ${names(src, i => i.satFat, ' g')}.`, (1 - s.limitParts.satFat) * WEIGHTS.limits / 3);
  }

  const fixes = out.filter(o => o.weight >= 1).sort((a, b) => b.weight - a.weight).slice(0, 3);

  // Context from Whoop
  const extra = [];
  if (whoopDay?.recovery != null && whoopDay.recovery < 34) {
    extra.push({ kind: 'context', key: 'recovery', title: `Low recovery (${whoopDay.recovery}%)`,
      body: 'Prioritize protein, slow carbs and hydration today, and skip alcohol — it hits HRV hardest.' });
  }
  // Wins
  if (result.score >= 80) extra.push({ kind: 'win', key: 'overall', title: 'Strong day', body: 'Balanced intake built on whole foods. Keep this pattern.' });
  else if (s.plantServings >= 5) extra.push({ kind: 'win', key: 'plants', title: '5+ servings of plants', body: 'Great base for fiber and micronutrients.' });
  else if (s.upfShare != null && s.upfShare < 0.1) extra.push({ kind: 'win', key: 'quality', title: 'Mostly whole foods', body: 'Under 10% of calories from ultra-processed food.' });
  // Data quality nudge (helps grow the shared database)
  if (s.qualityCoverage < 0.6) {
    extra.push({ kind: 'tip', key: 'data', title: 'Some foods lack quality info', body: 'Set a food group on products you add so your score can judge them.' });
  }

  return [...fixes, ...extra].slice(0, 4).map(({ weight, ...o }) => o);
}
