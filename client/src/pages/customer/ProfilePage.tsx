import { useState, useRef, useEffect } from 'react';
import { Save, Camera, User, Package, Calendar, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { useUpdateProfile } from '../../api/hooks/useAuth';
import api from '../../api/axiosInstance';
import { Link } from 'react-router-dom';

function ActiveCustomerPackageWidget() {
  const [pkg, setPkg] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/user-packages/active')
      .then(res => setPkg(res.data?.data || null))
      .catch(() => setPkg(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !pkg) return null;

  const endDate = pkg.end_date ? new Date(pkg.end_date) : null;
  const daysLeft = pkg.days_remaining !== undefined ? pkg.days_remaining : (endDate ? Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null);
  const isExpiringSoon = daysLeft !== null && daysLeft <= 30;

  return (
    <div className={`mb-8 p-5 rounded-2xl border ${isExpiringSoon ? 'bg-amber-50/90 border-amber-200' : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200'} shadow-xs`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-white shadow-xs ${isExpiringSoon ? 'bg-amber-500' : 'bg-[#2563EB]'}`}>
            <Package size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-900">{pkg.package_name || 'Active Package'}</h3>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full text-white ${isExpiringSoon ? 'bg-amber-600' : 'bg-emerald-600'}`}>
                {daysLeft !== null ? (daysLeft <= 0 ? 'EXPIRED TODAY' : `${daysLeft} DAYS REMAINING`) : 'ACTIVE'}
              </span>
            </div>
            <p className="text-xs text-slate-600 font-medium mt-0.5">
              Valid: {pkg.start_date ? new Date(pkg.start_date).toLocaleDateString('en-IN') : 'N/A'} to {endDate ? endDate.toLocaleDateString('en-IN') : 'Ongoing'}
            </p>
          </div>
        </div>

        <Link
          to="/customer/buy-packages"
          className={`px-4 py-2 text-white font-extrabold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 shrink-0 ${isExpiringSoon ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#2563EB] hover:bg-blue-700'}`}
        >
          <ShieldCheck size={14} />
          <span>Renew / Upgrade</span>
        </Link>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();
  const toast = useUIStore(s => s.toast);
  const updateProfileMut = useUpdateProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    mobile: user?.mobile || '',
    address: '',
    opt_out_promotional: user?.opt_out_promotional === 1
  });

  const [picPreview, setPicPreview] = useState<string | null>(
    user?.profile_picture ? `http://localhost:5000${user.profile_picture}` : null
  );

  const handleSave = async () => {
    try {
      await updateProfileMut.mutateAsync({ 
        name: form.name, 
        email: form.email, 
        address: form.address,
        opt_out_promotional: form.opt_out_promotional ? 1 : 0
      });
      if (user) {
        updateUser({ 
          name: form.name, 
          email: form.email,
          opt_out_promotional: form.opt_out_promotional ? 1 : 0
        });
      }
      toast('success', 'Profile updated successfully');
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to update profile');
    }
  };

  const handlePictureClick = () => {
    fileInputRef.current?.click();
  };

  const handlePictureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => setPicPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    // Upload to server
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('picture', file);
      const res = await api.post('/auth/profile/picture', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data?.data?.profile_picture) {
        updateUser({ profile_picture: res.data.data.profile_picture });
        toast('success', 'Profile picture updated!');
      }
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to upload photo');
      setPicPreview(user?.profile_picture ? `http://localhost:5000${user.profile_picture}` : null);
    } finally {
      setUploading(false);
    }
  };

  const initials = form.name ? form.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : 'U';

  return (
    <>
      <AdminTopBar title="My Profile" subtitle="Manage your account details" />
      
      <div className="max-w-3xl">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden">
          {/* Top accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#1D4ED8] via-[#2563EB] to-[#3B82F6]/60" />
          
          <div className="flex items-center gap-6 mb-8 pb-8 border-b border-gray-100">
            {/* Profile Picture */}
            <div className="relative group">
              <div
                onClick={handlePictureClick}
                className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#f6f3f2] to-[#ebe7e7] flex items-center justify-center text-[#2563EB] text-3xl font-black shadow-inner relative overflow-hidden cursor-pointer"
              >
                {picPreview ? (
                  <img src={picPreview} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}
                {/* Upload overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 rounded-2xl">
                  {uploading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Camera size={18} className="text-white" />
                      <span className="text-white text-[9px] font-bold uppercase">Change</span>
                    </>
                  )}
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePictureChange}
              />
              {/* Camera badge */}
              <button
                type="button"
                onClick={handlePictureClick}
                className="absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-[#2563EB] rounded-full flex items-center justify-center shadow-md hover:bg-[#1D4ED8] transition-colors"
              >
                <Camera size={12} className="text-white" />
              </button>
            </div>

            <div>
              <h2 className="text-2xl font-black text-[#0F172A] mb-1 tracking-tight">{form.name || 'User Profile'}</h2>
              <p className="text-[#5f5e5e] font-medium">{form.mobile}</p>
              <span className="inline-block mt-2 px-3 py-1 bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 text-xs font-bold uppercase tracking-wider rounded-lg border border-blue-200">
                {user?.role || 'Customer'}
              </span>
            </div>
          </div>

          {/* Active Package Expiry Widget */}
          <ActiveCustomerPackageWidget />

          <form onSubmit={e => { e.preventDefault(); handleSave(); }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <Input 
                label="Full Name" 
                value={form.name} 
                onChange={e => setForm({...form, name: e.target.value})} 
              />
              <Input 
                label="Mobile Number" 
                value={form.mobile} 
                onChange={e => setForm({...form, mobile: e.target.value})} 
                disabled
              />
              <Input 
                label="Email Address" 
                type="email"
                value={form.email} 
                onChange={e => setForm({...form, email: e.target.value})} 
              />
              <Input 
                label="Address" 
                value={form.address} 
                onChange={e => setForm({...form, address: e.target.value})} 
              />
            </div>

            <div className="mb-8 border-t border-gray-100 pt-6">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">Notification Preferences</h3>
              <label className="flex items-start gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={form.opt_out_promotional} 
                  onChange={e => setForm({...form, opt_out_promotional: e.target.checked})}
                  className="rounded text-[#2563EB] focus:ring-[#2563EB] border-gray-300 w-4 h-4 cursor-pointer mt-0.5"
                />
                <span className="text-sm font-medium text-[#0F172A] group-hover:text-gray-900 select-none">
                  Opt out of promotional alerts, reminders, and marketing campaigns (essential booking and service updates will still be sent)
                </span>
              </label>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <Button type="submit" icon={<Save size={18} />} size="lg" loading={updateProfileMut.isPending}>Save Changes</Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
