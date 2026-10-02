import express from 'express';
import { auth } from '../middleware/auth.js';
import WhoopConnection from '../models/WhoopConnection.js';
import WhoopDay from '../models/WhoopDay.js';
import {
  whoopConfigured, buildAuthorizeUrl, consumeState, exchangeCode, tokenFields, whoopGet, revoke
} from '../services/whoopClient.js';
import { syncUser } from '../services/whoopSync.js';
import { getWhoopDays } from '../services/whoopData.js';

const router = express.Router();
const clientUrl = () => process.env.CLIENT_URL || 'http://localhost:5173';

// Connection status for the UI
router.get('/status', auth, async (req, res) => {
  const conn = await WhoopConnection.findOne({ user: req.user.id });
  res.json({
    configured: whoopConfigured(),
    connected: Boolean(conn),
    status: conn?.status ?? null,
    lastSyncAt: conn?.lastSyncAt ?? null,
    lastSyncError: conn?.lastSyncError ?? null
  });
});

// Step 1: the client calls this (with its JWT) and then navigates the browser to the returned URL.
router.post('/connect', auth, (req, res) => {
  if (!whoopConfigured()) return res.status(501).json({ message: 'Whoop is not configured on the server (WHOOP_CLIENT_ID / SECRET / REDIRECT_URI)' });
  res.json({ url: buildAuthorizeUrl(req.user.id) });
});

// Step 2: Whoop redirects here. Public route; the user is identified by the one-time `state`.
router.get('/callback', async (req, res) => {
  const back = (q) => res.redirect(`${clientUrl()}/?whoop=${q}`);
  const { code, state, error } = req.query;
  if (error) return back('denied');
  const userId = state && consumeState(String(state));
  if (!userId || !code) return back('invalid_state');
  try {
    const tokens = await exchangeCode(String(code));
    const conn = await WhoopConnection.findOneAndUpdate(
      { user: userId },
      { $set: { user: userId, ...tokenFields(tokens), status: 'active', lastSyncError: null } },
      { upsert: true, new: true }
    );
    try {
      const { data } = await whoopGet(conn, '/v2/user/profile/basic');
      await WhoopConnection.updateOne({ _id: conn._id }, { whoopUserId: data.user_id });
    } catch { /* profile is optional */ }
    // Backfill history so the dashboard is populated on first load.
    try { await syncUser(userId, { days: 30 }); } catch (e) { console.warn('[whoop] initial sync', e.message); }
    back('connected');
  } catch (e) {
    console.error('[whoop] callback', e.message);
    back('error');
  }
});

router.post('/sync', auth, async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.body?.days) || 30, 1), 365);
    res.json({ ok: true, ...(await syncUser(req.user.id, { days })) });
  } catch (e) {
    res.status(e.message === 'Whoop not connected' ? 400 : 502).json({ message: e.message });
  }
});

router.delete('/connection', auth, async (req, res) => {
  const conn = await WhoopConnection.findOne({ user: req.user.id });
  if (conn) {
    try { await revoke(conn); } catch (e) { console.warn('[whoop] revoke failed', e.message); }
    await conn.deleteOne();
  }
  const purge = req.query.purge === 'true';
  if (purge) await WhoopDay.deleteMany({ user: req.user.id });
  res.json({ ok: true, purged: purge });
});

// Per-day data for the dashboard. Real data if connected, otherwise mock.
router.get('/days', auth, async (req, res) => {
  const n = Math.min(Math.max(parseInt(req.query.days) || 14, 1), 90);
  res.json(await getWhoopDays(req.user.id, n));
});

export default router;
