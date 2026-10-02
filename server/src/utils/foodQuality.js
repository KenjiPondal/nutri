// Food-quality vocabulary shared by products, scoring and coaching.

export const FOOD_GROUPS = {
  vegetable:      { label: 'Vegetables',            plant: true,  whole: true },
  fruit:          { label: 'Fruit',                 plant: true,  whole: true },
  legume:         { label: 'Legumes',               plant: true,  whole: true },
  whole_grain:    { label: 'Whole grains',          whole: true },
  refined_grain:  { label: 'Refined grains' },
  lean_protein:   { label: 'Meat, fish & eggs',     whole: true },
  processed_meat: { label: 'Processed meat',        ultra: true },
  dairy:          { label: 'Dairy' },
  nuts_seeds:     { label: 'Nuts & seeds',          whole: true },
  oils_fats:      { label: 'Oils & fats' },
  sweets_snacks:  { label: 'Sweets & snacks',       ultra: true },
  sugary_drink:   { label: 'Sugary drinks',         ultra: true },
  drink:          { label: 'Drinks' },
  prepared_meal:  { label: 'Fast food & ready meals', ultra: true },
  supplement:     { label: 'Supplements' },
  other:          { label: 'Other' }
};
export const FOOD_GROUP_KEYS = Object.keys(FOOD_GROUPS);

// Sugar from these groups is mostly intrinsic (fruit, lactose), not "added".
export const INTRINSIC_SUGAR_GROUPS = new Set(['fruit', 'vegetable', 'dairy', 'legume']);

/**
 * NOVA processing level (1 unprocessed ... 4 ultra-processed).
 * Use the product's real NOVA (from Open Food Facts) when known; otherwise estimate from food group.
 */
export function novaOf(product) {
  if (product?.novaGroup >= 1 && product.novaGroup <= 4) return product.novaGroup;
  const g = FOOD_GROUPS[product?.foodGroup];
  if (!g) return null;
  if (g.whole) return 1;
  if (g.ultra) return 4;
  return 3;
}

/** Map Open Food Facts categories_tags -> our food group. Order matters (most specific first). */
export function groupFromOffTags(tags = []) {
  const has = (...t) => t.some(x => tags.includes(x));
  const any = (re) => tags.some(t => re.test(t));
  if (has('en:dietary-supplements', 'en:protein-powders', 'en:bodybuilding-supplements')) return 'supplement';
  if (has('en:sodas', 'en:sweetened-beverages', 'en:energy-drinks', 'en:fruit-juices', 'en:nectars')) return 'sugary_drink';
  if (has('en:fast-foods', 'en:meals', 'en:pizzas', 'en:burgers', 'en:sandwiches', 'en:prepared-meals')) return 'prepared_meal';
  if (has('en:sweet-spreads', 'en:chocolates', 'en:candies', 'en:confectioneries', 'en:biscuits-and-cakes',
    'en:biscuits', 'en:cakes', 'en:sweet-snacks', 'en:salty-snacks', 'en:chips-and-fries', 'en:crisps', 'en:ice-creams',
    'en:desserts', 'en:sugary-snacks')) return 'sweets_snacks';
  if (has('en:processed-meats', 'en:sausages', 'en:hams', 'en:bacon', 'en:salami')) return 'processed_meat';
  if (has('en:nuts', 'en:nut-butters', 'en:peanut-butters', 'en:seeds', 'en:peanuts')) return 'nuts_seeds';
  if (has('en:legumes', 'en:pulses', 'en:beans', 'en:lentils', 'en:chickpeas', 'en:legumes-and-their-products')) return 'legume';
  if (has('en:fruits', 'en:fresh-fruits', 'en:dried-fruits', 'en:fruits-based-foods')) return 'fruit';
  if (has('en:vegetables', 'en:fresh-vegetables', 'en:vegetables-based-foods', 'en:salads')) return 'vegetable';
  if (has('en:dairies', 'en:yogurts', 'en:cheeses', 'en:milks')) return 'dairy';
  if (has('en:meats', 'en:fishes', 'en:seafood', 'en:eggs', 'en:poultries')) return 'lean_protein';
  if (has('en:fats', 'en:vegetable-oils', 'en:olive-oils', 'en:butters')) return 'oils_fats';
  if (any(/^en:whole.*(grain|wheat|meal)/) || has('en:oat-flakes', 'en:rolled-oats', 'en:brown-rices')) return 'whole_grain';
  if (has('en:cereals-and-potatoes', 'en:breads', 'en:pastas', 'en:rices', 'en:breakfast-cereals', 'en:cereals-and-their-products')) return 'refined_grain';
  if (has('en:beverages', 'en:waters', 'en:teas', 'en:coffees')) return 'drink';
  return 'other';
}
