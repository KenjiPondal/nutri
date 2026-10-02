import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String },
  name: { type: String, required: true },
  googleId: { type: String },
  avatar: { type: String },
  termsAcceptedAt: { type: Date }, // accepted the disclaimer / privacy policy at sign-up
  preferences: {
    goal: { type: String, enum: ['lose', 'maintain', 'gain'], default: 'maintain' },
    calorieGoal: { type: Number, default: 2000 }, // fallback target when no Whoop data
    proteinGoal: { type: Number, default: 150 },
    carbGoal: { type: Number, default: 200 },
    fatGoal: { type: Number, default: 70 },
    waterGoal: { type: Number, default: 2000 }
  }
}, { timestamps: true });

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password || !candidatePassword) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', UserSchema);
