import { useState, useEffect } from 'react';
import { CreditCard, IndianRupee, MessageCircle, Search, AlertCircle, Phone, ChevronRight, CheckCircle2, DollarSign, Loader2 } from 'lucide-react';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axiosInstance';
import { useSendWhatsApp } from '../../api/hooks/useWhatsApp';
import { formatINR, formatDate } from '../../utils/formatters';

interface PendingPayment {
  job_cart_id: number;
  customer_id: number;
  customer_name: string;
  customer_mobile: string;
  registration_no: string;
  brand: string;
  model: string;
  balance_due: number;
  total_amount: number;
  advance_paid: number;
  payment_status: string;
  job_status: string;
  visit_date: string;
  completed_at: string;
}

export default function PendingPaymentsPage() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sendingId, setSendingId] = useState<number | null>(null);
  const sendWhatsApp = useSendWhatsApp();

  const handleSendPaymentReminder = (p: PendingPayment) => {
    if (!p.customer_mobile) return;
    const date = formatDate(p.visit_date);
    const msg = `Hi ${p.customer_name},\n\nThis is a payment reminder from *O3 Car Spaa* 🚗\n\nYour vehicle *${p.registration_no}* (${p.brand} ${p.model}) serviced on ${date} has a pending balance of *₹${formatINR(p.balance_due)}*.\n\nKindly clear the payment at your earliest convenience.\n\nThank you for choosing O3 Car Spaa! 🙏`;

    setSendingId(p.job_cart_id);
    sendWhatsApp.mutate(
      {
        phone: p.customer_mobile,
        message: msg,
        customer_id: p.customer_id
      },
      {
        onSettled: () => setSendingId(null)
      }
    );
  };

  // Collect Payment Modal State
  const [collectModalOpen, setCollectModalOpen] = useState(false);
  const [activePayment, setActivePayment] = useState<PendingPayment | null>(null);
  const [collectAmount, setCollectAmount] = useState<number>(0);
  const [collectMethod, setCollectMethod] = useState<'cash' | 'upi' | 'card' | 'net_banking' | 'other'>('cash');
  const [collectNotes, setCollectNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchPendingPayments = () => {
    setLoading(true);
    api.get('/payments/pending-reminders')
      .then(r => setPayments(r.data?.data || []))
      .catch(err => {
        console.warn('Initial load pending payments notice:', err);
        setPayments([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPendingPayments();
  }, []);

  const openCollectModal = (p: PendingPayment) => {
    setActivePayment(p);
    setCollectAmount(parseFloat(p.balance_due as any) || 0);
    setCollectMethod('cash');
    setCollectNotes('Payment collected via Pending Payments dashboard');
    setCollectModalOpen(true);
  };

  const handleCollectPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePayment) return;
    if (collectAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        customer_id: activePayment.customer_id,
        job_cart_id: activePayment.job_cart_id,
        amount: collectAmount,
        payment_method: collectMethod,
        notes: collectNotes
      };

      const res = await api.post('/payments', payload);
      if (res.data?.success) {
        toast.success(`Collected ${formatINR(collectAmount)} from ${activePayment.customer_name}!`);
        setCollectModalOpen(false);
        fetchPendingPayments();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = payments.filter(p => {
    const q = search.toLowerCase();
    return !q || p.customer_name?.toLowerCase().includes(q) || p.customer_mobile?.includes(q) || p.registration_no?.toLowerCase().includes(q) || String(p.job_cart_id).includes(q);
  });

  const totalDue = filtered.reduce((s, p) => s + parseFloat(p.balance_due as any || 0), 0);

  return (
    <>
      <AdminTopBar
        title="Pending Payments"
        subtitle={`${filtered.length} customers with outstanding balance`}
      />

      {/* Stats Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-red-50 to-rose-100 border border-red-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle size={16} className="text-red-500" />
            <p className="text-xs font-bold text-red-700 uppercase tracking-wider">Total Pending</p>
          </div>
          <p className="text-2xl font-black text-red-700">{formatINR(totalDue)}</p>
          <p className="text-[10px] text-red-500 mt-0.5">Across {filtered.length} customers</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-orange-100 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard size={16} className="text-amber-600" />
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">Customers</p>
          </div>
          <p className="text-2xl font-black text-amber-700">{filtered.length}</p>
          <p className="text-[10px] text-amber-600 mt-0.5">With balance due</p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <IndianRupee size={16} className="text-[#2563EB]" />
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">Avg. Due</p>
          </div>
          <p className="text-2xl font-black text-[#2563EB]">
            {formatINR(filtered.length ? totalDue / filtered.length : 0)}
          </p>
          <p className="text-[10px] text-blue-500 mt-0.5">Per customer</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, mobile, number plate, job #"
            className="w-full pl-9 pr-4 py-2.5 bg-[#f6f3f2] border border-transparent rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white focus:border-[#2563EB]/30 placeholder:text-slate-400 transition-all"
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-slate-100 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <CreditCard size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-bold">{search ? 'No results found' : 'No pending payments! 🎉'}</p>
          <p className="text-sm text-slate-400 mt-1">{search ? 'Try different search terms' : 'All customers are up to date with their payments'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <div key={p.job_cart_id} className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-red-200 hover:shadow-sm transition-all">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                    <span className="text-red-600 font-extrabold text-sm">
                      {p.customer_name?.charAt(0) || '?'}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-extrabold text-slate-900 text-sm">{p.customer_name}</h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                        {p.registration_no}
                      </span>
                      {p.brand && <span className="text-[10px] text-slate-400">{p.brand} {p.model}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {p.customer_mobile && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Phone size={11} />
                          {p.customer_mobile}
                        </span>
                      )}
                      <span className="text-xs text-slate-400">
                        Job #{p.job_cart_id} · {formatDate(p.visit_date)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-100">
                  {/* Balance */}
                  <div className="text-left sm:text-right">
                    <p className="text-lg font-black text-red-600">{formatINR(p.balance_due)}</p>
                    <p className="text-[10px] text-slate-400">of {formatINR(p.total_amount)}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openCollectModal(p)}
                      className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-extrabold hover:bg-blue-700 transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
                    >
                      <DollarSign size={13} />
                      Collect
                    </button>
                    {p.customer_mobile && (
                      <button
                        type="button"
                        disabled={sendingId === p.job_cart_id}
                        onClick={() => handleSendPaymentReminder(p)}
                        className="flex items-center gap-1 px-3 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                        title="Send 1-Click WhatsApp Payment Reminder"
                      >
                        {sendingId === p.job_cart_id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <MessageCircle size={13} />
                        )}
                        <span>{sendingId === p.job_cart_id ? 'Sending...' : 'Remind'}</span>
                      </button>
                    )}
                    <button
                      onClick={() => navigate(`/admin/job-carts/${p.job_cart_id}`)}
                      className="p-2 rounded-xl hover:bg-slate-100 transition-colors"
                      title="View Job Card"
                    >
                      <ChevronRight size={16} className="text-slate-400" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Collect Payment Modal */}
      <Modal
        open={collectModalOpen}
        onClose={() => setCollectModalOpen(false)}
        title={`Collect Payment — Job #${activePayment?.job_cart_id}`}
        size="sm"
      >
        {activePayment && (
          <form onSubmit={handleCollectPaymentSubmit} className="space-y-4">
            <div className="bg-gradient-to-r from-red-50 to-blue-50 p-3.5 rounded-xl border border-blue-100">
              <p className="text-xs font-bold text-slate-700">{activePayment.customer_name} ({activePayment.registration_no})</p>
              <div className="flex justify-between items-center mt-2 text-xs">
                <span className="text-slate-500 font-medium">Outstanding Balance:</span>
                <span className="font-black text-red-600 text-sm">{formatINR(activePayment.balance_due)}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                Payment Amount (₹)
              </label>
              <Input
                type="number"
                value={collectAmount}
                onChange={(e) => setCollectAmount(parseFloat(e.target.value) || 0)}
                placeholder="Enter collected amount"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                Payment Method
              </label>
              <select
                value={collectMethod}
                onChange={(e) => setCollectMethod(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:border-blue-500 outline-none bg-white font-semibold"
              >
                <option value="cash">💵 Cash</option>
                <option value="upi">📱 UPI / QR Code</option>
                <option value="card">💳 Credit / Debit Card</option>
                <option value="net_banking">🏦 Net Banking</option>
                <option value="other">📝 Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                Notes / Reference
              </label>
              <input
                type="text"
                value={collectNotes}
                onChange={(e) => setCollectNotes(e.target.value)}
                placeholder="Optional notes or transaction ref..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium focus:border-blue-500 outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setCollectModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting} icon={<CheckCircle2 size={14} />}>
                Confirm Collection
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

