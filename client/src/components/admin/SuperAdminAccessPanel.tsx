import { useEffect, useState } from 'react';
import { KeyRound, Power, LogOut, UserPlus, Eye, Save } from 'lucide-react';
import api from '../../api/axiosInstance';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { useUIStore } from '../../store/uiStore';
import { formatDateTime } from '../../utils/formatters';
import { isValidMobile } from '../../utils/validators';
import Dropdown from '../ui/Dropdown';

const ROLES = [
  { key: 'admin', label: 'Franchise Admin' },
  { key: 'manager', label: 'Manager' },
  { key: 'staff', label: 'Staff' },
  { key: 'customer', label: 'Customer' },
];
const PRICE_FIELDS = [
  { key: 'cost_price', label: 'Cost price (HQ purchase)' },
  { key: 'franchise_price', label: 'Franchise price (HQ → franchise)' },
  { key: 'selling_price', label: 'Customer price (MRP / selling)' },
  { key: 'staff_price', label: 'Staff price' },
];
const strongPw = (p: string) => p.length >= 8 && /\d/.test(p) && /[a-zA-Z]/.test(p);

/** Super Admin: who can log in to each franchise, and which price each role may see. */
export function FranchiseUsersPanel({ franchises }: { franchises: { id: number; name: string }[] }) {
  const toast = useUIStore(s => s.toast);
  const [fid, setFid] = useState<number>(franchises[0]?.id || 1);
  const [users, setUsers] = useState<any[]>([]);
  const [resetUser, setResetUser] = useState<any>(null);
  const [newPw, setNewPw] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminForm, setAdminForm] = useState({ name: '', mobile: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { const { data } = await api.get(`/franchises/${fid}/users`); setUsers(data.data || []); }
    catch (e: any) { toast('error', e.message); }
  };
  useEffect(() => { if (fid) load(); }, [fid]);

  const act = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); toast('success', ok); load(); } catch (e: any) { toast('error', e.message); }
  };

  const createAdmin = async () => {
    if (!adminForm.name.trim()) { toast('error', 'Name is required'); return; }
    if (!isValidMobile(adminForm.mobile)) { toast('error', 'Enter a valid 10-digit mobile'); return; }
    if (!strongPw(adminForm.password)) { toast('error', 'Password: 8+ characters with letters and numbers'); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/franchises/${fid}/owner`, adminForm);
      toast('success', data.message || 'Franchise admin created');
      setShowAdmin(false); setAdminForm({ name: '', mobile: '', email: '', password: '' }); load();
    } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };

  const cls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 bg-white p-4 rounded-xl border border-gray-100">
        <Dropdown className="px-3 py-2 border border-gray-300 rounded-lg text-sm" value={fid} onChange={e => setFid(Number(e.target.value))}>
          {franchises.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Dropdown>
        <p className="text-xs text-gray-500">Create the franchise admin's login here and share it with them. The admin then adds their own staff and staff roles (within the modules you enabled).</p>
        <Button size="sm" className="ml-auto" icon={<UserPlus size={14} />} onClick={() => setShowAdmin(true)}>New franchise admin</Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
            <tr><th className="p-3 text-left">User</th><th className="p-3 text-left">Role</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Last login</th><th className="p-3 text-right">Actions</th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t border-gray-100">
                <td className="p-3"><p className="font-bold">{u.name}</p><p className="text-xs text-gray-500">{u.mobile}{u.email ? ` · ${u.email}` : ''}</p></td>
                <td className="p-3 capitalize">{u.role === 'admin' ? 'Franchise Admin' : u.role}{u.custom_role_name ? ` · ${u.custom_role_name}` : ''}</td>
                <td className="p-3 text-xs">
                  <span className={`px-2 py-0.5 rounded-full font-bold ${u.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'}`}>{u.is_active ? 'Active' : 'Disabled'}</span>
                  {u.must_change_password ? <div className="text-amber-700 mt-1">Must set own password</div> : null}
                </td>
                <td className="p-3 text-xs text-gray-500">{u.last_login ? formatDateTime(u.last_login) : 'Never'}</td>
                <td className="p-3 text-right whitespace-nowrap space-x-3">
                  <button title="Reset password" className="text-blue-600" onClick={() => { setResetUser(u); setNewPw(''); }}><KeyRound size={15} /></button>
                  <button title="Log out from all devices" className="text-slate-600" onClick={() => act(() => api.post(`/franchises/users/${u.id}/force-logout`), 'Logged out everywhere')}><LogOut size={15} /></button>
                  <button title={u.is_active ? 'Disable' : 'Enable'} className={u.is_active ? 'text-rose-600' : 'text-emerald-600'}
                    onClick={() => act(() => api.patch(`/franchises/users/${u.id}/status`), u.is_active ? 'Account disabled' : 'Account enabled')}><Power size={15} /></button>
                </td>
              </tr>
            ))}
            {!users.length && <tr><td colSpan={5} className="p-8 text-center text-gray-400">No logins for this franchise yet — create the franchise admin first.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={!!resetUser} onClose={() => setResetUser(null)} title={`Reset password — ${resetUser?.name || ''}`}
        footer={<><Button variant="ghost" onClick={() => setResetUser(null)}>Cancel</Button>
          <Button onClick={() => { if (!strongPw(newPw)) { toast('error', 'Password: 8+ characters with letters and numbers'); return; }
            act(() => api.post(`/franchises/users/${resetUser.id}/reset-password`, { new_password: newPw }), 'Password reset — they must change it at next login').then(() => setResetUser(null)); }}>Reset</Button></>}>
        <input className={cls} placeholder="Temporary password" value={newPw} onChange={e => setNewPw(e.target.value)} />
      </Modal>

      <Modal open={showAdmin} onClose={() => setShowAdmin(false)} title="New franchise admin login"
        footer={<><Button variant="ghost" onClick={() => setShowAdmin(false)}>Cancel</Button><Button loading={busy} onClick={createAdmin}>Create login</Button></>}>
        <div className="space-y-3">
          <input className={cls} placeholder="Full name" value={adminForm.name} onChange={e => setAdminForm({ ...adminForm, name: e.target.value })} />
          <input className={cls} placeholder="Mobile (used to log in)" maxLength={10} value={adminForm.mobile} onChange={e => setAdminForm({ ...adminForm, mobile: e.target.value.replace(/\D/g, '') })} />
          <input className={cls} placeholder="Email (optional)" value={adminForm.email} onChange={e => setAdminForm({ ...adminForm, email: e.target.value })} />
          <input className={cls} placeholder="Temporary password (8+ letters & numbers)" value={adminForm.password} onChange={e => setAdminForm({ ...adminForm, password: e.target.value })} />
          <p className="text-xs text-gray-500">They will be asked to choose their own password at first login.</p>
        </div>
      </Modal>
    </div>
  );
}

