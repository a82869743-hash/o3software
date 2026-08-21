import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axiosInstance';
import { Search, Users, ChevronRight, UserCircle, Trash2, Car } from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmModal from '../../components/ui/ConfirmModal';
import VehicleMasterModal from '../../components/admin/VehicleMasterModal';

interface Customer {
  id: number;
  name: string;
  mobile: string;
  email: string;
  created_at: string;
  is_active: number;
  vehicles?: Array<{ id: number; brand: string; model: string; registration_no: string }>;
}

export default function CustomersListPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [archiveTarget, setArchiveTarget] = useState<{ id: number; name: string } | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [vmModalOpen, setVmModalOpen] = useState(false);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/customers', {
        params: { search, page, limit: 20 }
      });
      if (res.data.success) {
        setCustomers(res.data.data);
        setTotalPages(Math.ceil(res.data.pagination.total / 20));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchCustomers();
  };

  const handleDeleteClick = (id: number, name: string) => {
    setArchiveTarget({ id, name });
  };

  const handleConfirmDelete = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await api.delete(`/customers/${archiveTarget.id}`);
      toast.success('Customer archived');
      setArchiveTarget(null);
      fetchCustomers();
    } catch {
      toast.error('Failed to archive customer');
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
            <Users className="text-[#2563EB] w-7 h-7" />
            Customers CRM
          </h1>
          <p className="text-sm text-[#5f5e5e] mt-1">Manage customers, view their vehicles, and maintain a chronological history of notes.</p>
        </div>
        <button
          onClick={() => setVmModalOpen(true)}
          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all shrink-0"
        >
          <Car size={15} />
          Manage Car Companies & Models
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <form onSubmit={handleSearch} className="flex gap-2 w-full max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, mobile, vehicle reg no..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 font-extrabold placeholder:text-gray-400"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >
              Search
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider text-[11px]">
                <th className="p-4">Customer</th>
                <th className="p-4">Vehicles</th>
                <th className="p-4">Contact</th>
                <th className="p-4">Joined On</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">Loading customers...</td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">No customers found.</td>
                </tr>
              ) : (
                customers.map(cust => (
                  <tr key={cust.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => navigate(`/admin/customers/${cust.id}`)}>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <UserCircle className="w-8 h-8 text-gray-400" />
                        <div>
                          <div className="font-bold text-gray-900">{cust.name}</div>
                          <div className="text-xs text-gray-500">ID: CUST-{cust.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      {cust.vehicles && cust.vehicles.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 max-w-xs">
                          {cust.vehicles.map(v => (
                            <span key={v.id} className="inline-flex items-center gap-1 text-[11px] font-bold bg-gray-100 text-gray-800 px-2 py-0.5 rounded border border-gray-200">
                              🚗 {v.registration_no || `${v.brand} ${v.model}`}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">No vehicles</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="font-medium text-gray-800">{cust.mobile || '—'}</div>
                      <div className="text-xs text-gray-500">{cust.email || '—'}</div>
                    </td>
                    <td className="p-4 text-gray-600">
                      {new Date(cust.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteClick(cust.id, cust.name); }}
                          className="p-1.5 rounded hover:bg-blue-50 transition-colors"
                          title="Archive"
                        >
                          <Trash2 size={14} className="text-gray-400 hover:text-blue-500" />
                        </button>
                        <ChevronRight className="w-5 h-5 text-gray-400 inline-block cursor-pointer" onClick={() => navigate(`/admin/customers/${cust.id}`)} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
            <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 bg-white border border-gray-300 rounded text-sm hover:bg-gray-100 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 bg-white border border-gray-300 rounded text-sm hover:bg-gray-100 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Archive Customer"
        description={`Archive customer "${archiveTarget?.name}"? They will be moved to the Recycle Bin.`}
        confirmText="Archive Customer"
        isDestructive={true}
        loading={archiving}
      />

      <VehicleMasterModal open={vmModalOpen} onClose={() => setVmModalOpen(false)} />
    </div>
  );
}
