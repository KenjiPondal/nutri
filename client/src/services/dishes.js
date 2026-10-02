import api from './api';

export const listDishes = async () => (await api.get('/dishes')).data;
export const saveDish = async (dish) => (dish._id ? api.put(`/dishes/${dish._id}`, dish) : api.post('/dishes', dish)).then(r => r.data);
export const deleteDish = (id) => api.delete(`/dishes/${id}`);
export const logDish = async (id, body) => (await api.post(`/dishes/${id}/log`, body)).data;

/** Local-noon ISO timestamp for a YYYY-MM-DD key (avoids timezone edge cases). */
export const noonISO = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 12).toISOString(); };
export const addDays = (key, n) => { const d = new Date(`${key}T12:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };

/** Nutrition for ingredients [{ product, grams }] — mirrors server/services/entries.js for live previews. */
export function sumIngredients(ingredients) {
  const t = { calories: 0, protein: 0, carbs: 0, fat: 0, grams: 0, plantGrams: 0, upfKcal: 0, knownKcal: 0 };
  for (const { product: p, grams } of ingredients) {
    if (!p || !(grams > 0)) continue;
    const f = grams / (p.servingSize || 100);
    for (const k of ['calories', 'protein', 'carbs', 'fat']) t[k] += (p[k] || 0) * f;
    t.grams += grams;
    if (['vegetable', 'fruit', 'legume'].includes(p.foodGroup)) t.plantGrams += grams;
    if (p.novaGroup) { t.knownKcal += (p.calories || 0) * f; if (p.novaGroup === 4) t.upfKcal += (p.calories || 0) * f; }
  }
  return t;
}
