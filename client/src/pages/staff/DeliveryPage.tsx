import { useEffect, useState } from 'react';
import { Navigation, MapPin, CheckCircle, Package } from 'lucide-react';
import { useDeliveries, useCompleteDelivery } from '../../api/hooks/useDeliveries';
import { useAuthStore } from '../../store/authStore';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import EmptyState from '../../components/shared/EmptyState';
import { useUIStore } from '../../store/uiStore';
import io from 'socket.io-client';
import api from '../../api/axiosInstance';

export default function DeliveryPage() {
  const { token } = useAuthStore();
  const toast = useUIStore((s) => s.toast);
  const { data, isLoading } = useDeliveries({ status: 'in_transit' });
  const completeMut = useCompleteDelivery();
  
  const [socket, setSocket] = useState<any>(null);
  const [activeDeliveryId, setActiveDeliveryId] = useState<number | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const activeDeliveries = data?.data || [];

  useEffect(() => {
    // Setup socket connection
    const newSocket = io(import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:5000', {
      auth: { token },
      autoConnect: false,
    });
    
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token]);

  // Handle location broadcasting
  useEffect(() => {
    let watchId: number;

    if (isBroadcasting && activeDeliveryId && socket) {
      if (!socket.connected) socket.connect();
      
      socket.emit('join_delivery', { deliveryId: activeDeliveryId });

      if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
          async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            socket.emit('location_update', {
              deliveryId: activeDeliveryId,
              lat,
              lng,
            });
            try {
              await api.patch(`/deliveries/${activeDeliveryId}/location`, { lat, lng });
            } catch (e) {
              console.error(e);
            }
          },
          (error) => toast('error', 'Location Access Denied: ' + error.message),
          { enableHighAccuracy: true, maximumAge: 0 }
        );
        toast('success', 'GPS Tracking Started');
      } else {
        toast('error', 'Geolocation not supported on this browser');
      }
    } else {
      if (socket?.connected) socket.disconnect();
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [isBroadcasting, activeDeliveryId, socket]);

  const handleComplete = async (id: number) => {
    if (confirm('Are you sure you want to complete this delivery?')) {
      try {
        await completeMut.mutateAsync(id);
        toast('success', 'Delivery completed successfully');
        if (activeDeliveryId === id) {
          setIsBroadcasting(false);
          setActiveDeliveryId(null);
        }
      } catch {
        toast('error', 'Failed to complete delivery');
      }
    }
  };

  const toggleBroadcast = (id: number) => {
    if (activeDeliveryId === id && isBroadcasting) {
      setIsBroadcasting(false);
      setActiveDeliveryId(null);
    } else {
      setActiveDeliveryId(id);
      setIsBroadcasting(true);
    }
  };

  return (
    <>
      <AdminTopBar title="Active Deliveries" subtitle="Manage your current drop-offs" />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2"><SkeletonCard/><SkeletonCard/></div>
      ) : !activeDeliveries.length ? (
        <EmptyState icon={Package} title="No Active Deliveries" description="You don't have any vehicles out for delivery currently." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {activeDeliveries.map((del: any, idx: number) => (
            <div key={del.id} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm card-premium relative overflow-hidden opacity-0 animate-fade-in-up" style={{ animationDelay: `${idx * 0.08}s`, animationFillMode: 'forwards' }}>
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-blue-400 to-blue-500/20" />
              <div className="flex justify-between items-start mb-4 mt-1">
                <div>
                  <h3 className="font-bold text-[#0F172A] text-lg">{del.registration_no}</h3>
                  <p className="text-sm text-[#5f5e5e]">{del.brand} {del.model}</p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider border border-blue-200 animate-pulse-dot">
                  In Transit
                </span>
              </div>

              <div className="bg-[#F8FAFC] p-4 rounded-xl border border-gray-100 mb-4">
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Customer Details</p>
                <p className="font-bold text-[#0F172A] text-sm">{del.customer_name}</p>
                <a href={`tel:${del.customer_mobile}`} className="text-[#2563EB] text-sm hover:underline font-medium">{del.customer_mobile}</a>
              </div>

              <div className="flex gap-2">
                <Button 
                  variant={isBroadcasting && activeDeliveryId === del.id ? 'ghost' : 'secondary'}
                  className={isBroadcasting && activeDeliveryId === del.id ? 'bg-blue-50 text-blue-600 border border-blue-200' : ''}
                  onClick={() => toggleBroadcast(del.id)}
                  icon={isBroadcasting && activeDeliveryId === del.id ? <MapPin size={16} className="animate-pulse"/> : <Navigation size={16}/>}
                >
                  {isBroadcasting && activeDeliveryId === del.id ? 'Stop Tracking' : 'Start GPS Tracking'}
                </Button>
                <Button 
                  onClick={() => handleComplete(del.id)} 
                  loading={completeMut.isPending}
                  className="bg-black hover:bg-gray-800 text-white border-0"
                  icon={<CheckCircle size={16}/>}
                >
                  Mark Delivered
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
