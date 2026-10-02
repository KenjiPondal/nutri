import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import passport from 'passport';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import nutritionRoutes from './routes/nutrition.js';
import whoopMockRoutes from './routes/whoop-mock.js';
import whoopRoutes from './routes/whoop.js';
import fuelRoutes from './routes/fuel.js';
import dishRoutes from './routes/dishes.js';
import objectiveRoutes from './routes/objectives.js';
import { startWhoopScheduler } from './services/whoopSync.js';
import { whoopConfigured } from './services/whoopClient.js';
import { sanitize, apiLimiter, securityHeaders } from './middleware/security.js';

const PROD = process.env.NODE_ENV === 'production';

// Fail fast in production if secrets are missing (otherwise sessions / Whoop tokens break later).
if (PROD) {
  const missing = ['MONGODB_URI', 'JWT_SECRET', 'TOKEN_ENCRYPTION_KEY'].filter(k => !process.env[k]);
  if (missing.length) { console.error(`Missing required env vars: ${missing.join(', ')}`); process.exit(1); }
}

const app = express();
const PORT = process.env.PORT || 5000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '../../client/dist');

app.set('trust proxy', 1); // behind Render's / Cloudflare's HTTPS proxy
app.disable('x-powered-by');
if (PROD) app.use(securityHeaders);
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.use(sanitize);
app.use('/api', apiLimiter);
app.use(morgan(PROD ? 'tiny' : 'dev'));
app.use(passport.initialize());

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/nutrition', nutritionRoutes);
app.use('/api/mock/whoop', whoopMockRoutes);
app.use('/api/whoop', whoopRoutes);
app.use('/api/fuel', fuelRoutes);
app.use('/api/dishes', dishRoutes);
app.use('/api/objectives', objectiveRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0-alpha', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});
app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

if (PROD) {
  // Hashed build assets can be cached forever; index.html must always be fresh.
  app.use('/assets', express.static(join(DIST, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(DIST, { maxAge: '1h', index: false }));
  app.get('*', (req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(join(DIST, 'index.html')); });
}

// Last-resort error handler: log, don't leak internals.
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: PROD ? 'Something went wrong' : err.message });
});

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fullcoach')
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    startWhoopScheduler();
    console.log(`Whoop integration: ${whoopConfigured() ? 'configured' : 'not configured (using mock data)'}`);
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

export default app;
