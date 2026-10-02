// Objectives: weight plan (drives the calorie target) and weekly progress for every objective type.
const KCAL_PER_KG = 7700;
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86_400_000);
const addDays = (key, n) => { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Smoothed current weight: average of weigh-ins in the 7 days up to `key`. */
export function trendWeight(weighIns, key) {
  const w = weighIns.filter(x => x.date <= key && x.date > addDays(key, -7)).map(x => x.kg);
  if (w.length) return avg(w);
  const last = weighIns.filter(x => x.date <= key).at(-1);
  return last ? last.kg : null;
}

/**
 * Turns a weight objective into a daily calorie adjustment, at a safe pace:
 * loss ≤ 1% of body weight per week (max 1 kg), gain ≤ 0.5 kg per week.
 */
export function weightPlan(o, weighIns, todayKey) {
  const current = trendWeight(weighIns, todayKey) ?? o.startKg;
  if (current == null || o.targetKg == null) return null;
  const remaining = o.targetKg - current;
  const prevWeek = trendWeight(weighIns, addDays(todayKey, -7));
  const weeklyChange = prevWeek != null && weighIns.some(x => x.date > addDays(todayKey, -7)) ? r1(current - prevWeek) : null;
  const base = { current: r1(current), remaining: r1(remaining), weeklyChange, startKg: o.startKg, targetKg: o.targetKg };
  if (Math.abs(remaining) < 0.3) return { ...base, direction: 'maintain', rate: 0, dailyAdjust: 0, reached: true };

  const lose = remaining < 0;
  const maxRate = lose ? Math.min(1, current * 0.01) : 0.5;
  const weeksLeft = o.deadline ? Math.max(1, daysBetween(todayKey, o.deadline) / 7) : null;
  const wanted = weeksLeft ? Math.abs(remaining) / weeksLeft : (lose ? 0.5 : 0.25);
  const rate = Math.min(wanted, maxRate);
  const projected = addDays(todayKey, Math.ceil((Math.abs(remaining) / rate) * 7));
  return {
    ...base,
    direction: lose ? 'lose' : 'gain',
    rate: r1(lose ? -rate : rate),                       // kg per week
    dailyAdjust: Math.round(((lose ? -rate : rate) * KCAL_PER_KG) / 7),
    capped: wanted > maxRate,                            // deadline needs an unsafe pace
    projected
  };
}

/** Totals over a list of day metrics (only days with food logged). */
function weekStats(days) {
  const logged = days.filter(d => d.result.score != null);
  let kcal = 0, known = 0, upf = 0;
  for (const d of logged) for (const i of d.items) { kcal += i.kcal; if (i.nova != null) { known += i.kcal; if (i.nova === 4) upf += i.kcal; } }
  const rec = days.map(d => d.whoopDay?.recovery).filter(x => x != null);
  return {
    logged: logged.length,
    avgScore: avg(logged.map(d => d.result.score)),
    upfShare: known ? upf / known : null,
    avgRecovery: avg(rec),
    avgHrv: avg(days.map(d => d.whoopDay?.hrv).filter(x => x != null)),
    proteinDays: (g) => logged.filter(d => d.result.totals.protein >= 0.9 * g).length,
    plantDays: (s) => logged.filter(d => d.result.stats.plantServings >= s).length,
    avgComponents: Object.fromEntries(['energy', 'protein', 'quality', 'plants', 'fiber', 'limits'].map(k =>
      [k, avg(logged.map(d => d.result.components.find(c => c.key === k)?.points ?? 0))]))
  };
}
export { weekStats };

const TITLES = { weight: 'Weight', protein: 'Protein', plants: 'Plants', upf: 'Less ultra-processed', fuel: 'Fuel score', recovery: 'Recovery' };

/** Progress of one objective over the last 7 complete days, vs the 7 before. */
export function evaluate(o, week, prev, plan) {
  const base = { _id: o._id, type: o.type, title: TITLES[o.type], why: o.why, raw: o };
  const trend = (a, b, better = 'up') => (a == null || b == null || Math.abs(a - b) < 0.01 ? 'flat' : (a > b) === (better === 'up') ? 'better' : 'worse');
  switch (o.type) {
    case 'weight': {
      if (!plan) return { ...base, status: 'needs_data', valueText: 'Log a weigh-in', targetText: `${o.targetKg} kg` };
      const total = Math.abs((o.startKg ?? plan.current) - o.targetKg) || 1;
      const done = Math.abs((o.startKg ?? plan.current) - plan.current);
      const ontrack = plan.reached || plan.weeklyChange == null ? true
        : plan.direction === 'lose' ? plan.weeklyChange <= 0.1 : plan.weeklyChange >= -0.1;
      return { ...base, status: plan.reached ? 'done' : ontrack ? 'on_track' : 'behind',
        progress: Math.min(1, done / total), valueText: `${plan.current} kg`, targetText: `${o.targetKg} kg`,
        detail: plan.reached ? 'Goal weight reached — holding steady.'
          : `${plan.weeklyChange != null ? `${plan.weeklyChange > 0 ? '+' : ''}${plan.weeklyChange} kg this week · ` : ''}aiming ${Math.abs(plan.rate)} kg/week${plan.capped ? ' (capped for safety)' : ''} · ETA ${plan.projected}`,
        plan };
    }
    case 'protein': {
      const v = week.proteinDays(o.grams), p = prev.proteinDays(o.grams);
      return { ...base, status: v >= o.daysPerWeek ? 'on_track' : 'behind', progress: Math.min(1, v / o.daysPerWeek),
        valueText: `${v}/${o.daysPerWeek} days`, targetText: `${o.grams} g`, trend: trend(v, p), detail: `Last week: ${p} days` };
    }
    case 'plants': {
      const v = week.plantDays(o.servings), p = prev.plantDays(o.servings);
      return { ...base, status: v >= o.daysPerWeek ? 'on_track' : 'behind', progress: Math.min(1, v / o.daysPerWeek),
        valueText: `${v}/${o.daysPerWeek} days`, targetText: `${o.servings} servings`, trend: trend(v, p), detail: `Last week: ${p} days` };
    }
    case 'upf': {
      const v = week.upfShare, p = prev.upfShare;
      if (v == null) return { ...base, status: 'needs_data', valueText: 'No food logged', targetText: `< ${o.maxPct}%` };
      return { ...base, status: v * 100 <= o.maxPct ? 'on_track' : 'behind', progress: Math.min(1, o.maxPct / Math.max(1, v * 100)),
        valueText: `${Math.round(v * 100)}%`, targetText: `under ${o.maxPct}%`, trend: trend(v, p, 'down'),
        detail: p != null ? `Last week: ${Math.round(p * 100)}%` : undefined };
    }
    case 'fuel': {
      const v = week.avgScore, p = prev.avgScore;
      if (v == null) return { ...base, status: 'needs_data', valueText: 'No food logged', targetText: `${o.score}+` };
      return { ...base, status: v >= o.score ? 'on_track' : 'behind', progress: Math.min(1, v / o.score),
        valueText: `${Math.round(v)} avg`, targetText: `${o.score}+`, trend: trend(v, p), detail: p != null ? `Last week: ${Math.round(p)}` : undefined };
    }
    case 'recovery': {
      const v = week.avgRecovery, p = prev.avgRecovery;
      if (v == null) return { ...base, status: 'needs_data', valueText: 'No Whoop data', targetText: `${o.score}%+` };
      return { ...base, status: v >= o.score ? 'on_track' : 'behind', progress: Math.min(1, v / o.score),
        valueText: `${Math.round(v)}% avg`, targetText: `${o.score}%+`, trend: trend(v, p), detail: p != null ? `Last week: ${Math.round(p)}%` : undefined };
    }
    default: return base;
  }
}
