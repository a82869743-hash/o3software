import { useState, useRef, useEffect } from 'react';
import { getLocation, locationPermission, distanceM, Fix } from '../../utils/location';
import GpsOffPrompt, { GpsProblem } from '../../components/shared/GpsOffPrompt';
import { Clock, LogIn, LogOut, Calendar, CheckCircle2, AlertCircle, Loader2, Camera, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminTopBar from '../../components/layout/AdminTopBar';
import ErrorState from '../../components/shared/ErrorState';
import { useMyAttendance, useCheckOut } from '../../api/hooks/useStaff';
import { formatTime, ymd, dateOnly } from '../../utils/formatters';
import api from '../../api/axiosInstance';

export default function CheckInOutPage() {
  const { data: attRes, isLoading, isError, refetch } = useMyAttendance();
  const checkOutMut = useCheckOut();

  const [checkingIn, setCheckingIn] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [gpsLocation, setGpsLocation] = useState<Fix | null>(null);
  const [studio, setStudio] = useState<{ name: string; lat: number; lng: number; radius: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [gpsProblem, setGpsProblem] = useState<GpsProblem>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const attendanceRecords = attRes?.data || [];
  const todayStr = ymd();
  const todayRecord = attendanceRecords.find((r: any) => dateOnly(r.att_date) === todayStr);

  // Studio pin + radius set by the admin; if location is already allowed, detect it right away
  useEffect(() => {
    api.get('/staff/premises').then(r => {
      const f = r.data.data;
      if (f?.latitude != null) setStudio({ name: f.name, lat: parseFloat(f.latitude), lng: parseFloat(f.longitude), radius: f.geofence_radius_m || 150 });
    }).catch(() => {});
    locationPermission().then(st => { if (st === 'granted') locate().catch(() => {}); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const locate = async () => {
    setLocating(true);
    try {
      const fix = await getLocation();
      setGpsLocation(fix);
      return fix;
    } catch (p: any) {
      setGpsProblem(p);
      throw p;
    } finally {
      setLocating(false);
    }
  };

  const away = gpsLocation && studio ? distanceM(gpsLocation, studio) : null;
  const dist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);
  const inside = away != null && studio ? away <= studio.radius + Math.min(gpsLocation!.accuracy, 100) : null;

  const startCamera = async () => {
    // 1. Location first (asks to turn on / allow location if needed)
    let fix: Fix;
    try { fix = await locate(); } catch { return; }
    if (studio && distanceM(fix, studio) > studio.radius + Math.min(fix.accuracy, 100)) {
      toast.error(`You are ${dist(distanceM(fix, studio))} from the studio. Check in at ${studio.name}.`);
      return;
    }
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      toast.error('Camera access denied or not available.');
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      setPhotoData(dataUrl);
    }
    // Stop camera stream
    const stream = videoRef.current.srcObject as MediaStream;
    if (stream) stream.getTracks().forEach(t => t.stop());
  };

  const handleCheckIn = async () => {
    if (!photoData || !gpsLocation) {
      toast.error('Facial photo and GPS location required to clock in.');
      return;
    }
    setCheckingIn(true);
    try {
      await api.post('/staff/check-in', {
        latitude: gpsLocation.lat,
        longitude: gpsLocation.lng,
        accuracy: gpsLocation.accuracy,
        face_photo_url: photoData
      });
      toast.success('Checked in — studio location verified');
      setShowCamera(false);
      setPhotoData(null);
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to clock in');
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCheckOut = async () => {
    if (!confirm('Are you sure you want to check out for today?')) return;
    try {
      // location is checked on the server: check-out only works at the studio
      let fix: Fix;
      try { fix = await locate(); } catch { return; }
      const loc = { latitude: fix.lat, longitude: fix.lng, accuracy: fix.accuracy };
      await checkOutMut.mutateAsync(loc);
      toast.success('Clocked out successfully');
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Failed to clock out');
    }
  };

  return (
    <>
      <GpsOffPrompt purpose="attendance" problem={gpsProblem} onClose={() => setGpsProblem(null)} onRetry={() => { setGpsProblem(null); locate().catch(() => {}); }} />
      <AdminTopBar title="Staff Check-In / Check-Out" subtitle="Log your daily attendance and shift hours" />

      <div className="max-w-xl mx-auto mt-6">
        {isError ? (
          <div className="pt-4">
            <ErrorState
              message="Failed to load attendance records. Please check your connection and try again."
              onRetry={() => refetch()}
            />
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-[#2563EB] w-8 h-8" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Status Card */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm card-premium relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#2563EB] via-orange-500 to-green-500" />
              
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                  !todayRecord ? 'bg-amber-50 text-amber-600' :
                  todayRecord.check_out_time ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-600'
                }`}>
                  <Clock size={24} />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-[#0F172A]">Shift Status</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                </div>
              </div>

              {/* Status Details */}
              <div className="bg-[#F8FAFC] rounded-xl p-4 border border-gray-100 mb-6 space-y-3">
                <div className="flex justify-between items-center text-sm border-b border-gray-200/50 pb-2">
                  <span className="text-gray-500 font-medium">Status</span>
                  <span className={`font-bold px-2.5 py-0.5 rounded-lg text-xs uppercase tracking-wider ${
                    !todayRecord ? 'bg-amber-100 text-amber-700' :
                    todayRecord.check_out_time ? 'bg-gray-100 text-gray-500' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {!todayRecord ? 'Absent / Not Checked In' :
                     todayRecord.check_out_time ? 'Shift Completed' : 'Active Duty'}
                  </span>
                </div>

                {todayRecord?.check_in_time && (
                  <div className="flex justify-between items-center text-sm border-b border-gray-200/50 pb-2">
                    <span className="text-gray-500 font-medium flex items-center gap-1.5">
                      <LogIn size={14} className="text-emerald-500" /> Clocked In
                    </span>
                    <span className="font-bold text-gray-900">{formatTime(todayRecord.check_in_time)}</span>
                  </div>
                )}

                {todayRecord?.check_out_time && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 font-medium flex items-center gap-1.5">
                      <LogOut size={14} className="text-blue-400" /> Clocked Out
                    </span>
                    <span className="font-bold text-gray-900">{formatTime(todayRecord.check_out_time)}</span>
                  </div>
                )}
              </div>

              {/* Where am I vs the studio */}
              <div className={`mb-4 rounded-xl px-3.5 py-2.5 text-xs font-bold flex items-center gap-2 border ${
                inside == null ? 'bg-slate-50 border-slate-200 text-slate-600' : inside ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                {locating ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                <span className="flex-1">
                  {locating ? 'Finding your location…'
                    : !studio ? 'Studio location not set yet — ask your admin'
                    : away == null ? 'Location not checked yet'
                    : inside ? `At the studio (${away} m from the pin)` : `${dist(away)} away — come within ${studio.radius} m of ${studio.name}`}
                  {!locating && gpsLocation && gpsLocation.accuracy > 300 && (
                    <span className="block font-semibold mt-0.5">This device gives only a rough location (±{dist(gpsLocation.accuracy)}, from Wi-Fi/internet — no GPS). Use your phone with location ON for check-in.</span>
                  )}
                </span>
                {!locating && <button type="button" onClick={() => locate().catch(() => {})} className="underline">{away == null ? 'Check' : 'Refresh'}</button>}
              </div>

              {/* Actions */}
              <div className="flex gap-4">
                {!todayRecord ? (
                  <button
                    onClick={startCamera}
                    disabled={checkingIn}
                    className="flex-1 py-3.5 bg-gradient-to-r from-emerald-600 to-green-700 text-white font-extrabold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wider disabled:opacity-50"
                  >
                    {checkingIn ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                    Take Selfie & Clock In
                  </button>
                ) : !todayRecord.check_out_time ? (
                  <button
                    onClick={handleCheckOut}
                    disabled={checkOutMut.isPending}
                    className="flex-1 py-3.5 bg-gradient-to-r from-blue-600 to-[#1D4ED8] text-white font-extrabold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wider disabled:opacity-50"
                  >
                    {checkOutMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
                    Clock Out
                  </button>
                ) : (
                  <div className="flex-1 py-3 bg-gray-50 text-gray-400 text-center font-bold text-sm rounded-xl border border-gray-200">
                    Shift Logged successfully for today
                  </div>
                )}
              </div>
            </div>

            {/* Attendance History */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center gap-2">
                <Calendar size={18} className="text-[#2563EB]" />
                <h3 className="font-extrabold text-[#0F172A] text-base">This Month's Attendance</h3>
              </div>

              {!attendanceRecords.length ? (
                <p className="text-sm text-gray-500 text-center py-8">No attendance records found.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {attendanceRecords.slice(0, 10).map((r: any, idx: number) => (
                    <div
                      key={r.id}
                      className="p-4 flex items-center justify-between hover:bg-[#F8FAFC] transition-colors opacity-0 animate-fade-in-up"
                      style={{ animationDelay: `${idx * 0.05}s`, animationFillMode: 'forwards' }}
                    >
                      <div>
                        <p className="font-bold text-[#0F172A]">
                          {new Date(r.att_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                          {r.check_in_time && <span>In: {formatTime(r.check_in_time)}</span>}
                          {r.check_out_time && <span>Out: {formatTime(r.check_out_time)}</span>}
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        r.status === 'present' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Facial Selfie Camera & Geofence Modal ─────────── */}
      {showCamera && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl text-center space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <Camera size={18} className="text-[#2563EB]" /> Facial Attendance Verification
              </h3>
              <button
                onClick={() => {
                  setShowCamera(false);
                  setPhotoData(null);
                }}
                className="text-gray-400 hover:text-gray-600 font-bold"
              >
                ✕
              </button>
            </div>

            {gpsLocation && (
              <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-xl p-2.5 text-xs font-bold flex items-center justify-center gap-1.5">
                <MapPin size={14} className="text-[#2563EB]" />
                Geotag: {gpsLocation.lat.toFixed(5)}, {gpsLocation.lng.toFixed(5)} (±{gpsLocation.accuracy} m){away != null ? ` · ${away} m from studio` : ''}
              </div>
            )}

            {!photoData ? (
              <div className="space-y-3">
                <div className="relative aspect-video bg-black rounded-2xl overflow-hidden shadow-inner border border-gray-800">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                </div>
                <button
                  onClick={capturePhoto}
                  className="w-full py-3 bg-[#2563EB] hover:bg-blue-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <Camera size={16} /> Capture Face Photo
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative aspect-video rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-md">
                  <img src={photoData} alt="Selfie preview" className="w-full h-full object-cover" />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPhotoData(null)}
                    className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-200"
                  >
                    Retake Photo
                  </button>
                  <button
                    onClick={handleCheckIn}
                    disabled={checkingIn}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50"
                  >
                    {checkingIn ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Confirm Clock-In'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
