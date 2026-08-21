import { useState, useEffect } from 'react';
import { Truck, MapPin, CheckCircle2, Clock, RefreshCw, User, Car, Phone, Navigation, Eye } from 'lucide-react';
import api from '../../api/axiosInstance';
import AdminTopBar from '../../components/layout/AdminTopBar';
import { useToastStore } from '../../store/toastStore';
import { formatDate } from '../../utils/formatters';
import { useAuthStore } from '../../store/authStore';
import { io } from 'socket.io-client';

interface Delivery {
  id: number;
  job_cart_id: number;
  vehicle_id: number;
  customer_id: number;
  staff_id: number;
  status: 'pending' | 'in_transit' | 'delivered';
  notes: string | null;
  address_from: string | null;
  address_to: string | null;
  last_lat: number | null;
  last_lng: number | null;
  location_updated_at: string | null;
  created_at: string;
  delivered_at: string | null;
  // Joined fields
  staff_name?: string;
  staff_mobile?: string;
  customer_name?: string;
  customer_mobile?: string;
  registration_no?: string;
  brand?: string;
  model?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending:    { label: 'Pending',    color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200',     icon: Clock },
  in_transit: { label: 'In Transit', color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-200',       icon: Navigation },
  delivered:  { label: 'Delivered',  color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
};

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [trackingId, setTrackingId] = useState<number | null>(null);
  const [liveLocation, setLiveLocation] = useState<{ lat: number; lng: number; timestamp: number } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isBroadcastingGps, setIsBroadcastingGps] = useState(false);
  const { addToast } = useToastStore();
  const { token } = useAuthStore();

  const fetchDeliveries = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (filter !== 'all') params.status = filter;
      const res = await api.get('/deliveries', { params });
      if (res.data?.success) {
        setDeliveries(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch deliveries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveries();
    const interval = setInterval(fetchDeliveries, 15000);
    return () => clearInterval(interval);
  }, [filter]);

  // Handle Simulation Drive
  useEffect(() => {
    if (!isSimulating || !trackingId) return;

    let lat = liveLocation?.lat || 22.3072;
    let lng = liveLocation?.lng || 73.1812;

    const simInterval = setInterval(async () => {
      lat += (Math.random() * 0.0004 + 0.0002);
      lng += (Math.random() * 0.0004 + 0.0002);

      setLiveLocation({ lat, lng, timestamp: Date.now() });

      try {
        await api.patch(`/deliveries/${trackingId}/location`, { lat, lng });
      } catch (e) {
        console.error(e);
      }
    }, 3000);

    return () => clearInterval(simInterval);
  }, [isSimulating, trackingId, liveLocation?.lat, liveLocation?.lng]);

  // Handle Device Browser Geolocation
  useEffect(() => {
    if (!isBroadcastingGps || !trackingId) return;

    let watchId: number;
    if (navigator.geolocation) {
      addToast('success', 'Live Device GPS broadcasting enabled');
      watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setLiveLocation({ lat, lng, timestamp: Date.now() });
          try {
            await api.patch(`/deliveries/${trackingId}/location`, { lat, lng });
          } catch (e) {
            console.error(e);
          }
        },
        (err) => {
          addToast('error', 'Device GPS error: ' + err.message);
          setIsBroadcastingGps(false);
        },
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    } else {
      addToast('error', 'Browser does not support GPS Geolocation');
      setIsBroadcastingGps(false);
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [isBroadcastingGps, trackingId]);

  // Poll live location for tracked delivery and connect socket
  useEffect(() => {
    if (!trackingId) {
      setLiveLocation(null);
      setIsSimulating(false);
      setIsBroadcastingGps(false);
      return;
    }

    const fetchLocation = async () => {
      try {
        const res = await api.get(`/deliveries/${trackingId}/location`);
        if (res.data?.success && res.data.data) {
          const lat = parseFloat(res.data.data.last_lat) || 22.3072;
          const lng = parseFloat(res.data.data.last_lng) || 73.1812;
          setLiveLocation({
            lat,
            lng,
            timestamp: res.data.data.location_updated_at ? new Date(res.data.data.location_updated_at).getTime() : Date.now(),
          });
        }
      } catch (err) {
        console.error('Failed to fetch live location:', err);
      }
    };
    fetchLocation();
    const interval = setInterval(fetchLocation, 5000);

    // Socket.io for real-time updates
    let socket: any = null;
    try {
      const socketUrl = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:5000';
      socket = io(socketUrl, { auth: { token }, transports: ['websocket', 'polling'] });

      socket.on('connect', () => {
        socket.emit('join_delivery', { deliveryId: trackingId });
      });

      const handleLocationUpdate = (loc: any) => {
        if (!loc) return;
        const lat = parseFloat(loc.lat);
        const lng = parseFloat(loc.lng);
        if (!isNaN(lat) && !isNaN(lng)) {
          setLiveLocation({ lat, lng, timestamp: Date.now() });
        }
      };

      socket.on('location_update', handleLocationUpdate);
      socket.on('location', handleLocationUpdate);
    } catch (err) {
      console.error('Socket initialization failed:', err);
    }

    return () => {
      clearInterval(interval);
      if (socket) {
        socket.disconnect();
      }
    };
  }, [trackingId, token]);

  const handleComplete = async (id: number) => {
    if (!confirm('Mark this delivery as completed?')) return;
    try {
      await api.patch(`/deliveries/${id}/complete`);
      addToast('success', 'Delivery marked as completed');
      fetchDeliveries();
    } catch {
      addToast('error', 'Failed to complete delivery');
    }
  };

  const stats = {
    total: deliveries.length,
    pending: deliveries.filter(d => d.status === 'pending').length,
    in_transit: deliveries.filter(d => d.status === 'in_transit').length,
    delivered: deliveries.filter(d => d.status === 'delivered').length,
  };

  return (
    <div className="space-y-6">
      <AdminTopBar
        title="Deliveries"
        subtitle="Track and manage vehicle deliveries"
        actions={
          <button
            onClick={fetchDeliveries}
            className="px-3.5 py-2 bg-white text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-50 transition-all flex items-center gap-2 text-sm font-medium shadow-sm"
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { label: 'Total', value: stats.total, color: 'text-gray-700', border: 'border-gray-200' },
          { label: 'Pending', value: stats.pending, color: 'text-amber-600', border: 'border-amber-200' },
          { label: 'In Transit', value: stats.in_transit, color: 'text-blue-600', border: 'border-blue-200' },
          { label: 'Delivered', value: stats.delivered, color: 'text-emerald-600', border: 'border-emerald-200' },
        ]).map(s => (
          <div key={s.label} className={`p-4 rounded-xl bg-white border ${s.border} shadow-sm`}>
            <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {['all', 'pending', 'in_transit', 'delivered'].map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              filter === status
                ? 'bg-[#2563EB] text-white shadow-sm'
                : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-200 hover:text-gray-700'
            }`}
          >
            {status === 'all' ? 'All' : STATUS_CONFIG[status]?.label || status}
          </button>
        ))}
      </div>

      {trackingId && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mb-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center animate-pulse shadow-md">
                <MapPin size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-gray-900">
                    Live GPS Tracking — Delivery #{trackingId}
                  </p>
                  {isSimulating && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider animate-pulse">
                      Simulation Active
                    </span>
                  )}
                  {isBroadcastingGps && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider animate-pulse">
                      Device GPS Active
                    </span>
                  )}
                </div>
                {liveLocation ? (
                  <p className="text-xs text-gray-600 font-mono mt-0.5">
                    Lat: {liveLocation.lat.toFixed(6)}, Lng: {liveLocation.lng.toFixed(6)}
                    {liveLocation.timestamp ? ` · Updated ${Math.max(0, Math.round((Date.now() - liveLocation.timestamp) / 1000))}s ago` : ''}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 mt-0.5">Initializing GPS coordinates...</p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setIsBroadcastingGps(!isBroadcastingGps);
                  if (!isBroadcastingGps) setIsSimulating(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 ${
                  isBroadcastingGps 
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                    : 'bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-50'
                }`}
              >
                <Navigation size={13} />
                {isBroadcastingGps ? 'Stop Device GPS' : '📡 Broadcast Device GPS'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsSimulating(!isSimulating);
                  if (!isSimulating) setIsBroadcastingGps(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 ${
                  isSimulating 
                    ? 'bg-amber-600 text-white hover:bg-amber-700' 
                    : 'bg-white text-amber-700 border border-amber-300 hover:bg-amber-50'
                }`}
              >
                <Truck size={13} />
                {isSimulating ? 'Stop Simulation' : '🚗 Simulate Transit Drive'}
              </button>

              <button
                type="button"
                onClick={() => setTrackingId(null)}
                className="px-3 py-1.5 bg-white text-gray-600 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50"
              >
                Close Map
              </button>
            </div>
          </div>
          
          <div className="w-full h-72 bg-white rounded-lg border border-gray-200 overflow-hidden relative shadow-inner">
            {liveLocation && !isNaN(liveLocation.lat) && !isNaN(liveLocation.lng) ? (
              <iframe 
                key={`${liveLocation.lat}-${liveLocation.lng}`}
                width="100%" 
                height="100%" 
                frameBorder="0" 
                style={{border:0}}
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${liveLocation.lng - 0.005}%2C${liveLocation.lat - 0.005}%2C${liveLocation.lng + 0.005}%2C${liveLocation.lat + 0.005}&layer=mapnik&marker=${liveLocation.lat}%2C${liveLocation.lng}`} 
                allowFullScreen
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-gray-400">
                <div className="text-center">
                  <Navigation size={24} className="mx-auto mb-2 opacity-50 animate-pulse text-blue-600" />
                  <p className="text-sm font-medium">Connecting to GPS positioning...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delivery Cards */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-3 border-gray-200 border-t-[#2563EB] rounded-full animate-spin" />
        </div>
      ) : deliveries.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <Truck size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-600 text-lg font-medium">No deliveries found</p>
          <p className="text-gray-400 text-sm mt-1">Deliveries are created from job cards when vehicles are ready</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {deliveries.map(del => {
            const config = STATUS_CONFIG[del.status] || STATUS_CONFIG.pending;
            const StatusIcon = config.icon;

            return (
              <div key={del.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                      <Truck size={14} className="text-[#2563EB]" />
                    </div>
                    <div>
                      <span className="text-gray-900 font-semibold text-sm">Delivery #{del.id}</span>
                      {del.job_cart_id && <p className="text-[11px] text-gray-400">Job #{del.job_cart_id}</p>}
                    </div>
                  </div>
                  <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${config.bg} ${config.color}`}>
                    <StatusIcon size={12} className="inline mr-1 -mt-0.5" />
                    {config.label}
                  </span>
                </div>

                {/* Vehicle */}
                <div className="space-y-1.5 mb-3">
                  {(del.brand || del.model) && (
                    <div className="flex items-center gap-1.5 text-sm text-gray-900">
                      <Car size={13} className="text-gray-400" />
                      <span className="font-medium">{del.brand} {del.model}</span>
                    </div>
                  )}
                  {del.registration_no && (
                    <p className="text-xs text-gray-500 font-mono tracking-wider ml-5">{del.registration_no}</p>
                  )}
                </div>

                {/* Customer */}
                {del.customer_name && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                    <User size={12} />
                    <span>{del.customer_name}</span>
                    {del.customer_mobile && (
                      <a href={`tel:${del.customer_mobile}`} className="text-blue-600 hover:underline flex items-center gap-0.5">
                        <Phone size={10} /> {del.customer_mobile}
                      </a>
                    )}
                  </div>
                )}

                {/* Staff */}
                {del.staff_name && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
                    <User size={12} />
                    <span>Staff: <span className="font-medium text-gray-600">{del.staff_name}</span></span>
                    {del.staff_mobile && <span>· {del.staff_mobile}</span>}
                  </div>
                )}

                {/* Address */}
                {(del.address_from || del.address_to) && (
                  <div className="text-xs text-gray-400 mb-2 bg-gray-50 rounded-lg p-2 space-y-0.5">
                    {del.address_from && <p>📍 From: {del.address_from}</p>}
                    {del.address_to && <p>📍 To: {del.address_to}</p>}
                  </div>
                )}

                {del.notes && <p className="text-xs text-gray-400 italic mb-3 line-clamp-2">{del.notes}</p>}

                <p className="text-[10px] text-gray-400 mb-3">{formatDate(del.created_at)}</p>

                {/* Actions */}
                <div className="flex gap-2">
                  {del.status === 'in_transit' && (
                    <>
                      <button
                        onClick={() => setTrackingId(trackingId === del.id ? null : del.id)}
                        className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                          trackingId === del.id
                            ? 'bg-blue-100 text-blue-700 border border-blue-300'
                            : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <Eye size={13} />
                        {trackingId === del.id ? 'Tracking...' : 'Track Live'}
                      </button>
                      <button
                        onClick={() => handleComplete(del.id)}
                        className="flex-1 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium rounded-lg hover:bg-emerald-100 transition-all flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 size={13} />
                        Complete
                      </button>
                    </>
                  )}
                  {del.status === 'delivered' && (
                    <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                      <CheckCircle2 size={13} />
                      Delivered {del.delivered_at ? `on ${formatDate(del.delivered_at)}` : ''}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
