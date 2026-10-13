import { useState, useEffect } from 'react';
import { Building2, ChevronDown, Plus, Check, MapPin, Phone } from 'lucide-react';
import api from '../../api/axiosInstance';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useUIStore } from '../../store/uiStore';

export interface Franchise {
  id: number;
  name: string;
  code: string;
  address?: string;
  phone?: string;
}

export default function FranchiseSwitcher() {
  const toast = useUIStore((s) => s.toast);
  const [franchises, setFranchises] = useState<Franchise[]>([]);
  const [activeId, setActiveId] = useState<number>(() => {
    return parseInt(localStorage.getItem('active_franchise_id') || '1', 10);
  });
  const [openDropdown, setOpenDropdown] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // New franchise form state
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchFranchises = async () => {
    try {
      const res = await api.get('/franchises');
      if (res.data.success) {
        setFranchises(res.data.data || []);
      }
    } catch {
      // Fallback defaults
      setFranchises([
        { id: 1, name: 'O3 Car Spaaa - Main Studio', code: 'o3_main' },
        { id: 2, name: 'O3 Lite - Express Studio', code: 'o3_lite' },
      ]);
    }
  };

  useEffect(() => {
    fetchFranchises();
  }, []);

  const activeFranchise = franchises.find((f) => f.id === activeId) || franchises[0] || {
    id: 1,
    name: 'O3 Car Spaaa - Main Studio',
    code: 'o3_main',
  };

  const handleSelect = (fId: number) => {
    localStorage.setItem('active_franchise_id', String(fId));
    setActiveId(fId);
    setOpenDropdown(false);
    toast('success', `Switched workspace to ${franchises.find((f) => f.id === fId)?.name || 'Franchise'}`);
    setTimeout(() => {
      window.location.reload();
    }, 400);
  };

  const handleCreateFranchise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast('error', 'Franchise name is required');
      return;
    }
    setSaving(true);
    try {
      const cleanCode = newCode.trim() || newName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const res = await api.post('/franchises', {
        name: newName,
        code: cleanCode,
        address: newAddress,
        phone: newPhone,
      });
      toast('success', res.data.message || 'Franchise created');
      setCreateModalOpen(false);
      setNewName('');
      setNewCode('');
      setNewAddress('');
      setNewPhone('');
      await fetchFranchises();
      if (res.data.data?.id) {
        handleSelect(res.data.data.id);
      }
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to create franchise');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative px-4 mb-3">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1 px-1 flex items-center justify-between">
        <span>Active Outlet / Franchise</span>
        <span className="text-[#2563EB] bg-blue-50 px-1.5 py-0.2 rounded font-black text-[9px]">
          {activeFranchise.code === 'o3_lite' ? 'LITE' : 'MAIN'}
        </span>
      </div>

      {/* Selector Trigger Button */}
      <button
        type="button"
        onClick={() => setOpenDropdown(!openDropdown)}
        className="w-full flex items-center justify-between gap-2 p-2.5 bg-gradient-to-r from-blue-50/90 to-slate-50 border border-blue-200/80 rounded-xl hover:border-blue-300 transition-all text-left group cursor-pointer shadow-2xs"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[#2563EB] text-white flex items-center justify-center shrink-0 shadow-xs">
            <Building2 size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-slate-900 truncate tracking-tight">
              {activeFranchise.name}
            </p>
            <p className="text-[10px] text-slate-500 font-semibold truncate">
              {activeFranchise.code}
            </p>
          </div>
        </div>
        <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600 shrink-0 transition-transform" />
      </button>

      {/* Dropdown Menu */}
      {openDropdown && (
        <div className="absolute left-4 right-4 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-1.5 space-y-1 animate-in fade-in-50 zoom-in-95">
          <div className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">
            Switch Outlet Login
          </div>
          {franchises.map((f) => {
            const isSelected = f.id === activeId;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => handleSelect(f.id)}
                className={`w-full flex items-center justify-between p-2 rounded-lg text-xs font-bold transition-all text-left ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 size={14} className={isSelected ? 'text-white' : 'text-blue-600'} />
                  <span className="truncate">{f.name}</span>
                </div>
                {isSelected && <Check size={14} className="shrink-0" />}
              </button>
            );
          })}

          <div className="pt-1 border-t border-slate-100 mt-1">
            <button
              type="button"
              onClick={() => {
                setOpenDropdown(false);
                setCreateModalOpen(true);
              }}
              className="w-full flex items-center gap-2 p-2 rounded-lg text-xs font-extrabold text-[#2563EB] hover:bg-blue-50 transition-colors"
            >
              <Plus size={14} />
              <span>Add New Franchise Login</span>
            </button>
          </div>
        </div>
      )}

      {/* Create New Franchise Modal */}
      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Create New Franchise Login" size="sm">
        <form onSubmit={handleCreateFranchise} className="space-y-4 text-left py-2">
          <p className="text-xs text-slate-600">
            Create a brand-new studio franchise login (e.g. <strong>O3 Lite Anand</strong>, <strong>O3 Studio Nadiad</strong>). Data across franchises will remain 100% separate.
          </p>

          <Input
            label="Franchise / Studio Name *"
            placeholder="e.g. O3 Lite Express Studio"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />

          <Input
            label="Franchise Code / Slug *"
            placeholder="e.g. o3_lite_express"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
          />

          <Input
            label="Studio Address"
            placeholder="e.g. Station Road, Anand"
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
          />

          <Input
            label="Contact Phone Number"
            placeholder="e.g. 7225030304"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" type="button" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} icon={<Plus size={16} />}>
              Create Franchise
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
