import mongoose from 'mongoose';

// One document per user per Whoop physiological cycle (~ one per day).
// `date` is the local calendar date of the cycle start (using Whoop's timezone_offset).
const WhoopDaySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  cycleId: { type: Number, required: true },
  cycleStart: Date,
  cycleEnd: Date,
  scoreState: String,
  // cycle
  strain: Number, kilojoule: Number, calories: Number, avgHr: Number, maxHr: Number,
  // recovery
  recovery: Number, hrv: Number, rhr: Number, spo2: Number, skinTemp: Number, calibrating: Boolean,
  // sleep (main sleep, not naps)
  sleepId: String, sleepPerf: Number, sleepHours: Number, sleepEfficiency: Number, sleepConsistency: Number, respiratoryRate: Number,
  workouts: [{
    _id: false, id: String, sport: String, start: Date, durationMin: Number, strain: Number, calories: Number, avgHr: Number
  }]
}, { timestamps: true });

WhoopDaySchema.index({ user: 1, cycleId: 1 }, { unique: true });
WhoopDaySchema.index({ user: 1, date: -1 });

export default mongoose.model('WhoopDay', WhoopDaySchema);
