import { useEffect, useRef, useState } from 'react';
import { Navigation, MapPin, CheckCircle, Package, Satellite } from 'lucide-react';
import io, { Socket } from 'socket.io-client';
import { useAuthStore } from '../../store/authStore';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import EmptyState from '../../components/shared/EmptyState';
import GpsOffPrompt, { GpsProblem, gpsProblemFrom } from '../../components/shared/GpsOffPrompt';
import { useUIStore } from '../../store/uiStore';
import api from '../../api/axiosInstance';
import { socketUrl } from '../../utils/endpoints';
import { useLiveReload } from '../../utils/liveUpdates';

/** Google Maps directions: the exact pin when the customer shared one, else the typed address. */
function directionsUrl(lat: any, lng: any, address?: string) {
  const dest = lat && lng ? `${lat},${lng}` : encodeURIComponent(address || '');
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
}

/** Driver screen: deliveries assigned to me + real GPS sharing (with "GPS off" handling). */
export default function DeliveryPage() {
  const token = useAuthStore(s => s.token);
  const toast = useUIStore(s => s.toast);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [problem, setProblem] = useState<GpsProblem>(null);
  const [lastFix, setLastFix] = useState<{ at: number; accuracy: number } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const watchRef = useRef<number | null>(null);
  const lastSentRef = useRef(0);

  const [pickups, setPickups] = useState<any[]>([]);
  const load = async () => {
    try {
      const [{ data }, pk] = await Promise.all([
        api.get('/deliveries/assigned'),
        api.get('/pickup-requests').catch(() => ({ data: { data: [] } })),
      ]);
      setDeliveries(data.data || []);
      setPickups((pk.data.data || []).filter((p: any) => ['assigned', 'pending'].includes(p.status)));
    }
    catch (e: any) { toast('error', e.message); } finally { setLoading(false); }
  };
  const pickedUp = async (id: number) => {
    try { await api.patch(`/pickup-requests/${id}/picked-up`); toast('success', 'Marked as picked up'); load(); }
    catch (e: any) { toast('error', e.message); }
  };
  useLiveReload(() => { load(); }); // reload when anything changes elsewhere
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const s = io(socketUrl(), { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = s;
    return () => { s.disconnect(); };
  }, [token]);

  const stopWatch = () => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
  };
  useEffect(() => () => stopWatch(), []);

  const reportProblem = (id: number, p: GpsProblem) => {
    setProblem(p);
    api.patch(`/deliveries/${id}/location`, { gps_status: p || 'off' }).catch(() => {});
  };

  const start = async (id: number) => {
    if (!('geolocation' in navigator)) { reportProblem(id, 'unsupported'); return; }
    try {
      const perm = await (navigator as any).permissions?.query({ name: 'geolocation' });
      if (perm && perm.state === 'denied') { reportProblem(id, 'denied'); return; }
    } catch { /* permissions API not available — continue */ }

    // drop task waiting at the studio → mark it on the way (customer gets the "on the way" message)
    const d = deliveries.find((x: any) => x.id === id);
    if (d && d.status === 'assigned') {
      try { await api.patch(`/deliveries/${id}/start`); load(); }
      catch (e: any) { toast('error', e?.response?.data?.error || 'Could not start delivery'); return; }
    }
    stopWatch();
    setActiveId(id);
    socketRef.current?.emit('join_delivery', { deliveryId: id });
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setProblem(null);
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        setLastFix({ at: Date.now(), accuracy });
        // live via socket every fix; persist to the server at most every 10s
        socketRef.current?.emit('location_update', { deliveryId: id, lat, lng });
        if (Date.now() - lastSentRef.current > 10000) {
          lastSentRef.current = Date.now();
          api.patch(`/deliveries/${id}/location`, { lat, lng }).catch(() => {});
        }
      },
      (err) => reportProblem(id, gpsProblemFrom(err)),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    toast('success', 'Live location sharing started — keep this screen open');
  };

  const stop = () => { stopWatch(); setActiveId(null); setLastFix(null); };

  const complete = async (id: number) => {
    if (!confirm('Mark this car as delivered to the customer?')) return;
    try {
      await api.patch(`/deliveries/${id}/complete`);
      toast('success', 'Delivery completed');
      if (activeId === id) stop();
      load();
    } catch (e: any) { toast('error', e.message); }
  };

  const ageSec = lastFix ? Math.round((Date.now() - lastFix.at) / 1000) : null;

  return (
    <>
      <AdminTopBar title="My Deliveries" subtitle="Share your live location with the customer while delivering" />
      <GpsOffPrompt problem={problem} onClose={() => setProblem(null)} onRetry={() => { setProblem(null); if (activeId || deliveries[0]) start(activeId || deliveries[0].id); }} />

      {pickups.length > 0 && (
        <div className="mb-6">
          <h3 className="font-extrabold text-[#0F172A] mb-2">Cars to pick up</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {pickups.map((p: any) => (
              <div key={p.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-2">
                <div className="flex justify-between gap-2">
                  <p className="font-bold text-sm">{p.customer_name}</p>
                  <a href={`tel:${p.customer_mobile}`} className="text-[#2563EB] text-sm font-medium">{p.customer_mobile}</a>
                </div>
                <p className="text-xs text-slate-600">{p.address}</p>
                {p.scheduled_time && <p className="text-xs font-bold text-blue-700">Pickup at {new Date(p.scheduled_time).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>}
                <div className="flex gap-2 pt-1">
                  <a target="_blank" rel="noreferrer" href={directionsUrl(p.latitude, p.longitude, p.address)}
                    className="flex-1 text-center py-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100">
                    Navigate{p.latitude ? ' (exact pin)' : ''}</a>
                  <button onClick={() => pickedUp(p.id)} className="flex-1 py-2 rounded-lg bg-black text-white text-xs font-bold">Picked up</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2"><SkeletonCard /><SkeletonCard /></div>
      ) : !deliveries.length ? (
        <EmptyState icon={Package} title="No deliveries assigned" description="When the studio assigns you a delivery it will appear here." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {deliveries.map((d: any) => {
            const live = activeId === d.id;
            return (
              <div key={d.id} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-[#0F172A] text-lg">{d.registration_no}</h3>
                    <p className="text-sm text-[#64748B]">{d.brand} {d.model}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase ${live ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-50 text-blue-700'}`}>
                    {live ? 'Sharing live' : d.status === 'assigned' ? 'Ready to deliver' : 'In transit'}
                  </span>
                </div>
                <div className="bg-[#F8FAFC] p-4 rounded-xl border border-gray-100 mb-4 space-y-1">
                  <p className="font-bold text-sm">{d.customer_name}</p>
                  <a href={`tel:${d.customer_mobile}`} className="text-[#2563EB] text-sm font-medium">{d.customer_mobile}</a>
                  {d.address_to && <p className="text-xs text-slate-600">{d.address_to}</p>}
                  {(d.customer_lat || d.address_to) && (
                    <a className="text-xs font-bold text-blue-600" target="_blank" rel="noreferrer" href={directionsUrl(d.customer_lat, d.customer_lng, d.address_to)}>
                      Navigate in Google Maps →{d.customer_lat ? ' (exact pin)' : ''}</a>
                  )}
                </div>
                {live && (
                  <p className="text-xs text-slate-600 mb-3 flex items-center gap-1">
                    <Satellite size={13} className="text-emerald-600" />
                    {lastFix ? `GPS fix ${ageSec}s ago · ±${Math.round(lastFix.accuracy)} m` : 'Waiting for GPS…'}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => (live ? stop() : start(d.id))}
                    icon={live ? <MapPin size={16} className="animate-pulse" /> : <Navigation size={16} />}>
                    {live ? 'Stop sharing' : d.status === 'assigned' ? 'Start delivery (share live location)' : 'Start live location'}
                  </Button>
                  <Button onClick={() => complete(d.id)} className="bg-black hover:bg-gray-800 text-white border-0" icon={<CheckCircle size={16} />}>
                    Delivered
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
