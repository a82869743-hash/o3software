import axios from 'axios';
import { API_BASE } from '../utils/endpoints';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 120_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT and active franchise ID on every request
api.interceptors.request.use((config) => {
  try {
    // same place the auth store keeps the login (localStorage), older sessions as fallback
    const stored = localStorage.getItem('o3-auth-v1') || sessionStorage.getItem('o3-auth-v1');
    const state = stored ? JSON.parse(stored).state : null;
    if (state?.token) config.headers.Authorization = `Bearer ${state.token}`;
    // Only the super admin switches studios; everyone else always works in their own studio
    const role = state?.user?.role;
    const franchiseId = role === 'super_admin'
      ? (localStorage.getItem('active_franchise_id') || '1')
      : String(state?.user?.franchise_id || 1);
    config.headers['x-franchise-id'] = franchiseId;
  } catch {
    // Ignore parse errors
  }
  // PDFs / Excel files: instant feedback on the first tap (no double clicks while the file is built)
  if (config.responseType === 'blob') toast.loading('Preparing your file…', { id: 'file-download' });
  return config;
});

const endDownload = (cfg: any) => { if (cfg?.responseType === 'blob') toast.dismiss('file-download'); };
api.interceptors.response.use((res) => { endDownload(res.config); return res; }, (err) => { endDownload(err.config); return Promise.reject(err); });


// After any successful save (create / edit / delete), refresh what is on screen so numbers like stock
// never lag behind (only lists currently shown are re-fetched).
api.interceptors.response.use((res) => {
  const m = (res.config.method || 'get').toLowerCase();
  if (m !== 'get') {
    import('./queryClient').then(({ queryClient }) => queryClient.invalidateQueries()).catch(() => {});
  }
  return res;
});

// Response interceptor — auto-logout on 401, friendly error messages
api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Network error (server down / no connection)
    if (!err.response) {
      err.message = 'Unable to connect to server. Please check your network connection.';
      return Promise.reject(err);
    }

    // Auto-logout on 401 (token expired/invalid)
    if (err.response.status === 401) {
      sessionStorage.removeItem('o3-auth-v1');
      localStorage.removeItem('o3-auth-v1');
      const path = window.location.pathname;
      if (path !== '/login' && path !== '/register') {
        window.location.href = '/login';
      }
    } else if (err.response.status === 403) {
      err.message = err.response.data?.error || 'Access denied: You do not have permission to perform this action.';
    } else if (err.response.status === 404) {
      err.message = err.response.data?.error || 'The requested resource was not found.';
    } else if (err.response.status >= 500) {
      err.message = err.response.data?.error || 'A server error occurred. Please try again.';
    } else if (err.response.data?.error) {
      err.message = err.response.data.error;
    }

    return Promise.reject(err);
  }
);

export default api;
