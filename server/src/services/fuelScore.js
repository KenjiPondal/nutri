// Fuel Score: a 0–100 daily nutrition score combining HOW MUCH you ate (vs. what Whoop says you
// burned, adjusted for your goal) with WHAT you ate (processing level, plants, fiber, limits).
//
//   Energy balance   25   intake vs target (full within ±7%, zero at ±35%)
//   Protein          15   vs protein goal
//   Food quality     25   share of calories from whole/minimally processed vs ultra-processed (NOVA)
//   Plants           15   servings of vegetables, fruit, legumes (80 g = 1 serving, target 5)
//   Fiber            10   vs 14 g per 1000 kcal (min 25 g)
//   Limits           10   saturated fat <10% kcal, added sugar <10% kcal, sodium <2300 mg
//
// Pure functions; no DB access. See services/coach.js for the advice built on top.
import { FOOD_GROUPS, INTRINSIC_SUGAR_GROUPS, novaOf } from '../utils/foodQuality.js';

export const WEIGHTS = { energy: 25, protein: 15, quality: 25, plants: 15, fiber: 10, limits: 10 };
export const GOAL_FACTORS = { lose: 0.85, maintain: 1, gain: 1.1 };
const SERVING_G = 80;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const r1 = (x) => Math.round(x * 10) / 10;

/** Normalize a NutritionEntry (optionally with populated product) to the fields we score. */
export function toItem(e) {
  const p = e.product && typeof e.product === 'object' ? e.product : null;
  const factor = p ? e.quantity / (p.servingSize || 100) : 0;
  const fromP = (k) => (p?.[k] != null ? p[k] * factor : undefined);
  const group = e.foodGroup ?? p?.foodGroup ?? null;
  return {
    name: e.productName,
    kcal: e.calories || 0,
    protein: e.protein || 0,
    carbs: e.carbs || 0,
    fat: e.fat || 0,
    fiber: e.fiber || 0,
    sugar: e.sugar || 0,
    satFat: e.saturatedFat ?? fromP('saturatedFat') ?? null,
    sodium: e.sodium ?? fromP('sodium') ?? null,
    grams: ['g', 'ml'].includes(e.unit || 'g') ? e.quantity : 0,
    group,
    at: e.hasTime ? e.date : null,
    nova: novaOf({ novaGroup: e.novaGroup ?? p?.novaGroup, foodGroup: group })
  };
}

/**
 * Daily calorie target.
 * Completed day: that day's Whoop burn. Today/in-progress: average burn of the previous 7 days.
 * No Whoop data: the user's calorie goal.
 */
export function energyTarget({ dateKey, whoopDays = {}, todayKey, goal = 'maintain', calorieGoal = 2000, dailyAdjust = null }) {
  const factor = GOAL_FACTORS[goal] ?? 1;
  const day = whoopDays[dateKey];
  const isToday = dateKey === todayKey || day?.inProgress;
  let base = null, basis;
  if (!isToday && day?.burned) { base = day.burned; basis = 'whoop_day'; }
  else {
    const prev = Object.entries(whoopDays)
      .filter(([k, d]) => k < dateKey && d?.burned && !d.inProgress).sort().slice(-7).map(([, d]) => d.burned);
    if (prev.length) { base = prev.reduce((a, b) => a + b, 0) / prev.length; basis = 'whoop_avg'; }
  }
  if (base == null) { base = calorieGoal; basis = 'goal'; }
  // A weight objective sets an exact daily surplus/deficit (kcal); otherwise use the goal factor.
  if (dailyAdjust != null) {
    const adjust = Math.max(dailyAdjust, -0.25 * base); // never more than a 25% deficit
    return { kcal: Math.max(1200, Math.round(base + adjust)), base: Math.round(base), basis, goal, factor: 1, adjust: Math.round(adjust) };
  }
  if (basis === 'goal') return { kcal: Math.round(calorieGoal), base: null, basis, goal, factor };
  return { kcal: Math.round(base * factor), base: Math.round(base), basis, goal, factor };
}

export function scoreDay({ items, target, proteinGoal = 150, inProgress = false }) {
  const sum = (f, list = items) => list.reduce((a, i) => a + (f(i) || 0), 0);
  const kcal = sum(i => i.kcal);
  if (!items.length || kcal <= 0) return { score: null, inProgress, totals: { kcal: 0 }, components: [], stats: {} };

  // Energy. While the day is in progress, being under target is expected, so only overshoot costs points.
  const ratio = kcal / target.kcal;
  const dev = inProgress ? Math.max(0, ratio - 1) : Math.abs(ratio - 1);
  const energy = dev <= 0.07 ? 1 : clamp01(1 - (dev - 0.07) / 0.28);

  // Protein
  const protein = sum(i => i.protein);
  const proteinPts = clamp01(protein / proteinGoal);

  // Processing (NOVA), weighted by calories
  const known = items.filter(i => i.nova != null);
  const knownKcal = sum(i => i.kcal, known);
  const wholeShare = knownKcal ? sum(i => (i.nova <= 2 ? i.kcal : 0), known) / knownKcal : null;
  const upfShare = knownKcal ? sum(i => (i.nova === 4 ? i.kcal : 0), known) / knownKcal : null;
  const quality = wholeShare == null ? 0.5 : 0.6 * clamp01((wholeShare - 0.3) / 0.5) + 0.4 * clamp01(1 - upfShare / 0.5);

  // Plants
  const plantGrams = sum(i => (FOOD_GROUPS[i.group]?.plant ? i.grams : 0));
  const plantServings = plantGrams / SERVING_G;
  const plants = clamp01(plantServings / 5);

  // Fiber
  const fiber = sum(i => i.fiber);
  const fiberTarget = Math.max(25, Math.round((target.kcal / 1000) * 14));
  const fiberPts = clamp01(fiber / fiberTarget);

  // Limits
  const satFat = sum(i => i.satFat);
  const addedSugar = sum(i => (INTRINSIC_SUGAR_GROUPS.has(i.group) ? 0 : i.sugar));
  const sodium = sum(i => i.sodium);
  const satPct = (satFat * 9) / kcal;
  const sugarPct = (addedSugar * 4) / kcal;
  const limitParts = {
    satFat: clamp01(1 - (satPct - 0.10) / 0.08),
    sugar: clamp01(1 - (sugarPct - 0.10) / 0.10),
    sodium: clamp01(1 - (sodium - 2300) / 1700)
  };
  const limits = (limitParts.satFat + limitParts.sugar + limitParts.sodium) / 3;

  const parts = { energy, protein: proteinPts, quality, plants, fiber: fiberPts, limits };
  const components = Object.entries(WEIGHTS).map(([key, max]) => ({ key, max, points: r1(parts[key] * max) }));
  const score = Math.round(components.reduce((a, c) => a + c.points, 0));

  return {
    score, inProgress,
    components,
    totals: { kcal: Math.round(kcal), protein: r1(protein), carbs: r1(sum(i => i.carbs)), fat: r1(sum(i => i.fat)), fiber: r1(fiber),
      sugar: r1(sum(i => i.sugar)), addedSugar: r1(addedSugar), satFat: r1(satFat), sodium: Math.round(sodium) },
    stats: {
      ratio: r1(ratio * 100) / 100, wholeShare, upfShare, qualityCoverage: knownKcal / kcal,
      plantServings: r1(plantServings), fiberTarget, satPct, sugarPct, limitParts
    }
  };
}
