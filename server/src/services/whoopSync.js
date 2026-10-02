import WhoopConnection from '../models/WhoopConnection.js';
import WhoopDay from '../models/WhoopDay.js';
import { whoopCollection, WhoopAuthError } from './whoopClient.js';

const KJ_PER_KCAL = 4.184;
const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

/** Local calendar date of an instant, given Whoop's "+HH:MM"/"-HH:MM" timezone_offset. */
export function localDate(iso, offset = '+00:00') {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(offset || '') || [null, '+', '00', '00'];
  const mins = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  return new Date(new Date(iso).getTime() + mins * 60_000).toISOString().slice(0, 10);
}

// Records can be missing (no recovery/sleep yet for a cycle, band not worn, etc.)
const scored = (r) => Boolean(r && r.score_state === 'SCORED' && r.score);

/**
 * Pull cycles/recovery/sleep/workouts for the last `days` days and upsert WhoopDay docs.
 * Idempotent: safe to re-run; re-syncing overwrites with Whoop's latest scores.
 */
export async function syncUser(userId, { days = 30 } = {}) {
  let conn = await WhoopConnection.findOne({ user: userId });
  if (!conn) throw new Error('Whoop not connected');

  const start = new Date(Date.now() - days * 86_400_000);
  try {
    // Sequential, not parallel: keeps us well under rate limits and avoids concurrent token refreshes.
    let r;
    r = await whoopCollection(conn, '/v2/cycle', { start }); conn = r.conn; const cycles = r.records;
    r = await whoopCollection(conn, '/v2/recovery', { start }); conn = r.conn; const recoveries = r.records;
    r = await whoopCollection(conn, '/v2/activity/sleep', { start }); conn = r.conn; const sleeps = r.records;
    r = await whoopCollection(conn, '/v2/activity/workout', { start }); conn = r.conn; const workouts = r.records;

    const recByCycle = new Map(recoveries.map(x => [x.cycle_id, x]));
    const sleepByCycle = new Map();
    for (const s of sleeps) if (!s.nap && s.cycle_id != null) sleepByCycle.set(s.cycle_id, s);

    // Assign each workout to the cycle it started in.
    const sorted = [...cycles].sort((a, b) => new Date(a.start) - new Date(b.start));
    const workoutsByCycle = new Map();
    for (const w of workouts) {
      const t = new Date(w.start).getTime();
      const cyc = sorted.findLast(c => new Date(c.start).getTime() <= t && (!c.end || new Date(c.end).getTime() > t));
      if (!cyc) continue;
      if (!workoutsByCycle.has(cyc.id)) workoutsByCycle.set(cyc.id, []);
      workoutsByCycle.get(cyc.id).push({
        id: w.id,
        sport: w.sport_name,
        start: w.start,
        durationMin: w.end ? Math.round((new Date(w.end) - new Date(w.start)) / 60_000) : null,
        strain: scored(w) ? round1(w.score.strain) : null,
        calories: scored(w) ? Math.round(w.score.kilojoule / KJ_PER_KCAL) : null,
        avgHr: scored(w) ? w.score.average_heart_rate : null
      });
    }

    const ops = cycles.map(c => {
      const rec = recByCycle.get(c.id);
      const sl = sleepByCycle.get(c.id);
      const ss = scored(sl) ? sl.score.stage_summary : null;
      const doc = {
        user: userId,
        date: localDate(c.start, c.timezone_offset),
        cycleId: c.id,
        cycleStart: c.start,
        cycleEnd: c.end || null,
        scoreState: c.score_state,
        strain: scored(c) ? round1(c.score.strain) : null,
        kilojoule: scored(c) ? Math.round(c.score.kilojoule) : null,
        calories: scored(c) ? Math.round(c.score.kilojoule / KJ_PER_KCAL) : null,
        avgHr: scored(c) ? c.score.average_heart_rate : null,
        maxHr: scored(c) ? c.score.max_heart_rate : null,
        recovery: scored(rec) ? rec.score.recovery_score : null,
        hrv: scored(rec) ? round1(rec.score.hrv_rmssd_milli) : null,
        rhr: scored(rec) ? rec.score.resting_heart_rate : null,
        spo2: scored(rec) ? round1(rec.score.spo2_percentage) : null,
        skinTemp: scored(rec) ? round1(rec.score.skin_temp_celsius) : null,
        calibrating: scored(rec) ? Boolean(rec.score.user_calibrating) : null,
        sleepId: sl?.id ?? null,
        sleepPerf: scored(sl) ? sl.score.sleep_performance_percentage : null,
        // Actual sleep = in bed - awake - no data
        sleepHours: ss ? round1((ss.total_in_bed_time_milli - ss.total_awake_time_milli - (ss.total_no_data_time_milli || 0)) / 3_600_000) : null,
        sleepEfficiency: scored(sl) ? round1(sl.score.sleep_efficiency_percentage) : null,
        sleepConsistency: scored(sl) ? sl.score.sleep_consistency_percentage : null,
        respiratoryRate: scored(sl) ? round1(sl.score.respiratory_rate) : null,
        workouts: workoutsByCycle.get(c.id) || []
      };
      return { updateOne: { filter: { user: userId, cycleId: c.id }, update: { $set: doc }, upsert: true } };
    });
    if (ops.length) await WhoopDay.bulkWrite(ops);

    await WhoopConnection.updateOne({ _id: conn._id }, { lastSyncAt: new Date(), lastSyncError: null, status: 'active' });
    return { cycles: cycles.length, recoveries: recoveries.length, sleeps: sleeps.length, workouts: workouts.length };
  } catch (e) {
    await WhoopConnection.updateOne({ _id: conn._id }, {
      lastSyncError: e.message, ...(e instanceof WhoopAuthError ? { status: 'reauth_required' } : {})
    });
    throw e;
  }
}

/** Background refresh: every `minutes`, re-sync the last 3 days for all active connections. */
export function startWhoopScheduler(minutes = Number(process.env.WHOOP_SYNC_MINUTES) || 30) {
  const tick = async () => {
    const conns = await WhoopConnection.find({ status: 'active' }).select('user');
    for (const c of conns) {
      try { await syncUser(c.user, { days: 3 }); }
      catch (e) { console.warn(`[whoop] sync failed for ${c.user}: ${e.message}`); }
    }
  };
  const t = setInterval(() => tick().catch(e => console.warn('[whoop] scheduler', e.message)), minutes * 60_000);
  t.unref();
  return t;
}
