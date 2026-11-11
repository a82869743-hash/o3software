import { normalizeCarType } from './carTypes';
import { getCategoryForModel } from './carData';
import { MODEL_PHOTOS, BRAND_LOGOS } from './carPhotos';

const TYPES = ['hatchback', 'semi_sedan', 'sedan', 'premium_sedan', 'suv', 'premium_suv'];
const norm = (s?: string | null) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Brand spellings customers / old data use
const BRAND_ALIAS: Record<string, string> = { maruti: 'maruti suzuki', suzuki: 'maruti suzuki', mercedes: 'mercedes benz', benz: 'mercedes benz', 'tata motors': 'tata', vw: 'volkswagen', 'mg motor': 'mg', 'range rover': 'land rover', 'force motors': 'force' };
const brandKey = (b?: string | null) => { const n = norm(b); return BRAND_ALIAS[n] || n; };

const NOT_SAME_CAR: Record<string, string[]> = { innova: ['hycross'], thar: ['roxx'], creta: ['electric'], 'grand i10': ['nios'], xuv300: [], 'range rover': ['velar', 'evoque', 'sport'] };

/** Real photo of this exact model (free-licensed, white background) when we have one. */
export function modelPhoto(brand?: string | null, model?: string | null): string | null {
  const b = brandKey(brand), m = ` ${norm(model)} `;
  if (!m.trim()) return null;
  let best: { file: string; len: number } | null = null;
  for (const p of MODEL_PHOTOS) {
    if (b && norm(p.brand) !== b) continue;
    const k = norm(p.model);
    // "Swift VXi" matches "Swift"; "Range Rover Evoque SE" matches "Range Rover Evoque"
    // a different car that shares the name (Innova Hycross is not the old Innova)
    if (NOT_SAME_CAR[k]?.some(w => m.includes(` ${w} `))) continue;
    if (m.includes(` ${k} `) && (!best || k.length > best.len)) best = { file: p.file, len: k.length };
  }
  return best?.file || null;
}

/** Picture of a customer's car on a white background: model photo when we have one, else a generic car for its type. */
export function carImage(v?: { model?: string | null; brand?: string | null; category?: string | null } | null): string {
  if (!v) return '/cars/sedan.webp';
  const photo = modelPhoto(v.brand, v.model);
  if (photo) return photo;
  let t: string = normalizeCarType(v.category) || '';
  if (!TYPES.includes(t) && v.model) t = normalizeCarType(getCategoryForModel(v.brand || '', v.model)) || '';
  return `/cars/${TYPES.includes(t) ? t : 'sedan'}.webp`;
}

/** Brand logo (free-licensed) or null → show initials. */
export function brandLogo(brand?: string | null): string | null {
  return BRAND_LOGOS[brandKey(brand)] || null;
}

export const CAR_TYPE_IMAGES: Record<string, string> = Object.fromEntries(TYPES.map(t => [t, `/cars/${t}.webp`]));
