/**
 * ─── TOAST STORE ─────────────────────────────────────
 * Thin compatibility wrapper around uiStore.toast
 * Provides the { addToast } API used by Phase 2 components.
 */
import { useUIStore } from './uiStore';
import type { ToastType } from '../types';

export const useToastStore = () => {
  const toast = useUIStore((s) => s.toast);
  return {
    addToast: (type: ToastType, message: string) => toast(type, message),
  };
};
