import mongoose from 'mongoose';

// A saved meal / meal-prep recipe. Ingredients are stored for the WHOLE batch;
// `portions` says how many servings it makes. Optional `cookedWeight` lets you log by weighed grams.
const DishSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  ingredients: [{
    _id: false,
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    grams: { type: Number, required: true, min: 0.1 },
    portionText: String
  }],
  portions: { type: Number, default: 1, min: 1, max: 50 },
  cookedWeight: { type: Number, min: 1 }, // grams of the whole cooked batch (optional)
  notes: { type: String, maxlength: 500 },
  timesLogged: { type: Number, default: 0 },
  lastLoggedAt: Date
}, { timestamps: true });

export default mongoose.model('Dish', DishSchema);
