// Print recent meal-description logs. Usage: MONGODB_URI=... node src/utils/parseLogs.js [days] [--issues]
import 'dotenv/config';
import mongoose from 'mongoose';
import ParseLog from '../models/ParseLog.js';
import User from '../models/User.js';
await mongoose.connect(process.env.MONGODB_URI);
const days = Number(process.argv[2]) || 7;
const q = { createdAt: { $gte: new Date(Date.now() - days * 86400000) } };
if (process.argv.includes('--issues')) q.$or = [{ 'outcome.changed': true }, { 'outcome.logged': { $ne: true } }, { aiError: { $exists: true } }];
for (const l of await ParseLog.find(q).sort({ createdAt: -1 }).limit(100).populate('user', 'email').lean()) {
  console.log(`\n${l.createdAt.toISOString().slice(0, 16)} ${l.user?.email} [${l.engine}${l.aiError ? ' AI-ERR: ' + l.aiError.slice(0, 60) : ''}] ${l.ms}ms`);
  console.log(`  "${l.text}"`);
  for (const p of l.parsed) console.log(`   parsed: ${p.food}${p.brand ? ` (${p.brand})` : ''} -> ${p.productName || 'NONE'} ${p.grams ?? ''}g`);
  if (l.outcome?.logged) for (const p of l.outcome.items) console.log(`   logged: ${p.productName} ${p.grams}g${l.outcome.changed ? '  *changed*' : ''}`);
  else console.log('   (not logged)');
}
await mongoose.disconnect();
