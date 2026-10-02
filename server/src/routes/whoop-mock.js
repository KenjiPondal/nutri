// Mock Whoop API for the alpha. Response shapes loosely follow Whoop's developer API v1
// (cycle / recovery / sleep / workout records with `score` objects), so that switching to
// the real API later is mostly a base-URL + OAuth change.
// Data is deterministic per (user, date) so charts are stable between reloads.
import express from 'express';
import { auth } from '../middleware/auth.js';

const router = express.Router();
router.use(auth);

function rng(seedStr) {
  let h = 2166136261;
  for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lastNDays = (n) => Array.from({ length: n }, (_, i) => {
  const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - (n - 1 - i));
  return d;
});

function dayData(userId, date) {
  const r = rng(`${userId}:${date.toISOString().slice(0, 10)}`);
  const strain = +(6 + r() * 14).toFixed(1);
  const sleepHours = +(5.5 + r() * 3).toFixed(2);
  return {
    date: date.toISOString().slice(0, 10),
    strain,
    kilojoule: Math.round((7500 + strain * 250 + r() * 800)),
    recovery_score: Math.round(30 + r() * 65),
    resting_heart_rate: Math.round(48 + r() * 14),
    hrv_rmssd_milli: +(35 + r() * 60).toFixed(1),
    sleep_hours: sleepHours,
    sleep_performance_percentage: Math.round(Math.min(100, (sleepHours / 8) * 100)),
    workout: r() > 0.35 ? { sport: ['running', 'cycling', 'weightlifting', 'functional fitness'][Math.floor(r() * 4)],
      strain: +(strain * 0.7).toFixed(1), duration_min: Math.round(25 + r() * 65) } : null
  };
}

/** Mock data in the same per-day shape as /api/whoop/days. */
export function mockDays(userId, n) {
  return Object.fromEntries(lastNDays(n).map(d => {
    const x = dayData(userId, d);
    return [x.date, {
      recovery: x.recovery_score, hrv: x.hrv_rmssd_milli, rhr: x.resting_heart_rate,
      strain: x.strain, burned: Math.round(x.kilojoule / 4.184),
      sleepHours: x.sleep_hours, sleepPerf: x.sleep_performance_percentage,
      workouts: x.workout ? [{ sport: x.workout.sport, strain: x.workout.strain, durationMin: x.workout.duration_min }] : []
    }];
  }));
}

const days = (req) => Math.min(Math.max(parseInt(req.query.days) || 7, 1), 30);

router.get('/cycle', (req, res) => {
  res.json({ records: lastNDays(days(req)).map(d => {
    const x = dayData(req.user.id, d);
    return { start: x.date, score: { strain: x.strain, kilojoule: x.kilojoule,
      calories: Math.round(x.kilojoule / 4.184) } };
  }) });
});

router.get('/recovery', (req, res) => {
  res.json({ records: lastNDays(days(req)).map(d => {
    const x = dayData(req.user.id, d);
    return { date: x.date, score: { recovery_score: x.recovery_score,
      resting_heart_rate: x.resting_heart_rate, hrv_rmssd_milli: x.hrv_rmssd_milli } };
  }) });
});

router.get('/sleep', (req, res) => {
  res.json({ records: lastNDays(days(req)).map(d => {
    const x = dayData(req.user.id, d);
    return { date: x.date, score: { total_sleep_hours: x.sleep_hours,
      sleep_performance_percentage: x.sleep_performance_percentage } };
  }) });
});

router.get('/workout', (req, res) => {
  res.json({ records: lastNDays(days(req)).map(d => dayData(req.user.id, d))
    .filter(x => x.workout).map(x => ({ date: x.date, sport: x.workout.sport,
      score: { strain: x.workout.strain }, duration_min: x.workout.duration_min })) });
});

export default router;
