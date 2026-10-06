import express from 'express';
import Product from '../models/Product.js';
import { auth } from '../middleware/auth.js';
import { searchFoods } from '../services/foodSearch.js';
import { FOOD_GROUP_KEYS } from '../utils/foodQuality.js';
import { importFromOff, searchOff } from '../services/openFoodFacts.js';

const router = express.Router();
router.get('/barcode/:code', auth, async (req, res) => {
  const code = req.params.code.trim();
  if (!/^\d{6,14}$/.test(code)) return res.status(400).json({ message: 'Invalid barcode' });
  const product = (await Product.findOne({ barcode: code })) || (await importFromOff(code));
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
});

// Local search: every query word must prefix-match a word of the name (or brand). Results are ranked.
router.get('/', auth, async (req, res) => {
  const q = String(req.query.search || '').trim().slice(0, 80);
  if (!q) {
    // No query: the most-used foods, then the seed list
    const recent = await Product.find({ useCount: { $gt: 0 } }).sort({ useCount: -1 }).limit(20);
    return res.json(recent.length ? recent : await Product.find({ source: 'seed' }).sort({ name: 1 }).limit(30));
  }
  res.json(await searchFoods(q, req.user.id));
});

// Branded products from Open Food Facts (separate request so local results render instantly).
// Results are not saved until the user picks one (GET /barcode/:code imports it).
router.get('/external', auth, async (req, res) => {
  const q = String(req.query.search || '').trim().slice(0, 80);
  if (q.length < 3) return res.json([]);
  res.json(await searchOff(q));
});

const ALLOWED = ['name', 'brand', 'barcode', 'servingSize', 'servingUnit', 'calories', 'protein', 'carbs', 'fat', 'saturatedFat',
  'fiber', 'sugar', 'sodium', 'micros', 'foodGroup', 'novaGroup', 'ingredients', 'category', 'portions'];

router.post('/', auth, async (req, res) => {
  try {
    const data = Object.fromEntries(ALLOWED.filter(k => req.body[k] !== undefined && req.body[k] !== '').map(k => [k, req.body[k]]));
    if (data.foodGroup && !FOOD_GROUP_KEYS.includes(data.foodGroup)) delete data.foodGroup;
    if (data.barcode && !/^\d{6,14}$/.test(String(data.barcode))) return res.status(400).json({ message: 'Invalid barcode' });
    const source = req.body.fromLabel ? 'label' : 'user'; // users can never mark products verified
    const product = await Product.create({ ...data, source, createdBy: req.user.id });
    res.status(201).json(product);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'A product with this barcode already exists' });
    res.status(400).json({ message: err.message });
  }
});

export default router;
