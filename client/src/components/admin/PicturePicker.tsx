import { useMemo, useState } from 'react';
import { Images, Upload, Wand2, X, Check, Search } from 'lucide-react';
import api from '../../api/axiosInstance';
import { useUIStore } from '../../store/uiStore';
import { ServiceArt, ILLUSTRATIONS, LIBRARY_LABELS, illustrationFor, PHOTO_LIBRARY } from '../customer/serviceVisuals';

interface Props {
  /** service / package name — used for the automatic picture and the AI prompt */
  name: string;
  description?: string;
  kind?: 'service' | 'package';
  value: string;
  onChange: (url: string) => void;
}

/**
 * Picture for a service or package. Leaving it empty is fine: the customer app then picks a matching
 * picture by name automatically (and, if AI pictures are set up, the server creates one after saving).
 */
export default function PicturePicker({ name, description, kind = 'service', value, onChange }: Props) {
  const toast = useUIStore(s => s.toast);
  const [showLibrary, setShowLibrary] = useState(false);
  const [q, setQ] = useState('');
  const [libTab, setLibTab] = useState<'photos' | 'art'>('photos');
  const [busy, setBusy] = useState<'' | 'upload' | 'ai'>('');
  const auto = !value && !!illustrationFor(name);

  const library = useMemo(() => {
    const all = libTab === 'photos' ? PHOTO_LIBRARY : Object.entries(ILLUSTRATIONS).map(([key, url]) => ({ key, url, label: LIBRARY_LABELS[key] || key }));
    const term = q.trim().toLowerCase();
    return term ? all.filter(it => it.label.toLowerCase().includes(term) || it.key.includes(term)) : all;
  }, [q, libTab]);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('error', 'Picture must be under 5 MB'); return; }
    setBusy('upload');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const r = await api.post('/services/upload-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onChange(r.data.data.image_url);
    } catch (err: any) { toast('error', err.message || 'Upload failed'); } finally { setBusy(''); }
  };

  const generate = async () => {
    if (!name.trim()) { toast('error', 'Type the name first'); return; }
    setBusy('ai');
    try {
      const r = await api.post('/services/generate-image', { name, description, kind });
      onChange(r.data.data.image_url);
      toast('success', 'Picture created');
    } catch (err: any) { toast('error', err.message || 'Could not create a picture'); } finally { setBusy(''); }
  };

  return (
    <div className="col-span-full">
      <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">Picture shown to customers</label>
      <div className="flex gap-3 items-start flex-wrap">
        <div className="w-24 h-24 rounded-2xl overflow-hidden border border-slate-200 shrink-0">
          <ServiceArt name={name || 'service'} imageUrl={value || null} className="h-24" />
        </div>
        <div className="flex-1 min-w-[200px] space-y-2">
          <p className="text-xs text-slate-500">
            {value ? 'Custom picture selected.' : auto ? 'Automatic: a matching picture is picked from the name.' : 'No match yet — choose one below or leave it for an automatic picture.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowLibrary(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Images size={14} /> Choose from library
            </button>
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Upload size={14} /> {busy === 'upload' ? 'Uploading…' : 'Upload photo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={upload} disabled={!!busy} />
            </label>
            <button type="button" onClick={generate} disabled={!!busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] text-white text-xs font-bold disabled:opacity-60">
              <Wand2 size={14} /> {busy === 'ai' ? 'Creating… (~15s)' : 'Create with AI'}
            </button>
            {value && (
              <button type="button" onClick={() => onChange('')} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-rose-600">
                <X size={14} /> Use automatic
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Library popup (sits above the form) */}
      {showLibrary && (
        <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4" onClick={() => setShowLibrary(false)}>
          <div className="w-full sm:max-w-2xl max-h-[85vh] bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-[16px] font-extrabold text-slate-900">Picture library</h3>
                <p className="text-xs text-slate-500">Tap a picture to use it</p>
              </div>
              <button type="button" onClick={() => setShowLibrary(false)} className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-500"><X size={18} /></button>
            </div>
            <div className="px-5 pt-3 space-y-2">
              <div className="flex bg-slate-100 rounded-xl p-1">
                {([['photos', `Real photos (${PHOTO_LIBRARY.length})`], ['art', '3D pictures']] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setLibTab(k)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${libTab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{label}</button>
                ))}
              </div>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search e.g. coating, wash, interior…" autoFocus
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-[#2563EB]" />
              </div>
            </div>
            <div className="p-5 overflow-y-auto grid grid-cols-3 sm:grid-cols-5 gap-3">
              {library.map(it => (
                <button key={it.key} type="button" onClick={() => { onChange(it.url); setShowLibrary(false); toast('success', `${it.label} selected`); }}
                  className={`group relative rounded-2xl border p-2 text-center transition-all hover:-translate-y-0.5 hover:shadow-md ${value === it.url ? 'border-[#2563EB] ring-2 ring-blue-200 bg-blue-50/40' : 'border-slate-200 bg-white'}`}>
                  <img src={it.url} alt="" className={`w-full aspect-square rounded-xl ${libTab === 'photos' ? 'object-cover' : 'object-contain mix-blend-multiply'}`} />
                  <span className="block text-[11px] font-semibold text-slate-700 leading-tight mt-1">{it.label}</span>
                  {value === it.url && <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#2563EB] text-white flex items-center justify-center"><Check size={12} /></span>}
                </button>
              ))}
              {!library.length && <p className="col-span-full text-center text-sm text-slate-400 py-6">No picture matches “{q}”.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
