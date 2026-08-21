import { create } from 'zustand';

export interface ServiceCartItem {
  id: number;
  name: string;
  category_name?: string;
  description?: string;
  features_json?: any;
  whats_included_json?: any;
  process_json?: any;
  image_url?: string;
  price_hatchback?: number | string;
  price_medium_hatchback?: number | string;
  price_sedan?: number | string;
  price_premium_sedan?: number | string;
  price_suv?: number | string;
  duration_minutes?: number;
  [key: string]: any;
}

export interface ProductCartItem {
  id: number;
  product_name: string;
  brand?: string;
  selling_price: number | string;
  image_url?: string;
  images_json?: string;
  quantity: number;
  stock: number;
}

interface CartStore {
  servicesCart: ServiceCartItem[];
  productsCart: ProductCartItem[];
  servicesDrawerOpen: boolean;
  productsDrawerOpen: boolean;

  // Services Cart actions
  addServiceToCart: (svc: ServiceCartItem) => void;
  removeServiceFromCart: (svcId: number) => void;
  toggleServiceInCart: (svc: ServiceCartItem) => void;
  clearServicesCart: () => void;
  setServicesDrawerOpen: (open: boolean) => void;

  // Products Cart actions
  addProductToCart: (prod: any, qty?: number) => void;
  updateProductQty: (prodId: number, qty: number) => void;
  removeProductFromCart: (prodId: number) => void;
  clearProductsCart: () => void;
  setProductsDrawerOpen: (open: boolean) => void;
}

export const useCartStore = create<CartStore>((set, get) => ({
  servicesCart: [],
  productsCart: [],
  servicesDrawerOpen: false,
  productsDrawerOpen: false,

  addServiceToCart: (svc) => {
    set((state) => {
      if (state.servicesCart.some((item) => item.id === svc.id)) {
        return state;
      }
      return { servicesCart: [...state.servicesCart, svc] };
    });
  },

  removeServiceFromCart: (svcId) => {
    set((state) => ({
      servicesCart: state.servicesCart.filter((item) => item.id !== svcId),
    }));
  },

  toggleServiceInCart: (svc) => {
    set((state) => {
      const exists = state.servicesCart.some((item) => item.id === svc.id);
      if (exists) {
        return { servicesCart: state.servicesCart.filter((item) => item.id !== svc.id) };
      }
      return { servicesCart: [...state.servicesCart, svc] };
    });
  },

  clearServicesCart: () => set({ servicesCart: [] }),
  setServicesDrawerOpen: (open) => set({ servicesDrawerOpen: open }),

  addProductToCart: (prod, qty = 1) => {
    set((state) => {
      const pId = prod.id;
      const existing = state.productsCart.find((item) => item.id === pId);
      const availableStock = parseFloat(prod.quantity || prod.stock || '999');
      const img = prod.images_json ? (typeof prod.images_json === 'string' ? JSON.parse(prod.images_json)[0] : prod.images_json[0]) : (prod.image_url || '');

      if (existing) {
        const newQty = Math.min(availableStock, existing.quantity + qty);
        return {
          productsCart: state.productsCart.map((item) =>
            item.id === pId ? { ...item, quantity: newQty } : item
          ),
        };
      }
      return {
        productsCart: [
          ...state.productsCart,
          {
            id: pId,
            product_name: prod.product_name || prod.name,
            brand: prod.brand || '',
            selling_price: parseFloat(prod.selling_price || prod.price || '0'),
            image_url: img,
            quantity: Math.min(availableStock, qty),
            stock: availableStock,
          },
        ],
      };
    });
  },

  updateProductQty: (prodId, qty) => {
    set((state) => {
      if (qty <= 0) {
        return { productsCart: state.productsCart.filter((item) => item.id !== prodId) };
      }
      return {
        productsCart: state.productsCart.map((item) =>
          item.id === prodId ? { ...item, quantity: Math.min(item.stock, qty) } : item
        ),
      };
    });
  },

  removeProductFromCart: (prodId) => {
    set((state) => ({
      productsCart: state.productsCart.filter((item) => item.id !== prodId),
    }));
  },

  clearProductsCart: () => set({ productsCart: [] }),
  setProductsDrawerOpen: (open) => set({ productsDrawerOpen: open }),
}));
