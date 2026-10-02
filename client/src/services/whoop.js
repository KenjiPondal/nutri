import api from './api';

// Single place the UI gets Whoop data from. The server returns real Whoop data when the
// user has connected their account, otherwise simulated data in the same shape.

export { gradeColor as recoveryColor } from './fuel';

/** -> { source: 'whoop' | 'mock', days: { 'YYYY-MM-DD': { recovery, hrv, rhr, strain, burned, sleepHours, sleepPerf, workouts[] } } } */
export async function getWhoopDays(days = 14) {
  const r = await api.get('/whoop/days', { params: { days } });
  return r.data;
}

export const getWhoopStatus = async () => (await api.get('/whoop/status')).data;

export async function connectWhoop() {
  const r = await api.post('/whoop/connect');
  window.location.assign(r.data.url); // off to Whoop's consent screen
}

export const syncWhoop = async (days = 30) => (await api.post('/whoop/sync', { days })).data;
export const disconnectWhoop = async (purge = false) => (await api.delete('/whoop/connection', { params: { purge } })).data;
