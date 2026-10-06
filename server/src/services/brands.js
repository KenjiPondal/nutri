// Brand recognition: known brands (Spain + common international) plus every brand already in our database.
// Lets "hacendado coles de bruselas" or "danone danette" be understood without "brand"/"marca".
import Product from '../models/Product.js';

const KNOWN = [
  'hacendado', 'deliplus', 'bosque verde', 'mercadona', 'dia', 'eroski', 'carrefour', 'auchan', 'alcampo', 'lidl', 'aldi', 'milbona', 'pingo doce', 'consum', 'el corte ingles', 'ifa eliges',
  'hsn', 'myprotein', 'prozis', 'optimum nutrition', 'bulk', 'scitec', 'weider', 'amix', 'foodspring', 'quest', 'grenade', 'barebells', 'powerbar', 'nutrisport',
  'danone', 'activia', 'actimel', 'danette', 'oikos', 'alpro', 'pascual', 'bifrutas', 'central lechera asturiana', 'puleva', 'kaiku', 'president', 'el caserio', 'philadelphia', 'arla', 'skyr', 'yoplait', 'nestle', 'la lechera', 'llet nostra', 'leche rio', 'garcia baquero',
  'bimbo', 'panrico', 'oroweat', 'artiach', 'cuetara', 'fontaneda', 'gullon', 'oreo', 'chips ahoy', 'principe', 'lu', 'tosta rica', 'dinosaurus',
  'kelloggs', 'kellogg', 'special k', 'nesquik', 'cola cao', 'colacao', 'cheerios', 'fitness', 'quaker',
  'gallo', 'barilla', 'buitoni', 'garofalo', 'brillante', 'sos', 'la fallera', 'calvo', 'isabel', 'albo', 'campofrio', 'elpozo', 'el pozo', 'navidul', 'oscar mayer', 'casa tarradellas', 'pescanova', 'findus', 'mccain', 'dr oetker', 'buitoni',
  'coca cola', 'coca-cola', 'pepsi', 'fanta', 'sprite', 'aquarius', 'nestea', 'red bull', 'monster', 'kas', 'schweppes', 'trina', 'don simon', 'zumosol', 'granini', 'tropicana', 'innocent',
  'nutella', 'ferrero', 'kinder', 'lindt', 'milka', 'valor', 'nestle', 'kitkat', 'twix', 'mars', 'snickers', 'm&m', 'haribo', 'lacasa', 'chupa chups',
  'lays', 'ruffles', 'pringles', 'doritos', 'cheetos', 'matutano', 'risi', 'grefusa', 'frit ravich', 'tostitos',
  'heinz', 'hellmanns', 'ybarra', 'carbonell', 'koipe', 'la masia', 'borges', 'knorr', 'gallina blanca', 'starlux', 'kikkoman', 'mizkan', 'otafuku', 'old el paso', 'santa maria',
  'mcdonalds', 'burger king', 'kfc', 'telepizza', 'dominos', 'starbucks', 'subway', 'five guys', 'taco bell', 'tgb', 'goiko',
  'ben jerrys', 'haagen dazs', 'magnum', 'frigo', 'cornetto', 'carte dor'
];

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’`]/g, '').replace(/[^a-z0-9&]+/g, ' ').trim();
export const brandSlug = (b) => norm(b).replace(/&/g, '-').replace(/\s+/g, '-');

let cache = null, cachedAt = 0;
async function lexicon() {
  if (cache && Date.now() - cachedAt < 3600_000) return cache;
  const dbBrands = await Product.distinct('brand', { brand: { $nin: [null, '', 'Generic'] } }).catch(() => []);
  const all = new Set(KNOWN.map(norm));
  for (const b of dbBrands) { const n = norm(b); if (n.length >= 3 && n.split(' ').length <= 4) all.add(n); }
  // Longest first so "central lechera asturiana" beats "asturiana"
  cache = [...all].filter(Boolean).sort((a, b) => b.length - a.length);
  cachedAt = Date.now();
  return cache;
}

/** Find a known brand inside a food phrase. -> { brand, rest } or null */
export async function detectBrand(phrase) {
  const p = ` ${norm(phrase)} `;
  for (const b of await lexicon()) {
    if (p.includes(` ${b} `)) {
      const rest = p.replace(` ${b} `, ' ').trim();
      return { brand: b, rest };
    }
  }
  return null;
}
