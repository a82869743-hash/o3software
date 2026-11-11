import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface MyVehicle {
  id: number;
  brand: string;
  model: string;
  registration_no?: string | null;
  category?: string | null;
  is_primary?: number;
}

interface VehicleStore {
  selectedId: number | null;
  sheetOpen: boolean;
  select: (id: number | null) => void;
  openSheet: () => void;
  closeSheet: () => void;
}

/** The customer's currently selected car (drives prices shown across the app). */
export const useVehicleStore = create<VehicleStore>()(
  persist(
    (set) => ({
      selectedId: null,
      sheetOpen: false,
      select: (id) => set({ selectedId: id, sheetOpen: false }),
      openSheet: () => set({ sheetOpen: true }),
      closeSheet: () => set({ sheetOpen: false }),
    }),
    { name: 'o3-selected-vehicle', partialize: (s) => ({ selectedId: s.selectedId }) as any }
  )
);

export const CATEGORY_LABEL: Record<string, string> = {
  hatchback: 'Hatchback', semi_sedan: 'Mini SUV', sedan: 'Sedan',
  premium_sedan: 'Luxury', suv: 'SUV', premium_suv: 'Luxury + SUV',
};

/** Price of a service for a car category (falls back sensibly when a tier is empty). */
export function priceForCategory(svc: any, category?: string | null): number {
  const order = ['hatchback', 'semi_sedan', 'sedan', 'premium_sedan', 'suv', 'premium_suv'];
  const c = category && order.includes(category) ? category : 'sedan';
  const v = Number(svc?.[`price_${c}`]);
  if (v > 0) return v;
  for (const k of order) { const n = Number(svc?.[`price_${k}`]); if (n > 0) return n; }
  return 0;
}

export function minPrice(svc: any): number {
  const vals = ['hatchback', 'semi_sedan', 'sedan', 'premium_sedan', 'suv', 'premium_suv']
    .map(k => Number(svc?.[`price_${k}`])).filter(n => n > 0);
  return vals.length ? Math.min(...vals) : 0;
}
