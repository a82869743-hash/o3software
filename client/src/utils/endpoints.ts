/**
 * Where the API / socket / uploaded files live.
 * - Web (same origin behind Nginx, or Vite dev proxy): leave VITE_API_URL=/api and VITE_SERVER_ORIGIN empty.
 * - Mobile app build (Capacitor) or separate API host: set VITE_SERVER_ORIGIN=https://api.example.com
 *   and VITE_API_URL=https://api.example.com/api
 */
const RAW_ORIGIN = (import.meta.env.VITE_SERVER_ORIGIN as string | undefined) || '';

export const SERVER_ORIGIN = RAW_ORIGIN.replace(/\/+$/, '');
export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || `${SERVER_ORIGIN}/api`;

/** Socket.io server URL (origin only — never a path, or socket.io treats it as a namespace). */
export function socketUrl(): string {
  return SERVER_ORIGIN || window.location.origin;
}

/** Turn a server-relative upload path (/uploads/...) into a loadable URL. */
export function fileUrl(path?: string | null): string {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  // pictures bundled with the app (library photos, car pictures) load from the app itself, also inside the phone app
  if (/^\/(photos|illustrations|product-library|cars|brands)\//.test(path)) return path;
  return `${SERVER_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * Public web address of the customer app — used in links we send to customers (WhatsApp, referral, tracking).
 * In the browser this is the current site; inside the phone app it must be the real website, so set VITE_PUBLIC_URL.
 */
export const APP_URL = ((import.meta.env.VITE_PUBLIC_URL as string | undefined) || window.location.origin).replace(/\/+$/, '');
