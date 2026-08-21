import { useState, useEffect } from 'react';
import { Trash2, RotateCcw, Users, ClipboardList, Receipt, Loader2 } from 'lucide-react';
import api from '../../api/axiosInstance';
import toast from 'react-hot-toast';

type Tab = 'customers' | 'jobCarts' | 'bills';

export default function ArchivePage() {
  const [tab, setTab] = useState<Tab>('customers');
  const [data, setData] = useState<any>({ customers: [], jobCarts: [], bills: [] });
  const [loading, setLoading] = useState(true);

  const fetchArchived = async () => {
    setLoading(true);
    try {
      const res = await api.get('/archive');
      if (res.data.success) setData(res.data.data);
    } catch {
      toast.error('Failed to load archived data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchArchived(); }, []);

  const restore = async (type: string, id: number) => {
    try {
      if (type === 'customer') await api.post(`/customers/${id}/restore`);
      else if (type === 'jobCart') await api.post(`/job-carts/${id}/restore`);
      else if (type === 'bill') await api.post(`/billing/${id}/restore`);
      toast.success('Restored successfully');
      fetchArchived();
    } catch {
      toast.error('Failed to restore');
    }
  };

  const tabs: { key: Tab; label: string; icon: typeof Users; count: number }[] = [
    { key: 'customers', label: 'Customers', icon: Users, count: data.customers.length },
    { key: 'jobCarts', label: 'Job Cards', icon: ClipboardList, count: data.jobCarts.length },
    { key: 'bills', label: 'Bills', icon: Receipt, count: data.bills.length },
  ];

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 border-l-4 pl-6" style={{ borderImage: 'linear-gradient(to bottom, #1D4ED8, #2563EB) 1' }}>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2563EB] mb-1">MANAGE</p>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F172A]">
          Recycle Bin
        </h1>
        <p className="text-[#5f5e5e] text-sm font-medium mt-1">
          Archived customers, cancelled job cards, and voided bills. Restore items to bring them back.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              tab === t.key
                ? 'bg-[#0F172A] text-white shadow-md'
                : 'bg-[#f6f3f2] text-[#5f5e5e] hover:bg-[#e5e2e1]'
            }`}
          >
            <t.icon size={14} />
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                tab === t.key ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-[#2563EB]" size={28} />
          </div>
        ) : (
          <>
            {/* Customers */}
            {tab === 'customers' && (
              <div>
                {data.customers.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <Trash2 size={32} className="mx-auto mb-3 text-gray-300" />
                    <p className="font-semibold">No archived customers</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                          <th className="p-4">Customer</th>
                          <th className="p-4">Contact</th>
                          <th className="p-4">Archived On</th>
                          <th className="p-4 text-right">Restore</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data.customers.map((c: any) => (
                          <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                            <td className="p-4 font-bold text-gray-900">{c.name}</td>
                            <td className="p-4 text-gray-600">{c.mobile || '—'}</td>
                            <td className="p-4 text-gray-500">{formatDate(c.created_at)}</td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() => restore('customer', c.id)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-bold rounded-lg hover:bg-green-100 transition-colors"
                              >
                                <RotateCcw size={12} /> Restore
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Job Carts */}
            {tab === 'jobCarts' && (
              <div>
                {data.jobCarts.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <Trash2 size={32} className="mx-auto mb-3 text-gray-300" />
                    <p className="font-semibold">No cancelled job cards</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                          <th className="p-4">Vehicle</th>
                          <th className="p-4">Customer</th>
                          <th className="p-4">Date</th>
                          <th className="p-4 text-right">Restore</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data.jobCarts.map((jc: any) => (
                          <tr key={jc.id} className="hover:bg-gray-50 transition-colors">
                            <td className="p-4">
                              <span className="font-bold text-gray-900">{jc.registration_no}</span>
                              <p className="text-xs text-gray-500">{jc.brand} {jc.model}</p>
                            </td>
                            <td className="p-4 text-gray-600">{jc.customer_name}</td>
                            <td className="p-4 text-gray-500">{formatDate(jc.visit_date || jc.created_at)}</td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() => restore('jobCart', jc.id)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-bold rounded-lg hover:bg-green-100 transition-colors"
                              >
                                <RotateCcw size={12} /> Restore
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Bills */}
            {tab === 'bills' && (
              <div>
                {data.bills.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <Trash2 size={32} className="mx-auto mb-3 text-gray-300" />
                    <p className="font-semibold">No voided bills</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                          <th className="p-4">Bill ID</th>
                          <th className="p-4">Customer</th>
                          <th className="p-4">Amount</th>
                          <th className="p-4">Date</th>
                          <th className="p-4 text-right">Restore</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data.bills.map((b: any) => (
                          <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                            <td className="p-4 font-bold text-gray-900 font-mono">MB-{b.id}</td>
                            <td className="p-4 text-gray-600">{b.customer_name || 'Walk-in'}</td>
                            <td className="p-4 font-bold text-[#2563EB]">₹{Number(b.amount || 0).toLocaleString('en-IN')}</td>
                            <td className="p-4 text-gray-500">{formatDate(b.created_at)}</td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() => restore('bill', b.id)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-bold rounded-lg hover:bg-green-100 transition-colors"
                              >
                                <RotateCcw size={12} /> Restore
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
