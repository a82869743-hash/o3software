/**
 * The six car types (price tiers), same as the studio's rate card. Every service and package has one price per type: price_<value>.
 * The stored keys are older names: semi_sedan = Mini SUV, premium_sedan = Luxury, premium_suv = Luxury + SUV.
 * Server mirror: server/src/utils/carCategory.js.
 */
export const CAR_TYPES = [
  { value: 'hatchback', label: 'Hatchback', short: 'Hatch', example: 'Alto, Swift, i20, Baleno' },
  { value: 'sedan', label: 'Sedan', short: 'Sedan', example: 'Dzire, Amaze, City, Verna' },
  { value: 'semi_sedan', label: 'Mini SUV', short: 'Mini SUV', example: 'Nexon, Brezza, Creta, Seltos' },
  { value: 'suv', label: 'SUV', short: 'SUV', example: 'XUV700, Harrier, Innova, Ertiga' },
  { value: 'premium_sedan', label: 'Luxury', short: 'Luxury', example: 'BMW 3, C-Class, Audi A4' },
  { value: 'premium_suv', label: 'Luxury + SUV', short: 'Lux SUV', example: 'Fortuner, Gloster, BMW X5' },
] as const;

export type CarType = typeof CAR_TYPES[number]['value'];
export const CAR_TYPE_VALUES = CAR_TYPES.map(t => t.value) as string[];
export const carTypeLabel = (v?: string | null) => CAR_TYPES.find(t => t.value === normalizeCarType(v))?.label || 'Car';

/** Older saved values → the six types (premium hatchbacks are hatchbacks). */
export function normalizeCarType(v?: string | null): CarType | null {
  if (!v) return null;
  const s = String(v).toLowerCase();
  if (CAR_TYPE_VALUES.includes(s)) return s as CarType;
  if (s === 'medium_hatchback') return 'hatchback';
  if (s === 'luxury') return 'premium_suv';
  return null;
}

/** Empty price map for a service / package form. */
export const emptyPrices = (): Record<string, number> => Object.fromEntries(CAR_TYPES.map(t => [`price_${t.value}`, 0]));
