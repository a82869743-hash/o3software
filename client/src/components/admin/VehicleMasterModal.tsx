import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Check, Car, Search } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import api from '../../api/axiosInstance';
import { toast } from 'react-hot-toast';

import { getCategoryForModel } from '../../utils/carData';

interface VehicleMasterItem {
  id: number;
  make: string;
  model: string;
  variant?: string | null;
  vehicle_category: string;
}

interface VehicleMasterModalProps {
  open: boolean;
  onClose: () => void;
}

export default function VehicleMasterModal({ open, onClose }: VehicleMasterModalProps) {
  const [items, setItems] = useState<VehicleMasterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Form states for creating new entry
  const [makeInput, setMakeInput] = useState('');
  const [modelInput, setModelInput] = useState('');
  const [variantInput, setVariantInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('sedan');
  const [submitting, setSubmitting] = useState(false);

  // Edit inline state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editMake, setEditMake] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editVariant, setEditVariant] = useState('');
  const [editCategory, setEditCategory] = useState('sedan');

  const fetchMaster = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ success: boolean; data: VehicleMasterItem[] }>('/vehicles/master');
      if (res.data.success) {
        setItems(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch vehicle master:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchMaster();
  }, [open]);

  const handleCreate = async () => {
    if (!makeInput.trim() || !modelInput.trim()) {
      toast.error('Car brand (make) and model are required');
      return;
    }
    try {
      setSubmitting(true);
      const res = await api.post('/vehicles/master', {
        make: makeInput.trim(),
        model: modelInput.trim(),
        variant: variantInput.trim() || null,
        vehicle_category: categoryInput,
      });
      if (res.data.success) {
        toast.success(res.data.message || 'Vehicle master entry added');
        setMakeInput('');
        setModelInput('');
        setVariantInput('');
        fetchMaster();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to add entry');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (id: number) => {
    if (!editMake.trim() || !editModel.trim()) {
      toast.error('Car brand (make) and model are required');
      return;
    }
    try {
      const res = await api.put(`/vehicles/master/${id}`, {
        make: editMake.trim(),
        model: editModel.trim(),
        variant: editVariant.trim() || null,
        vehicle_category: editCategory,
      });
      if (res.data.success) {
        toast.success(res.data.message || 'Updated successfully');
        setEditingId(null);
        fetchMaster();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update entry');
    }
  };

  const handleDelete = async (id: number, nameStr: string) => {
    if (!confirm(`Are you sure you want to delete "${nameStr}"?`)) return;
    try {
      const res = await api.delete(`/vehicles/master/${id}`);
      if (res.data.success) {
        toast.success(res.data.message || 'Entry deleted');
        fetchMaster();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete entry');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Manage Car Companies & Models" size="lg">
      <div className="space-y-4 text-left">
        {/* Add Entry Card */}
        <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 space-y-3">
          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
            <Car size={14} className="text-blue-600" /> Add New Car Make & Model
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              type="text"
              placeholder="Brand / Make (e.g. Hyundai)"
              value={makeInput}
              onChange={(e) => setMakeInput(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            <input
              type="text"
              placeholder="Model (e.g. Creta)"
              value={modelInput}
              onChange={(e) => {
                const val = e.target.value;
                setModelInput(val);
                if (val.trim()) {
                  setCategoryInput(getCategoryForModel(makeInput, val));
                }
              }}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            <input
              type="text"
              placeholder="Variant (Optional)"
              value={variantInput}
              onChange={(e) => setVariantInput(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            <select
              value={categoryInput}
              onChange={(e) => setCategoryInput(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium"
            >
              <option value="hatchback">Hatchback</option>
              <option value="medium_hatchback">Medium Hatchback</option>
              <option value="sedan">Sedan</option>
              <option value="premium_sedan">Premium Sedan</option>
              <option value="suv">SUV</option>
            </select>
          </div>
          <div className="flex justify-end">
            <Button size="sm" loading={submitting} onClick={handleCreate} icon={<Plus size={14} />}>
              Save Car Model
            </Button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by brand, model, or variant..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>

        {/* List of Entries Table */}
        <div className="max-h-[400px] overflow-y-auto border border-gray-200 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-100 text-gray-700 font-bold sticky top-0 border-b border-gray-200">
              <tr>
                <th className="p-2.5">Brand / Make</th>
                <th className="p-2.5">Model</th>
                <th className="p-2.5">Variant</th>
                <th className="p-2.5">Vehicle Category</th>
                <th className="p-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-400 italic">Loading vehicle master catalog...</td>
                </tr>
              ) : items.filter(item => {
                  if (!searchQuery.trim()) return true;
                  const q = searchQuery.toLowerCase().trim();
                  return (
                    item.make?.toLowerCase().includes(q) ||
                    item.model?.toLowerCase().includes(q) ||
                    item.variant?.toLowerCase().includes(q) ||
                    item.vehicle_category?.toLowerCase().includes(q)
                  );
                }).length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-400 italic">
                    {searchQuery.trim() ? `No car brand or model matching "${searchQuery}"` : 'No car brands or models found.'}
                  </td>
                </tr>
              ) : (
                items.filter(item => {
                  if (!searchQuery.trim()) return true;
                  const q = searchQuery.toLowerCase().trim();
                  return (
                    item.make?.toLowerCase().includes(q) ||
                    item.model?.toLowerCase().includes(q) ||
                    item.variant?.toLowerCase().includes(q) ||
                    item.vehicle_category?.toLowerCase().includes(q)
                  );
                }).map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/80 transition-colors">
                    {editingId === item.id ? (
                      <>
                        <td className="p-2">
                          <input
                            type="text"
                            value={editMake}
                            onChange={(e) => setEditMake(e.target.value)}
                            className="w-full px-2 py-1 border border-blue-400 rounded text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={editModel}
                            onChange={(e) => setEditModel(e.target.value)}
                            className="w-full px-2 py-1 border border-blue-400 rounded text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={editVariant}
                            onChange={(e) => setEditVariant(e.target.value)}
                            className="w-full px-2 py-1 border border-blue-400 rounded text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="w-full px-2 py-1 border border-blue-400 rounded text-xs bg-white"
                          >
                            <option value="hatchback">Hatchback</option>
                            <option value="medium_hatchback">Medium Hatchback</option>
                            <option value="sedan">Sedan</option>
                            <option value="premium_sedan">Premium Sedan</option>
                            <option value="suv">SUV</option>
                          </select>
                        </td>
                        <td className="p-2 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => handleUpdate(item.id)}
                              className="p-1 text-green-600 hover:text-green-700 font-bold"
                              title="Save Changes"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1 text-gray-400 hover:text-gray-600 text-[10px]"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-2.5 font-bold text-gray-900">{item.make}</td>
                        <td className="p-2.5 font-semibold text-gray-700">{item.model}</td>
                        <td className="p-2.5 text-gray-500">{item.variant || '-'}</td>
                        <td className="p-2.5">
                          <span className="bg-blue-50 text-blue-700 text-[10px] px-2 py-0.5 rounded-md font-bold capitalize">
                            {item.vehicle_category}
                          </span>
                        </td>
                        <td className="p-2.5 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => {
                                setEditingId(item.id);
                                setEditMake(item.make);
                                setEditModel(item.model);
                                setEditVariant(item.variant || '');
                                setEditCategory(item.vehicle_category || 'sedan');
                              }}
                              className="p-1 text-gray-500 hover:text-blue-600 rounded"
                              title="Edit Entry"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id, `${item.make} ${item.model}`)}
                              className="p-1 text-gray-500 hover:text-blue-600 rounded"
                              title="Delete Entry"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
