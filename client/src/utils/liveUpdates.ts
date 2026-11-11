import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { queryClient } from '../api/queryClient';
import { useAuthStore } from '../store/authStore';
import { socketUrl } from './endpoints';

/**
 * Live updates for every screen. The server sends `data:changed` whenever anyone saves something
 * (see server/src/services/liveEvents.js); we then quietly reload what is on screen. The same happens when the
 * app comes back to the front or the connection returns, so nobody has to pull-to-refresh or reload the page.
 */
const EVENT = 'o3:live-refresh';
let socket: Socket | null = null;
let currentToken: string | null | undefined;
let timer: ReturnType<typeof setTimeout> | null = null;

const isTyping = () => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
};

/** Reload on-screen data soon; waits while someone is typing so a form is never reset under their fingers. */
function refreshSoon(delay = 250) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (isTyping()) { refreshSoon(1500); return; }
    queryClient.invalidateQueries();
    window.dispatchEvent(new Event(EVENT));
  }, delay);
}

function connect(token: string | null) {
  if (socket && token === currentToken) return;
  currentToken = token;
  socket?.disconnect();
  socket = io(socketUrl(), { auth: { token: token || undefined }, transports: ['websocket', 'polling'], reconnectionDelayMax: 5000 });
  socket.on('data:changed', () => refreshSoon());
  let first = true;
  socket.on('connect', () => { if (!first) refreshSoon(); first = false; }); // back online: catch up on anything missed
}

let started = false;
/** Call once at start-up. */
export function startLiveUpdates() {
  if (started) return;
  started = true;
  connect(useAuthStore.getState().token);
  useAuthStore.subscribe((s) => connect(s.token));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshSoon(0); });
  window.addEventListener('online', () => refreshSoon(0));
}

/** For screens that load their own data (not through the shared cache): run `reload` on every live refresh. */
export function useLiveReload(reload: () => unknown) {
  const ref = useRef(reload);
  ref.current = reload;
  useEffect(() => {
    const on = () => { try { ref.current(); } catch { /* ignore */ } };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
}
