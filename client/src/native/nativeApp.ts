// Phone-app (Android) behaviour. Does nothing in a normal browser.
//
// The app shows the live site inside an Android WebView. A WebView cannot do a few things a browser does,
// so this file fills those gaps:
//  - files the site "downloads" (invoices, job cards, reports, Excel templates) are saved on the phone and opened;
//  - window.open(...) for invoices opens the PDF instead of leaving the app on a blank page;
//  - links to WhatsApp, Maps, phone and UPI open those apps;
//  - the phone's Back button goes back a page, and leaves the app from a home screen.
import { Capacitor } from '@capacitor/core';

export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

const extFromMime = (mime: string): string => {
  const hit = Object.entries(MIME_BY_EXT).find(([, m]) => m === mime);
  return hit ? hit[0] : 'pdf';
};

const safeName = (name: string): string =>
  name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 120) || `O3_${Date.now()}.pdf`;

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.readAsDataURL(blob);
  });

let busy = false;

/** Save a file on the phone and open it (PDF viewer, Sheets...). Falls back to the share sheet. */
export async function saveAndOpenFile(blob: Blob, fileName: string): Promise<void> {
  if (busy) return;
  busy = true;
  const { toast } = await import('react-hot-toast');
  const tid = toast.loading('Opening file…');
  try {
    const [{ Filesystem, Directory }, { FileOpener }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor-community/file-opener'),
    ]);
    let name = safeName(fileName);
    if (!/\.[a-z0-9]{2,5}$/i.test(name)) name += '.' + extFromMime(blob.type);
    const ext = name.split('.').pop()!.toLowerCase();
    const mime = blob.type && blob.type !== 'application/octet-stream' ? blob.type : MIME_BY_EXT[ext] || 'application/octet-stream';
    const data = await blobToBase64(blob);
    const saved = await Filesystem.writeFile({ path: `O3CarSpaa/${name}`, data, directory: Directory.Cache, recursive: true });
    toast.dismiss(tid);
    try {
      await FileOpener.open({ filePath: saved.uri, contentType: mime, openWithDefault: true });
    } catch {
      // no app on the phone opens this type: let the user pick where to send or save it
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: name, files: [saved.uri], dialogTitle: 'Save or share' });
    }
  } catch (e: any) {
    toast.dismiss(tid);
    if (!/cancel/i.test(String(e?.message || e))) toast.error('Could not open the file. Please try again.');
  } finally {
    busy = false;
  }
}

const fileNameFromResponse = (res: Response, url: URL): string => {
  const cd = res.headers.get('content-disposition') || '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  if (m) return decodeURIComponent(m[1]);
  const last = url.pathname.split('/').filter(Boolean);
  // e.g. /api/payments/12/invoice -> invoice-12.pdf
  const tail = last[last.length - 1] || 'file';
  const id = last.find((p) => /^\d+$/.test(p));
  return `${tail}${id ? '-' + id : ''}`;
};

/** Fetch a file from our own server (the URL already carries the login token when needed) and open it. */
async function openServerFile(url: URL): Promise<void> {
  const { useAuthStore } = await import('../store/authStore');
  const token = useAuthStore.getState().token;
  const res = await fetch(url.toString(), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const { toast } = await import('react-hot-toast');
    toast.error(res.status === 401 ? 'Please sign in again.' : 'Could not load the file.');
    return;
  }
  const blob = await res.blob();
  await saveAndOpenFile(blob, fileNameFromResponse(res, url));
}

const HOME_PATHS = new Set(['/', '/login', '/admin', '/customer']);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Full-screen pop-ups / drawers currently on screen, bottom-most first. */
const openOverlays = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>('.fixed.inset-0')).filter((el) => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetWidth > 0 && s.pointerEvents !== 'none';
  });

export function installNativeApp(): void {
  if (!isNativeApp()) return;
  document.documentElement.classList.add('native-app');

  // 1. Remember every Blob the site turns into a link, so a download can be saved even after the link is revoked.
  const blobs = new Map<string, Blob>();
  const origCreate = URL.createObjectURL.bind(URL);
  const origRevoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (obj: Blob | MediaSource) => {
    const u = origCreate(obj);
    if (obj instanceof Blob) blobs.set(u, obj);
    return u;
  };
  URL.revokeObjectURL = (u: string) => {
    // keep it long enough for the save to finish
    setTimeout(() => { blobs.delete(u); origRevoke(u); }, 60_000);
  };

  const handleUrl = (raw: string, suggestedName?: string): boolean => {
    if (!raw) return false;
    if (raw.startsWith('blob:')) {
      const b = blobs.get(raw);
      if (b) { void saveAndOpenFile(b, suggestedName || `O3_${Date.now()}`); return true; }
      void fetch(raw).then((r) => r.blob()).then((bb) => saveAndOpenFile(bb, suggestedName || `O3_${Date.now()}`));
      return true;
    }
    let url: URL;
    try { url = new URL(raw, window.location.href); } catch { return false; }
    if (url.origin === window.location.origin) {
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
        void openServerFile(url);
        return true;
      }
      return false; // a page of the app itself: normal in-app navigation
    }
    // another site or app (WhatsApp, Maps, phone, UPI): the app hands it to Android, which opens the right app
    window.location.href = url.toString();
    return true;
  };

  // 2. <a download> / blob links, whether clicked by the user or by code (link.click())
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    const href = this.getAttribute('href') || '';
    if ((this.hasAttribute('download') || href.startsWith('blob:')) && handleUrl(this.href, this.getAttribute('download') || undefined)) return;
    return origClick.call(this);
  };
  document.addEventListener('click', (ev) => {
    const a = (ev.target as Element | null)?.closest?.('a');
    if (!a || ev.defaultPrevented) return;
    const href = a.getAttribute('href') || '';
    const isFile = a.hasAttribute('download') || href.startsWith('blob:');
    const isNewTab = a.getAttribute('target') === '_blank';
    if (!isFile && !isNewTab) return;
    if (handleUrl(a.href, a.getAttribute('download') || undefined)) ev.preventDefault();
  }, true);

  // 3. window.open(...) — the app has a single screen, so open files / other apps instead
  const origOpen = window.open.bind(window);
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const raw = url ? String(url) : '';
    if (handleUrl(raw)) return null;
    if (raw) { window.location.href = new URL(raw, window.location.href).toString(); return null; }
    return origOpen(url as any, target, features);
  }) as typeof window.open;

  // 4. Back button and app start
  void (async () => {
    const [{ App }, { SplashScreen }] = await Promise.all([import('@capacitor/app'), import('@capacitor/splash-screen')]);
    App.addListener('backButton', async ({ canGoBack }) => {
      // close an open pop-up / side menu first: Escape key, then a tap on its dark background
      const overlays = openOverlays();
      if (overlays.length) {
        const top = overlays[overlays.length - 1];
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await wait(80);
        if (!document.contains(top) || openOverlays().length < overlays.length) return;
        top.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        top.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await wait(80);
        if (!document.contains(top) || openOverlays().length < overlays.length) return;
      }
      const path = window.location.pathname.replace(/\/+$/, '') || '/';
      if (HOME_PATHS.has(path) || !canGoBack) {
        if (HOME_PATHS.has(path)) void App.minimizeApp();
        else window.location.replace('/');
        return;
      }
      window.history.back();
    });
    void SplashScreen.hide();
  })();
}
