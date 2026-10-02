import mongoose from 'mongoose';

const NutritionEntrySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true, default: Date.now },
  mealType: { type: String, enum: ['breakfast', 'lunch', 'dinner', 'snack'], required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, default: 'g' },
  portionText: { type: String }, // e.g. "1.5 × 1 cup" (quantity is always stored in g/ml)
  calories: { type: Number, default: 0 },
  protein: { type: Number, default: 0 },
  carbs: { type: Number, default: 0 },
  fat: { type: Number, default: 0 },
  fiber: { type: Number, default: 0 },
  sugar: { type: Number, default: 0 },
  // Snapshot of quality data at log time (product may be edited later)
  saturatedFat: { type: Number },
  sodium: { type: Number },
  foodGroup: { type: String },
  novaGroup: { type: Number },
  notes: { type: String },
  // Set when this entry is one ingredient of a logged dish. All ingredients of one serving share `group`.
  dish: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Dish' },
    name: String,
    group: String,
    amount: String // "1 portion", "350 g"
  },
  planned: { type: Boolean, default: false } // meal planning: true = planned, not yet eaten
}, { timestamps: true });

// Primary access pattern: a user's entries over a date range.
// For sharding at scale, { user: 'hashed' } is a natural shard key.
NutritionEntrySchema.index({ user: 1, date: -1 });
NutritionEntrySchema.index({ user: 1, 'dish.group': 1 }, { sparse: true });

export default mongoose.model('NutritionEntry', NutritionEntrySchema);
