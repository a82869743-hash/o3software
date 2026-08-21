import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Search, Phone } from 'lucide-react';
import { useStaffList, useCreateStaff } from '../../api/hooks/useStaff';
import { useUIStore } from '../../store/uiStore';
import PageHeader from '../../components/shared/PageHeader';
import StatusBadge from '../../components/shared/StatusBadge';
import EmptyState from '../../components/shared/EmptyState';
import SkeletonLoader from '../../components/ui/SkeletonLoader';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';

export default function StaffPage() {
  const navigate = useNavigate();
  const toast = useUIStore(s => s.toast);
  const { data: staff, isLoading } = useStaffList();
  const createMutation = useCreateStaff();

  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', mobile: '', password: '', specialisations: '', email: '' });

  const filtered = (staff || []).filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.mobile.includes(search)
  );

  const handleCreate = async () => {
    if (!form.name || !form.mobile || !form.password) {
      toast('error', 'Name, mobile, and password are required');
      return;
    }
    try {
      await createMutation.mutateAsync(form);
      toast('success', 'Staff member added');
      setShowAdd(false);
      setForm({ name: '', mobile: '', password: '', specialisations: '', email: '' });
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to create staff');
    }
  };

  if (isLoading) return <SkeletonLoader lines={6} />;

  return (
    <div>
      <PageHeader
        title="Staff Management"
        subtitle={`${staff?.length || 0} team members`}
        actions={
          <Button variant="primary" size="md" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Staff
          </Button>
        }
      />

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or mobile..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] outline-none"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {!filtered.length ? (
        <EmptyState icon={Users} title="No staff members found" />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Mobile</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Specialisations</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Today</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s: any) => (
                <tr
                  key={s.id}
                  className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/admin/staff/${s.id}`)}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#2563EB]/10 flex items-center justify-center text-[#2563EB] font-semibold text-sm">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{s.name}</p>
                        {s.email && <p className="text-xs text-gray-400">{s.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5 text-sm text-gray-600">
                      <Phone className="w-3.5 h-3.5" />
                      {s.mobile}
                    </div>
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell">
                    <p className="text-sm text-gray-500 truncate max-w-xs">{s.specialisations || '—'}</p>
                  </td>
                  <td className="px-5 py-4">
                    {s.today_attendance ? (
                      <StatusBadge status={s.today_attendance} />
                    ) : (
                      <span className="text-xs text-gray-400">Not marked</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Staff Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Staff Member">
        <div className="space-y-4">
          <Input label="Full Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="John Doe" />
          <Input label="Mobile Number *" value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} placeholder="9876543210" />
          <Input label="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" />
          <Input label="Password *" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" />
          <Textarea label="Specialisations" value={form.specialisations} onChange={e => setForm({ ...form, specialisations: e.target.value })} placeholder="PPF, Ceramic Coating, Interior Detailing" />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate} loading={createMutation.isPending}>Add Staff</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
