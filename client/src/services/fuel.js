import api from './api';

// Shared visual language for scores (Fuel + Whoop recovery): lime / amber / coral.
export const gradeColor = (s) => (s == null ? 'var(--dim)' : s >= 67 ? 'var(--good)' : s >= 34 ? 'var(--fair)' : 'var(--poor)');
export const fuelColor = (s) => (s == null ? 'var(--dim)' : s >= 75 ? 'var(--good)' : s >= 50 ? 'var(--fair)' : 'var(--poor)');
export const fuelVerdict = (s, inProgress) => {
  if (s == null) return inProgress ? 'Log your first meal' : 'Nothing logged';
  const v = s >= 85 ? 'Excellent fuel' : s >= 75 ? 'Well fueled' : s >= 50 ? 'Room to improve' : 'Off track';
  return inProgress ? `${v} so far` : v;
};
export const COMPONENT_LABELS = {
  energy: 'Energy balance', protein: 'Protein', quality: 'Whole foods', plants: 'Plants', fiber: 'Fiber', limits: 'Sugar, salt & sat fat'
};

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const getFuelDay = async (date) => (await api.get('/fuel/day', { params: { date, tz } })).data;
export const getFuelHistory = async (days = 7) => (await api.get('/fuel/history', { params: { days, tz } })).data;
