import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Phone, Mail, Calendar, CheckSquare, IndianRupee, Download } from 'lucide-react';
import { useStaffDetail, useUpdateStaff, useStaffAttendance, useMarkAttendance, useStaffPayments, useAddPayment, useCompletePayment } from '../../api/hooks/useStaff';
import { useUIStore } from '../../store/uiStore';
import PageHeader from '../../components/shared/PageHeader';
import StatusBadge from '../../components/shared/StatusBadge';
import SkeletonLoader from '../../components/ui/SkeletonLoader';
import Tabs from '../../components/ui/Tabs';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import Modal from '../../components/ui/Modal';
import DataTable from '../../components/ui/DataTable';

const tabs = [
  { key: 'profile', label: 'Profile & Settings' },
  { key: 'attendance', label: 'Attendance Log' },
  { key: 'payments', label: 'Payments Tracker' },
];

export default function StaffDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useUIStore(s => s.toast);
  const staffId = parseInt(id || '0');

  const { data: staff, isLoading: isStaffLoading } = useStaffDetail(staffId);
  const { data: attendance, isLoading: isAttLoading } = useStaffAttendance(staffId);
  const { data: payments, isLoading: isPayLoading } = useStaffPayments(staffId);

  const updateMutation = useUpdateStaff();
  const markAttMutation = useMarkAttendance();
  const addPayMutation = useAddPayment();
  const completePayMutation = useCompletePayment();

  const [activeTab, setActiveTab] = useState('profile');
  const [showAttModal, setShowAttModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);

  const [attForm, setAttForm] = useState({ att_date: new Date().toISOString().slice(0, 10), status: 'present', note: '', check_in_time: '', check_out_time: '' });
  const [payForm, setPayForm] = useState({ amount: '', purpose: '', payment_date: new Date().toISOString().slice(0, 10) });
  const [profileForm, setProfileForm] = useState({ name: '', mobile: '', email: '', specialisations: '' });

  // Initialize profile form when data loads
  useState(() => {
    if (staff) {
      setProfileForm({
        name: staff.name || '',
        mobile: staff.mobile || '',
        email: staff.email || '',
        specialisations: staff.profile?.specialisations || '',
      });
    }
  });

  if (isStaffLoading) return <SkeletonLoader lines={8} />;
  if (!staff) return <div className="p-8 text-center text-gray-500">Staff member not found.</div>;

  const handleUpdateProfile = async () => {
    try {
      await updateMutation.mutateAsync({ id: staffId, ...profileForm });
      toast('success', 'Profile updated successfully');
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to update profile');
    }
  };

  const handleMarkAttendance = async () => {
    try {
      await markAttMutation.mutateAsync({ staffId, ...attForm });
      toast('success', 'Attendance marked');
      setShowAttModal(false);
    } catch(err: any) {
      toast('error', err?.response?.data?.error || 'Failed to mark attendance');
    }
  };

  const handleAddPayment = async () => {
    if (!payForm.amount || !payForm.purpose) {
      toast('error', 'Please fill all required fields');
      return;
    }
    try {
      await addPayMutation.mutateAsync({ staffId, amount: parseFloat(payForm.amount), purpose: payForm.purpose, payment_date: payForm.payment_date });
      toast('success', 'Payment recorded');
      setShowPayModal(false);
      setPayForm({ amount: '', purpose: '', payment_date: new Date().toISOString().slice(0, 10) });
    } catch(err: any) {
      toast('error', err?.response?.data?.error || 'Failed to add payment');
    }
  };

  const handleCompletePayment = async (pid: number) => {
    try {
      await completePayMutation.mutateAsync({ staffId, paymentId: pid });
      toast('success', 'Payment marked as completed');
    } catch(err: any) {
      toast('error', err?.response?.data?.error || 'Failed to complete payment');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/admin/staff')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{staff.name}</h1>
          <p className="text-sm text-gray-500 flex items-center gap-4 mt-1">
            <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{staff.mobile}</span>
            {staff.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{staff.email}</span>}
          </p>
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'profile' && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 skeleton-content max-w-2xl">
          <h3 className="text-lg font-semibold mb-4">Edit Profile</h3>
          <div className="space-y-4">
            <Input label="Full Name" value={profileForm.name} onChange={e => setProfileForm({...profileForm, name: e.target.value})} />
            <Input label="Mobile" value={profileForm.mobile} onChange={e => setProfileForm({...profileForm, mobile: e.target.value})} />
            <Input label="Email" value={profileForm.email} onChange={e => setProfileForm({...profileForm, email: e.target.value})} />
            <Textarea label="Specialisations" value={profileForm.specialisations} onChange={e => setProfileForm({...profileForm, specialisations: e.target.value})} />
            <div className="pt-2">
              <Button variant="primary" onClick={handleUpdateProfile} loading={updateMutation.isPending}>Save Changes</Button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'attendance' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200">
            <h3 className="text-lg font-semibold flex items-center gap-2"><CheckSquare className="w-5 h-5 text-[#2563EB]"/> Attendance Log</h3>
            <Button variant="primary" onClick={() => setShowAttModal(true)}>Mark Attendance</Button>
          </div>
          {isAttLoading ? <SkeletonLoader lines={3} /> : (
            <DataTable
              columns={[
                { key: 'att_date', header: 'Date', render: (row: any) => new Date(row.att_date).toLocaleDateString() },
                { key: 'status', header: 'Status', render: (row: any) => <StatusBadge status={row.status} /> },
                { key: 'check_in_time', header: 'Check In', render: (row: any) => row.check_in_time ? new Date(row.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—' },
                { key: 'check_out_time', header: 'Check Out', render: (row: any) => row.check_out_time ? new Date(row.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—' },
                { key: 'note', header: 'Note', render: (row: any) => row.note || '—' }
              ]}
              data={attendance || []}
              keyExtractor={(r: any) => r.id}
            />
          )}
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200">
            <h3 className="text-lg font-semibold flex items-center gap-2"><IndianRupee className="w-5 h-5 text-[#2563EB]"/> Payments Tracker</h3>
            <Button variant="primary" onClick={() => setShowPayModal(true)}>Add Payment</Button>
          </div>
          {isPayLoading ? <SkeletonLoader lines={3} /> : (
            <DataTable
              columns={[
                { key: 'payment_date', header: 'Date', render: (row: any) => new Date(row.payment_date).toLocaleDateString() },
                { key: 'purpose', header: 'Purpose' },
                { key: 'amount', header: 'Amount', render: (row: any) => `₹${parseFloat(row.amount).toLocaleString('en-IN')}` },
                { key: 'status', header: 'Status', render: (row: any) => <StatusBadge status={row.status} /> },
                { key: 'actions', header: 'Action', render: (row: any) => 
                  row.status === 'pending' ? (
                    <Button variant="secondary" size="sm" onClick={() => handleCompletePayment(row.id)} loading={completePayMutation.isPending}>Mark Paid</Button>
                  ) : <span className="text-sm text-gray-500">Completed</span>
                }
              ]}
              data={payments || []}
              keyExtractor={(r: any) => r.id}
            />
          )}
        </div>
      )}

      {/* Attendance Modal */}
      <Modal open={showAttModal} onClose={() => setShowAttModal(false)} title="Mark Attendance">
        <div className="space-y-4">
          <Input label="Date" type="date" value={attForm.att_date} onChange={e => setAttForm({...attForm, att_date: e.target.value})} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              value={attForm.status} onChange={e => setAttForm({...attForm, status: e.target.value})}
            >
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="half_day">Half Day</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Check-In Time" type="time" value={attForm.check_in_time} onChange={e => setAttForm({...attForm, check_in_time: e.target.value})} />
            <Input label="Check-Out Time" type="time" value={attForm.check_out_time} onChange={e => setAttForm({...attForm, check_out_time: e.target.value})} />
          </div>
          <Input label="Note (Optional)" value={attForm.note} onChange={e => setAttForm({...attForm, note: e.target.value})} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowAttModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleMarkAttendance} loading={markAttMutation.isPending}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal open={showPayModal} onClose={() => setShowPayModal(false)} title="Add Payment Entry">
        <div className="space-y-4">
          <Input label="Amount (₹) *" type="number" value={payForm.amount} onChange={e => setPayForm({...payForm, amount: e.target.value})} placeholder="e.g. 5000" />
          <Input label="Purpose *" value={payForm.purpose} onChange={e => setPayForm({...payForm, purpose: e.target.value})} placeholder="e.g. Salary Advance, Bonus" />
          <Input label="Date *" type="date" value={payForm.payment_date} onChange={e => setPayForm({...payForm, payment_date: e.target.value})} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowPayModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAddPayment} loading={addPayMutation.isPending}>Save Payment</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
