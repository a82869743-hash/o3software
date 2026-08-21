import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDelivery, useDeliveryLocation } from '../../api/hooks/useDeliveries';
import { useAuthStore } from '../../store/authStore';
import io from 'socket.io-client';
import { ArrowLeft, Phone, MapPin, Clock, CheckCircle2, Truck } from 'lucide-react';

export default function TrackingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const { data: delivery, isLoading, error } = useDelivery(Number(id));
  const { data: locationData } = useDeliveryLocation(Number(id));
  const [staffLocation, setStaffLocation] = useState<{lat: number, lng: number} | null>(null);

  // Use polled location as fallback, socket for real-time
  useEffect(() => {
    if (locationData?.last_lat && locationData?.last_lng) {
      setStaffLocation({ lat: parseFloat(locationData.last_lat), lng: parseFloat(locationData.last_lng) });
    }
  }, [locationData]);

  // Socket.io for real-time location updates
  useEffect(() => {
    if (!id || !token) return;

    const socketUrl = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:5000';
    const newSocket = io(socketUrl, { auth: { token }, transports: ['websocket', 'polling'] });

    newSocket.on('connect', () => {
      newSocket.emit('join_delivery', { deliveryId: Number(id) });
    });

    newSocket.on('location_update', (loc) => {
      if (loc && loc.lat && loc.lng) {
        setStaffLocation({ lat: parseFloat(loc.lat), lng: parseFloat(loc.lng) });
      }
    });

    newSocket.on('location', (loc) => {
      if (loc && loc.lat && loc.lng) {
        setStaffLocation({ lat: parseFloat(loc.lat), lng: parseFloat(loc.lng) });
      }
    });

    newSocket.on('delivery_completed', () => {
      // Trigger refetch
      window.location.reload();
    });

    return () => {
      newSocket.disconnect();
    };
  }, [id, token]);

  if (isLoading) return (
    <div className="p-8 text-center text-[#5f5e5e] animate-fade-in">
      <div className="animate-spin w-8 h-8 rounded-full border-4 border-gray-200 border-t-[#2563EB] mx-auto mb-3" />
      Loading delivery details...
    </div>
  );

  if (error || !delivery) return (
    <div className="p-8 text-center">
      <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Truck size={28} className="text-blue-400" />
      </div>
      <p className="text-blue-500 font-bold text-lg mb-2">Delivery Not Found</p>
      <p className="text-gray-500 text-sm mb-4">This delivery may not exist or you don't have access.</p>
      <button
        onClick={() => navigate('/customer')}
        className="px-4 py-2 bg-[#2563EB] text-white rounded-lg text-sm font-semibold hover:bg-[#1E40AF] transition-colors"
      >
        Back to Dashboard
      </button>
    </div>
  );

  const isDelivered = delivery.status === 'delivered';
  const isInTransit = delivery.status === 'in_transit';

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8">
      {/* Back button */}
      <button
        onClick={() => navigate('/customer')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-4 text-sm font-medium transition-colors"
      >
        <ArrowLeft size={14} /> Back to Dashboard
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden card-premium">
        {/* Hero header */}
        <div className="hero-bg text-white p-6 text-center relative overflow-hidden pattern-overlay">
          <div className="relative z-10">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mx-auto mb-3 animate-float">
              {isDelivered ? (
                <CheckCircle2 size={24} className="text-green-400" />
              ) : (
                <Truck size={24} className="text-[#2563EB]" />
              )}
            </div>
            <h1 className="text-2xl font-black mb-1 tracking-tight">
              {isDelivered ? 'Vehicle Delivered ✅' : 'Live Vehicle Delivery'}
            </h1>
            <p className="text-white/60 text-sm font-medium">Tracking {delivery.registration_no}</p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#2563EB] via-[#2563EB]/40 to-transparent" />
        </div>

        <div className="p-6">
          {/* Status + Executive info */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <p className="text-[9px] uppercase font-bold tracking-widest text-[#5f5e5e] mb-1.5">Status</p>
              <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border ${
                isDelivered
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse'
              }`}>
                {isDelivered ? '✅ Delivered' : '🚗 In Transit'}
              </span>
            </div>
            <div className="text-right">
              <p className="text-[9px] uppercase font-bold tracking-widest text-[#5f5e5e] mb-1.5">Assigned Executive</p>
              <p className="font-bold text-[#0F172A]">{delivery.staff_name}</p>
              {delivery.staff_mobile && (
                <a
                  href={`tel:${delivery.staff_mobile}`}
                  className="inline-flex items-center gap-1 text-[#2563EB] text-sm font-medium hover:underline"
                >
                  <Phone size={12} /> {delivery.staff_mobile}
                </a>
              )}
            </div>
          </div>

          {/* Vehicle Info */}
          <div className="bg-[#F8FAFC] rounded-xl p-4 mb-4 border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <MapPin size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#0F172A]">{delivery.brand} {delivery.model}</p>
                <p className="text-xs text-gray-500">{delivery.registration_no}</p>
              </div>
              {isInTransit && staffLocation && (
                <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg border border-green-200">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Live
                </span>
              )}
            </div>
          </div>

          {/* Map / Status Area */}
          <div className="bg-[#F8FAFC] rounded-xl h-64 md:h-96 w-full flex items-center justify-center relative overflow-hidden border border-gray-100">
            {isDelivered ? (
              <div className="text-center p-6 animate-scale-in">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="font-black text-xl text-[#0F172A] mb-1">Vehicle Delivered</h3>
                <p className="text-[#5f5e5e] text-sm">Your vehicle was successfully delivered.</p>
                {delivery.delivered_at && (
                  <p className="text-xs text-gray-400 mt-2">
                    <Clock size={12} className="inline mr-1" />
                    {new Date(delivery.delivered_at).toLocaleString('en-IN')}
                  </p>
                )}
              </div>
            ) : staffLocation && !isNaN(staffLocation.lat) && !isNaN(staffLocation.lng) ? (
              <div className="absolute inset-0">
                <iframe 
                  width="100%" 
                  height="100%" 
                  frameBorder="0" 
                  style={{border:0}}
                  loading="lazy"
                  src={`https://maps.google.com/maps?q=${staffLocation.lat},${staffLocation.lng}&z=15&output=embed`} 
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="text-center p-6 bg-white/80 backdrop-blur-sm rounded-xl shadow-sm z-10 m-4 border border-gray-100">
                <div className="animate-spin w-8 h-8 rounded-full border-4 border-gray-200 border-t-[#2563EB] mx-auto mb-3" />
                <p className="text-sm font-medium text-[#5f5e5e]">Waiting for GPS signal from the executive...</p>
                <p className="text-xs text-gray-400 mt-1">Location updates every 5 seconds</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
