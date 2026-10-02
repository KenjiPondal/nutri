// Turns "X grams of product P" into a NutritionEntry payload (macros + quality snapshot).
// Shared by single-food logging and dish logging so both compute nutrition identically.
export const MACROS = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar'];

export function entryFromProduct(p, qty) {
  const factor = qty / (p.servingSize || 100);
  const scale = (v) => (v == null ? undefined : +(v * factor).toFixed(1));
  return {
    product: p._id,
    productName: p.brand && p.brand !== 'Generic' ? `${p.name} (${p.brand})` : p.name,
    unit: p.servingUnit || 'g',
    quantity: +qty.toFixed(1),
    ...Object.fromEntries(MACROS.map(m => [m, +((p[m] || 0) * factor).toFixed(1)])),
    saturatedFat: scale(p.saturatedFat),
    sodium: scale(p.sodium),
    foodGroup: p.foodGroup,
    novaGroup: p.novaGroup
  };
}

/** Sum nutrition for a list of { product (populated), grams }. */
export function sumIngredients(ingredients) {
  const t = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, saturatedFat: 0, sodium: 0, grams: 0, plantGrams: 0, upfKcal: 0, wholeKcal: 0, knownKcal: 0 };
  const PLANT = new Set(['vegetable', 'fruit', 'legume']);
  for (const ing of ingredients) {
    if (!ing.product) continue;
    const e = entryFromProduct(ing.product, ing.grams);
    for (const k of [...MACROS, 'saturatedFat', 'sodium']) t[k] += e[k] || 0;
    t.grams += ing.grams;
    if (PLANT.has(e.foodGroup)) t.plantGrams += ing.grams;
    if (e.novaGroup) { t.knownKcal += e.calories; if (e.novaGroup === 4) t.upfKcal += e.calories; if (e.novaGroup <= 2) t.wholeKcal += e.calories; }
  }
  return t;
}
