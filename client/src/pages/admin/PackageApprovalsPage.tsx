import { useState, useEffect } from 'react';
import api from '../../api/axiosInstance';
import { CheckCircle, XCircle, Loader2, PackageOpen, User, Car, Clock, AlertTriangle, Download } from 'lucide-react';
import ConfirmModal from '../../components/ui/ConfirmModal';
import AdminHero from '../../components/admin/AdminHero';
import { useAuthStore } from '../../store/authStore';
import { useLiveReload } from '../../utils/liveUpdates';
import { API_BASE } from '../../utils/endpoints';

export default function PackageApprovalsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectModalId, setRejectModalId] = useState<number | null>(null);
  const [approveModalId, setApproveModalId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');

  const fetchRequests = async () => {
    try {
      const res = await api.get('/packages/requests');
      if (res.data.success) {
        setRequests(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useLiveReload(() => { fetchRequests(); }); // reload when anything changes elsewhere
  useEffect(() => {
    fetchRequests();
  }, []);

  const handleApproveClick = (id: number) => {
    setApproveModalId(id);
  };

  const handleConfirmApprove = async () => {
    if (!approveModalId) return;
    setApprovingId(approveModalId);
    try {
      const res = await api.put(`/packages/requests/${approveModalId}/approve`);
      if (res.data.success) {
        setApproveModalId(null);
        fetchRequests();
      }
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.error || 'Failed to approve package');
    } finally {
      setApprovingId(null);
    }
  };

  const openRejectModal = (id: number) => {
    setRejectModalId(id);
    setRejectionReason('');
  };

  const handleReject = async () => {
    if (!rejectModalId) return;
    setRejectingId(rejectModalId);
    try {
      const res = await api.put(`/packages/requests/${rejectModalId}/reject`, {
        rejection_reason: rejectionReason.trim(),
      });
      if (res.data.success) {
        alert('Package request rejected. Customer will be notified on WhatsApp.');
        setRejectModalId(null);
        setRejectionReason('');
        fetchRequests();
      }
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.error || 'Failed to reject package request');
    } finally {
      setRejectingId(null);
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const approvedRequests = requests.filter(r => r.status === 'approved');
  const rejectedRequests = requests.filter(r => r.status === 'rejected');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
      <AdminHero title={'Package Approvals'} subtitle={'Review, approve, or reject customer package purchases.'} />
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        
        
      </div>

      {/* ─── Tab Bar ─── */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 max-w-md">
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold transition-all ${
            activeTab === 'pending'
              ? 'bg-white shadow-sm text-orange-700'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          Pending
          {pendingRequests.length > 0 && (
            <span className="bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {pendingRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('approved')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold transition-all ${
            activeTab === 'approved'
              ? 'bg-white shadow-sm text-green-700'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          Approved
        </button>
        <button
          onClick={() => setActiveTab('rejected')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold transition-all ${
            activeTab === 'rejected'
              ? 'bg-white shadow-sm text-blue-700'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <XCircle className="w-4 h-4" />
          Rejected
        </button>
      </div>

      {/* ─── PENDING TAB ─── */}
      {activeTab === 'pending' && (
        <div>
          {pendingRequests.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
              <PackageOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No pending package requests.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pendingRequests.map(req => (
                <div key={req.id} className="bg-white rounded-xl shadow-sm border border-orange-200 overflow-hidden flex flex-col">
                  <div className="bg-orange-50 p-4 border-b border-orange-100 flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg">{req.package_name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-bold text-orange-600">₹{req.price}</span>
                        {req.pricing_type && (
                          <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded ${req.pricing_type === 'premium' ? 'bg-purple-100 text-purple-700' : 'bg-gray-200 text-gray-600'}`}>{req.pricing_type}</span>
                        )}
                      </div>
                    </div>
                    <span className="bg-orange-200 text-orange-800 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">Pending</span>
                  </div>
                  <div className="p-4 space-y-3 flex-1">
                    <div className="flex items-start gap-2">
                      <User className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">{req.customer_name}</div>
                        <div className="text-gray-500">{req.customer_mobile}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Car className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">{req.brand} {req.model}</div>
                        <div className="text-gray-500">{req.registration_no || 'No Reg'}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <span className="text-xs font-semibold text-gray-500">Payment Status:</span>
                      <span className={`px-2.5 py-1 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                        req.payment_status === 'captured'
                          ? 'bg-green-100 text-green-800 border border-green-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        {req.payment_status === 'captured' ? '💰 PAID' : '⏳ PENDING'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
                      Requested on: {new Date(req.created_at).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="p-4 bg-gray-50 border-t border-gray-100 flex flex-col gap-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApproveClick(req.id)}
                        disabled={approvingId === req.id}
                        className="flex-1 flex justify-center items-center gap-2 px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {approvingId === req.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Approve
                      </button>
                      <button
                        onClick={() => openRejectModal(req.id)}
                        className="flex-1 flex justify-center items-center gap-2 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </button>
                    </div>
                    {/* invoice appears once the package is approved */}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── APPROVED TAB ─── */}
      {activeTab === 'approved' && (
        <div>
          {approvedRequests.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
              <p className="text-gray-500 font-medium">No approved packages yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
              <table className="w-full min-w-[800px] text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="p-4">Package</th>
                    <th className="p-4">Tier</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Vehicle</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Payment</th>
                    <th className="p-4">Approved At</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {approvedRequests.map(req => (
                    <tr key={req.id} className="hover:bg-gray-50">
                      <td className="p-4 font-medium text-gray-900">{req.package_name}</td>
                      <td className="p-4">
                        <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded ${req.pricing_type === 'premium' ? 'bg-purple-100 text-purple-700' : 'bg-gray-200 text-gray-600'}`}>{req.pricing_type || 'basic'}</span>
                      </td>
                      <td className="p-4">
                        <div>{req.customer_name}</div>
                        <div className="text-gray-500 text-xs">{req.customer_mobile}</div>
                      </td>
                      <td className="p-4">
                        <div>{req.brand} {req.model}</div>
                        <div className="text-gray-500 text-xs">{req.registration_no || 'No Reg'}</div>
                      </td>
                      <td className="p-4 font-bold text-gray-900">₹{req.price}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          req.payment_status === 'captured'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {req.payment_status === 'captured' ? 'PAID' : 'PENDING'}
                        </span>
                      </td>
                      <td className="p-4 text-gray-500">
                        {new Date(req.approved_at || req.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
                      </td>
                      <td className="p-4 text-right">
                        {req.status === 'approved' && <button
                          onClick={() => {
                            const token = useAuthStore.getState().token;
                            window.open(`${API_BASE}/packages/requests/${req.id}/invoice?token=${token}`, '_blank');
                          }}
                          className="text-blue-600 hover:text-blue-800 font-bold text-xs inline-flex items-center gap-1 bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Receipt
                        </button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── REJECTED TAB ─── */}
      {activeTab === 'rejected' && (
        <div>
          {rejectedRequests.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
              <p className="text-gray-500 font-medium">No rejected requests.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
              <table className="w-full min-w-[800px] text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="p-4">Package</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Vehicle</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Rejection Reason</th>
                    <th className="p-4">Rejected At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rejectedRequests.map(req => (
                    <tr key={req.id} className="hover:bg-blue-50/30">
                      <td className="p-4 font-medium text-gray-900">{req.package_name}</td>
                      <td className="p-4">
                        <div>{req.customer_name}</div>
                        <div className="text-gray-500 text-xs">{req.customer_mobile}</div>
                      </td>
                      <td className="p-4">
                        <div>{req.brand} {req.model}</div>
                        <div className="text-gray-500 text-xs">{req.registration_no || 'No Reg'}</div>
                      </td>
                      <td className="p-4 font-bold text-gray-900">₹{req.price}</td>
                      <td className="p-4">
                        <div className="flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                          <span className="text-blue-600 text-xs">{req.rejection_reason || 'No reason provided'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-gray-500 text-xs">
                        {new Date(req.updated_at || req.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── REJECTION REASON MODAL ─── */}
      {rejectModalId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-blue-50 px-6 py-4 border-b border-blue-100">
              <h3 className="text-lg font-bold text-blue-800 flex items-center gap-2">
                <XCircle className="w-5 h-5" />
                Reject Package Request
              </h3>
              <p className="text-sm text-blue-600 mt-1">The customer will be notified on WhatsApp.</p>
            </div>
            <div className="p-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Rejection Reason <span className="text-gray-400 font-normal ml-1">(Optional)</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g., Payment not received, Duplicate request..."
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none resize-none"
              />
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => { setRejectModalId(null); setRejectionReason(''); }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={rejectingId !== null}
                className="flex-1 flex justify-center items-center gap-2 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {rejectingId ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={approveModalId !== null}
        onClose={() => setApproveModalId(null)}
        onConfirm={handleConfirmApprove}
        title="Approve Package"
        description="Are you sure you want to approve this package request? This will generate an invoice for the customer."
        confirmText="Approve"
        isDestructive={false}
        loading={approvingId !== null}
      />
    </div>
  );
}
