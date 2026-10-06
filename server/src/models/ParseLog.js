import mongoose from 'mongoose';

// Alpha debugging: what the user typed in "What did you eat?", what we understood, and what they finally logged.
// Auto-deleted after 30 days. Visible to the user (export) and admins only.
const Item = { _id: false, food: String, brand: String, productId: String, productName: String, grams: Number, kind: String };
const ParseLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  text: { type: String, maxlength: 1000 },
  engine: String,               // 'ai' | 'rules'
  aiError: String,              // why AI fell back, if it did
  ms: Number,                   // parse time
  parsed: [Item],
  minutes: Number, meal: String,
  outcome: {                    // filled when the user logs (or not)
    logged: { type: Boolean, default: false },
    at: Date,
    items: [Item],
    changed: Boolean            // user swapped products / edited amounts / removed items
  },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 }
});

export default mongoose.model('ParseLog', ParseLogSchema);
