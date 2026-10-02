import WhoopConnection from '../models/WhoopConnection.js';
import WhoopDay from '../models/WhoopDay.js';
import { mockDays } from '../routes/whoop-mock.js';
import { syncUser } from './whoopSync.js';

const STALE_MS = 30 * 60 * 1000;
const syncing = new Set();

/**
 * Free hosts sleep when idle, so the background scheduler can't be relied on.
 * When data is read and the last sync is stale, refresh it in the background (non-blocking).
 */
function refreshIfStale(conn) {
  const id = String(conn.user);
  if (conn.status !== 'active' || syncing.has(id)) return;
  if (conn.lastSyncAt && Date.now() - new Date(conn.lastSyncAt).getTime() < STALE_MS) return;
  syncing.add(id);
  syncUser(conn.user, { days: 3 })
    .catch(e => console.warn(`[whoop] on-read sync failed: ${e.message}`))
    .finally(() => syncing.delete(id));
}

/** Per-day Whoop metrics for a user: real data if connected, else simulated. */
export async function getWhoopDays(userId, n = 14) {
  const conn = await WhoopConnection.findOne({ user: userId }, 'user status lastSyncAt').lean();
  if (!conn) return { source: 'mock', days: mockDays(String(userId), n) };
  refreshIfStale(conn);

  const since = new Date(Date.now() - (n + 1) * 86_400_000).toISOString().slice(0, 10);
  const rows = await WhoopDay.find({ user: userId, date: { $gte: since } }).sort({ date: 1 }).lean();
  const days = {};
  for (const r of rows) {
    // If two cycles land on one date (e.g. travel), keep the later one.
    days[r.date] = {
      recovery: r.recovery, hrv: r.hrv, rhr: r.rhr, spo2: r.spo2, skinTemp: r.skinTemp, calibrating: r.calibrating,
      strain: r.strain, burned: r.calories, avgHr: r.avgHr,
      sleepHours: r.sleepHours, sleepPerf: r.sleepPerf, sleepEfficiency: r.sleepEfficiency,
      workouts: r.workouts || [], inProgress: !r.cycleEnd
    };
  }
  return { source: 'whoop', days };
}
