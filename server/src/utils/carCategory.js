/**
 * Car types (price tiers). Every service and package has one price per type: price_<type>.
 * The model → type list (carModelCategories.json) is generated from client/src/utils/carData.ts,
 * so the app screens and the server always pick the same type for a car.
 */
const MODEL_MAP = require('./carModelCategories.json');

const CAR_TYPES = ['hatchback', 'semi_sedan', 'sedan', 'premium_sedan', 'suv', 'premium_suv'];
const CAR_TYPE_LABELS = {
  hatchback: 'Hatchback', semi_sedan: 'Mini SUV', sedan: 'Sedan',
  premium_sedan: 'Luxury', suv: 'SUV', premium_suv: 'Luxury + SUV',
};
const LUXURY_BRANDS = ['audi', 'bmw', 'mercedes', 'porsche', 'jaguar', 'land rover', 'lexus', 'volvo', 'bentley', 'ferrari',
  'lamborghini', 'maserati', 'aston martin', 'bugatti', 'rolls', 'mini'];

/** Old values saved before the six-type list → the new type (premium hatchbacks are hatchbacks). */
function normalizeCarType(t) {
  if (!t) return null;
  const v = String(t).toLowerCase().trim();
  if (CAR_TYPES.includes(v)) return v;
  if (v === 'medium_hatchback') return 'hatchback';
  if (v === 'luxury') return 'premium_suv';
  return null;
}

// The car list shared with the app (src/data/carCatalog.json).
const CATALOG = Object.fromEntries(Object.entries(require('../data/carCatalog.json')).filter(([k]) => !k.startsWith('_')));
const keyOf = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const BRAND_SAME = { mercedesbenz: 'Mercedes-Benz', mercedes: 'Mercedes-Benz', benz: 'Mercedes-Benz', maruti: 'Maruti Suzuki', suzuki: 'Maruti Suzuki', tatamotors: 'Tata', vw: 'Volkswagen', mgmotor: 'MG', rangerover: 'Land Rover', forcemotors: 'Force', rollsroyce: 'Rolls-Royce' };
const catalogBrand = (b) => BRAND_SAME[keyOf(b)] || Object.keys(CATALOG).find(x => keyOf(x) === keyOf(b)) || null;

/** Car type from the car list for this exact model (null when not listed). Same as catalogCategory() in carData.ts. */
function catalogCategory(brand, model) {
  const m = keyOf(model);
  if (!m) return null;
  const b = catalogBrand(brand);
  const find = (models, exact = false) => {
    let best = null, len = 0;
    for (const [name, v] of Object.entries(models)) {
      const k = keyOf(name);
      if ((m === k || (!exact && m.startsWith(k))) && k.length > len) { best = v; len = k.length; }
    }
    return best ? best[0] : null;
  };
  if (b && CATALOG[b]) return find(CATALOG[b]);
  // brand unknown: only an exact model name counts (short names like "ES" would match too much)
  for (const models of Object.values(CATALOG)) { const t = find(models, true); if (t) return t; }
  return null;
}

/** Best guess of the car type from brand + model (null when unknown). Mirrors getCategoryForModel() in carData.ts. */
function guessCarCategory(brand, model) {
  const b = String(brand || '').toLowerCase().trim();
  const m = String(model || '').toLowerCase().trim();
  if (!m) return null;
  const listed = catalogCategory(brand, model);
  if (listed) return listed;
  const clean = m.replace(/\s+(gt|gtx|ev)\b.*$/i, '').replace(/^electric\s+/, '')
    .replace(/\s+(roadster|cabriolet|coupe|sportback|convertible|touring|cross|nxt|prime)$/i, '').trim();

  if (MODEL_MAP[m]) return MODEL_MAP[m];
  if (MODEL_MAP[clean]) return MODEL_MAP[clean];
  for (const [key, cat] of Object.entries(MODEL_MAP)) {
    if (clean === key || clean.startsWith(key) || key.startsWith(clean)) return cat;
  }
  if (LUXURY_BRANDS.some(x => b.includes(x))) {
    return /q|x|macan|cayenne|gl|pace|discovery|range|levante|urus|bentayga/.test(m) ? 'premium_suv' : 'premium_sedan';
  }
  if (/nexon|brezza|venue|sonet|3xo|xuv300|punch|exter|kiger|magnite|fronx|creta|seltos|kushaq|taigun|astor|elevate|hyryder|grand vitara|curvv/.test(m)) return 'semi_sedan'; // Mini SUV
  if (/suv|xuv|sport|cross|ranger|safari|harrier|creta|seltos|innova|scorpio|bolero|thar|gurkha/.test(m)) return 'suv';
  if (/fortuner|endeavour|gloster|kodiaq|land cruiser|tiguan|meridian/.test(m)) return 'premium_suv';
  if (/dzire|amaze|aura|tigor|xcent|aspire|zest/.test(m)) return 'sedan';
  if (/sedan|verna|city|slavia|virtus|ciaz|linea|sunny/.test(m)) return 'sedan';
  if (/alto|wagon|celerio|presso|i10|i20|tiago|kwid|micra|polo|brio|sant|baleno|altroz|glanza|swift/.test(m)) return 'hatchback';
  return null;
}

module.exports = { CAR_TYPES, CAR_TYPE_LABELS, normalizeCarType, guessCarCategory, catalogCategory };
