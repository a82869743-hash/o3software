import { useState, useEffect } from 'react';
import { ShoppingBag, Check, X, RefreshCw, AlertCircle, Clock, CheckCircle2, Building2, PackageCheck, AlertTriangle } from 'lucide-react';
import api from '../../api/axiosInstance';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import PremiumPageHeader from '../../components/shared/PremiumPageHeader';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';

export default function FranchiseStockApprovalsPage() {
  const toast = useUIStore((s) => s.toast);
  const { user } = useAuthStore();
  const activeFranchiseId = parseInt(localStorage.getItem('active_franchise_id') || '1', 10);
  const isMainStudioAdmin = (user?.role === 'admin' || user?.role === 'super_admin') && (!user?.franchise_id || user?.franchise_id === 1) && activeFranchiseId === 1;

  const [requests, setRequests] = useState<any[]>([]);
  const [franchises, setFranchises] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedFranchiseId, setSelectedFranchiseId] = useState<string>('all');

  // Approval Modal State
  const [approveModalItem, setApproveModalItem] = useState<any | null>(null);
  const [approvedQtyInput, setApprovedQtyInput] = useState<number>(0);

  // Rejection Modal State
  const [rejectModalItem, setRejectModalItem] = useState<any | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState<string>('');

  if (!isMainStudioAdmin) {
    return (
      <div className="p-12 text-center bg-white rounded-3xl border border-gray-100 space-y-4 max-w-xl mx-auto my-12 shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-100">
          <AlertTriangle size={32} />
        </div>
        <h2 className="text-xl font-black text-slate-900">Main Studio Approvals Only</h2>
        <p className="text-xs text-slate-600 leading-relaxed font-medium">
          Main Studio Admin holds all master stock and handles approval/rejection of transfer requests. Other franchise branches cannot approve or reject transfers; they can submit stock replenishment requests via their stock order portal.
        </p>
      </div>
    );
  }

  const loadRequests = async () => {
    try {
      setLoading(true);
      const [reqRes, franRes] = await Promise.all([
        api.get('/stock-requests'),
        api.get('/franchises').catch(() => ({ data: { data: [] } }))
      ]);

      setRequests(reqRes.data.data || []);
      setFranchises(franRes.data.data || []);
    } catch (err) {
      console.error(err);
      toast('error', 'Failed to load franchise stock requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  // Handle Approve Request
  const handleConfirmApprove = async () => {
    if (!approveModalItem || approvedQtyInput <= 0) return;
    try {
      setActionLoading(approveModalItem.id);
      const res = await api.post(`/stock-requests/${approveModalItem.id}/approve`, {
        approved_quantity: approvedQtyInput,
      });
      toast('success', res.data.message || 'Stock request approved and stock transferred to franchise!');
      setApproveModalItem(null);
      loadRequests();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to approve stock request.');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle Reject Request
  const handleConfirmReject = async () => {
    if (!rejectModalItem) return;
    try {
      setActionLoading(rejectModalItem.id);
      await api.post(`/stock-requests/${rejectModalItem.id}/reject`, {
        reason: rejectReasonInput.trim() || 'Stock unavailable at main warehouse',
      });
      toast('info', `Stock request #${rejectModalItem.id} rejected.`);
      setRejectModalItem(null);
      setRejectReasonInput('');
      loadRequests();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to reject stock request.');
    } finally {
      setActionLoading(null);
    }
  };

  // Filtered requests list
  const filteredRequests = requests.filter((r) => {
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchesFranchise = selectedFranchiseId === 'all' || String(r.franchise_id) === selectedFranchiseId;
    return matchesStatus && matchesFranchise;
  });

  // Key KPI stats
  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const approvedCount = requests.filter((r) => r.status === 'approved').length;
  const rejectedCount = requests.filter((r) => r.status === 'rejected').length;
  const totalTransferredValue = requests
    .filter((r) => r.status === 'approved')
    .reduce((sum, r) => sum + parseFloat(String(r.total_amount || 0)), 0);

  return (
    <div className="space-y-6">
      <PremiumPageHeader
        title="Franchise Stock Approvals Console"
        subtitle="Review stock replenishment orders placed by franchise branches, approve atomic stock transfers, or reject requests."
        icon={ShoppingBag}
      />

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">Pending Approval</p>
            <p className="text-2xl font-black text-slate-900">{pendingCount} <span className="text-xs text-gray-400 font-normal">Orders</span></p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">Approved Orders</p>
            <p className="text-2xl font-black text-slate-900">{approvedCount} <span className="text-xs text-gray-400 font-normal">Transferred</span></p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0 border border-blue-100">
            <PackageCheck size={24} />
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">Stock Value Transferred</p>
            <p className="text-2xl font-black text-[#2563EB]">₹{totalTransferredValue.toLocaleString('en-IN')}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100">
            <X size={24} />
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">Rejected Requests</p>
            <p className="text-2xl font-black text-slate-900">{rejectedCount} <span className="text-xs text-gray-400 font-normal">Declined</span></p>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-2">Status:</span>
          {(['all', 'pending', 'approved', 'rejected'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all ${
                statusFilter === st
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <Building2 size={16} className="text-gray-400 shrink-0" />
          <select
            value={selectedFranchiseId}
            onChange={(e) => setSelectedFranchiseId(e.target.value)}
            className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#2563EB]"
          >
            <option value="all">All Franchise Outlets</option>
            {franchises.map((f) => (
              <option key={f.id} value={String(f.id)}>
                {f.name} ({f.code})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={loadRequests}
            className="p-2 text-gray-400 hover:text-gray-700 transition-colors"
            title="Refresh List"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Main Stock Requests Table */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="animate-spin text-gray-400" size={32} />
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-12 text-center text-gray-400 space-y-2">
            <AlertCircle size={40} className="mx-auto text-gray-300" />
            <p className="font-bold text-gray-700">No stock requests found</p>
            <p className="text-xs text-gray-400">Incoming replenishment orders from franchises will appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                  <th className="px-6 py-4">Outlet / Franchise</th>
                  <th className="px-6 py-4">Product Name</th>
                  <th className="px-6 py-4 text-center">Requested Qty</th>
                  <th className="px-6 py-4 text-center">Main Studio Stock</th>
                  <th className="px-6 py-4 text-right">Wholesale Value</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm font-medium text-gray-800">
                {filteredRequests.map((r) => {
                  const mainStockAvailable = r.main_stock || 0;
                  const hasSufficientStock = mainStockAvailable >= r.requested_quantity;
                  const totalCost = parseFloat(String(r.total_amount || 0));

                  return (
                    <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-900">
                        <p className="font-extrabold text-slate-900">{r.franchise_name}</p>
                        <p className="text-[10px] text-gray-400 font-mono">{r.franchise_code}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-extrabold text-[#2563EB]">{r.product_name}</p>
                        {r.notes && <p className="text-[11px] text-gray-500 italic mt-0.5">Note: {r.notes}</p>}
                      </td>
                      <td className="px-6 py-4 text-center font-extrabold text-slate-900">
                        {r.requested_quantity} {r.unit || 'pcs'}
                      </td>
                      <td className="px-6 py-4 text-center font-bold">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                            hasSufficientStock
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-red-50 text-red-700 border border-red-200 animate-pulse'
                          }`}
                        >
                          {mainStockAvailable} {r.unit || 'pcs'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-extrabold text-[#2563EB]">
                        ₹{totalCost.toLocaleString('en-IN')}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            r.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : r.status === 'pending'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {r.status === 'approved' ? (
                            <><CheckCircle2 size={12} /> Approved</>
                          ) : r.status === 'pending' ? (
                            <><Clock size={12} /> Pending</>
                          ) : (
                            <><X size={12} /> Rejected</>
                          )}
                        </span>
                        {r.rejection_reason && (
                          <p className="text-[10px] text-red-600 mt-1 font-semibold">Reason: {r.rejection_reason}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {r.status === 'pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setApproveModalItem(r);
                                setApprovedQtyInput(r.requested_quantity);
                              }}
                              disabled={actionLoading === r.id}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1 shadow-xs"
                            >
                              <Check size={14} /> Approve & Transfer
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectModalItem(r);
                                setRejectReasonInput('');
                              }}
                              disabled={actionLoading === r.id}
                              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1"
                            >
                              <X size={14} /> Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 font-bold uppercase">{r.status}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* APPROVAL & STOCK TRANSFER CONFIRMATION MODAL */}
      <Modal open={!!approveModalItem} onClose={() => setApproveModalItem(null)} title="Approve Stock Transfer" size="sm">
        {approveModalItem && (
          <div className="space-y-4 py-2 text-left">
            <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200 space-y-1">
              <p className="text-xs font-black text-slate-900">
                Transferring stock to <span className="text-[#2563EB]">{approveModalItem.franchise_name}</span>
              </p>
              <p className="text-xs font-extrabold text-slate-700">{approveModalItem.product_name}</p>
              <div className="flex items-center justify-between text-[11px] text-emerald-800 font-bold pt-1">
                <span>Main Studio Stock: <strong>{approveModalItem.main_stock || 0} {approveModalItem.unit || 'pcs'}</strong></span>
                <span>Wholesale Rate: <strong>₹{parseFloat(String(approveModalItem.unit_price || 0)).toLocaleString('en-IN')}</strong></span>
              </div>
            </div>

            {approveModalItem.main_stock < approvedQtyInput && (
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 flex items-center gap-2 text-amber-800 text-xs font-bold">
                <AlertTriangle size={16} className="shrink-0 text-amber-600" />
                <span>Warning: Main Studio stock ({approveModalItem.main_stock}) is lower than requested quantity!</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Approved Transfer Quantity ({approveModalItem.unit || 'pcs'}) *</label>
              <input
                type="number"
                min="1"
                required
                value={approvedQtyInput}
                onChange={(e) => setApprovedQtyInput(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#2563EB]"
              />
              <p className="text-[10px] text-gray-400 mt-1">Stock will be automatically deducted from Main Studio & credited to Franchise Inventory.</p>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setApproveModalItem(null)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmApprove} loading={actionLoading === approveModalItem.id} icon={<Check size={16} />}>
                Approve & Transfer Stock
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* REJECTION REASON MODAL */}
      <Modal open={!!rejectModalItem} onClose={() => setRejectModalItem(null)} title="Reject Stock Request" size="sm">
        {rejectModalItem && (
          <div className="space-y-4 py-2 text-left">
            <div className="bg-red-50 p-3.5 rounded-2xl border border-red-200">
              <p className="text-xs font-black text-slate-900">Rejecting Stock Request #{rejectModalItem.id}</p>
              <p className="text-xs font-extrabold text-red-700 mt-0.5">{rejectModalItem.product_name} ({rejectModalItem.requested_quantity} {rejectModalItem.unit || 'pcs'})</p>
              <p className="text-[11px] text-gray-600 mt-1">Requested by: <strong>{rejectModalItem.franchise_name}</strong></p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Rejection Reason *</label>
              <textarea
                rows={3}
                placeholder="e.g. Insufficient stock at central warehouse. Restock arriving next week."
                value={rejectReasonInput}
                onChange={(e) => setRejectReasonInput(e.target.value)}
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRejectModalItem(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleConfirmReject} loading={actionLoading === rejectModalItem.id} icon={<X size={16} />}>
                Reject Stock Request
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
