import mongoose from 'mongoose';

// One per Nutri user. Tokens are stored encrypted (see utils/crypto.js).
const WhoopConnectionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  whoopUserId: { type: Number },
  accessToken: { type: String, required: true },   // encrypted
  refreshToken: { type: String },                  // encrypted
  expiresAt: { type: Date, required: true },
  scope: { type: String },
  lastSyncAt: { type: Date },
  lastSyncError: { type: String },
  status: { type: String, enum: ['active', 'reauth_required'], default: 'active' }
}, { timestamps: true });

export default mongoose.model('WhoopConnection', WhoopConnectionSchema);
