import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Pin = { lat: number; lng: number };

const icon = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#2563EB;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);transform:rotate(-45deg)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

/**
 * Map with a draggable pin (OpenStreetMap tiles, free). The customer drags the pin or taps the map
 * to mark the exact gate, so pickup / drop never depends on a rough laptop or phone location.
 */
export default function PinPicker({ pin, onChange, height = 220 }: { pin: Pin; onChange: (p: Pin) => void; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!box.current || map.current) return;
    // kept inside India and never zoomed out to the whole world
    const m = L.map(box.current, {
      zoomControl: true, attributionControl: false, minZoom: 5,
      maxBounds: L.latLngBounds([5, 66], [38, 99]), maxBoundsViscosity: 1,
    }).setView([pin.lat, pin.lng], 18);
    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
    // satellite photo view (free) — customers can see their own building / gate
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });
    const labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });
    street.addTo(m);
    L.control.layers({ Map: street, Satellite: L.layerGroup([sat, labels]) }, undefined, { position: 'topright', collapsed: false }).addTo(m);
    // the map is often shown inside a box that was hidden a moment ago — redraw so tiles are not grey
    setTimeout(() => m.invalidateSize(), 150);
    const mk = L.marker([pin.lat, pin.lng], { draggable: true, icon }).addTo(m);
    mk.on('dragend', () => { const p = mk.getLatLng(); cb.current({ lat: p.lat, lng: p.lng }); });
    m.on('click', (e: L.LeafletMouseEvent) => { mk.setLatLng(e.latlng); cb.current({ lat: e.latlng.lat, lng: e.latlng.lng }); });
    map.current = m; marker.current = mk;
    return () => { m.remove(); map.current = null; marker.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pin moved from outside (GPS, address search, saved address)
  useEffect(() => {
    const mk = marker.current, m = map.current;
    if (!mk || !m) return;
    const cur = mk.getLatLng();
    if (Math.abs(cur.lat - pin.lat) > 1e-7 || Math.abs(cur.lng - pin.lng) > 1e-7) {
      mk.setLatLng([pin.lat, pin.lng]);
      m.setView([pin.lat, pin.lng], Math.max(m.getZoom(), 18));
    }
  }, [pin.lat, pin.lng]);

  return <div ref={box} style={{ height }} className="w-full rounded-xl overflow-hidden border border-gray-200 z-0" />;
}
