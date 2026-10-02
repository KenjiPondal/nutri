// Parse OCR text from a nutrition label into product fields.
// Handles EU style ("per 100 g", "Energy 2252 kJ / 539 kcal", "of which saturates", "Salt")
// and US style ("Serving size 2 tbsp (32g)", "Calories 190", "Total Fat 16g", "Sodium 140mg").
// Values are taken from the FIRST numeric column (EU: per 100 g; US: per serving).

const NUM = '(\\d{1,4}(?:[.,]\\d{1,2})?)';

function clean(text) {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map(l => {
      l = l.toLowerCase();
      // OCR often reads the unit "g" as "9" ("53,0g" -> "53,09"). If a nutrient line has values but no
      // "g" unit anywhere, treat a trailing 9 on each value as the missing "g".
      if (!/kcal|kj|mg|%/.test(l) && !/\d\s*g\b/.test(l) && /\d9(\s|$)/.test(l)) {
        l = l.replace(/(\d+(?:[.,]\d+)?)9(?=\s|$)/g, '$1g');
      }
      return l
        .replace(/(\d)\s*[,]\s*(\d)/g, '$1.$2')      // 3,5 -> 3.5
        .replace(/(?<=\d)o|o(?=\d)/g, '0')           // OCR: 1o -> 10
        .replace(/(?<=\d)[il|](?=\s*g\b)/g, '1')      // OCR: 1l g -> 11 g
        .replace(/<\s*/g, '')                         // "<0.5 g" -> 0.5
        .replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
}

function firstNum(line, re) {
  const m = line.match(re);
  return m ? parseFloat(m[m.length - 1]) : undefined;
}

export function parseLabel(text) {
  const lines = clean(text);
  const all = lines.join('\n');
  const out = {};
  const pick = (key, value) => { if (value != null && !Number.isNaN(value) && out[key] == null) out[key] = value; };

  // Basis: per 100 g/ml (EU) or per serving (US)
  const per100 = /per\s*100\s*(g|ml)|100\s*(g|ml)\b|pour\s*100|por\s*100/.test(all);
  const serving = all.match(/serving size[^\n]*?\(?\s*(\d{1,4})\s*(g|ml)\s*\)?/);
  if (per100) { out.servingSize = 100; out.servingUnit = /100\s*ml/.test(all) ? 'ml' : 'g'; }
  else if (serving) { out.servingSize = Number(serving[1]); out.servingUnit = serving[2]; }

  for (const l of lines) {
    // Energy
    if (/kcal/.test(l)) pick('calories', firstNum(l, new RegExp(`${NUM}\\s*kcal`)));
    if (/^calories\b/.test(l)) pick('calories', firstNum(l, new RegExp(`^calories\\D*${NUM}`)));

    if (/saturat|saturates|gras(as)? saturad|satur/.test(l)) pick('saturatedFat', firstNum(l, new RegExp(`${NUM}\\s*g`)));
    else if (/trans/.test(l)) { /* ignore trans fat */ }
    else if (/^(total )?fat\b|^fat\b|^lipid|^grasas?\b|^matières grasses/.test(l)) pick('fat', firstNum(l, new RegExp(`${NUM}\\s*g`)));

    if (/carbohydrate|^total carb|^carbs?\b|^hidratos|^glucides/.test(l)) pick('carbs', firstNum(l, new RegExp(`${NUM}\\s*g`)));
    if (/sugar|azúcar|azucar|sucres/.test(l) && !/added|incl|añadid/.test(l)) pick('sugar', firstNum(l, new RegExp(`${NUM}\\s*g`)));
    if (/fib(re|er)|fibra/.test(l)) pick('fiber', firstNum(l, new RegExp(`${NUM}\\s*g`)));
    if (/protein|proteína|proteina|protéines/.test(l)) pick('protein', firstNum(l, new RegExp(`${NUM}\\s*g`)));

    if (/sodium|sodio/.test(l)) {
      const mg = firstNum(l, new RegExp(`${NUM}\\s*mg`));
      const g = mg == null ? firstNum(l, new RegExp(`${NUM}\\s*g`)) : undefined;
      pick('sodium', mg ?? (g != null ? Math.round(g * 1000) : undefined));
    }
    if (/^salt\b|^sal\b|^sel\b/.test(l)) {
      const g = firstNum(l, new RegExp(`${NUM}\\s*g`));
      if (g != null) pick('sodium', Math.round(g * 400)); // salt (g) -> sodium (mg)
    }
  }

  // Energy fallback: kJ only
  if (out.calories == null) {
    const kj = all.match(new RegExp(`${NUM}\\s*kj`));
    if (kj) out.calories = Math.round(parseFloat(kj[1]) / 4.184);
  }

  // Sanity checks: drop impossible values (OCR noise)
  const base = out.servingSize || 100;
  for (const k of ['fat', 'saturatedFat', 'carbs', 'sugar', 'fiber', 'protein']) if (out[k] > base) delete out[k];
  if (out.saturatedFat > (out.fat ?? Infinity)) delete out.saturatedFat;
  if (out.sugar > (out.carbs ?? Infinity)) delete out.sugar;
  if (out.calories > base * 9.5) delete out.calories;

  const found = ['calories', 'protein', 'carbs', 'fat', 'saturatedFat', 'fiber', 'sugar', 'sodium'].filter(k => out[k] != null);
  return { fields: out, found };
}
