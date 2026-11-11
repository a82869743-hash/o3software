import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import api from '../api/axiosInstance';

/**
 * Re-reads the signed-in user's role and permissions from the server on load, every minute and
 * whenever the tab regains focus — so permission changes made by the admin / Super Admin apply
 * without the user logging out.
 */
export function useSessionSync() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const updateUser = useAuthStore((s) => s.updateUser);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const sync = async () => {
      try {
        const { data } = await api.get('/auth/me');
        if (!cancelled && data?.data) {
          const u = data.data;
          updateUser({
            name: u.name,
            role: u.role,
            franchise_id: u.franchise_id,
            franchise_name: u.franchise_name,
            permissions: u.permissions || [],
            custom_role_id: u.custom_role_id,
            profile_picture: u.profile_picture,
            email: u.email,
          });
        }
      } catch {
        /* 401 handled globally by the axios interceptor */
      }
    };
    sync();
    const timer = setInterval(sync, 60_000);
    const onFocus = () => sync();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [isAuthenticated, updateUser]);
}
