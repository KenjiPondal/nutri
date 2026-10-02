import mongoose from 'mongoose';

const WeighInSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD (one per day; re-weighing replaces it)
  kg: { type: Number, required: true, min: 20, max: 400 }
}, { timestamps: true });

WeighInSchema.index({ user: 1, date: 1 }, { unique: true });

export default mongoose.model('WeighIn', WeighInSchema);
