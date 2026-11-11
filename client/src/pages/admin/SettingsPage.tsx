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
import { fileUrl } from '../../utils/endpoints';
import IntegrationsPanel from '../../components/admin/IntegrationsPanel';
import Dropdown from '../../components/ui/Dropdown';

import { askForm } from '../../utils/ask';
export default function SettingsPage() {
  const toast = useUIStore((s) => s.toast);
  const { token, user, updateUser } = useAuthStore();
  const { data, isLoading, refetch } = useSettings();
  const updateMut = useUpdateSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [picPreview, setPicPreview] = useState<string | null>(
    user?.profile_picture ? fileUrl(user.profile_picture) : null
  );

  const [form, setForm] = useState<Record<string, string>>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [heroUploading, setHeroUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const uploadHero = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('error', 'Picture must be under 5 MB'); return; }
    setHeroUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const r = await api.post('/settings/banner-upload?key=invoice_hero_url', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      handleChange('invoice_hero_url', r.data.data.invoice_hero_url);
      toast('success', 'Invoice picture uploaded');
    } catch (err: any) {
      toast('error', err.message || 'Upload failed');
    } finally { setHeroUploading(false); }
  };

  const previewInvoice = async () => {
    setPreviewing(true);
    try {
      const r = await api.get('/settings/invoice-preview', { responseType: 'blob' });
      window.open(URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' })), '_blank');
    } catch (err: any) {
      toast('error', err.message || 'Could not open the preview');
    } finally { setPreviewing(false); }
  };


  const uploadBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('error', 'Picture must be under 5 MB'); return; }
    setBannerUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const r = await api.post('/settings/banner-upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      handleChange('app_banner_url', r.data.data.app_banner_url);
      toast('success', 'Banner uploaded');
    } catch (err: any) {
      toast('error', err.message || 'Upload failed');
    } finally { setBannerUploading(false); }
  };

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
      <AdminTopBar title="System Settings" subtitle="Configure O3 Car Spaa details, UPI QR Code, and operational defaults" />

      <div className="max-w-4xl">
        {user?.role === 'super_admin' && <IntegrationsPanel />}

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
                  const f = await askForm('Add payment QR', [
                    { name: 'title', label: 'QR name', placeholder: 'e.g. O3 PhonePe QR', required: true },
                    { name: 'upi_id', label: 'UPI ID', placeholder: 'e.g. 9876543210@ybl', required: true },
                    { name: 'upi_name', label: 'Account holder name', value: form.upi_name || 'O3 Car Spaa' },
                    { name: 'upi_number', label: 'UPI mobile number', type: 'tel', value: form.upi_number || '' },
                  ], { okLabel: 'Add QR' });
                  if (!f) return;
                  const title = f.title.trim(), upi_id = f.upi_id.trim(), upi_name = f.upi_name.trim(), upi_number = f.upi_number.trim();
                  if (!/^[\w.\-]{2,}@[a-zA-Z][\w.\-]{1,}$/.test(upi_id)) { toast('error', 'UPI ID looks wrong. Example: 9876543210@ybl'); return; }
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
                    Main payment QR
                  </label>
                  <p className="text-xs text-slate-600">
                    Used everywhere, unless you pick a different QR below for invoices, job cards or the payment page.
                  </p>
                </div>
              </div>

              <div className="min-w-[240px]">
                <Dropdown
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
                  <option value="" disabled>Choose the main QR…</option>
                  {(data?.data?.all_qrs || []).map((q: any) => (
                    <option key={q.id} value={q.id}>
                      {q.is_active ? '⭐ ' : ''}{q.title} ({q.upi_id})
                    </option>
                  ))}
                </Dropdown>
              </div>
            </div>

            {/* Which QR to show where */}
            {(data?.data?.all_qrs || []).length > 1 && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { key: 'qr_for_invoice', label: 'QR on invoices' },
                  { key: 'qr_for_jobcard', label: 'QR on job cards' },
                  { key: 'qr_for_payment', label: 'QR on payment page' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">{f.label}</label>
                    <Dropdown value={form[f.key] || ''} onChange={e => handleChange(f.key, e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm">
                      <option value="">Main QR</option>
                      {(data?.data?.all_qrs || []).map((q: any) => <option key={q.id} value={String(q.id)}>{q.title} ({q.upi_id})</option>)}
                    </Dropdown>
                  </div>
                ))}
                <p className="sm:col-span-3 text-xs text-gray-500">Press “Save All Settings” at the bottom after choosing.</p>
              </div>
            )}

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
                          <img src={fileUrl(q.qr_image_url)} alt={q.title} className="w-full h-full object-contain" />
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
              <Input label="Tagline (shown under the name)" value={form.tagline || ''} onChange={e => handleChange('tagline', e.target.value)} placeholder="e.g. Premium Car Detailing Studio" />
              <Input label="Studio timings" value={form.support_hours || ''} onChange={e => handleChange('support_hours', e.target.value)} placeholder="Tue–Sun, 9:30 AM – 8:30 PM" />
              <Input label="Customer support WhatsApp" value={form.support_whatsapp || ''} onChange={e => handleChange('support_whatsapp', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile" />
              <Input label="Google review link" value={form.google_review_url || ''} onChange={e => handleChange('google_review_url', e.target.value)} placeholder="https://g.page/r/…/review" />
              <div className="col-span-full">
                <Input label="Note printed at the bottom of invoices (terms, thank-you)" value={form.invoice_footer || ''} onChange={e => handleChange('invoice_footer', e.target.value)} placeholder="e.g. Thank you for choosing O3 Car Spaa!" />
              </div>
            </div>
          </section>

          {/* Invoice design */}
          <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-4 border-b border-gray-100 pb-2 flex-wrap">
              <div className="flex items-center gap-2 text-[#0284C7]">
                <Settings size={20} />
                <h2 className="font-bold text-lg text-gray-900">Invoice</h2>
              </div>
              <button type="button" onClick={previewInvoice} disabled={previewing}
                className="text-sm font-bold text-[#2563EB] border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 disabled:opacity-60">
                {previewing ? 'Opening…' : 'Preview invoice'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">Name, address, phone, GST and email come from “Studio Information” above. Save first, then press Preview.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Slogan (top right)" value={form.invoice_slogan || ''} onChange={e => handleChange('invoice_slogan', e.target.value)} placeholder="Breathe the Luxury" />
              <Input label="PAN number (optional)" value={form.studio_pan || ''} onChange={e => handleChange('studio_pan', e.target.value.toUpperCase().slice(0, 10))} placeholder="ABCDE1234F" />
              <Input label="Instagram" value={form.studio_instagram || ''} onChange={e => handleChange('studio_instagram', e.target.value.replace(/\s/g, ''))} placeholder="@o3carspa" />
              <Input label="Website" value={form.studio_website || ''} onChange={e => handleChange('studio_website', e.target.value.trim())} placeholder="www.o3carspa.in" />
              <Input label="Payment due after (days)" type="number" value={form.invoice_due_days || ''} onChange={e => handleChange('invoice_due_days', e.target.value)} placeholder="0 = same day" />
              <Input label="Bottom words" value={form.invoice_footer_words || ''} onChange={e => handleChange('invoice_footer_words', e.target.value)} placeholder="Clean | Protect | Enhance | Maintain" />
              <div className="col-span-full">
                <Input label="Services shown in the header (comma separated)" value={form.invoice_services_strip || ''} onChange={e => handleChange('invoice_services_strip', e.target.value)} placeholder="Washing, Ceramic Coating, Graphene Coating, PPF, Denting & Painting, Detailing, Accessories" />
              </div>
              <div className="col-span-full">
                <Input label="Highlights strip (comma separated, up to 5)" value={form.invoice_highlights || ''} onChange={e => handleChange('invoice_highlights', e.target.value)} placeholder="Premium Products, Expert Technicians, Advanced Technology, Long Lasting Protection, Enhanced Appearance" />
              </div>
              <div className="col-span-full">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Terms &amp; Conditions (one per line)</label>
                <textarea rows={5} value={form.invoice_terms || ''} onChange={e => handleChange('invoice_terms', e.target.value)}
                  placeholder={'Thank you for choosing O3 Car Spaa.\nAll services are non-refundable.\nPlease check your vehicle and belongings before leaving.'}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0284C7]/20" />
              </div>
              <div className="col-span-full">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Header picture (optional — e.g. your best car photo)</label>
                <div className="flex items-center gap-3 flex-wrap">
                  {form.invoice_hero_url
                    ? <img src={fileUrl(form.invoice_hero_url)} alt="Invoice header" className="h-20 w-36 object-cover rounded-lg border border-gray-200" />
                    : <div className="h-20 w-36 rounded-lg bg-gradient-to-br from-[#0B1220] to-[#1E3A8A] flex items-center justify-center text-[10px] text-white/70">Default dark design</div>}
                  <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    <Upload size={15} /> {heroUploading ? 'Uploading…' : 'Upload picture'}
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={uploadHero} disabled={heroUploading} />
                  </label>
                  {form.invoice_hero_url && <button type="button" onClick={() => handleChange('invoice_hero_url', '')} className="text-xs font-semibold text-red-600">Remove</button>}
                </div>
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

          {/* Customer App Section */}
          <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-[#0284C7] border-b border-gray-100 pb-2">
              <Settings size={20} />
              <h2 className="font-bold text-lg text-gray-900">Customer App — Offers on Home Screen</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Offer title" value={form.app_offer_title || ''} onChange={e => handleChange('app_offer_title', e.target.value)} placeholder="e.g. Diwali Special — 30% OFF Ceramic" />
              <Input label="Offer details" value={form.app_offer_subtitle || ''} onChange={e => handleChange('app_offer_subtitle', e.target.value)} placeholder="e.g. Valid till 15 Nov on all SUVs" />
              <Input label="Coupon code" value={form.app_offer_code || ''} onChange={e => handleChange('app_offer_code', e.target.value.toUpperCase())} placeholder="e.g. DIWALI30" />
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Discount on claiming</label>
                <div className="flex gap-2">
                  <Dropdown value={form.app_offer_type || 'percent'} onChange={e => handleChange('app_offer_type', e.target.value)} className="w-24 shrink-0 px-2 py-2 rounded-lg border border-gray-300 text-sm bg-white">
                    <option value="percent">% off</option>
                    <option value="flat">₹ off</option>
                  </Dropdown>
                  <input type="number" min={0} value={form.app_offer_value || ''} onChange={e => handleChange('app_offer_value', e.target.value)} placeholder={form.app_offer_type === 'flat' ? 'e.g. 500' : 'e.g. 20'}
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-300 text-sm" />
                </div>
                <p className="text-[11px] text-gray-500 mt-1">Applied automatically when the customer books with this code (on services, not pickup charges).</p>
              </div>
              <Input label="Valid till" type="date" value={form.app_offer_valid_till || ''} onChange={e => handleChange('app_offer_valid_till', e.target.value)} />
              <Input label="Minimum booking (₹)" type="number" value={form.app_offer_min_amount || ''} onChange={e => handleChange('app_offer_min_amount', e.target.value)} placeholder="0 = any amount" />
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 self-end pb-2">
                <input type="checkbox" checked={String(form.app_offer_once ?? '1') !== '0'} onChange={e => handleChange('app_offer_once', e.target.checked ? '1' : '0')} className="w-4 h-4" />
                Once per customer
              </label>
              <div className="col-span-full">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Banner picture (home screen & popup)</label>
                <div className="flex items-center gap-3 flex-wrap">
                  {form.app_banner_url
                    ? <img src={fileUrl(form.app_banner_url)} alt="Banner" className="h-20 w-36 object-cover rounded-lg border border-gray-200" />
                    : <div className="h-20 w-36 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400">No picture</div>}
                  <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    <Upload size={15} /> {bannerUploading ? 'Uploading…' : 'Upload picture'}
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={uploadBanner} disabled={bannerUploading} />
                  </label>
                  {form.app_banner_url && (
                    <button type="button" onClick={() => handleChange('app_banner_url', '')} className="text-xs font-semibold text-red-600">Remove</button>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">Best size: 1200 × 600 px (JPG/PNG, under 5 MB).</p>
              </div>
              <label className="flex items-center gap-3 mt-6 text-sm font-semibold text-gray-700">
                <input type="checkbox" checked={form.app_offer_popup === '1'} onChange={e => handleChange('app_offer_popup', e.target.checked ? '1' : '0')} className="w-4 h-4" />
                Show the offer as a popup when customers open the app (once a day)
              </label>
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
              <h2 className="font-bold text-lg text-gray-900">Bookings</h2>
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
