// Re-encrypt stored Whoop tokens with a new TOKEN_ENCRYPTION_KEY.
// Usage: MONGODB_URI=... OLD_KEY=<64 hex> NEW_KEY=<64 hex> node src/utils/rotateTokenKey.js
// Then set TOKEN_ENCRYPTION_KEY=<NEW_KEY> wherever the app runs (Render) and redeploy.
import mongoose from 'mongoose';
import crypto from 'crypto';

const { MONGODB_URI, OLD_KEY, NEW_KEY } = process.env;
const ok = (k) => /^[0-9a-f]{64}$/i.test(k || '');
if (!MONGODB_URI || !ok(OLD_KEY) || !ok(NEW_KEY)) { console.error('Need MONGODB_URI, OLD_KEY and NEW_KEY (64 hex chars each).'); process.exit(1); }

const dec = (k, blob) => {
  const [iv, tag, enc] = blob.split('.').map(s => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(k, 'hex'), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
};
const enc = (k, plain) => {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(k, 'hex'), iv);
  const e = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), e].map(b => b.toString('base64')).join('.');
};

const conn = await mongoose.createConnection(MONGODB_URI).asPromise();
const col = conn.db.collection('whoopconnections');
let n = 0, already = 0;
for await (const doc of col.find({})) {
  const set = {};
  for (const f of ['accessToken', 'refreshToken']) {
    if (!doc[f]) continue;
    try { set[f] = enc(NEW_KEY, dec(OLD_KEY, doc[f])); }
    catch { dec(NEW_KEY, doc[f]); already++; } // already on the new key (throws if neither key works)
  }
  if (Object.keys(set).length) { await col.updateOne({ _id: doc._id }, { $set: set }); n++; }
}
console.log(`Re-encrypted ${n} connection(s); ${already} field(s) were already on the new key.`);
await conn.close();
