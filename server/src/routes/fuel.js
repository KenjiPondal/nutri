import express from 'express';
import { auth } from '../middleware/auth.js';
import { validTz, keyOf, range, loadContext, dayMetrics } from '../services/days.js';
import { coach } from '../services/coach.js';
import { weeklyReview } from '../services/weekly.js';

const router = express.Router();
router.use(auth);

// GET /api/fuel/day?date=YYYY-MM-DD&tz=Europe/Madrid
router.get('/day', async (req, res) => {
  const tz = validTz(req.query.tz || 'UTC');
  const todayKey = keyOf(new Date(), tz);
  const key = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : todayKey;
  const ctx = await loadContext(req.user.id, [key], tz);
  const d = dayMetrics(key, ctx);
  res.json({
    date: key,
    source: ctx.whoop.source,
    inProgress: d.inProgress,
    score: d.result.score,
    target: d.target,
    totals: d.result.totals,
    components: d.result.components,
    stats: d.result.stats,
    insights: coach({ ...d, proteinGoal: ctx.prefs.proteinGoal ?? 150 })
  });
});

// GET /api/fuel/history?days=14&tz=...  -> [{ date, score, kcal, target }]
router.get('/history', async (req, res) => {
  const tz = validTz(req.query.tz || 'UTC');
  const n = Math.min(Math.max(parseInt(req.query.days) || 14, 1), 30);
  const keys = range(keyOf(new Date(), tz), n);
  const ctx = await loadContext(req.user.id, keys, tz);
  res.json(keys.map(k => {
    const d = dayMetrics(k, ctx);
    return { date: k, score: d.result.score, kcal: d.result.totals.kcal || 0, target: d.target.kcal, inProgress: d.inProgress };
  }));
});

// GET /api/fuel/weekly?tz=...  -> this week vs last week + coaching
router.get('/weekly', async (req, res) => {
  const tz = validTz(req.query.tz || 'UTC');
  res.json(await weeklyReview(req.user.id, tz));
});

export default router;
