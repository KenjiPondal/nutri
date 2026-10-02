// Usage: npm run seed --workspace=server
// Generic foods (per 100 g) with quality data. Values from USDA FoodData Central (rounded).
import 'dotenv/config';
import mongoose from 'mongoose';
import Product from '../models/Product.js';

const F = (name, foodGroup, novaGroup, calories, protein, carbs, fat, extra = {}) =>
  ({ name, brand: 'Generic', foodGroup, novaGroup, calories, protein, carbs, fat, ...extra });

const seeds = [
  // Vegetables & fruit
  F('Broccoli', 'vegetable', 1, 34, 2.8, 7, 0.4, { fiber: 2.6, sugar: 1.7, saturatedFat: 0, sodium: 33, micros: { vitaminC: 89, calcium: 47, iron: 0.7, potassium: 316 } }),
  F('Spinach', 'vegetable', 1, 23, 2.9, 3.6, 0.4, { fiber: 2.2, sugar: 0.4, saturatedFat: 0.1, sodium: 79, micros: { vitaminC: 28, calcium: 99, iron: 2.7, potassium: 558, magnesium: 79 } }),
  F('Mixed Salad Greens', 'vegetable', 1, 17, 1.4, 3.3, 0.2, { fiber: 2, sugar: 1.2, sodium: 28, micros: { vitaminC: 15, potassium: 260 } }),
  F('Carrot', 'vegetable', 1, 41, 0.9, 10, 0.2, { fiber: 2.8, sugar: 4.7, sodium: 69, micros: { vitaminA: 835, vitaminC: 6, potassium: 320 } }),
  F('Sweet Potato (baked)', 'vegetable', 1, 90, 2, 21, 0.2, { fiber: 3.3, sugar: 6.5, sodium: 36, micros: { vitaminA: 961, vitaminC: 20, potassium: 475 } }),
  F('Avocado', 'fruit', 1, 160, 2, 8.5, 14.7, { fiber: 6.7, sugar: 0.7, saturatedFat: 2.1, sodium: 7, micros: { vitaminC: 10, potassium: 485, magnesium: 29 } }),
  F('Banana', 'fruit', 1, 89, 1.1, 22.8, 0.3, { fiber: 2.6, sugar: 12.2, saturatedFat: 0.1, sodium: 1, micros: { vitaminC: 8.7, potassium: 358, magnesium: 27 } }),
  F('Apple', 'fruit', 1, 52, 0.3, 14, 0.2, { fiber: 2.4, sugar: 10.4, sodium: 1, micros: { vitaminC: 4.6, potassium: 107 } }),
  F('Blueberries', 'fruit', 1, 57, 0.7, 14.5, 0.3, { fiber: 2.4, sugar: 10, sodium: 1, micros: { vitaminC: 9.7, potassium: 77 } }),
  // Legumes, grains
  F('Lentils (cooked)', 'legume', 1, 116, 9, 20, 0.4, { fiber: 7.9, sugar: 1.8, sodium: 2, micros: { iron: 3.3, potassium: 369, magnesium: 36 } }),
  F('Chickpeas (cooked)', 'legume', 1, 164, 8.9, 27.4, 2.6, { fiber: 7.6, sugar: 4.8, saturatedFat: 0.3, sodium: 7, micros: { iron: 2.9, potassium: 291, magnesium: 48 } }),
  F('Rolled Oats', 'whole_grain', 1, 379, 13.2, 67.7, 6.5, { fiber: 10.1, sugar: 1, saturatedFat: 1.1, sodium: 6, micros: { iron: 4.3, magnesium: 138, potassium: 362 } }),
  F('Brown Rice (cooked)', 'whole_grain', 1, 112, 2.3, 23.5, 0.8, { fiber: 1.8, sugar: 0.4, saturatedFat: 0.2, sodium: 5, micros: { magnesium: 44 } }),
  F('White Rice (cooked)', 'refined_grain', 1, 130, 2.7, 28, 0.3, { fiber: 0.4, sugar: 0.1, sodium: 1 }),
  F('Whole Wheat Bread', 'whole_grain', 3, 252, 12.5, 43, 3.5, { fiber: 6, sugar: 4.4, saturatedFat: 0.7, sodium: 455, micros: { iron: 2.5, magnesium: 76 } }),
  F('White Bread', 'refined_grain', 4, 266, 8.9, 49, 3.3, { fiber: 2.7, sugar: 5.7, saturatedFat: 0.7, sodium: 490 }),
  F('Pasta (cooked)', 'refined_grain', 1, 158, 5.8, 31, 0.9, { fiber: 1.8, sugar: 0.6, sodium: 1 }),
  // Proteins
  F('Chicken Breast (cooked)', 'lean_protein', 1, 165, 31, 0, 3.6, { saturatedFat: 1, sodium: 74, micros: { potassium: 256 } }),
  F('Salmon (cooked)', 'lean_protein', 1, 206, 22, 0, 12.4, { saturatedFat: 2.5, sodium: 61, micros: { vitaminD: 13, potassium: 384 } }),
  F('Whole Egg', 'lean_protein', 1, 143, 12.6, 0.7, 9.5, { saturatedFat: 3.1, sodium: 142, micros: { vitaminD: 2, iron: 1.8 } }),
  F('Lean Beef (cooked)', 'lean_protein', 1, 217, 26, 0, 11.8, { saturatedFat: 4.6, sodium: 72, micros: { iron: 2.6, potassium: 318 } }),
  F('Tofu (firm)', 'legume', 2, 144, 17.3, 2.8, 8.7, { fiber: 2.3, saturatedFat: 1.3, sodium: 14, micros: { calcium: 683, iron: 2.7 } }),
  F('Greek Yogurt 2%', 'dairy', 1, 73, 9.9, 3.9, 1.9, { sugar: 3.6, saturatedFat: 1.2, sodium: 34, micros: { calcium: 115 } }),
  F('Whey Protein Powder', 'supplement', 4, 400, 80, 8, 6, { sugar: 5, saturatedFat: 3, sodium: 200, micros: { calcium: 450 } }),
  // Fats, nuts
  F('Almonds', 'nuts_seeds', 1, 579, 21.2, 21.6, 49.9, { fiber: 12.5, sugar: 4.4, saturatedFat: 3.8, sodium: 1, micros: { calcium: 269, magnesium: 270, potassium: 733 } }),
  F('Olive Oil', 'oils_fats', 2, 884, 0, 0, 100, { saturatedFat: 13.8 }),
  // Ultra-processed / fast food (for honest logging)
  F('Cheeseburger (fast food)', 'prepared_meal', 4, 263, 13, 28, 11, { fiber: 1.3, sugar: 6.5, saturatedFat: 5, sodium: 600 }),
  F('French Fries (fast food)', 'prepared_meal', 4, 312, 3.4, 41, 15, { fiber: 3.8, sugar: 0.3, saturatedFat: 2.3, sodium: 210 }),
  F('Pepperoni Pizza', 'prepared_meal', 4, 298, 12.7, 32, 13, { fiber: 2.3, sugar: 3.6, saturatedFat: 5.5, sodium: 680 }),
  F('Cola', 'sugary_drink', 4, 42, 0, 10.6, 0, { sugar: 10.6, sodium: 4 }),
  F('Potato Chips', 'sweets_snacks', 4, 536, 7, 53, 34.6, { fiber: 4.4, sugar: 0.3, saturatedFat: 3.1, sodium: 525 }),
  F('Milk Chocolate', 'sweets_snacks', 4, 535, 7.7, 59.4, 29.7, { fiber: 3.4, sugar: 51.5, saturatedFat: 18.5, sodium: 79 }),
  F('Bacon (cooked)', 'processed_meat', 4, 541, 37, 1.4, 42, { saturatedFat: 14, sodium: 1717 })
].map(p => ({ servingSize: 100, servingUnit: 'g', fiber: 0, sugar: 0, sodium: 0, verified: true, source: 'seed', ...p }));

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fullcoach');
await Product.syncIndexes();
// Rename legacy seed names so we update rather than duplicate.
const renames = { 'Chicken Breast': 'Chicken Breast (cooked)', 'Egg': 'Whole Egg', 'Oatmeal': 'Rolled Oats', 'Salmon': 'Salmon (cooked)' };
for (const [from, to] of Object.entries(renames)) await Product.updateOne({ name: from, source: 'seed' }, { $set: { name: to } });
let added = 0, updated = 0;
for (const s of seeds) {
  const r = await Product.updateOne({ name: s.name, source: 'seed' }, { $set: s }, { upsert: true });
  added += r.upsertedCount; updated += r.modifiedCount;
}
console.log(`Seed complete: ${added} added, ${updated} updated`);
await mongoose.disconnect();
