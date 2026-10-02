import mongoose from 'mongoose';
import { FOOD_GROUP_KEYS } from '../utils/foodQuality.js';

// All nutrient values are per `servingSize` `servingUnit` (default per 100 g).
const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  brand: { type: String },
  barcode: { type: String, unique: true, sparse: true },
  servingSize: { type: Number, default: 100 },
  servingUnit: { type: String, default: 'g' },
  calories: { type: Number, default: 0 },
  protein: { type: Number, default: 0 },
  carbs: { type: Number, default: 0 },
  fat: { type: Number, default: 0 },
  saturatedFat: { type: Number },
  fiber: { type: Number, default: 0 },
  sugar: { type: Number, default: 0 },
  sodium: { type: Number, default: 0 }, // mg
  // Micronutrients (mg unless noted). Optional; filled when the source has them.
  micros: {
    vitaminA: Number, // µg
    vitaminC: Number,
    vitaminD: Number, // µg
    calcium: Number,
    iron: Number,
    potassium: Number,
    magnesium: Number
  },
  // Quality signals
  foodGroup: { type: String, enum: FOOD_GROUP_KEYS },
  novaGroup: { type: Number, min: 1, max: 4 },      // 1 unprocessed ... 4 ultra-processed
  nutriScore: { type: String, enum: ['a', 'b', 'c', 'd', 'e'] },
  // Common household portions, e.g. [{ label: '1 cup', grams: 140 }]
  portions: [{ _id: false, label: String, grams: Number }],
  fdcId: { type: Number, index: { unique: true, sparse: true } }, // USDA FoodData Central id
  ingredients: { type: String },
  category: { type: String },
  useCount: { type: Number, default: 0 },          // times logged (all users), boosts search ranking
  verified: { type: Boolean, default: false },
  source: { type: String, default: 'user' },        // seed | usda | openfoodfacts | user | label
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

ProductSchema.index({ name: 'text', brand: 'text' });

export default mongoose.model('Product', ProductSchema);
