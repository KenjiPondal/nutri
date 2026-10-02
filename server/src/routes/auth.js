import express from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User.js';
import NutritionEntry from '../models/NutritionEntry.js';
import Dish from '../models/Dish.js';
import Objective from '../models/Objective.js';
import WeighIn from '../models/WeighIn.js';
import WhoopDay from '../models/WhoopDay.js';
import WhoopConnection from '../models/WhoopConnection.js';
import Product from '../models/Product.js';
import { auth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/security.js';
import { signToken } from '../utils/jwt.js';
import { revoke } from '../services/whoopClient.js';

const router = express.Router();
const publicUser = (u) => ({ id: u._id, email: u.email, name: u.name, avatar: u.avatar, preferences: u.preferences });
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const normEmail = (v) => str(v, 254).toLowerCase();

/**
 * Invite-only sign-up. ALLOWED_EMAILS="a@x.com,b@y.com" limits who can register.
 * In production, registration is closed entirely unless ALLOWED_EMAILS is set.
 */
const allowList = () => (process.env.ALLOWED_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
function mayRegister(email) {
  const list = allowList();
  if (list.length) return list.includes(email);
  return process.env.NODE_ENV !== 'production';
}

// --- Google OAuth 2.0 / OpenID Connect (enabled when credentials are set) ---
const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
if (googleEnabled) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/api/auth/google/callback',
    scope: ['openid', 'profile', 'email']
  }, async (_at, _rt, profile, done) => {
    try {
      const email = normEmail(profile.emails?.[0]?.value);
      let user = await User.findOne({ $or: [{ googleId: profile.id }, { email }] });
      if (!user) {
        if (!mayRegister(email)) return done(null, false);
        user = await User.create({ googleId: profile.id, email, name: profile.displayName, avatar: profile.photos?.[0]?.value, termsAcceptedAt: new Date() });
      } else if (!user.googleId) {
        user.googleId = profile.id;
        await user.save();
      }
      done(null, user);
    } catch (err) { done(err); }
  }));
}

router.get('/providers', (req, res) => res.json({ google: googleEnabled, inviteOnly: allowList().length > 0 || process.env.NODE_ENV === 'production' }));

router.get('/google', (req, res, next) => {
  if (!googleEnabled) return res.status(501).json({ message: 'Google OAuth not configured' });
  passport.authenticate('google', { session: false })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', { session: false }, (err, user) => {
    const client = process.env.CLIENT_URL || 'http://localhost:5173';
    if (err || !user) return res.redirect(`${client}/login?error=oauth`);
    // Token passed in URL fragment so it is not sent to servers / logged
    res.redirect(`${client}/oauth-callback#token=${signToken(user._id)}`);
  })(req, res, next);
});

// --- Email/password ---
router.post('/register', authLimiter, async (req, res) => {
  try {
    const email = normEmail(req.body.email), name = str(req.body.name, 80);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!email || !password || !name) return res.status(400).json({ message: 'All fields required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email' });
    if (password.length < 8 || password.length > 128) return res.status(400).json({ message: 'Password must be 8–128 characters' });
    if (req.body.acceptTerms !== true) return res.status(400).json({ message: 'Please accept the terms to continue' });
    if (!mayRegister(email)) return res.status(403).json({ message: 'Nutri is invite-only right now. Ask for an invite.' });
    if (await User.findOne({ email })) return res.status(400).json({ message: 'An account with this email already exists' });
    const user = await User.create({ email, password, name, termsAcceptedAt: new Date() });
    res.json({ token: signToken(user._id), user: publicUser(user) });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Could not create account' }); }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!email || !password) return res.status(400).json({ message: 'Invalid credentials' });
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) return res.status(400).json({ message: 'Invalid credentials' });
    res.json({ token: signToken(user._id), user: publicUser(user) });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Could not sign in' }); }
});

router.get('/me', auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(publicUser(user));
});

router.put('/preferences', auth, async (req, res) => {
  const ranges = { calorieGoal: [800, 8000], proteinGoal: [0, 500], carbGoal: [0, 1500], fatGoal: [0, 500], waterGoal: [0, 10000] };
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  for (const [k, [min, max]] of Object.entries(ranges)) {
    if (req.body[k] == null || req.body[k] === '') continue;
    const n = Number(req.body[k]);
    if (!Number.isFinite(n) || n < min || n > max) return res.status(400).json({ message: `${k} must be ${min}–${max}` });
    user.preferences[k] = n;
  }
  if (['lose', 'maintain', 'gain'].includes(req.body.goal)) user.preferences.goal = req.body.goal;
  await user.save();
  res.json(publicUser(user));
});

// --- Your data ---
// GET /api/auth/export -> everything we store about you, as JSON (no password hash, no Whoop tokens)
router.get('/export', auth, async (req, res) => {
  const u = req.user.id;
  const [user, entries, dishes, objectives, weighIns, whoopDays, products] = await Promise.all([
    User.findById(u, '-password -googleId').lean(), NutritionEntry.find({ user: u }).lean(), Dish.find({ user: u }).lean(),
    Objective.find({ user: u }).lean(), WeighIn.find({ user: u }).lean(), WhoopDay.find({ user: u }).lean(),
    Product.find({ createdBy: u }).lean()
  ]);
  res.set('Content-Disposition', `attachment; filename="nutri-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ exportedAt: new Date(), user, entries, dishes, objectives, weighIns, whoopDays, productsYouAdded: products });
});

// POST /api/auth/delete { password } -> permanently delete the account and all personal data
router.post('/delete', auth, authLimiter, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (user.password && !(await user.comparePassword(password))) return res.status(400).json({ message: 'Wrong password' });
  const u = user._id;
  const conn = await WhoopConnection.findOne({ user: u });
  if (conn) { try { await revoke(conn); } catch (e) { console.warn('[whoop] revoke on delete failed', e.message); } }
  await Promise.all([
    NutritionEntry.deleteMany({ user: u }), Dish.deleteMany({ user: u }), Objective.deleteMany({ user: u }),
    WeighIn.deleteMany({ user: u }), WhoopDay.deleteMany({ user: u }), WhoopConnection.deleteMany({ user: u }),
    // Products you added stay in the shared food database, but are no longer linked to you
    Product.updateMany({ createdBy: u }, { $unset: { createdBy: 1 } })
  ]);
  await User.deleteOne({ _id: u });
  res.json({ ok: true });
});

export default router;
