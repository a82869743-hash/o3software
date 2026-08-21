import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types';

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (token, user) => set({ token, user, isAuthenticated: true }),
      logout: () => {
        set({ token: null, user: null, isAuthenticated: false });
        // Also clear any legacy localStorage entry
        try { localStorage.removeItem('gk-auth-v1'); } catch {}
        window.location.href = '/login';
      },
      updateUser: (updates) => set({ user: { ...get().user!, ...updates } }),
    }),
    {
      name: 'gk-auth-v1',
      storage: {
        getItem: (name) => {
          // Try sessionStorage first, fall back to localStorage for migration
          const session = sessionStorage.getItem(name);
          if (session) return JSON.parse(session);
          const local = localStorage.getItem(name);
          if (local) {
            // Migrate: move to sessionStorage, remove from localStorage
            sessionStorage.setItem(name, local);
            localStorage.removeItem(name);
            return JSON.parse(local);
          }
          return null;
        },
        setItem: (name, value) => {
          sessionStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          sessionStorage.removeItem(name);
          localStorage.removeItem(name); // Clean up legacy
        },
      },
    }
  )
);
