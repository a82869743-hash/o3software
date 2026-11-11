import { useEffect, useState } from 'react';
import { MapPin, Crosshair, Save, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axiosInstance';
import GpsOffPrompt, { GpsProblem } from '../shared/GpsOffPrompt';
import { getLocation, parseCoords, mapEmbedUrl } from '../../utils/location';

/** Admin sets where staff may check in: a pin (Google Maps link, coordinates or "use my location") and a radius. */
export default function StudioPremisesCard() {
  const [name, setName] = useState('');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(150);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState<'' | 'gps' | 'save'>('');
  const [gpsProblem, setGpsProblem] = useState<GpsProblem>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api.get('/staff/premises').then(r => {
      const f = r.data.data;
      if (!f) return;
      setName(f.name);
      if (f.latitude != null) setPin({ lat: parseFloat(f.latitude), lng: parseFloat(f.longitude) });
      setRadius(f.geofence_radius_m || 150);
    }).catch(() => {});
  }, []);

  const fromLink = (v: string) => {
    setLink(v);
    const c = parseCoords(v);
    if (c) { setPin(c); setDirty(true); }
  };

  const useMine = async () => {
    setBusy('gps');
    try {
      const f = await getLocation();
      setPin({ lat: f.lat, lng: f.lng });
      setDirty(true);
      toast.success(`Pinned your location (±${f.accuracy} m)`);
    } catch (p: any) {
      setGpsProblem(p);
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    if (!pin) return toast.error('Set the studio location first');
    setBusy('save');
    try {
      await api.put('/staff/premises', { latitude: pin.lat, longitude: pin.lng, radius_m: radius });
      toast.success('Studio premises saved');
      setDirty(false);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Could not save');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
      <GpsOffPrompt purpose="attendance" problem={gpsProblem} onClose={() => setGpsProblem(null)} onRetry={() => { setGpsProblem(null); useMine(); }} />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-extrabold text-[#0F172A] flex items-center gap-2"><MapPin size={18} className="text-[#2563EB]" /> Studio premises</h3>
          <p className="text-xs text-gray-500 mt-0.5">Staff can check in and out only inside this circle{name ? ` around ${name}` : ''}.</p>
        </div>
        <button onClick={save} disabled={!dirty || busy !== ''}
          className="px-4 py-2 rounded-xl bg-[#2563EB] text-white text-sm font-bold flex items-center gap-1.5 disabled:opacity-40">
          {busy === 'save' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <div className="space-y-3">
          <div>
            <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Google Maps link or coordinates</label>
            <input value={link} onChange={e => fromLink(e.target.value)} placeholder="Paste the studio's Google Maps link"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#2563EB]" />
            {link && !parseCoords(link) && <p className="text-[11px] text-rose-600 mt-1">No location found in this link. Open the place in Google Maps and copy the full link from the address bar.</p>}
          </div>
          <button onClick={useMine} disabled={busy !== ''} type="button"
            className="w-full py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {busy === 'gps' ? <Loader2 size={15} className="animate-spin" /> : <Crosshair size={15} />} Use my current location (stand at the studio)
          </button>
          <div>
            <div className="flex justify-between text-[12px] font-semibold text-slate-600 mb-1.5">
              <span>Allowed distance</span><span className="text-[#2563EB]">{radius} m</span>
            </div>
            <input type="range" min={30} max={500} step={10} value={radius} onChange={e => { setRadius(Number(e.target.value)); setDirty(true); }} className="w-full accent-[#2563EB]" />
            <p className="text-[11px] text-gray-400">100–200 m works for most studios. Phone GPS can be off by 20–50 m indoors.</p>
          </div>
          {pin && <p className="text-[11px] font-mono text-slate-500">{pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}</p>}
        </div>
        <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 min-h-[200px]">
          {pin
            ? <iframe title="Studio map" src={mapEmbedUrl(pin.lat, pin.lng)} className="w-full h-full min-h-[220px]" loading="lazy" />
            : <div className="h-full min-h-[220px] flex items-center justify-center text-sm text-slate-400">Location not set</div>}
        </div>
      </div>
    </div>
  );
}
