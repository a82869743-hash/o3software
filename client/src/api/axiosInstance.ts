import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 120_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT and active franchise ID on every request
api.interceptors.request.use((config) => {
  try {
    // Try sessionStorage first, fall back to localStorage for migration
    const stored = sessionStorage.getItem('gk-auth-v1') || localStorage.getItem('gk-auth-v1');
    if (stored) {
      const { state } = JSON.parse(stored);
      if (state?.token) config.headers.Authorization = `Bearer ${state.token}`;
    }
    const franchiseId = localStorage.getItem('active_franchise_id') || '1';
    config.headers['x-franchise-id'] = franchiseId;
  } catch {
    // Ignore parse errors
  }
  return config;
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
      sessionStorage.removeItem('gk-auth-v1');
      localStorage.removeItem('gk-auth-v1');
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
