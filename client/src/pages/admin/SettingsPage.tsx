import { useState, useEffect, useRef } from 'react';
import { Settings, Save, AlertCircle, QrCode, Upload, Check, Camera, User } from 'lucide-react';
import { useSettings, useUpdateSettings } from '../../api/hooks/useSettings';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import api from '../../api/axiosInstance';

export default function SettingsPage() {
  const toast = useUIStore((s) => s.toast);
  const { token, user, updateUser } = useAuthStore();
  const { data, isLoading, refetch } = useSettings();
  const updateMut = useUpdateSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [picPreview, setPicPreview] = useState<string | null>(
    user?.profile_picture ? `http://localhost:5000${user.profile_picture}` : null
  );

  const [form, setForm] = useState<Record<string, string>>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (data?.data) {
      setForm(data.data);
      if (data.data.upi_qr_url) {
        setPreviewUrl(data.data.upi_qr_url);
      }
    }
  }, [data]);

  const handleChange = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleUploadQr = async () => {
    if (!selectedFile) return;
    setUploadingQr(true);
    try {
      const formData = new FormData();
      formData.append('qr_image', selectedFile);

      const res = await fetch('/api/settings/qr-upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });
      const result = await res.json();
      if (result.success) {
        toast('success', 'UPI Payment QR Code uploaded successfully!');
        setSelectedFile(null);
        refetch();
      } else {
        toast('error', result.error || 'Failed to upload QR code');
      }
    } catch {
      toast('error', 'Network error during QR upload');
    } finally {
      setUploadingQr(false);
    }
  };

  const handleSave = async () => {
    try {
      await updateMut.mutateAsync(form);
      toast('success', 'Settings updated successfully');
    } catch {
      toast('error', 'Failed to update settings');
    }
  };

  const handlePicClick = () => fileInputRef.current?.click();

  const handlePicChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPicPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
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
    } catch {
      toast('error', 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const initials = user?.name ? user.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) : 'A';

  if (isLoading) {
    return <div className="p-8"><SkeletonCard/><SkeletonCard/></div>;
  }

  return (
    <>
      <AdminTopBar title="System Settings" subtitle="Configure O3 Car Spa details, UPI QR Code, and operational defaults" />

      <div className="max-w-4xl">
        {/* Admin Profile Picture Section */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6">
          <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-2">
            <User size={20} className="text-[#2563EB]" />
            <h2 className="font-bold text-lg text-gray-900">My Profile</h2>
          </div>
          <div className="flex items-center gap-5">
            <div className="relative group cursor-pointer" onClick={handlePicClick}>
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE] flex items-center justify-center text-[#2563EB] text-2xl font-black overflow-hidden shadow-inner">
                {picPreview ? (
                  <img src={picPreview} alt="Admin" className="w-full h-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                  {uploading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera size={18} className="text-white" />}
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#2563EB] rounded-full flex items-center justify-center">
                <Camera size={10} className="text-white" />
              </div>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePicChange} />
            </div>
            <div>
              <p className="font-extrabold text-slate-900 text-base">{user?.name || 'Admin'}</p>
              <p className="text-slate-500 text-sm">{user?.mobile || ''}</p>
              <p className="text-xs text-blue-600 font-semibold mt-1">Click avatar to change photo</p>
            </div>
          </div>
        </div>
        <div className="bg-sky-50 border border-sky-200 p-4 rounded-xl mb-6 flex items-start gap-3">
          <AlertCircle size={20} className="text-[#0284C7] mt-0.5" />
          <div>
            <h4 className="font-bold text-sky-900 text-sm">System Wide Impact</h4>
            <p className="text-xs text-sky-700 mt-1">
              Changes made here will affect invoice generation, messaging variables, customer checkout QR payment, and studio details across the platform.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Payment & QR Code Management Section */}
          <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-[#0284C7]">
                <QrCode size={22} />
                <div>
                  <h2 className="font-extrabold text-lg text-gray-900">Multiple Payment QR Codes Management</h2>
                  <p className="text-xs text-slate-500">Configure multiple QR payment accounts & pick which QR to display to customers</p>
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  const title = window.prompt('QR Title (e.g. O3 Primary PhonePe QR):');
                  if (!title) return;
                  const upi_id = window.prompt('UPI VPA / ID (e.g. 7225030303@ybl):', '7225030303@paytm');
                  if (!upi_id) return;
                  const upi_name = window.prompt('Payee Account Name:', form.upi_name || 'O3 Car Spa');
                  const upi_number = window.prompt('UPI Mobile Number:', form.upi_number || '7225030303');
                  try {
                    await api.post('/settings/payment-qrs', { title, upi_id, upi_name, upi_number, is_active: 0 });
                    toast('success', 'New Payment QR Code added successfully!');
                    refetch();
                  } catch {
                    toast('error', 'Failed to add Payment QR Code');
                  }
                }}
                className="px-4 py-2 bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl transition-all shadow-xs shrink-0"
              >
                + Add New QR Code
              </button>
            </div>

            {/* Active Customer QR Dropdown Selector */}
            <div className="bg-gradient-to-r from-blue-50/80 to-sky-50/80 border border-blue-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#2563EB] text-white flex items-center justify-center shrink-0 shadow-xs">
                  <QrCode size={20} />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-900 uppercase tracking-wide">
                    Active Customer-Facing Payment QR Code
                  </label>
                  <p className="text-xs text-slate-600">
                    The selected QR will be automatically rendered on customer checkout, package modal & invoices.
                  </p>
                </div>
              </div>

              <div className="min-w-[240px]">
                <select
                  value={data?.data?.active_qr?.id || ''}
                  onChange={async (e) => {
                    const selectedId = e.target.value;
                    if (!selectedId) return;
                    try {
                      await api.post(`/settings/payment-qrs/${selectedId}/set-active`);
                      toast('success', 'Active Customer QR Code updated!');
                      refetch();
                    } catch {
                      toast('error', 'Failed to update active QR');
                    }
                  }}
                  className="w-full px-3.5 py-2.5 bg-white border border-blue-300 rounded-xl text-xs font-extrabold text-slate-900 shadow-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="" disabled>Select Active Customer QR...</option>
                  {(data?.data?.all_qrs || []).map((q: any) => (
                    <option key={q.id} value={q.id}>
                      {q.is_active ? '⭐ [ACTIVE] ' : ''}{q.title} ({q.upi_id})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Uploaded QRs Grid / List */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider">Configured Payment QRs ({ (data?.data?.all_qrs || []).length })</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(data?.data?.all_qrs || []).map((q: any) => (
                  <div
                    key={q.id}
                    className={`rounded-2xl p-4 border transition-all flex flex-col justify-between gap-3 ${
                      q.is_active
                        ? 'bg-blue-50/40 border-blue-300 ring-2 ring-blue-500/10 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-20 h-20 bg-slate-100 rounded-xl border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                        {q.qr_image_url ? (
                          <img src={q.qr_image_url} alt={q.title} className="w-full h-full object-contain" />
                        ) : (
                          <QrCode size={32} className="text-slate-400" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-extrabold text-slate-900 truncate">{q.title}</h4>
                          {q.is_active ? (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-full shrink-0 uppercase tracking-wider">
                              Active
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-full shrink-0 uppercase tracking-wider">
                              Inactive
                            </span>
                          )}
                        </div>

                        <p className="text-xs font-extrabold text-[#2563EB] truncate">{q.upi_id}</p>
                        <p className="text-[11px] text-slate-600">{q.upi_name} · {q.upi_number}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      <label className="px-2.5 py-1.5 bg-white border border-slate-300 hover:border-blue-500 text-slate-700 text-xs font-bold rounded-lg cursor-pointer transition-colors inline-flex items-center gap-1">
                        <Upload size={12} className="text-blue-600" />
                        <span>Upload QR</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const formData = new FormData();
                              formData.append('qr_image', file);
                              const res = await api.post(`/settings/qr-upload?qr_id=${q.id}`, formData, {
                                headers: { 'Content-Type': 'multipart/form-data' }
                              });
                              if (res.data.success) {
                                toast('success', `QR Image updated for ${q.title}!`);
                                refetch();
                              }
                            } catch {
                              toast('error', 'Failed to upload QR image');
                            }
                          }}
                        />
                      </label>

                      {!q.is_active && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api.post(`/settings/payment-qrs/${q.id}/set-active`);
                              toast('success', `"${q.title}" set as active!`);
                              refetch();
                            } catch {
                              toast('error', 'Failed to set active');
                            }
                          }}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-extrabold rounded-lg transition-colors"
                        >
                          Set Active
                        </button>
                      )}

                      {(data?.data?.all_qrs || []).length > 1 && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm(`Are you sure you want to delete "${q.title}"?`)) return;
                            try {
                              await api.delete(`/settings/payment-qrs/${q.id}`);
                              toast('success', 'Payment QR removed');
                              refetch();
                            } catch {
                              toast('error', 'Failed to delete QR');
                            }
                          }}
                          className="px-2.5 py-1.5 text-blue-600 hover:bg-blue-50 text-xs font-bold rounded-lg transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Studio Info Section */}
          <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-[#0284C7] border-b border-gray-100 pb-2">
              <Settings size={20} />
              <h2 className="font-bold text-lg text-gray-900">Studio Information</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Studio Name" value={form.studio_name || ''} onChange={e => handleChange('studio_name', e.target.value)} />
              <Input label="GST Number" value={form.studio_gst || ''} onChange={e => handleChange('studio_gst', e.target.value)} />
              <Input label="Contact Number" value={form.studio_mobile || ''} onChange={e => handleChange('studio_mobile', e.target.value)} />
              <Input label="Support Email" type="email" value={form.studio_email || ''} onChange={e => handleChange('studio_email', e.target.value)} />
              <div className="col-span-full">
                <Input label="Studio Address" value={form.studio_address || ''} onChange={e => handleChange('studio_address', e.target.value)} />
              </div>
            </div>
          </section>

          {/* Operational Defaults Section */}
          <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-[#0284C7] border-b border-gray-100 pb-2">
              <Settings size={20} />
              <h2 className="font-bold text-lg text-gray-900">Operational Defaults</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Invoice Prefix" value={form.invoice_prefix || ''} onChange={e => handleChange('invoice_prefix', e.target.value)} placeholder="e.g. O3" />
              <Input label="Next Invoice Number" type="number" value={form.invoice_counter || ''} onChange={e => handleChange('invoice_counter', e.target.value)} />
              <Input label="Advance Booking Days Allowed" type="number" value={form.booking_advance_days || ''} onChange={e => handleChange('booking_advance_days', e.target.value)} />
              <Input label="Low Stock Threshold (Units)" type="number" value={form.low_stock_threshold || ''} onChange={e => handleChange('low_stock_threshold', e.target.value)} />
              <Input label="Admin WhatsApp (for system alerts)" value={form.admin_whatsapp || ''} onChange={e => handleChange('admin_whatsapp', e.target.value)} placeholder="Include country code, e.g. 917225030303" />
            </div>
          </section>

          {/* Pickup & Drop Settings Section */}
          <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-[#0284C7] border-b border-gray-100 pb-2">
              <Settings size={20} />
              <h2 className="font-bold text-lg text-gray-900">Pickup & Drop Charges</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input 
                label="Pickup Charge (₹)" 
                type="number" 
                value={form.pickup_charge || ''} 
                onChange={e => handleChange('pickup_charge', e.target.value)} 
                placeholder="e.g. 150" 
              />
              <Input 
                label="Drop Charge (₹)" 
                type="number" 
                value={form.drop_charge || ''} 
                onChange={e => handleChange('drop_charge', e.target.value)} 
                placeholder="e.g. 150" 
              />
              <Input 
                label="Pickup + Drop Charge (₹)" 
                type="number" 
                value={form.pickup_drop_charge || ''} 
                onChange={e => handleChange('pickup_drop_charge', e.target.value)} 
                placeholder="e.g. 250" 
              />
            </div>
          </section>

          {/* Booking & Advance Payment Settings */}
          <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-[#0284C7] border-b border-gray-100 pb-2">
              <Settings size={20} />
              <h2 className="font-bold text-lg text-gray-900">Booking & Advance Payment Settings</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-full flex items-center justify-between bg-sky-50/50 p-4 rounded-xl border border-sky-100/50">
                <div>
                  <h4 className="font-bold text-gray-900 text-sm">Pause All Bookings</h4>
                  <p className="text-xs text-gray-500 mt-0.5">Globally prevent customers from booking new slots.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleChange('bookings_paused', form.bookings_paused === '1' ? '0' : '1')}
                  className={`relative w-14 h-7 rounded-full transition-colors duration-200 ${form.bookings_paused === '1' ? 'bg-[#0284C7]' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200 ${form.bookings_paused === '1' ? 'translate-x-7' : ''}`} />
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Advance Payment Type</label>
                <select 
                  value={form.advance_type || 'none'} 
                  onChange={e => handleChange('advance_type', e.target.value)}
                  className="w-full px-3.5 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0284C7]/20 focus:border-[#0284C7]/30 bg-white font-medium"
                >
                  <option value="none">None (Disabled)</option>
                  <option value="fixed">Fixed Amount (₹)</option>
                  <option value="percentage">Percentage (%)</option>
                </select>
              </div>

              {form.advance_type && form.advance_type !== 'none' && (
                <Input 
                  label={form.advance_type === 'fixed' ? 'Advance Amount (₹)' : 'Advance Percentage (%)'} 
                  type="number" 
                  value={form.advance_value || ''} 
                  onChange={e => handleChange('advance_value', e.target.value)} 
                  placeholder={form.advance_type === 'fixed' ? 'e.g. 500' : 'e.g. 10'} 
                />
              )}
            </div>
          </section>

          <div className="flex justify-end">
            <Button size="lg" onClick={handleSave} loading={updateMut.isPending} icon={<Save size={18} />} className="bg-[#0284C7] hover:bg-[#0369A1] text-white">
              Save All Settings
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
