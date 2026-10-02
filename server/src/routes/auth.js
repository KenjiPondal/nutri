import express from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User.js';
import { auth } from '../middleware/auth.js';
import { signToken } from '../utils/jwt.js';

const router = express.Router();
const publicUser = (u) => ({ id: u._id, email: u.email, name: u.name, avatar: u.avatar, preferences: u.preferences });

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
      const email = profile.emails?.[0]?.value;
      let user = await User.findOne({ $or: [{ googleId: profile.id }, { email }] });
      if (!user) {
        user = await User.create({ googleId: profile.id, email, name: profile.displayName, avatar: profile.photos?.[0]?.value });
      } else if (!user.googleId) {
        user.googleId = profile.id;
        await user.save();
      }
      done(null, user);
    } catch (err) { done(err); }
  }));
}

router.get('/providers', (req, res) => res.json({ google: googleEnabled }));

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

// --- Email/password (fallback for alpha testers) ---
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ message: 'All fields required' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
    if (await User.findOne({ email })) return res.status(400).json({ message: 'User exists' });
    const user = await User.create({ email, password, name });
    res.json({ token: signToken(user._id), user: publicUser(user) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) return res.status(400).json({ message: 'Invalid credentials' });
    res.json({ token: signToken(user._id), user: publicUser(user) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/me', auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(publicUser(user));
});

router.put('/preferences', auth, async (req, res) => {
  const allowed = ['calorieGoal', 'proteinGoal', 'carbGoal', 'fatGoal', 'waterGoal'];
  const user = await User.findById(req.user.id);
  for (const k of allowed) if (req.body[k] != null && req.body[k] !== '') user.preferences[k] = Number(req.body[k]);
  if (['lose', 'maintain', 'gain'].includes(req.body.goal)) user.preferences.goal = req.body.goal;
  await user.save();
  res.json(publicUser(user));
});

export default router;
