import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import api from '../api/axiosInstance';

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE = 5 * 60 * 1000;      // Show warning 5 min before logout
const TOKEN_REFRESH_INTERVAL = 45 * 60 * 1000; // Refresh token every 45 min

/**
 * Auto-logout hook: tracks mouse, keyboard, touch, and scroll events.
 * After 30 minutes of inactivity, logs the user out.
 * Shows a warning toast at 25 minutes.
 */
export function useInactivityTimer() {
  const { isAuthenticated, logout } = useAuthStore();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningShownRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    warningShownRef.current = false;
  }, []);

  const resetTimer = useCallback(() => {
    if (!isAuthenticated) return;

    clearTimers();

    // Warning timer (5 min before logout)
    warningRef.current = setTimeout(() => {
      if (!warningShownRef.current) {
        warningShownRef.current = true;
        // Dispatch a custom event that the Toast component can listen to
        window.dispatchEvent(new CustomEvent('gk-inactivity-warning', {
          detail: { message: 'You will be logged out in 5 minutes due to inactivity.' }
        }));
      }
    }, INACTIVITY_TIMEOUT - WARNING_BEFORE);

    // Logout timer
    timeoutRef.current = setTimeout(() => {
      console.log('[SESSION] Auto-logout due to inactivity');
      logout();
    }, INACTIVITY_TIMEOUT);
  }, [isAuthenticated, logout, clearTimers]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearTimers();
      return;
    }

    // Track user activity events
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    
    // Throttle — only reset timer at most once per 30 seconds to reduce overhead
    let lastReset = 0;
    const throttledReset = () => {
      const now = Date.now();
      if (now - lastReset > 30000) {
        lastReset = now;
        resetTimer();
      }
    };

    events.forEach(event => {
      document.addEventListener(event, throttledReset, { passive: true });
    });

    // Initial timer start
    resetTimer();

    return () => {
      clearTimers();
      events.forEach(event => {
        document.removeEventListener(event, throttledReset);
      });
    };
  }, [isAuthenticated, resetTimer, clearTimers]);
}

/**
 * Silent token refresh hook.
 * - On mount: checks if the JWT is expired → logs out
 * - While active: refreshes the token every 45 min so users never hit the 1h expiry wall
 */
export function useTokenRefresh() {
  const { isAuthenticated, token, login, logout } = useAuthStore();
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Parse JWT expiry without a library
  const getTokenExp = useCallback((jwt: string | null): number | null => {
    if (!jwt) return null;
    try {
      const payload = JSON.parse(atob(jwt.split('.')[1]));
      return payload.exp ? payload.exp * 1000 : null; // Convert to ms
    } catch {
      return null;
    }
  }, []);

  // Refresh the token via /auth/refresh
  const doRefresh = useCallback(async () => {
    try {
      const res = await api.post('/auth/refresh');
      if (res.data?.success && res.data.data?.token) {
        login(res.data.data.token, res.data.data.user);
        console.log('[SESSION] Token refreshed silently');
      }
    } catch (err) {
      console.error('[SESSION] Token refresh failed:', err);
      // 401 will be handled by axios interceptor → auto-logout
    }
  }, [login]);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      if (refreshRef.current) clearInterval(refreshRef.current);
      return;
    }

    // Check if token is already expired on mount
    const exp = getTokenExp(token);
    if (exp && Date.now() >= exp) {
      console.log('[SESSION] Token expired on load — logging out');
      logout();
      return;
    }

    // Set up periodic silent refresh (every 45 min)
    refreshRef.current = setInterval(() => {
      doRefresh();
    }, TOKEN_REFRESH_INTERVAL);

    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [isAuthenticated, token, getTokenExp, doRefresh, logout]);
}
