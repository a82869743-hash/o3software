import { useEffect, useState } from 'react';
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
import api from '../../api/axiosInstance';
import { useAuthStore } from '../../store/authStore';
import { can } from '../../utils/access';
import { isValidMobile } from '../../utils/validators';
import Dropdown from '../../components/ui/Dropdown';

export default function StaffPage() {
  const navigate = useNavigate();
  const toast = useUIStore(s => s.toast);
  const { data: staff, isLoading } = useStaffList();
  const createMutation = useCreateStaff();

  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const user = useAuthStore(st => st.user);
  const emptyForm = { name: '', mobile: '', password: '', specialisations: '', email: '', role: 'staff', custom_role_id: '', salary_type: 'monthly', salary_rate: '', working_days_per_month: '26', paid_leaves_per_month: '1' };
  const [form, setForm] = useState<any>(emptyForm);
  const [roles, setRoles] = useState<any[]>([]);
  useEffect(() => {
    if (can(user, 'roles')) api.get('/roles').then(r => setRoles(r.data.data || [])).catch(() => {});
  }, [user]);
  const sel = 'w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white';

  const filtered = (staff || []).filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.mobile.includes(search)
  );

  const handleCreate = async () => {
    if (!form.name || !form.mobile || !form.password) {
      toast('error', 'Name, mobile, and password are required');
      return;
    }
    if (!isValidMobile(form.mobile)) { toast('error', 'Enter a valid 10-digit mobile number'); return; }
    if (form.password.length < 8 || !/\d/.test(form.password) || !/[a-zA-Z]/.test(form.password)) {
      toast('error', 'Password must be at least 8 characters with letters and numbers'); return;
    }
    try {
      await createMutation.mutateAsync({ ...form, custom_role_id: form.custom_role_id ? Number(form.custom_role_id) : null });
      toast('success', `${form.role === 'manager' ? 'Manager' : 'Staff member'} added — share the login (mobile + password) with them`);
      setShowAdd(false);
      setForm(emptyForm);
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
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Role & salary</th>
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
                    <p className="text-sm text-gray-700 capitalize">{s.role}{s.custom_role_name ? ` · ${s.custom_role_name}` : ''}</p>
                    <p className="text-xs text-gray-500 capitalize">{s.salary_type || 'monthly'} · ₹{Number(s.salary_rate || 0).toLocaleString('en-IN')}</p>
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
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Staff / Manager">
        <div className="space-y-4">
          <Input label="Full Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="John Doe" />
          <Input label="Mobile Number *" value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} placeholder="9876543210" />
          <Input label="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" />
          <Input label="Temporary password *" type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min 8 chars, letters + numbers (they must change it at first login)" />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-gray-700">Account type
              <Dropdown className={sel} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="staff">Staff / Technician</option><option value="manager">Manager</option>
              </Dropdown>
            </label>
            <label className="text-xs font-semibold text-gray-700">Permissions role
              <Dropdown className={sel} value={form.custom_role_id} onChange={e => setForm({ ...form, custom_role_id: e.target.value })}>
                <option value="">Default for {form.role}</option>
                {roles.filter(r => !r.is_template).map(r => <option key={r.id} value={r.id}>{r.role_name}</option>)}
              </Dropdown>
            </label>
            <label className="text-xs font-semibold text-gray-700">Salary method
              <Dropdown className={sel} value={form.salary_type} onChange={e => setForm({ ...form, salary_type: e.target.value })}>
                <option value="monthly">Monthly</option><option value="daily">Per day</option><option value="hourly">Per hour</option>
              </Dropdown>
            </label>
            <Input label={`Rate (₹ ${form.salary_type === 'monthly' ? 'per month' : form.salary_type === 'daily' ? 'per day' : 'per hour'})`} type="number" value={form.salary_rate} onChange={e => setForm({ ...form, salary_rate: e.target.value })} />
            <Input label="Working days / month" type="number" value={form.working_days_per_month} onChange={e => setForm({ ...form, working_days_per_month: e.target.value })} />
            <Input label="Paid leaves / month" type="number" value={form.paid_leaves_per_month} onChange={e => setForm({ ...form, paid_leaves_per_month: e.target.value })} />
          </div>
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
