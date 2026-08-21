import { useState, useRef } from 'react';
import { X, Camera, Trash2, Plus, PackageOpen } from 'lucide-react';
import api from '../../api/axiosInstance';
import { useUIStore } from '../../store/uiStore';

interface Belonging {
  id: number;
  description: string;
  image_url: string | null;
  created_at: string;
}

interface Props {
  jobCartId: string | undefined;
  initialBelongings: Belonging[];
  canEdit: boolean;
  onUpdate: (belongings: Belonging[]) => void;
}

export default function BelongingsSection({ jobCartId, initialBelongings, canEdit, onUpdate }: Props) {
  const toast = useUIStore((s) => s.toast);
  const [belongings, setBelongings] = useState<Belonging[]>(initialBelongings);
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAdd = async () => {
    if (!description.trim()) { toast('error', 'Description is required'); return; }
    if (!jobCartId) return;
    setAdding(true);
    try {
      const form = new FormData();
      form.append('description', description.trim());
      if (imageFile) form.append('image', imageFile);
      const res = await api.post(`/job-carts/${jobCartId}/belongings`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const updated = [...belongings, res.data.data];
      setBelongings(updated);
      onUpdate(updated);
      setDescription('');
      setImageFile(null);
      setImagePreview(null);
      setShowForm(false);
      toast('success', 'Belonging added');
    } catch (e: any) {
      toast('error', e?.response?.data?.error || 'Failed to add belonging');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!jobCartId) return;
    setDeleting(id);
    try {
      await api.delete(`/job-carts/${jobCartId}/belongings/${id}`);
      const updated = belongings.filter((b) => b.id !== id);
      setBelongings(updated);
      onUpdate(updated);
      toast('success', 'Belonging removed');
    } catch (e: any) {
      toast('error', 'Failed to remove belonging');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
            <PackageOpen size={18} className="text-amber-600" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm">Customer Belongings</h3>
            <p className="text-[11px] text-slate-500">Personal items found in/with the vehicle</p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#2563EB] text-white rounded-xl text-xs font-bold hover:bg-[#1D4ED8] transition-colors"
          >
            <Plus size={14} />
            Add Item
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && canEdit && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex gap-3 items-start">
            <div className="flex-1">
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="E.g. Sunglasses, Charger, EZ Tag, Cash..."
                className="w-full px-3 py-2.5 bg-white border border-amber-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400/30 placeholder:text-slate-400"
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                autoFocus
              />
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              className="shrink-0 w-10 h-10 rounded-xl bg-white border border-amber-200 flex items-center justify-center hover:bg-amber-100 transition-colors"
              title="Attach photo"
            >
              <Camera size={16} className="text-amber-600" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>
          {imagePreview && (
            <div className="mt-2 relative inline-block">
              <img src={imagePreview} alt="preview" className="w-20 h-20 rounded-lg object-cover border border-amber-200" />
              <button
                onClick={() => { setImageFile(null); setImagePreview(null); }}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
              >
                <X size={10} className="text-white" />
              </button>
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleAdd}
              disabled={adding}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition-colors disabled:opacity-60"
            >
              {adding ? 'Adding...' : 'Add Belonging'}
            </button>
            <button
              onClick={() => { setShowForm(false); setDescription(''); setImageFile(null); setImagePreview(null); }}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {belongings.length === 0 ? (
        <div className="py-6 text-center">
          <PackageOpen size={28} className="text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-400 font-medium">No belongings recorded</p>
        </div>
      ) : (
        <div className="space-y-2">
          {belongings.map((b) => (
            <div key={b.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 group">
              {b.image_url ? (
                <a href={b.image_url} target="_blank" rel="noreferrer">
                  <img src={b.image_url} alt={b.description} className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0 hover:opacity-80 transition-opacity" />
                </a>
              ) : (
                <div className="w-12 h-12 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                  <PackageOpen size={18} className="text-slate-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{b.description}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Added {new Date(b.created_at).toLocaleDateString('en-IN')}
                </p>
              </div>
              {canEdit && (
                <button
                  onClick={() => handleDelete(b.id)}
                  disabled={deleting === b.id}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 transition-all"
                  title="Remove belonging"
                >
                  <Trash2 size={14} className="text-red-400" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
