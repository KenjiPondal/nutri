// Copy every collection from one MongoDB to another (e.g. local -> MongoDB Atlas), then rebuild indexes.
// Usage:
//   TARGET_URI="mongodb+srv://user:pass@cluster.xxxx.mongodb.net/nutri" npm run migrate
//   (SOURCE_URI defaults to MONGODB_URI from server/.env, i.e. your local database)
// Refuses to write into a non-empty target unless you pass --force (which replaces target collections).
import 'dotenv/config';
import mongoose from 'mongoose';

const SOURCE = process.env.SOURCE_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/fullcoach';
const TARGET = process.env.TARGET_URI;
const FORCE = process.argv.includes('--force');
const mask = (u) => u.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');

if (!TARGET) { console.error('Set TARGET_URI to the destination connection string (e.g. your Atlas URI).'); process.exit(1); }
if (TARGET === SOURCE) { console.error('TARGET_URI is the same as the source.'); process.exit(1); }

const src = await mongoose.createConnection(SOURCE).asPromise();
const dst = await mongoose.createConnection(TARGET).asPromise();
console.log(`Source: ${mask(SOURCE)}  ->  Target: ${mask(TARGET)}`);

const cols = (await src.db.listCollections().toArray()).map(c => c.name).filter(n => !n.startsWith('system.'));
const existing = new Set((await dst.db.listCollections().toArray()).map(c => c.name));
const nonEmpty = [];
for (const c of cols) if (existing.has(c) && await dst.db.collection(c).estimatedDocumentCount()) nonEmpty.push(c);
if (nonEmpty.length && !FORCE) {
  console.error(`Target already has data in: ${nonEmpty.join(', ')}. Re-run with --force to replace those collections.`);
  process.exit(1);
}

for (const name of cols) {
  const from = src.db.collection(name), to = dst.db.collection(name);
  if (existing.has(name)) await to.drop();
  const total = await from.estimatedDocumentCount();
  let copied = 0, batch = [];
  for await (const doc of from.find()) {
    batch.push(doc);
    if (batch.length === 1000) { await to.insertMany(batch, { ordered: false }); copied += batch.length; batch = []; }
  }
  if (batch.length) { await to.insertMany(batch, { ordered: false }); copied += batch.length; }
  // Copy indexes too (skip the default _id index)
  const idx = (await from.indexes()).filter(i => i.name !== '_id_');
  for (const { key, name: idxName, v, ns, ...opts } of idx) await to.createIndex(key, { name: idxName, ...opts });
  console.log(`  ${name.padEnd(20)} ${String(copied).padStart(6)} / ${total} docs, ${idx.length} indexes`);
}

await src.close(); await dst.close();
console.log('Migration complete.');
