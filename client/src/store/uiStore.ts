import { create } from 'zustand';
import { ToastType } from '../types';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface UIStore {
  sidebarOpen: boolean;
  toasts: ToastItem[];
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toast: (type: ToastType, message: string) => void;
  dismissToast: (id: string) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  toasts: [],
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toast: (type, message) => {
    const id = `${Date.now()}-${Math.random()}`;
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })), 3500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
