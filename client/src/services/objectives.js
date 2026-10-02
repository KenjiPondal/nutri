import api from './api';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const listObjectives = async () => (await api.get('/objectives', { params: { tz } })).data;
export const createObjective = async (o) => (await api.post('/objectives', { ...o, tz })).data;
export const removeObjective = (id) => api.delete(`/objectives/${id}`);
export const listWeighIns = async (days = 120) => (await api.get('/objectives/weighins', { params: { days } })).data;
export const addWeighIn = async (kg, date) => (await api.post('/objectives/weighins', { kg, date, tz })).data;
export const getWeekly = async () => (await api.get('/fuel/weekly', { params: { tz } })).data;

export const OBJECTIVES = {
  weight:   { title: 'Lose or gain weight', blurb: 'Set a target weight. Your daily calories adjust to reach it at a safe pace.' },
  protein:  { title: 'Hit my protein', blurb: 'Build or keep muscle by reaching your protein most days.' },
  plants:   { title: 'Eat more plants', blurb: 'Fruit, veg and legumes: fiber, vitamins and better recovery.' },
  upf:      { title: 'Cut ultra-processed food', blurb: 'Keep processed snacks, fast food and sugary drinks to a small share.' },
  fuel:     { title: 'Raise my Fuel score', blurb: 'An all-round target for eating well, week to week.' },
  recovery: { title: 'Improve recovery', blurb: 'Use food to support your Whoop recovery. The coach links meals to how you recover.' }
};
