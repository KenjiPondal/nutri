// Per-day metrics shared by the Fuel Score, objectives and the weekly review.
import NutritionEntry from '../models/NutritionEntry.js';
import User from '../models/User.js';
import Objective from '../models/Objective.js';
import WeighIn from '../models/WeighIn.js';
import { getWhoopDays } from './whoopData.js';
import { toItem, energyTarget, scoreDay } from './fuelScore.js';
import { weightPlan } from './objectives.js';

export const validTz = (tz) => { try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); return tz; } catch { return 'UTC'; } };
export const keyOf = (d, tz) => new Date(d).toLocaleDateString('en-CA', { timeZone: tz });
export const shift = (key, n) => { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const range = (endKey, n) => Array.from({ length: n }, (_, i) => shift(endKey, i - (n - 1)));

/** Load everything needed to compute metrics for the given (sorted) day keys. */
export async function loadContext(userId, keys, tz) {
  const [user, whoop, entries, objectives, weighIns] = await Promise.all([
    User.findById(userId).lean(),
    getWhoopDays(userId, 45),
    NutritionEntry.find({
      user: userId, planned: { $ne: true },
      date: { $gte: new Date(`${shift(keys[0], -1)}T00:00:00Z`), $lte: new Date(`${shift(keys.at(-1), 1)}T23:59:59Z`) }
    }).populate('product', 'servingSize foodGroup novaGroup saturatedFat sodium').lean(),
    Objective.find({ user: userId, active: true }).lean(),
    WeighIn.find({ user: userId }).sort({ date: 1 }).lean()
  ]);
  const byDay = {};
  for (const e of entries) (byDay[keyOf(e.date, tz)] ||= []).push(e);
  const todayKey = keyOf(new Date(), tz);
  const weightObj = objectives.find(o => o.type === 'weight');
  const plan = weightObj ? weightPlan(weightObj, weighIns, todayKey) : null;
  return { user, prefs: user?.preferences || {}, whoop, byDay, objectives, weighIns, plan, todayKey, tz };
}

/** Score one day. */
export function dayMetrics(key, ctx) {
  const { prefs, whoop, byDay, plan, todayKey } = ctx;
  const items = (byDay[key] || []).map(toItem);
  const whoopDay = whoop.days[key];
  const inProgress = key === todayKey;
  const target = energyTarget({
    dateKey: key, whoopDays: whoop.days, todayKey,
    goal: plan ? plan.direction : prefs.goal, calorieGoal: prefs.calorieGoal,
    dailyAdjust: plan?.dailyAdjust
  });
  const result = scoreDay({ items, target, proteinGoal: prefs.proteinGoal, inProgress });
  return { key, items, whoopDay, inProgress, target, result };
}
