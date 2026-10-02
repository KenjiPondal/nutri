import crypto from 'crypto';

// AES-256-GCM for secrets at rest (Whoop OAuth tokens).
// Key: TOKEN_ENCRYPTION_KEY (64 hex chars). Falls back to a key derived from JWT_SECRET in dev.
function key() {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, 'hex');
  if (process.env.NODE_ENV === 'production') throw new Error('TOKEN_ENCRYPTION_KEY (64 hex chars) must be set in production');
  return crypto.createHash('sha256').update(`fullcoach-token-key:${process.env.JWT_SECRET || 'dev'}`).digest();
}

export function encrypt(plain) {
  if (plain == null) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join('.');
}

export function decrypt(blob) {
  if (!blob) return null;
  const [iv, tag, enc] = blob.split('.').map(s => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
