import express from 'express';
import Objective, { OBJECTIVE_TYPES } from '../models/Objective.js';
import WeighIn from '../models/WeighIn.js';
import User from '../models/User.js';
import { auth } from '../middleware/auth.js';
import { validTz, keyOf, shift, range, loadContext, dayMetrics } from '../services/days.js';
import { weekStats, evaluate } from '../services/objectives.js';

const router = express.Router();
router.use(auth);

const isKey = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : undefined; };

/** Validate per-type fields. Returns a clean object or throws. */
function fields(type, b) {
  const bad = (m) => { throw Object.assign(new Error(m), { status: 400 }); };
  const why = typeof b.why === 'string' ? b.why.trim().slice(0, 200) : undefined;
  switch (type) {
    case 'weight': {
      const targetKg = num(b.targetKg, 30, 300) ?? bad('Target weight must be 30–300 kg');
      const deadline = b.deadline ? (isKey(b.deadline) ? b.deadline : bad('Invalid date')) : undefined;
      return { targetKg, deadline, why };
    }
    case 'protein': return { grams: num(b.grams, 20, 400) ?? bad('Protein must be 20–400 g'), daysPerWeek: num(b.daysPerWeek, 1, 7) ?? 5, why };
    case 'plants': return { servings: num(b.servings, 1, 15) ?? bad('Servings must be 1–15'), daysPerWeek: num(b.daysPerWeek, 1, 7) ?? 5, why };
    case 'upf': return { maxPct: num(b.maxPct, 0, 100) ?? bad('Percentage must be 0–100'), why };
    case 'fuel': return { score: num(b.score, 1, 100) ?? bad('Score must be 1–100'), why };
    case 'recovery': return { score: num(b.score, 1, 100) ?? bad('Recovery must be 1–100%'), why };
    default: return bad('Unknown objective');
  }
}

// GET /api/objectives?tz=  -> active objectives with progress over the last 7 complete days
router.get('/', async (req, res) => {
  const tz = validTz(req.query.tz || 'UTC');
  const yesterday = shift(keyOf(new Date(), tz), -1);
  const keys = range(yesterday, 14);
  const ctx = await loadContext(req.user.id, keys, tz);
  const days = keys.map(k => dayMetrics(k, ctx));
  const week = weekStats(days.slice(-7)), prev = weekStats(days.slice(0, 7));
  res.json(ctx.objectives.map(o => { const { raw, ...e } = evaluate(o, week, prev, ctx.plan); return e; }));
});

// POST /api/objectives { type, ...fields, currentKg? }  (replaces any active objective of the same type)
router.post('/', async (req, res) => {
  try {
    const { type } = req.body;
    if (!OBJECTIVE_TYPES.includes(type)) return res.status(400).json({ message: 'Unknown objective' });
    const data = fields(type, req.body);
    if (type === 'weight') {
      const tz = validTz(req.body.tz || 'UTC');
      const current = num(req.body.currentKg, 30, 300);
      if (current) await WeighIn.updateOne({ user: req.user.id, date: keyOf(new Date(), tz) }, { $set: { kg: current } }, { upsert: true });
      const latest = await WeighIn.findOne({ user: req.user.id }).sort({ date: -1 });
      if (!latest) return res.status(400).json({ message: 'Enter your current weight' });
      data.startKg = latest.kg;
      await User.updateOne({ _id: req.user.id }, { $set: { 'preferences.goal': data.targetKg < latest.kg ? 'lose' : data.targetKg > latest.kg ? 'gain' : 'maintain' } });
    }
    if (type === 'protein') await User.updateOne({ _id: req.user.id }, { $set: { 'preferences.proteinGoal': data.grams } });
    await Objective.updateMany({ user: req.user.id, type, active: true }, { $set: { active: false } });
    const o = await Objective.create({ ...data, type, user: req.user.id });
    res.status(201).json(o);
  } catch (e) { res.status(e.status || 400).json({ message: e.message }); }
});

router.delete('/:id', async (req, res) => {
  const o = await Objective.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, { $set: { active: false } });
  if (!o) return res.status(404).json({ message: 'Not found' });
  if (o.type === 'weight') await User.updateOne({ _id: req.user.id }, { $set: { 'preferences.goal': 'maintain' } });
  res.json({ ok: true });
});

// Weigh-ins
router.get('/weighins', async (req, res) => {
  const n = Math.min(Math.max(parseInt(req.query.days) || 90, 1), 730);
  const since = new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  res.json(await WeighIn.find({ user: req.user.id, date: { $gte: since } }, 'date kg').sort({ date: 1 }).lean());
});

router.post('/weighins', async (req, res) => {
  const kg = num(req.body.kg, 20, 400);
  if (!kg) return res.status(400).json({ message: 'Weight must be 20–400 kg' });
  const date = isKey(req.body.date) ? req.body.date : keyOf(new Date(), validTz(req.body.tz || 'UTC'));
  const w = await WeighIn.findOneAndUpdate({ user: req.user.id, date }, { $set: { kg: Math.round(kg * 10) / 10 } }, { upsert: true, new: true });
  res.status(201).json({ date: w.date, kg: w.kg });
});

router.delete('/weighins/:date', async (req, res) => {
  await WeighIn.deleteOne({ user: req.user.id, date: req.params.date });
  res.json({ ok: true });
});

export default router;
