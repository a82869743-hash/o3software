import { useState, useEffect } from 'react';
import { Users, FileText, Check, Settings, Save, AlertTriangle, Download, Plus } from 'lucide-react';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import api from '../../api/axiosInstance';
import toast from 'react-hot-toast';
import { formatINR } from '../../utils/formatters';

export default function StaffSalaryPage() {
  const [monthYear, setMonthYear] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const [salaries, setSalaries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);

  // Custom salary modal
  const [showAdd, setShowAdd] = useState(false);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [addForm, setAddForm] = useState({ staff_id: '', base_salary: 0, bonus: 0, deductions: 0, status: 'paid', notes: '' });
  
  // Editing state
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    base_salary: 0,
    bonus: 0,
    deductions: 0,
    status: 'pending',
    notes: ''
  });

  const fetchSalaries = async () => {
    setLoading(true);
    try {
      const res = await api.get('/salary', { params: { month_year: monthYear } });
      setSalaries(res.data.data || []);
      setEditId(null);
    } catch (err) {
      setSalaries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalaries();
    // Fetch staff for dropdown
    api.get('/staff').then(res => setStaffList(res.data.data || [])).catch(() => {});
  }, [monthYear]);

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      await api.post('/salary/calculate', { month_year: monthYear });
      toast.success('Salary records generated successfully');
      fetchSalaries();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to generate salaries');
    } finally {
      setGenerating(false);
    }
  };

  const startEdit = (s: any) => {
    setEditId(s.id);
    setEditForm({
      base_salary: parseFloat(s.base_salary),
      bonus: parseFloat(s.bonus),
      deductions: parseFloat(s.deductions),
      status: s.status,
      notes: s.notes || ''
    });
  };

  const handleSave = async (id: number) => {
    try {
      await api.put(`/salary/${id}`, editForm);
      toast.success('Salary updated');
      fetchSalaries();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update');
    }
  };

  const getFinalSalary = () => {
    return editForm.base_salary + editForm.bonus - editForm.deductions;
  };

  const handleDownload = async (s: any) => {
    setDownloading(s.id);
    try {
      // Use the auth store token implicitly or explicitly
      const tokenStr = sessionStorage.getItem('gk-auth-v1') || localStorage.getItem('gk-auth-v1');
      let token = '';
      if (tokenStr) token = JSON.parse(tokenStr).state?.token || '';
      
      const API = import.meta.env.VITE_API_URL || '';
      const url = `${API}/salary/${s.id}/slip?token=${token}`;
      
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Failed');
      const blob = await resp.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `SAL-${s.month_year}-${s.id}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      toast.error('Could not generate PDF');
    } finally {
      setDownloading(null);
    }
  };

  const handleCreateSalary = async () => {
    if (!addForm.staff_id) return toast.error('Select a staff member');
    try {
      // Create manually (assuming backend has an endpoint or we just use calculate with specific ID)
      // Actually, we don't have a POST /salary endpoint for single manual salary creation.
      // Wait, let's create it in backend or check if it exists.
      await api.post('/salary', { ...addForm, month_year: monthYear });
      toast.success('Salary record created');
      setShowAdd(false);
      fetchSalaries();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create');
    }
  };


  return (
    <>
      <AdminTopBar
        title="Staff Salary Management"
        subtitle="Calculate and manage monthly payroll"
      />

      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="font-bold text-[#5f5e5e] text-sm whitespace-nowrap">Select Month:</label>
          <input 
            type="month" 
            value={monthYear} 
            onChange={(e) => setMonthYear(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg outline-none focus:border-[#2563EB] text-sm font-medium w-full sm:w-auto"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowAdd(true)} icon={<Plus size={16} />}>
            Custom Salary
          </Button>
          <Button onClick={handleGenerate} loading={generating} icon={<Settings size={16} />}>
            Auto Generate
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : salaries.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <FileText size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="font-bold text-[#0F172A] mb-1">No Salary Records Found</p>
            <p className="text-sm">Click "Generate / Recalculate" to calculate salaries for {monthYear}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase tracking-wider text-[#5f5e5e] font-bold">
                  <th className="p-4">Staff Name</th>
                  <th className="p-4">Base Salary</th>
                  <th className="p-4">Bonus</th>
                  <th className="p-4">Deductions</th>
                  <th className="p-4 bg-blue-50 text-[#2563EB]">Final Salary</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {salaries.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="p-4">
                      <p className="font-bold text-[#0F172A]">{s.staff_name}</p>
                      <p className="text-xs text-gray-500">{s.staff_mobile}</p>
                    </td>
                    
                    {editId === s.id ? (
                      <>
                        <td className="p-4">
                          <input type="number" value={editForm.base_salary} onChange={e => setEditForm({...editForm, base_salary: parseFloat(e.target.value) || 0})} className="w-24 px-2 py-1 border rounded text-sm" />
                        </td>
                        <td className="p-4">
                          <input type="number" value={editForm.bonus} onChange={e => setEditForm({...editForm, bonus: parseFloat(e.target.value) || 0})} className="w-20 px-2 py-1 border rounded text-sm" />
                        </td>
                        <td className="p-4">
                          <input type="number" value={editForm.deductions} onChange={e => setEditForm({...editForm, deductions: parseFloat(e.target.value) || 0})} className="w-20 px-2 py-1 border rounded text-sm" />
                        </td>
                        <td className="p-4 font-black text-[#2563EB]">
                          {formatINR(getFinalSalary())}
                        </td>
                        <td className="p-4">
                          <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})} className="px-2 py-1 border rounded text-xs uppercase font-bold">
                            <option value="pending">Pending</option>
                            <option value="paid">Paid</option>
                          </select>
                        </td>
                        <td className="p-4 text-right">
                          <button onClick={() => handleSave(s.id)} className="text-green-600 hover:text-green-800 font-bold text-xs uppercase bg-green-50 px-3 py-1.5 rounded flex items-center gap-1 inline-flex">
                            <Save size={14} /> Save
                          </button>
                          <button onClick={() => setEditId(null)} className="ml-2 text-gray-500 hover:text-gray-700 font-bold text-xs uppercase px-3 py-1.5 rounded inline-flex">
                            Cancel
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-4 font-medium text-[#0F172A]">{formatINR(s.base_salary)}</td>
                        <td className="p-4 font-medium text-green-600">{parseFloat(s.bonus) > 0 ? `+${formatINR(s.bonus)}` : '—'}</td>
                        <td className="p-4 font-medium text-blue-500">{parseFloat(s.deductions) > 0 ? `-${formatINR(s.deductions)}` : '—'}</td>
                        <td className="p-4 font-black text-[#2563EB] bg-blue-50/30">{formatINR(s.final_salary)}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${s.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button onClick={() => startEdit(s)} className="text-blue-600 hover:underline font-bold text-xs uppercase">
                              Edit
                            </button>
                            <button 
                              onClick={() => handleDownload(s)} 
                              disabled={downloading === s.id}
                              className="text-[#2563EB] hover:underline font-bold text-xs uppercase flex items-center gap-1 disabled:opacity-50"
                            >
                              {downloading === s.id ? '...' : <><Download size={13} /> PDF</>}
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Add Custom Salary Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-bold text-[#0F172A]">Create Custom Salary</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Staff Member</label>
                <select 
                  value={addForm.staff_id} 
                  onChange={e => {
                    const st = staffList.find(s => s.id === parseInt(e.target.value));
                    // Auto-fill base salary if staff has it in some profile, but we don't store it yet. Default 0.
                    setAddForm({...addForm, staff_id: e.target.value});
                  }}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:border-[#2563EB] text-sm font-medium"
                >
                  <option value="">Select Staff</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.mobile})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Base Salary</label>
                  <input type="number" value={addForm.base_salary} onChange={e => setAddForm({...addForm, base_salary: parseFloat(e.target.value) || 0})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bonus</label>
                  <input type="number" value={addForm.bonus} onChange={e => setAddForm({...addForm, bonus: parseFloat(e.target.value) || 0})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Deductions</label>
                  <input type="number" value={addForm.deductions} onChange={e => setAddForm({...addForm, deductions: parseFloat(e.target.value) || 0})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Status</label>
                  <select value={addForm.status} onChange={e => setAddForm({...addForm, status: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm font-bold uppercase">
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg flex justify-between items-center">
                <span className="text-xs font-bold text-[#2563EB] uppercase">Final Salary</span>
                <span className="font-black text-xl text-[#2563EB]">{formatINR(addForm.base_salary + addForm.bonus - addForm.deductions)}</span>
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
              <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={handleCreateSalary}>Create Salary Slip</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
