import mongoose from 'mongoose';

// A personal objective. Exactly one active objective per type.
//   weight:   { targetKg, startKg, deadline }           -> drives the daily calorie target
//   protein:  { grams, daysPerWeek }                     -> hit protein N days a week
//   plants:   { servings, daysPerWeek }                  -> N servings of fruit/veg/legumes, N days a week
//   upf:      { maxPct }                                 -> keep ultra-processed under X% of calories
//   fuel:     { score }                                  -> weekly average Fuel Score
//   recovery: { score }                                  -> weekly average Whoop recovery
export const OBJECTIVE_TYPES = ['weight', 'protein', 'plants', 'upf', 'fuel', 'recovery'];

const ObjectiveSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: OBJECTIVE_TYPES, required: true },
  targetKg: Number,
  startKg: Number,
  deadline: String, // YYYY-MM-DD
  grams: Number,
  servings: Number,
  daysPerWeek: Number,
  maxPct: Number,
  score: Number,
  why: { type: String, maxlength: 200 }, // the user's own reason, shown back to them
  active: { type: Boolean, default: true }
}, { timestamps: true });

ObjectiveSchema.index({ user: 1, type: 1, active: 1 });

export default mongoose.model('Objective', ObjectiveSchema);
