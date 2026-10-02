// Security middleware: input sanitizing, rate limits, headers.
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

/**
 * Block MongoDB operator injection: drop any object key that starts with "$" or contains "."
 * from body/query/params (e.g. {"email": {"$gt": ""}} would otherwise match any user).
 */
function clean(value, depth = 0) {
  if (depth > 10 || value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => clean(v, depth + 1));
  for (const k of Object.keys(value)) {
    if (k.startsWith('$') || k.includes('.')) delete value[k];
    else value[k] = clean(value[k], depth + 1);
  }
  return value;
}
export function sanitize(req, res, next) {
  clean(req.body); clean(req.params);
  // req.query is a getter in newer Express; clean in place
  if (req.query && typeof req.query === 'object') clean(req.query);
  next();
}

const json429 = (message) => (req, res) => res.status(429).json({ message });

/** Login/register: 10 attempts per 15 min per IP. Stops password guessing. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: json429('Too many attempts. Try again in 15 minutes.')
});

/** Everything else under /api: generous, just stops abuse/scrapers. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: json429('Too many requests. Slow down a little.')
});

/**
 * Security headers. The CSP allows only what the app actually uses:
 * - tesseract.js (label OCR) loads its worker/wasm from jsDelivr and language data from projectnaptha
 * - camera via getUserMedia needs no CSP entry; images from blob:/data: for label previews
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'wasm-unsafe-eval'", 'https://cdn.jsdelivr.net', 'blob:'],
      'worker-src': ["'self'", 'blob:', 'https://cdn.jsdelivr.net'],
      'connect-src': ["'self'", 'https://cdn.jsdelivr.net', 'https://tessdata.projectnaptha.com', 'blob:', 'data:'],
      'img-src': ["'self'", 'data:', 'blob:'],
      'media-src': ["'self'", 'blob:'],
      'style-src': ["'self'", "'unsafe-inline'"],
      'font-src': ["'self'", 'data:'],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'frame-ancestors': ["'none'"],
      'form-action': ["'self'", 'https://api.prod.whoop.com', 'https://accounts.google.com']
    }
  },
  crossOriginEmbedderPolicy: false, // tesseract assets come from a CDN without CORP headers
  referrerPolicy: { policy: 'no-referrer' }
});
