import express from 'express';
import { auth } from '../middleware/auth.js';
import User from '../models/User.js';
import ParseLog from '../models/ParseLog.js';
import { isAdmin } from './auth.js';

const router = express.Router();
router.use(auth, async (req, res, next) => {
  const u = await User.findById(req.user.id, 'email').lean();
  if (!u || !isAdmin(u.email)) return res.status(404).json({ message: 'Not found' });
  next();
});

// GET /api/admin/parse-logs?days=7&onlyIssues=1
router.get('/parse-logs', async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 30);
  const q = { createdAt: { $gte: new Date(Date.now() - days * 86400000) } };
  if (req.query.onlyIssues === '1') q.$or = [{ 'outcome.changed': true }, { 'outcome.logged': { $ne: true } }, { aiError: { $exists: true } }];
  const logs = await ParseLog.find(q).sort({ createdAt: -1 }).limit(200).populate('user', 'name email').lean();
  res.json(logs);
});

export default router;
