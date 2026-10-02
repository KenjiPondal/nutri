import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Dish from '../models/Dish.js';
import Product from '../models/Product.js';
import NutritionEntry from '../models/NutritionEntry.js';
import { auth } from '../middleware/auth.js';
import { entryFromProduct, sumIngredients } from '../services/entries.js';

const router = express.Router();
router.use(auth);

const PRODUCT_FIELDS = 'name brand servingSize servingUnit calories protein carbs fat fiber sugar saturatedFat sodium foodGroup novaGroup portions';
const r1 = (x) => Math.round(x * 10) / 10;

/** Dish + computed nutrition for the whole batch and per portion. */
function present(d) {
  const t = sumIngredients(d.ingredients);
  const per = (k) => r1(t[k] / d.portions);
  return {
    _id: d._id, name: d.name, portions: d.portions, cookedWeight: d.cookedWeight, notes: d.notes,
    timesLogged: d.timesLogged, lastLoggedAt: d.lastLoggedAt, updatedAt: d.updatedAt,
    ingredients: d.ingredients.map(i => ({ product: i.product, grams: i.grams, portionText: i.portionText, missing: !i.product })),
    batch: { calories: Math.round(t.calories), grams: Math.round(t.grams) },
    perPortion: {
      calories: Math.round(t.calories / d.portions), protein: per('protein'), carbs: per('carbs'), fat: per('fat'),
      fiber: per('fiber'), grams: Math.round((d.cookedWeight || t.grams) / d.portions)
    },
    quality: {
      plantServings: r1(t.plantGrams / 80 / d.portions),
      upfShare: t.knownKcal ? r1(t.upfKcal / t.knownKcal) : null,
      wholeShare: t.knownKcal ? r1(t.wholeKcal / t.knownKcal) : null
    }
  };
}

async function validated(body) {
  const name = String(body.name || '').trim();
  if (!name) throw Object.assign(new Error('Give the meal a name'), { status: 400 });
  const raw = Array.isArray(body.ingredients) ? body.ingredients.slice(0, 40) : [];
  const ids = raw.map(i => i.productId || i.product?._id || i.product).filter(id => mongoose.isValidObjectId(id));
  const found = new Set((await Product.find({ _id: { $in: ids } }, '_id').lean()).map(p => String(p._id)));
  const ingredients = raw
    .map(i => ({ product: String(i.productId || i.product?._id || i.product), grams: Number(i.grams), portionText: i.portionText?.slice?.(0, 60) }))
    .filter(i => found.has(i.product) && i.grams > 0);
  if (!ingredients.length) throw Object.assign(new Error('Add at least one ingredient'), { status: 400 });
  const portions = Math.min(50, Math.max(1, Math.round(Number(body.portions) || 1)));
  const cookedWeight = Number(body.cookedWeight) > 0 ? Math.round(Number(body.cookedWeight)) : undefined;
  return { name: name.slice(0, 80), ingredients, portions, cookedWeight, notes: body.notes?.slice?.(0, 500) };
}

const load = (q) => Dish.find(q).populate('ingredients.product', PRODUCT_FIELDS);

router.get('/', async (req, res) => {
  const dishes = await load({ user: req.user.id }).sort({ lastLoggedAt: -1, updatedAt: -1 });
  res.json(dishes.map(present));
});

router.post('/', async (req, res) => {
  try {
    const d = await Dish.create({ ...(await validated(req.body)), user: req.user.id });
    res.status(201).json(present(await d.populate('ingredients.product', PRODUCT_FIELDS)));
  } catch (e) { res.status(e.status || 400).json({ message: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const d = await Dish.findOne({ _id: req.params.id, user: req.user.id });
    if (!d) return res.status(404).json({ message: 'Not found' });
    const v = await validated(req.body);
    d.set({ ...v, cookedWeight: v.cookedWeight ?? null });
    await d.save();
    res.json(present(await d.populate('ingredients.product', PRODUCT_FIELDS)));
  } catch (e) { res.status(e.status || 400).json({ message: e.message }); }
});

router.delete('/:id', async (req, res) => {
  const r = await Dish.deleteOne({ _id: req.params.id, user: req.user.id });
  if (!r.deletedCount) return res.status(404).json({ message: 'Not found' });
  res.json({ ok: true }); // already-logged entries stay in the history
});

/**
 * POST /api/dishes/:id/log
 * { mealType, days: [{ date: ISO, planned: bool }], portions?: number, grams?: number }
 * Logs the dish on each day (e.g. a week of meal-prep lunches). Each day becomes one group of entries.
 */
router.post('/:id/log', async (req, res) => {
  const [d] = await load({ _id: req.params.id, user: req.user.id });
  if (!d) return res.status(404).json({ message: 'Not found' });
  const { mealType, days } = req.body;
  if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType)) return res.status(400).json({ message: 'Invalid meal' });
  if (!Array.isArray(days) || !days.length || days.length > 31) return res.status(400).json({ message: 'Pick 1–31 days' });

  const grams = Number(req.body.grams);
  const portions = Number(req.body.portions) || 1;
  let factor, amount;
  if (grams > 0 && d.cookedWeight) { factor = grams / d.cookedWeight; amount = `${Math.round(grams)} g`; }
  else if (portions > 0 && portions <= 20) { factor = portions / d.portions; amount = `${portions} portion${portions === 1 ? '' : 's'}`; }
  else return res.status(400).json({ message: 'Invalid amount' });

  const docs = [];
  for (const day of days) {
    const date = new Date(day.date);
    if (Number.isNaN(date.getTime())) return res.status(400).json({ message: 'Invalid date' });
    const group = crypto.randomUUID();
    for (const ing of d.ingredients) {
      if (!ing.product) continue; // product was deleted
      docs.push({
        ...entryFromProduct(ing.product, ing.grams * factor),
        user: req.user.id, mealType, date, planned: Boolean(day.planned),
        dish: { id: d._id, name: d.name, group, amount }
      });
    }
  }
  await NutritionEntry.insertMany(docs);
  await Dish.updateOne({ _id: d._id }, { $inc: { timesLogged: days.length }, $set: { lastLoggedAt: new Date() } });
  res.status(201).json({ days: days.length, entries: docs.length });
});

export default router;
