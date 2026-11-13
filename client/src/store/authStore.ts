import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types';
import { API_BASE } from '../utils/endpoints';

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
        const token = get().token;
        if (token) {
          // Invalidate the session server-side as well (fire and forget); in the phone app this also
          // stops this person's alerts on this phone
          const pushToken = (window as any).__o3PushToken as string | undefined;
          fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            keepalive: true,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(pushToken ? { push_token: pushToken } : {}),
          }).catch(() => {});
        }
        set({ token: null, user: null, isAuthenticated: false });
        try { localStorage.removeItem('o3-auth-v1'); sessionStorage.removeItem('o3-auth-v1'); } catch {}
        window.location.href = '/login';
      },
      updateUser: (updates) => set({ user: { ...get().user!, ...updates } }),
    }),
    {
      name: 'o3-auth-v1',
      storage: {
        // Kept in localStorage so a new tab, a refresh or reopening the app stays signed in
        // (studio logins still end after inactivity — see useInactivityTimer).
        getItem: (name) => {
          try {
            const local = localStorage.getItem(name);
            if (local) return JSON.parse(local);
            const session = sessionStorage.getItem(name); // older sessions
            if (session) { localStorage.setItem(name, session); sessionStorage.removeItem(name); return JSON.parse(session); }
          } catch { /* storage blocked */ }
          return null;
        },
        setItem: (name, value) => {
          try { localStorage.setItem(name, JSON.stringify(value)); } catch { sessionStorage.setItem(name, JSON.stringify(value)); }
        },
        removeItem: (name) => {
          sessionStorage.removeItem(name);
          localStorage.removeItem(name); // Clean up legacy
        },
      },
    }
  )
);
