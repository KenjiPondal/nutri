import Product from '../models/Product.js';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Relevance for plain-food search: simple, whole foods whose main noun is the query win. */
function rank(p, words, userId, headNoun = false, boost) {
  const name = p.name.toLowerCase();
  const segs = name.split(',').map(x => x.trim());
  let score = 0;
  words.forEach((w, i) => {
    // In "wheat noodles" the last word is the food; weigh it double when not every word can match.
    const k = headNoun && i === words.length - 1 ? 2 : 1;
    const same = (x) => x === w || (x?.startsWith(w) && x.length - w.length <= 2); // "noodles" ~ "noodle"
    if (same(segs[0]) || same(segs[1])) score += 4 * k;              // "Rice, white…", "Beef, steak, …"
    else if (segs.slice(0, 2).some(sg => sg.split(/[\s-]/).includes(w))) score += 2 * k;
    else if (name.includes(w)) score += 0.5 * k;
  });
  if (/\b(raw|cooked|boiled|whole|plain|fresh|grilled|baked|roasted)\b/.test(name)) score += 1.5;   // plain preparations
  if (name.startsWith(words[0])) score += 1.5;
  // Unusual forms lose unless asked for ("dried egg", "venison")
  const q = words.join(' ');
  for (const odd of ['dried', 'dehydrated', 'powder', 'dry', 'frozen', 'canned', 'imitation', 'venison', 'bison', 'elk', 'game', 'goat', 'babyfood', 'khorasan', 'durum', 'sprouted'])
    if (new RegExp(`\\b${odd}\\b`).test(name) && !q.includes(odd)) score -= 3;
  score += ({ 1: 3, 2: 1, 3: 0, 4: -3 })[p.novaGroup] ?? 0;          // plain foods first
  if (String(p.createdBy) === String(userId)) score += 6;           // your own products
  score += Math.min(6, Math.log2((p.useCount || 0) + 1) * 2);       // frequently logged
  if (p.source === 'seed') score += 2;
  if (/^[^a-z,]{3,},/.test(p.name)) score -= 5;                       // "T.G.I. FRIDAY'S, ...", "DENNY'S, ..."
  if (/fast foods?|restaurant|school lunch|\bnfs\b|ns as to|babyfood/i.test(p.name)) score -= 2;
  if (boost?.has(String(p._id))) score += 8;                         // you've eaten this before
  score -= name.length / 30;
  return score;
}


/**
 * Ranked local food search. `boost` = Set of product ids to favour (e.g. foods the user logged before).
 * Falls back to "any word" when nothing matches every word ("wheat noodles").
 */
export async function searchFoods(q, userId, { boost, limit = 30 } = {}) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return [];
  const res_ = words.map(w => new RegExp(`(^|[\\s,(-])${escapeRe(w)}`, 'i'));
  const match = (list) => list.map(re => ({ $or: [{ name: re }, { brand: re }] }));
  let candidates = await Product.find({ $and: match(res_) }).limit(500).lean();
  let fallback = false;
  if (!candidates.length && words.length > 1) { fallback = true; candidates = await Product.find({ $or: match(res_) }).limit(800).lean(); }
  const seen = new Set();
  return candidates.map(p => [rank(p, words, userId, fallback, boost), p]).sort((a, b) => b[0] - a[0])
    .map(([, p]) => p).filter(p => !seen.has(p.name.toLowerCase()) && seen.add(p.name.toLowerCase())).slice(0, limit);
}