export function PriceVisibilityPanel() {
  const toast = useUIStore(s => s.toast);
  const [matrix, setMatrix] = useState<Record<string, Record<string, boolean>>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/settings/price-visibility').then(r => setMatrix(r.data.data || {})).catch((e: any) => toast('error', e.message));
  }, [toast]);

  const toggle = (role: string, field: string) =>
    setMatrix(m => ({ ...m, [role]: { ...(m[role] || {}), [field]: !m[role]?.[field] } }));

  const save = async () => {
    setBusy(true);
    try { await api.put('/settings/price-visibility', { matrix }); toast('success', 'Saved. Changes show right away.'); }
    catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Eye className="text-blue-600 mt-0.5" size={20} />
        <div>
          <h3 className="font-bold text-gray-900">Who sees which price</h3>
          <p className="text-xs text-gray-500">Only you (Super Admin) can change this and edit product prices. Franchise admins cannot.
            Hidden prices are removed by the server, not just hidden on screen.</p>
        </div>
        <Button size="sm" className="ml-auto" loading={busy} icon={<Save size={14} />} onClick={save}>Save</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-500"><th className="py-2">Price</th>{ROLES.map(r => <th key={r.key} className="text-center">{r.label}</th>)}</tr></thead>
          <tbody>
            {PRICE_FIELDS.map(f => (
              <tr key={f.key} className="border-t border-gray-100">
                <td className="py-3 font-semibold">{f.label}</td>
                {ROLES.map(r => (
                  <td key={r.key} className="text-center">
                    <input type="checkbox" className="w-4 h-4" checked={!!matrix[r.key]?.[f.key]} onChange={() => toggle(r.key, f.key)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
