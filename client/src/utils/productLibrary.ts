/** Product photo library (client/public/product-library) — kept apart from the service / package photos. */
const FILES: Record<string, string> = {
  'car-shampoo': 'Car shampoo',
  'microfiber-cloth': 'Microfiber cloths',
  'tyre-shine': 'Tyre shine',
  'dashboard-polish': 'Dashboard polish',
  'glass-cleaner': 'Glass cleaner',
  'car-perfume-gel': 'Car perfume gel',
  'ceramic-spray': 'Ceramic spray',
  'carnauba-wax': 'Carnauba wax',
  'car-vacuum': 'Car vacuum',
  'tyre-inflator': 'Tyre inflator',
  'seat-cover': 'Seat cover',
  'floor-mats': 'Floor mats',
};

export const PRODUCT_LIBRARY = Object.entries(FILES).map(([key, label]) => ({ key, label, url: `/product-library/${key}.webp` }));
