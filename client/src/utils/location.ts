import type { GpsProblem } from '../components/shared/GpsOffPrompt';

export type Fix = { lat: number; lng: number; accuracy: number };

/** 'granted' | 'prompt' | 'denied' | 'unknown' — lets screens auto-detect when location is already allowed. */
export async function locationPermission(): Promise<'granted' | 'prompt' | 'denied' | 'unknown'> {
  try {
    const p = await (navigator as any).permissions?.query({ name: 'geolocation' });
    return p?.state || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Current position. Asks for permission if needed (the phone shows its own "Allow location" /
 * "Turn on location" prompt). Waits for a good fix (≤ 50 m) for up to `waitMs`, else returns the best one.
 * Rejects with a GpsProblem ('denied' | 'off' | 'timeout' | 'unsupported').
 */
export function getLocation(waitMs = 12000): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject('unsupported' as GpsProblem);
    // Browsers silently block location on plain http pages (e.g. testing on a phone over Wi-Fi).
    if (typeof window !== 'undefined' && window.isSecureContext === false) return reject('insecure' as GpsProblem);
    let best: Fix | null = null;
    let done = false;
    const finish = (ok: boolean, why?: GpsProblem) => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(id);
      clearTimeout(timer);
      if (ok && best) resolve(best); else reject(why || 'timeout');
    };
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy || 0) };
        if (!best || fix.accuracy < best.accuracy) best = fix;
        if (fix.accuracy <= 50) finish(true);
      },
      (e) => finish(false, e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'off'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: waitMs },
    );
    const timer = setTimeout(() => (best ? finish(true) : finish(false, 'timeout')), waitMs);
  });
}

export type Place = { address: string; city: string; state: string; pincode: string; landmark: string };

/** Address for a point (OpenStreetMap, free, no key). Empty fields if it fails. */
export async function addressFor(lat: number, lng: number): Promise<Place> {
  const empty = { address: '', city: '', state: '', pincode: '', landmark: '' };
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, { headers: { 'Accept-Language': 'en' } });
    if (!r.ok) return empty;
    const j = await r.json();
    const a = j.address || {};
    const street = [a.house_number, a.building, a.road, a.neighbourhood, a.suburb].filter(Boolean).join(', ');
    return {
      address: street || (j.display_name || '').split(',').slice(0, 3).join(',').trim(),
      landmark: a.amenity || a.shop || '',
      city: a.city || a.town || a.village || a.county || '',
      state: a.state || '',
      pincode: a.postcode || '',
    };
  } catch {
    return empty;
  }
}

/** Point for a typed address (OpenStreetMap search, India only). Tries the full text, then fewer parts. null if not found. */
export async function pointFor(parts: string[]): Promise<{ lat: number; lng: number } | null> {
  const clean = parts.map(p => (p || '').trim()).filter(Boolean);
  for (let i = 0; i < clean.length - 1 || i === 0; i++) {
    const q = clean.slice(i).join(', ');
    if (!q) break;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=in&limit=1&q=${encodeURIComponent(q)}`, { headers: { 'Accept-Language': 'en' } });
      const j = r.ok ? await r.json() : [];
      if (j[0]) return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) };
    } catch { /* try a shorter query */ }
  }
  return null;
}

/** Lat/lng from a Google Maps link or "22.53, 72.92" text. Prefers the place pin (!3d…!4d…) over the map centre (@…). */
export function parseCoords(text: string): { lat: number; lng: number } | null {
  const t = decodeURIComponent(text || '');
  const pin = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(t);
  const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(t);
  const q = /[?&](?:q|query|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/.exec(t);
  const plain = /^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/.exec(t);
  const m = pin || q || at || plain;
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/** Small map preview (OpenStreetMap embed) around a point. */
export function mapEmbedUrl(lat: number, lng: number, span = 0.004) {
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - span},${lat - span / 2},${lng + span},${lat + span / 2}&layer=mapnik&marker=${lat},${lng}`;
}

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

/** Google Maps driving directions to the customer's exact pin (else the typed address). Starts from `from` when given (e.g. the studio). */
export function directionsUrl(to: { lat?: any; lng?: any; address?: string }, from?: { lat?: any; lng?: any } | null) {
  const dest = to.lat && to.lng ? `${to.lat},${to.lng}` : encodeURIComponent(to.address || '');
  const origin = from?.lat && from?.lng ? `&origin=${from.lat},${from.lng}` : '';
  return `https://www.google.com/maps/dir/?api=1${origin}&destination=${dest}&travelmode=driving`;
}
