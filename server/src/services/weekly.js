// Weekly review: last 7 complete days vs the 7 before, plus food -> next-day recovery patterns.
// Rule-based, like the daily coach. Patterns are reported as associations, never as proof.
import { keyOf, shift, range, loadContext, dayMetrics } from './days.js';
import { weekStats, evaluate } from './objectives.js';
import { WEIGHTS } from './fuelScore.js';

const LABELS = { energy: 'energy balance', protein: 'protein', quality: 'whole foods', plants: 'plants', fiber: 'fiber', limits: 'sugar, salt & sat fat' };
const TIPS = {
  energy: 'Your intake drifted from your target. Check portion sizes on your most frequent meals.',
  protein: 'Add a protein anchor to each meal (eggs, Greek yogurt, chicken, tofu).',
  quality: 'More of your calories came from ultra-processed food. Prepping one or two meals ahead helps most.',
  plants: 'Fewer fruit and veg. Add a side salad or fruit to two meals a day.',
  fiber: 'Fiber fell. Swap white grains for whole grains, or add beans or lentils.',
  limits: 'Sugar, salt or saturated fat crept up. Snacks and sauces are the usual culprits.'
};
const r = Math.round;
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Compare next-day recovery after days that do vs don't match a condition. */
function pattern(days, whoopDays, test) {
  const yes = [], no = [];
  for (const d of days) {
    if (d.result.score == null) continue;
    const next = whoopDays[shift(d.key, 1)]?.recovery;
    if (next == null) continue;
    (test(d) ? yes : no).push(next);
  }
  if (yes.length < 3 || no.length < 3) return null;
  return { yes: avg(yes), no: avg(no), diff: avg(yes) - avg(no), n: yes.length + no.length };
}

export async function weeklyReview(userId, tz) {
  const todayKey = keyOf(new Date(), tz);
  const yesterday = shift(todayKey, -1);
  const keys = range(yesterday, 28); // 4 weeks: this, last, and history for patterns
  const ctx = await loadContext(userId, keys, tz);
  const all = keys.map(k => dayMetrics(k, ctx));
  const thisDays = all.slice(-7), lastDays = all.slice(-14, -7);
  const week = weekStats(thisDays), prev = weekStats(lastDays);

  const objectives = ctx.objectives.map(o => evaluate(o, week, prev, ctx.plan));
  const insights = [];

  // 1) Overall Fuel trend, explained by the component that moved most
  if (week.avgScore != null && prev.avgScore != null) {
    const delta = week.avgScore - prev.avgScore;
    const moves = Object.keys(WEIGHTS).map(k => [k, (week.avgComponents[k] ?? 0) - (prev.avgComponents[k] ?? 0)]).sort((a, b) => a[1] - b[1]);
    if (delta <= -5) {
      const [k, d] = moves[0];
      insights.push({ kind: 'fix', title: `Fuel score down to ${r(week.avgScore)} from ${r(prev.avgScore)}`,
        body: `Biggest drop: ${LABELS[k]} (${r(d)} pts). ${TIPS[k]}` });
    } else if (delta >= 5) {
      const [k, d] = moves.at(-1);
      insights.push({ kind: 'win', title: `Fuel score up to ${r(week.avgScore)} from ${r(prev.avgScore)}`,
        body: `Biggest gain: ${LABELS[k]} (+${r(d)} pts). Whatever you changed, keep it.` });
    }
  }

  // Recovery-based coaching only on real Whoop data: patterns in simulated data would be fake advice.
  const realWhoop = ctx.whoop.source === 'whoop';

  // 2) Recovery trend, linked to nutrition when both moved
  if (realWhoop && week.avgRecovery != null && prev.avgRecovery != null) {
    const dRec = week.avgRecovery - prev.avgRecovery;
    const dFuel = week.avgScore != null && prev.avgScore != null ? week.avgScore - prev.avgScore : 0;
    if (dRec <= -5) {
      insights.push({ kind: 'context', title: `Recovery averaged ${r(week.avgRecovery)}%, down from ${r(prev.avgRecovery)}%`,
        body: dFuel <= -3 ? 'Your nutrition slipped too. Getting food back on track is one lever you control. Sleep and training load are the others.'
          : 'Your nutrition held steady, so look at sleep, stress and training load first.' });
    } else if (dRec >= 5) {
      insights.push({ kind: 'win', title: `Recovery up to ${r(week.avgRecovery)}% from ${r(prev.avgRecovery)}%`, body: 'Good week for your body. Keep the routine.' });
    }
  }

  // 3) Food -> next-day recovery patterns over the last 4 weeks (strongest one only)
  const candidates = [
    ['upf', 'more than 30% ultra-processed', (d) => (d.result.stats.upfShare ?? 0) > 0.3, true],
    ['under', 'a big deficit (25%+ under target)', (d) => !d.inProgress && d.result.stats.ratio < 0.75, true],
    ['protein', 'protein goal hit', (d) => d.result.totals.protein >= 0.9 * (ctx.prefs.proteinGoal ?? 150), false],
    ['plants', '5+ servings of plants', (d) => d.result.stats.plantServings >= 5, false]
  ].map(([key, label, test, bad]) => ({ key, label, bad, p: pattern(all.slice(0, -1), ctx.whoop.days, test) }))
    .filter(c => c.p && Math.abs(c.p.diff) >= 5)
    .sort((a, b) => Math.abs(b.p.diff) - Math.abs(a.p.diff));
  if (realWhoop && candidates.length) {
    const c = candidates[0];
    insights.push({ kind: 'pattern',
      title: `After days with ${c.label}, recovery averaged ${r(c.p.yes)}%`,
      body: `vs ${r(c.p.no)}% after other days (${c.p.n} days of data). A pattern, not proof, but worth noticing.` });
  }

  // 4) Objectives that are behind
  const covered = new Set(insights.map(i => (/^Fuel score/.test(i.title) ? 'fuel' : /^Recovery/.test(i.title) ? 'recovery' : null)));
  for (const o of objectives.filter(o => o.status === 'behind' && !covered.has(o.type)).slice(0, 2)) {
    insights.push({ kind: 'fix', title: `${o.title}: ${o.valueText} (goal ${o.targetText})`, body: o.detail || 'Behind this week.' });
  }

  // 5) Logging consistency
  if (week.logged < 5) {
    insights.push({ kind: 'tip', title: `Food logged on ${week.logged} of 7 days`,
      body: 'More complete weeks make these comparisons much sharper. Saved meals make logging one tap.' });
  }

  return {
    range: { from: thisDays[0].key, to: yesterday },
    thisWeek: { avgScore: week.avgScore && r(week.avgScore), avgRecovery: week.avgRecovery && r(week.avgRecovery), avgHrv: week.avgHrv && r(week.avgHrv), logged: week.logged, upfShare: week.upfShare },
    lastWeek: { avgScore: prev.avgScore && r(prev.avgScore), avgRecovery: prev.avgRecovery && r(prev.avgRecovery), avgHrv: prev.avgHrv && r(prev.avgHrv), logged: prev.logged, upfShare: prev.upfShare },
    whoopSource: ctx.whoop.source,
    objectives: objectives.map(({ raw, ...o }) => o),
    insights: insights.slice(0, 5)
  };
}
