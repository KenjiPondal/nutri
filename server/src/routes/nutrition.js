import express from 'express';
import mongoose from 'mongoose';
import NutritionEntry from '../models/NutritionEntry.js';
import Product from '../models/Product.js';
import { auth } from '../middleware/auth.js';
import { entryFromProduct, MACROS } from '../services/entries.js';
import { parseMeal, mealForHour } from '../services/mealParser.js';
import { aiEnabled, aiParseMeal } from '../services/aiMeal.js';

const router = express.Router();

const dayRange = (start, end) => {
  const s = new Date(start); s.setHours(0, 0, 0, 0);
  const e = new Date(end || start); e.setHours(23, 59, 59, 999);
  return { $gte: s, $lte: e };
};

// GET /api/nutrition?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/', auth, async (req, res) => {
  const { startDate, endDate } = req.query;
  const query = { user: req.user.id };
  if (startDate) query.date = dayRange(startDate, endDate);
  // Product details included so the client can e.g. turn a logged meal into a saved dish.
  const entries = await NutritionEntry.find(query).sort({ date: -1, createdAt: 1 }).limit(500)
    .populate('product', 'name brand servingSize servingUnit calories protein carbs fat fiber sugar saturatedFat sodium foodGroup novaGroup portions');
  res.json(entries);
});

// GET /api/nutrition/summary?days=7  -> per-day macro totals for charts
router.get('/summary', auth, async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 90);
  let tz = req.query.tz || 'UTC';
  try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); } catch { tz = 'UTC'; }
  // Build the list of day keys in the *user's* timezone, independent of server timezone.
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const keys = Array.from({ length: days }, (_, i) => {
    const d = new Date(`${todayKey}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - (days - 1 - i));
    return d.toISOString().slice(0, 10);
  });
  // Query window padded by a day to cover any UTC offset; grouping below uses the user's tz.
  const start = new Date(`${keys[0]}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - 1);
  const rows = await NutritionEntry.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(req.user.id), date: { $gte: start }, planned: { $ne: true } } },
    { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: tz } },
        ...Object.fromEntries(MACROS.map(m => [m, { $sum: `$${m}` }]))
    } },
    { $sort: { _id: 1 } }
  ]);
  // Fill missing days with zeros so charts have a continuous axis
  const byDate = Object.fromEntries(rows.map(r => [r._id, r]));
  res.json(keys.map(key => {
    const r = byDate[key] || {};
    return { date: key, ...Object.fromEntries(MACROS.map(m => [m, Math.round(r[m] || 0)])) };
  }));
});

// POST /api/nutrition  { productId, quantity, mealType, date, planned }
// Macros are computed server-side from the product so clients can't submit inconsistent data.
router.post('/', auth, async (req, res) => {
  try {
    const { productId, quantity, mealType, date, notes, planned, portion, hasTime } = req.body;
    const qty = Number(quantity);
    if (!(qty > 0)) return res.status(400).json({ message: 'Quantity must be positive' });
    let data;
    if (productId) {
      const p = await Product.findById(productId);
      if (!p) return res.status(404).json({ message: 'Product not found' });
      data = { ...entryFromProduct(p, qty), portionText: typeof portion === 'string' ? portion.slice(0, 60) : undefined };
      Product.updateOne({ _id: p._id }, { $inc: { useCount: 1 } }).catch(() => {});
    } else {
      // Quick manual entry without a product
      if (!req.body.productName) return res.status(400).json({ message: 'productId or productName required' });
      data = { productName: req.body.productName, unit: req.body.unit || 'g',
        ...Object.fromEntries(MACROS.map(m => [m, Number(req.body[m]) || 0])) };
    }
    const entry = await NutritionEntry.create({
      ...data, user: req.user.id, quantity: qty, mealType,
      date: date ? new Date(date) : new Date(), notes, planned: Boolean(planned), hasTime: hasTime === true
    });
    res.status(201).json(entry);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// POST /api/nutrition/parse { text } -> what we understood, for the user to confirm
router.post('/parse', auth, async (req, res) => {
  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ message: 'Describe what you ate' });
  let r;
  if (aiEnabled()) {
    try { r = await aiParseMeal(text, req.user.id); }
    catch (e) { console.warn('[ai] meal parse failed, using rules:', e.message); }
  }
  r ||= await parseMeal(text, req.user.id);
  res.json({ ...r, suggestedMeal: r.meal || (r.minutes != null ? mealForHour(Math.floor(r.minutes / 60)) : null) });
});

// POST /api/nutrition/batch { items: [{ productId, quantity, portion }], mealType, date, hasTime, planned }
router.post('/batch', auth, async (req, res) => {
  const { items, mealType, date, hasTime, planned } = req.body;
  if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType)) return res.status(400).json({ message: 'Invalid meal' });
  if (!Array.isArray(items) || !items.length || items.length > 25) return res.status(400).json({ message: 'Add 1–25 foods' });
  const when = date ? new Date(date) : new Date();
  if (Number.isNaN(when.getTime())) return res.status(400).json({ message: 'Invalid date' });
  const ids = items.map(i => i.productId).filter(id => mongoose.isValidObjectId(id));
  const products = new Map((await Product.find({ _id: { $in: ids } })).map(p => [String(p._id), p]));
  const docs = [];
  for (const i of items) {
    const p = products.get(String(i.productId)); const qty = Number(i.quantity);
    if (!p || !(qty > 0 && qty < 5000)) return res.status(400).json({ message: 'Each food needs a valid product and amount' });
    docs.push({ ...entryFromProduct(p, qty), portionText: typeof i.portion === 'string' ? i.portion.slice(0, 60) : undefined,
      user: req.user.id, mealType, date: when, hasTime: hasTime === true, planned: Boolean(planned) });
  }
  const created = await NutritionEntry.insertMany(docs);
  Product.updateMany({ _id: { $in: [...products.keys()] } }, { $inc: { useCount: 1 } }).catch(() => {});
  res.status(201).json({ created: created.length });
});

// A logged dish is several entries sharing dish.group. Act on them together.
router.patch('/group/:group', auth, async (req, res) => {
  const set = {};
  if (req.body.planned != null) set.planned = Boolean(req.body.planned);
  const r = await NutritionEntry.updateMany({ user: req.user.id, 'dish.group': req.params.group }, { $set: set });
  if (!r.matchedCount) return res.status(404).json({ message: 'Not found' });
  res.json({ updated: r.modifiedCount });
});

router.delete('/group/:group', auth, async (req, res) => {
  const r = await NutritionEntry.deleteMany({ user: req.user.id, 'dish.group': req.params.group });
  if (!r.deletedCount) return res.status(404).json({ message: 'Not found' });
  res.json({ deleted: r.deletedCount });
});

// PATCH /api/nutrition/:id  -> e.g. mark a planned meal as eaten
router.patch('/:id', auth, async (req, res) => {
  const entry = await NutritionEntry.findOne({ _id: req.params.id, user: req.user.id });
  if (!entry) return res.status(404).json({ message: 'Not found' });
  if (req.body.planned != null) entry.planned = Boolean(req.body.planned);
  if (req.body.notes != null) entry.notes = req.body.notes;
  await entry.save();
  res.json(entry);
});

router.delete('/:id', auth, async (req, res) => {
  const result = await NutritionEntry.deleteOne({ _id: req.params.id, user: req.user.id });
  if (!result.deletedCount) return res.status(404).json({ message: 'Not found' });
  res.json({ message: 'Deleted' });
});

export default router;
