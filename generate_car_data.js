const fs = require('fs');

const csv = fs.readFileSync('car model dataset.csv', 'utf8');
const lines = csv.split('\n').slice(1).filter(l => l.trim());

const data = {};
lines.forEach(l => {
  const cols = l.split(',');
  let make = (cols[1] || '').trim();
  const model = (cols[2] || '').trim();
  const variant = (cols[3] || '').trim();
  if (!make || !model) return;

  // Normalize brand names
  if (make === 'Bmw') make = 'BMW';
  if (make === 'Mg') make = 'MG';
  if (make === 'Dc') make = 'DC';
  if (make === 'Icml') make = 'ICML';
  if (make === 'Land Rover Rover') make = 'Land Rover';
  if (make === 'Maruti Suzuki R') make = 'Maruti Suzuki';

  if (!data[make]) data[make] = {};
  if (!data[make][model]) data[make][model] = [];
  if (variant && !data[make][model].includes(variant)) {
    data[make][model].push(variant);
  }
});

const brands = Object.keys(data).sort();

let ts = `/**
 * ─── CAR BRAND, MODEL & VARIANT DATASET ──────────────────────────────
 * Auto-generated from car model dataset.csv (1277 entries)
 * Used in registration, add car modal, job card, quick wash, and booking forms.
 * Brand → Model → Variant hierarchy. "Other/Others" options trigger manual input.
 */

export interface CarModelData {
  models: string[];
  variants: Record<string, string[]>;
}

export const carDataFull: Record<string, CarModelData> = {
`;

brands.forEach((b, bi) => {
  const models = Object.keys(data[b]).sort();
  const variants = data[b];
  ts += `  ${JSON.stringify(b)}: {\n`;
  ts += `    models: ${JSON.stringify(models)},\n`;
  ts += `    variants: {\n`;
  models.forEach((m, mi) => {
    ts += `      ${JSON.stringify(m)}: ${JSON.stringify(variants[m])}`;
    if (mi < models.length - 1) ts += ',';
    ts += '\n';
  });
  ts += `    }\n`;
  ts += `  }`;
  if (bi < brands.length - 1) ts += ',';
  ts += '\n';
});

ts += `};

/** Sorted list of brand names for dropdowns */
export const carBrands: string[] = [...Object.keys(carDataFull), "Others"];

/** Legacy compat: brand -> model list (without variants) */
export const carData: Record<string, string[]> = Object.fromEntries(
  Object.entries(carDataFull).map(([brand, d]) => [brand, [...d.models, "Other"]])
);
carData["Others"] = ["Other"];

/** Get models for a given brand */
export function getModelsForBrand(brand: string): string[] {
  if (brand === "Others") return ["Other"];
  const entry = carDataFull[brand];
  return entry ? [...entry.models, "Other"] : [];
}

/** Get variants for a given brand + model */
export function getVariantsForModel(brand: string, model: string): string[] {
  const entry = carDataFull[brand];
  if (!entry) return [];
  return entry.variants[model] || [];
}
`;

fs.writeFileSync('client/src/utils/carData.ts', ts, 'utf8');
console.log(`Generated carData.ts with ${brands.length} brands and ${Object.values(data).reduce((sum, b) => sum + Object.keys(b).length, 0)} models`);
