import { useState } from 'react';
import api from '../../api/axiosInstance';
import { IndianRupee, TrendingUp, TrendingDown, Clock, Download, Package, Calendar, Briefcase, RefreshCw, CheckCircle2, ChevronRight, BarChart3, Receipt, FileText, Plus, Trash2 } from 'lucide-react';
import { useAccountSummary, useTransactions, useExportReport, useAccountKPIs, usePurchaseBills, useCreatePurchaseBill, useGstReport, useReturns, useCreateReturn } from '../../api/hooks/useAccounts';
import { useVendors } from '../../api/hooks/useVendors';
import { useUIStore } from '../../store/uiStore';
import PremiumPageHeader from '../../components/shared/PremiumPageHeader';
import PremiumStatCard from '../../components/shared/PremiumStatCard';
import SkeletonLoader from '../../components/ui/SkeletonLoader';
import Tabs from '../../components/ui/Tabs';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { useNavigate } from 'react-router-dom';
import { useJobCarts } from '../../api/hooks/useJobCarts';
import { useBuySellList, useCompleteBuySell, useCreateBuySell } from '../../api/hooks/useBuySell';
import { useInventory } from '../../api/hooks/useInventory';
import StatusBadge from '../../components/shared/StatusBadge';
import { formatINR, formatDate, ymd } from '../../utils/formatters';
import Dropdown from '../../components/ui/Dropdown';
import { API_BASE } from '../../utils/endpoints';
import { useAuthStore } from '../../store/authStore';

export default function AccountsPage() {
  const toast = useUIStore(s => s.toast);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('summary');
  
  const [dateFilter, setDateFilter] = useState({
    from_date: ymd(new Date(new Date().setDate(1))),
    to_date: ymd(),
  });

  const { data: summary, isLoading: isSummaryLoading, refetch: refetchSummary } = useAccountSummary(dateFilter);
  const { data: kpiData, isLoading: isKpiLoading, refetch: refetchKPI } = useAccountKPIs(dateFilter);
  const { data: txns, isLoading: isTxnsLoading, refetch: refetchTxns } = useTransactions({ limit: 100, ...dateFilter });
  
  const exportMutation = useExportReport();

  const [showExport, setShowExport] = useState(false);
  const [exportForm, setExportForm] = useState({ 
    from_date: ymd(new Date(new Date().setDate(1))), 
    to_date: ymd(), 
    format: 'excel' as 'excel' | 'pdf' 
  });

  const handleExport = async () => {
    try {
      await exportMutation.mutateAsync(exportForm);
      toast('success', 'Report downloaded successfully');
      setShowExport(false);
    } catch(err: any) {
      toast('error', 'Failed to generate report');
    }
  };

  const { data: jobCarts, isLoading: isJobCartsLoading, refetch: refetchJobCarts } = useJobCarts({ page: 1, limit: 100, ...dateFilter });
  const { data: buySell, isLoading: isBuySellLoading, refetch: refetchBuySell } = useBuySellList({ page: 1, limit: 100, ...dateFilter });
  const { data: inventory, isLoading: isInventoryLoading } = useInventory({ page: 1, limit: 100 });
  const completeBuySellMutation = useCompleteBuySell();

  const handleCompleteBs = async (id: number) => {
    try {
      await completeBuySellMutation.mutateAsync(id);
      toast('success', 'Transaction marked complete');
      refetchSummary();
      refetchKPI();
      refetchBuySell();
      refetchTxns();
    } catch(err: any) {
      toast('error', 'Failed to complete transaction');
    }
  };

  // --- NEW FINANCIAL MODULES STATES & HOOKS ---
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);

  const [gstMonth, setGstMonth] = useState(new Date().getMonth() + 1);
  const [gstYear, setGstYear] = useState(new Date().getFullYear());

  // Purchase Form State
  const [purchaseForm, setPurchaseForm] = useState({
    vendor_id: '',
    purchase_date: ymd(),
    invoice_number: '',
    tax_amount: '0',
    notes: '',
    items: [{ item_id: '', hsn_sac: '', quantity: '1', unit_price: '0', gst_rate: '18' }] as Array<{ item_id: string; hsn_sac?: string; quantity: string; unit_price: string; gst_rate?: string }>
  });

  // Return Form State
  const [returnForm, setReturnForm] = useState({
    original_bill_id: '',
    return_type: 'sales_return',
    amount: '0',
    reason: ''
  });

  // Queries
  const { data: vendorsList } = useVendors({ active_only: true });
  const { data: purchaseBills, refetch: refetchPurchases } = usePurchaseBills(dateFilter);
  const { data: gstReport, refetch: refetchGst } = useGstReport({ month: String(gstMonth), year: String(gstYear) });
  const { data: returnsList, refetch: refetchReturns } = useReturns();

  // Mutations
  const createPurchaseMutation = useCreatePurchaseBill();
  const createReturnMutation = useCreateReturn();

  // Product Sale Form State
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [saleForm, setSaleForm] = useState({
    party_name: '',
    type: 'sell_b2c',
    product_id: '',
    quantity: '1',
    unit_price: '0',
    transaction_date: ymd(),
    notes: ''
  });

  const createBuySellMutation = useCreateBuySell();

  const handleSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleForm.party_name || !saleForm.product_id) {
      alert('Please fill out all required fields.');
      return;
    }
    const selectedProd = (inventory?.data || []).find((p: any) => p.id === Number(saleForm.product_id));
    const productName = selectedProd ? selectedProd.product_name : `Product #${saleForm.product_id}`;
    
    try {
      await createBuySellMutation.mutateAsync({
        type: saleForm.type,
        party_name: saleForm.party_name,
        product_name: productName,
        quantity: parseFloat(saleForm.quantity) || 1,
        unit_price: parseFloat(saleForm.unit_price) || 0,
        transaction_date: saleForm.transaction_date,
        notes: saleForm.notes || undefined
      } as any);
      toast('success', 'Product sale recorded successfully');
      setSaleModalOpen(false);
      setSaleForm({
        party_name: '',
        type: 'sell_b2c',
        product_id: '',
        quantity: '1',
        unit_price: '0',
        transaction_date: ymd(),
        notes: ''
      });
      refetchSummary();
      refetchKPI();
      refetchBuySell();
      refetchTxns();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to record product sale');
    }
  };

  const handleAddPurchaseItem = () => {
    setPurchaseForm(prev => ({
      ...prev,
      items: [...prev.items, { item_id: '', hsn_sac: '', quantity: '1', unit_price: '0', gst_rate: '18' }]
    }));
  };

  const handleRemovePurchaseItem = (index: number) => {
    setPurchaseForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handlePurchaseItemChange = (index: number, field: string, value: string) => {
    setPurchaseForm(prev => {
      const updated = [...prev.items];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, items: updated };
    });
  };

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseForm.vendor_id || !purchaseForm.purchase_date) {
      toast('error', 'Please select a vendor and purchase date.');
      return;
    }
    for (let idx = 0; idx < purchaseForm.items.length; idx++) {
      const item = purchaseForm.items[idx];
      if (!item.item_id || Number(item.item_id) <= 0) {
        toast('error', `Please select a product for line item #${idx + 1}`);
        return;
      }
      if (!item.quantity || parseFloat(item.quantity) <= 0) {
        toast('error', `Please enter a valid quantity for line item #${idx + 1}`);
        return;
      }
    }
    try {
      await createPurchaseMutation.mutateAsync({
        ...purchaseForm,
        vendor_id: Number(purchaseForm.vendor_id),
        tax_amount: parseFloat(purchaseForm.tax_amount) || 0,
        items: purchaseForm.items.map(i => ({
          item_id: Number(i.item_id),
          hsn_sac: i.hsn_sac || null,
          quantity: parseFloat(i.quantity) || 1,
          unit_price: parseFloat(i.unit_price) || 0,
          gst_rate: parseFloat(i.gst_rate || '0') || 0
        }))
      });
      toast('success', 'Purchase bill recorded successfully');
      setPurchaseModalOpen(false);
      setPurchaseForm({
        vendor_id: '',
        purchase_date: ymd(),
        invoice_number: '',
        tax_amount: '0',
        notes: '',
        items: [{ item_id: '', quantity: '1', unit_price: '0', hsn_sac: '', gst_rate: '18' }]
      });
      refetchPurchases();
      refetchSummary();
      refetchKPI();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to record purchase bill');
    }
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnForm.original_bill_id || !returnForm.amount) {
      alert('Please fill out all required fields.');
      return;
    }
    try {
      await createReturnMutation.mutateAsync({
        original_bill_id: Number(returnForm.original_bill_id),
        return_type: returnForm.return_type,
        amount: parseFloat(returnForm.amount) || 0,
        reason: returnForm.reason
      });
      toast('success', 'Return note logged successfully');
      setReturnModalOpen(false);
      setReturnForm({
        original_bill_id: '',
        return_type: 'sales_return',
        amount: '0',
        reason: ''
      });
      refetchReturns();
      refetchSummary();
      refetchKPI();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to log return note');
    }
  };

  const downloadGstCsv = () => {
    const url = `${API_BASE}/gst-reports?month=${gstMonth}&year=${gstYear}&format=csv&token=${useAuthStore.getState().token}`;
    window.open(url, '_blank');
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 font-sans">
      {/* Page Header */}
      <PremiumPageHeader
        title="Consolidated Financial Command"
        subtitle="Consolidated financial overview of revenue streams, vendor ledgers, inventory assets, and payroll cycles."
        icon={BarChart3}
        iconColor="#10B981"
        accentGradient="from-emerald-600 to-teal-600"
        actions={
          <Button variant="primary" onClick={() => setShowExport(true)} className="shadow-lg shadow-emerald-500/20">
            <Download className="w-4 h-4 mr-2" /> Export Report
          </Button>
        }
      />

      {/* Date Filter & Tab Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm max-w-full overflow-hidden">
        <div className="w-full max-w-full overflow-x-auto min-w-0 scrollbar-none">
          <Tabs 
            tabs={[
              { key: 'summary', label: 'Summary Overview' },
              { key: 'transactions', label: 'General Ledger' },
              { key: 'purchase_bills', label: 'Purchase Bills' },
              { key: 'gst', label: 'GST Compliance' },
              { key: 'returns', label: 'Returns Ledger' },
              { key: 'buy_sell', label: 'Buy & Sell Trade' },
              { key: 'job_carts', label: 'Service Job Cards' },
              { key: 'inventory', label: 'Inventory Capital' },
            ]} 
            activeTab={activeTab} 
            onTabChange={setActiveTab} 
          />
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 border border-gray-100 p-2 bg-gray-50 rounded-lg shrink-0 w-full lg:w-auto">
          <span className="text-[11px] font-bold text-gray-400 uppercase px-1 shrink-0">Period</span>
          <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
            <input
              type="date"
              className="w-full px-2 py-1 bg-white border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={dateFilter.from_date}
              onChange={e => setDateFilter({...dateFilter, from_date: e.target.value})}
            />
            <span className="text-gray-400 text-xs shrink-0">to</span>
            <input
              type="date"
              className="w-full px-2 py-1 bg-white border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={dateFilter.to_date}
              onChange={e => setDateFilter({...dateFilter, to_date: e.target.value})}
            />
          </div>
        </div>
      </div>

      {/* Tab Content: Summary */}
      {activeTab === 'summary' && (
        <div className="space-y-6 animate-fade-in">
          {isSummaryLoading ? (
            <div className="p-12 text-center">
              <RefreshCw className="animate-spin w-8 h-8 text-emerald-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500 font-medium">Computing summaries...</p>
            </div>
          ) : (
            <>
              {/* Row 1 Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <PremiumStatCard
                  title="Today's Revenue"
                  value={summary?.today_revenue || 0}
                  prefix="₹"
                  icon={IndianRupee}
                  color="#10B981"
                  gradient="from-emerald-500/10 to-teal-400/5"
                  delay={0.1}
                />
                <PremiumStatCard
                  title="Period Revenue"
                  value={summary?.month_revenue || 0}
                  prefix="₹"
                  icon={TrendingUp}
                  color="#2563EB"
                  gradient="from-blue-500/10 to-indigo-400/5"
                  delay={0.2}
                />
                <PremiumStatCard
                  title="Period Procurements"
                  value={summary?.total_purchases_month || 0}
                  prefix="₹"
                  icon={TrendingDown}
                  color="#EF4444"
                  gradient="from-blue-500/10 to-rose-400/5"
                  delay={0.3}
                />
                <PremiumStatCard
                  title="Pending Salaries"
                  value={summary?.pending_staff_payments || 0}
                  prefix="₹"
                  icon={Clock}
                  color="#F59E0B"
                  gradient="from-amber-500/10 to-yellow-400/5"
                  delay={0.4}
                />
              </div>

              {/* Row 2 Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <PremiumStatCard
                  title="B2B Bulk Sales"
                  value={summary?.total_b2b_sales_month || 0}
                  prefix="₹"
                  icon={TrendingUp}
                  color="#8B5CF6"
                  gradient="from-purple-500/10 to-indigo-400/5"
                  delay={0.1}
                />
                <PremiumStatCard
                  title="B2C Retail Sales"
                  value={summary?.total_b2c_sales_month || 0}
                  prefix="₹"
                  icon={TrendingUp}
                  color="#EC4899"
                  gradient="from-pink-500/10 to-rose-400/5"
                  delay={0.2}
                />
                <PremiumStatCard
                  title="Active Job Carts"
                  value={summary?.open_job_carts || 0}
                  icon={Briefcase}
                  color="#6B7280"
                  gradient="from-gray-500/10 to-slate-400/5"
                  delay={0.3}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab Content: Transactions Ledger */}
      {activeTab === 'transactions' && (
        <div className="space-y-6 animate-fade-in">
          {isTxnsLoading || isKpiLoading ? (
            <div className="p-12 text-center">
              <RefreshCw className="animate-spin w-8 h-8 text-emerald-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500 font-medium">Reconciling Ledger...</p>
            </div>
          ) : (
            <>
              {/* Ledger KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <PremiumStatCard
                  title="Total Cash Inflow"
                  value={kpiData?.ledger?.total_in || 0}
                  prefix="₹"
                  icon={TrendingUp}
                  color="#10B981"
                  gradient="from-emerald-500/10 to-teal-400/5"
                  delay={0.1}
                />
                <PremiumStatCard
                  title="Total Cash Outflow"
                  value={kpiData?.ledger?.total_out || 0}
                  prefix="₹"
                  icon={TrendingDown}
                  color="#EF4444"
                  gradient="from-blue-500/10 to-rose-400/5"
                  delay={0.2}
                />
                <PremiumStatCard
                  title="Net Financial Flow"
                  value={kpiData?.ledger?.net_flow || 0}
                  prefix="₹"
                  icon={IndianRupee}
                  color={(kpiData?.ledger?.net_flow || 0) >= 0 ? '#10B981' : '#EF4444'}
                  gradient={(kpiData?.ledger?.net_flow || 0) >= 0 ? 'from-emerald-500/10 to-teal-400/5' : 'from-blue-500/10 to-rose-400/5'}
                  delay={0.3}
                />
              </div>

              {/* Ledger Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">All Ledger Records</span>
                  <Receipt size={16} className="text-gray-400" />
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <th className="p-4">Transaction Date</th>
                        <th className="p-4">Source Category</th>
                        <th className="p-4">Cashflow Direction</th>
                        <th className="p-4">Total Amount</th>
                        <th className="p-4">Audit Note</th>
                        <th className="p-4">Processed By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(txns?.data || []).map((row: any) => {
                        const isIn = row.direction === 'in';
                        return (
                          <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="p-4 font-medium text-gray-600">
                              {new Date(row.transaction_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </td>
                            <td className="p-4 font-bold text-gray-900 uppercase text-xs">
                              {row.type.replace(/_/g, ' ')}
                            </td>
                            <td className="p-4">
                              <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${
                                isIn ? 'text-green-700 bg-green-50 border-green-200' : 'text-blue-700 bg-blue-50 border-blue-200'
                              }`}>
                                {isIn ? 'INFLOW ↑' : 'OUTFLOW ↓'}
                              </span>
                            </td>
                            <td className={`p-4 font-black ${isIn ? 'text-green-700' : 'text-blue-700'}`}>
                              {formatINR(row.amount)}
                            </td>
                            <td className="p-4 text-gray-500 text-xs font-medium">
                              {row.note || '—'}
                            </td>
                            <td className="p-4 text-gray-600 font-semibold text-xs">
                              {row.created_by_name || 'System Auto'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab Content: Buy & Sell */}
      {activeTab === 'buy_sell' && (
        <div className="space-y-6 animate-fade-in">
          {isBuySellLoading || isKpiLoading ? (
            <div className="p-12 text-center">
              <RefreshCw className="animate-spin w-8 h-8 text-emerald-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500 font-medium">Loading trade ledger...</p>
            </div>
          ) : (
            <>
              {/* Buy Sell KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <PremiumStatCard
                  title="Procured Materials Value"
                  value={kpiData?.buy_sell?.total_purchases || 0}
                  prefix="₹"
                  icon={TrendingDown}
                  color="#EF4444"
                  gradient="from-blue-500/10 to-rose-400/5"
                  delay={0.1}
                />
                <PremiumStatCard
                  title="Trade Revenue (Sales)"
                  value={kpiData?.buy_sell?.total_sales || 0}
                  prefix="₹"
                  icon={TrendingUp}
                  color="#10B981"
                  gradient="from-emerald-500/10 to-teal-400/5"
                  delay={0.2}
                />
                <PremiumStatCard
                  title="Pending Receivables"
                  value={kpiData?.buy_sell?.pending_value || 0}
                  prefix="₹"
                  icon={Clock}
                  color="#F59E0B"
                  gradient="from-amber-500/10 to-yellow-400/5"
                  delay={0.3}
                />
              </div>

              {/* Buy Sell Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">B2B / B2C Trade Ledger</span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => setSaleModalOpen(true)} icon={<Plus size={14} />}>
                      Record Product Sale
                    </Button>
                    <FileText size={16} className="text-gray-400" />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <th className="p-4">Date</th>
                        <th className="p-4">Transaction Type</th>
                        <th className="p-4">Counterparty Name</th>
                        <th className="p-4">Product details</th>
                        <th className="p-4">Volume</th>
                        <th className="p-4">Gross total</th>
                        <th className="p-4">Current Status</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(buySell?.data || []).map((row: any) => {
                        let badgeColor = '';
                        let typeLabel = '';
                        if (row.type === 'buy') {
                          badgeColor = 'text-blue-700 bg-blue-50 border-blue-200';
                          typeLabel = 'BUY';
                        } else if (row.type === 'sell_b2b') {
                          badgeColor = 'text-blue-700 bg-blue-50 border-blue-200';
                          typeLabel = 'SELL (B2B)';
                        } else {
                          badgeColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
                          typeLabel = 'SELL (B2C)';
                        }

                        return (
                          <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="p-4 font-medium text-gray-600">
                              {new Date(row.transaction_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </td>
                            <td className="p-4">
                              <span className={`inline-flex px-2.5 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}>
                                {typeLabel}
                              </span>
                            </td>
                            <td className="p-4 font-semibold text-gray-900">
                              {row.party_name}
                            </td>
                            <td className="p-4 text-gray-700 font-medium">
                              {row.product_name}
                            </td>
                            <td className="p-4 font-bold text-gray-900">
                              {row.quantity}
                            </td>
                            <td className="p-4 font-black text-gray-900">
                              {formatINR(row.total_amount)}
                            </td>
                            <td className="p-4">
                              <StatusBadge status={row.status} />
                            </td>
                            <td className="p-4 text-right">
                              {row.status === 'pending' ? (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => handleCompleteBs(row.id)}
                                  loading={completeBuySellMutation.isPending}
                                >
                                  Complete
                                </Button>
                              ) : (
                                <span className="text-gray-400 text-xs font-bold uppercase">Settled</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab Content: Job Cards */}
      {activeTab === 'job_carts' && (
        <div className="space-y-6 animate-fade-in">
          {isJobCartsLoading || isKpiLoading ? (
            <div className="p-12 text-center">
              <RefreshCw className="animate-spin w-8 h-8 text-emerald-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500 font-medium">Analyzing job cards...</p>
            </div>
          ) : (
            <>
              {/* Job Cards KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <PremiumStatCard
                  title="Total Workshop Pipeline"
                  value={kpiData?.job_carts?.total_value || 0}
                  prefix="₹"
                  icon={IndianRupee}
                  color="#2563EB"
                  gradient="from-blue-500/10 to-indigo-400/5"
                  delay={0.1}
                />
                <PremiumStatCard
                  title="Settled Revenue"
                  value={kpiData?.job_carts?.completed_value || 0}
                  prefix="₹"
                  icon={CheckCircle2}
                  color="#10B981"
                  gradient="from-emerald-500/10 to-teal-400/5"
                  delay={0.2}
                />
                <PremiumStatCard
                  title="Active Workshop Cards"
                  value={kpiData?.job_carts?.open_count || 0}
                  icon={Briefcase}
                  color="#F59E0B"
                  gradient="from-amber-500/10 to-yellow-400/5"
                  delay={0.3}
                />
              </div>

              {/* Job Cards Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Service Workshop Operations</span>
                  <Briefcase size={16} className="text-gray-400" />
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <th className="p-4">Job ID</th>
                        <th className="p-4">Vehicle Details</th>
                        <th className="p-4">Customer</th>
                        <th className="p-4">Visit Date</th>
                        <th className="p-4">Gross Revenue</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Invoice</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(jobCarts?.data || []).map((row: any) => {
                        return (
                          <tr key={row.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => navigate(`/admin/job-carts/${row.id}`)}>
                            <td className="p-4 font-mono text-xs text-gray-400">
                              #JC-{String(row.id).padStart(4, '0')}
                            </td>
                            <td className="p-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-gray-900">{row.registration_no}</span>
                                <span className="text-xs text-gray-500">{row.brand} {row.model}</span>
                              </div>
                            </td>
                            <td className="p-4 font-semibold text-gray-900">
                              {row.customer_name}
                            </td>
                            <td className="p-4 text-gray-500 font-medium">
                              {formatDate(row.visit_date)}
                            </td>
                            <td className="p-4 font-black text-gray-900">
                              {formatINR(row.total_amount)}
                            </td>
                            <td className="p-4">
                              <StatusBadge status={row.status} />
                            </td>
                            <td className="p-4 text-right">
                              <span className="text-xs font-bold text-[#2563EB] hover:underline flex items-center justify-end gap-0.5">
                                View Details <ChevronRight size={12} />
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab Content: Inventory */}
      {activeTab === 'inventory' && (
        <div className="space-y-6 animate-fade-in">
          {isInventoryLoading || isKpiLoading ? (
            <div className="p-12 text-center">
              <RefreshCw className="animate-spin w-8 h-8 text-emerald-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500 font-medium">Valuing assets...</p>
            </div>
          ) : (
            <>
              {/* Inventory KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <PremiumStatCard
                  title="Unique Catalog Items"
                  value={kpiData?.inventory?.total_items || 0}
                  icon={Package}
                  color="#2563EB"
                  gradient="from-blue-500/10 to-indigo-400/5"
                  delay={0.1}
                />
                <PremiumStatCard
                  title="In-Stock Units"
                  value={kpiData?.inventory?.total_units || 0}
                  icon={TrendingUp}
                  color="#10B981"
                  gradient="from-emerald-500/10 to-teal-400/5"
                  delay={0.2}
                />
                <PremiumStatCard
                  title="Low Stock Warning Thresholds"
                  value={kpiData?.inventory?.low_stock_count || 0}
                  icon={TrendingDown}
                  color={kpiData?.inventory?.low_stock_count > 0 ? '#EF4444' : '#10B981'}
                  gradient={kpiData?.inventory?.low_stock_count > 0 ? 'from-blue-500/10 to-rose-400/5' : 'from-emerald-500/10 to-teal-400/5'}
                  delay={0.3}
                />
              </div>

              {/* Inventory Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Material Asset Registry</span>
                  <Package size={16} className="text-gray-400" />
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <th className="p-4">Asset ID</th>
                        <th className="p-4">Material / Product Name</th>
                        <th className="p-4">Active Stock Count</th>
                        <th className="p-4">Base Unit Price</th>
                        <th className="p-4">Retail Value</th>
                        <th className="p-4">Status Alert</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(inventory?.data || []).map((row: any) => {
                        const isLow = parseFloat(row.quantity) <= parseFloat(row.low_stock_threshold);
                        const isOut = parseFloat(row.quantity) === 0;

                        return (
                          <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="p-4 font-mono text-xs text-gray-400">
                              #INV-{String(row.id).padStart(4, '0')}
                            </td>
                            <td className="p-4 font-semibold text-gray-900">
                              {row.product_name}
                            </td>
                            <td className={`p-4 font-black ${isLow ? 'text-blue-700' : 'text-emerald-700'}`}>
                              {parseFloat(row.quantity)} <span className="text-[10px] font-bold uppercase text-gray-400">{row.unit}</span>
                            </td>
                            <td className="p-4 font-medium text-gray-900">
                              {row.unit_price ? formatINR(row.unit_price) : '—'}
                            </td>
                            <td className="p-4 font-medium text-gray-900">
                              {row.retail_price ? formatINR(row.retail_price) : '—'}
                            </td>
                            <td className="p-4">
                              {isOut ? (
                                <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-800 border border-blue-200">
                                  Out of Stock
                                </span>
                              ) : isLow ? (
                                <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200">
                                  Low Stock
                                </span>
                              ) : (
                                <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  OK
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab Content: Purchase Bills */}
      {activeTab === 'purchase_bills' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Procurements & Invoices</h3>
              <p className="text-xs text-gray-500">Record and track inventory purchases from certified suppliers.</p>
            </div>
            <button
              onClick={() => setPurchaseModalOpen(true)}
              className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-emerald-800 text-white text-xs font-bold rounded-xl hover:from-emerald-700 hover:to-emerald-900 transition flex items-center gap-1 shadow-sm shadow-emerald-500/25"
            >
              <Plus size={14} /> Record Purchase Bill
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="p-4">Purchase Date</th>
                    <th className="p-4">Invoice / ID</th>
                    <th className="p-4">Vendor Name</th>
                    <th className="p-4">Total Price (incl. tax)</th>
                    <th className="p-4">Tax Amount</th>
                    <th className="p-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(purchaseBills?.data || []).map((row: any) => (
                    <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="p-4 text-gray-600 font-medium">
                        {new Date(row.purchase_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="p-4 font-mono text-xs text-gray-950 font-bold">
                        {row.invoice_number || `#PUR-${String(row.id).padStart(4, '0')}`}
                      </td>
                      <td className="p-4 font-semibold text-gray-900">{row.vendor_name || '—'}</td>
                      <td className="p-4 font-black text-gray-900">{formatINR(row.total_amount)}</td>
                      <td className="p-4 text-gray-600 font-medium">{formatINR(row.tax_amount)}</td>
                      <td className="p-4 text-gray-500 text-xs">{row.notes || '—'}</td>
                    </tr>
                  ))}
                  {(!purchaseBills?.data || purchaseBills.data.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-xs text-gray-400 font-bold uppercase">
                        No purchase bills recorded yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: GST Compliance */}
      {activeTab === 'gst' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div>
              <h3 className="text-sm font-bold text-gray-900">GST Compliance Ledger</h3>
              <p className="text-xs text-gray-500">View GSTR-1 & GSTR-2 aggregates and export monthly summaries.</p>
            </div>
            <div className="flex items-center gap-2">
              <Dropdown
                className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                value={gstMonth}
                onChange={e => setGstMonth(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i+1} value={i+1}>
                    {new Date(2000, i).toLocaleString('default', { month: 'long' })}
                  </option>
                ))}
              </Dropdown>
              <Dropdown
                className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                value={gstYear}
                onChange={e => setGstYear(Number(e.target.value))}
              >
                {[2025, 2026, 2027, 2028].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </Dropdown>
              <button
                onClick={downloadGstCsv}
                className="px-3.5 py-1.5 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs font-bold rounded-xl transition flex items-center gap-1 shadow-sm"
              >
                <Download size={13} /> Export CSV
              </button>
            </div>
          </div>

          {/* GST KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <PremiumStatCard
              title="Sales GST (GSTR-1 Outward)"
              value={gstReport?.summary?.sales?.gst || 0}
              prefix="₹"
              icon={TrendingUp}
              color="#10B981"
              gradient="from-emerald-500/10 to-teal-400/5"
              delay={0.1}
            />
            <PremiumStatCard
              title="Purchase GST (GSTR-2 Inward ITC)"
              value={gstReport?.summary?.purchases?.gst || 0}
              prefix="₹"
              icon={TrendingDown}
              color="#EF4444"
              gradient="from-blue-500/10 to-rose-400/5"
              delay={0.2}
            />
            <PremiumStatCard
              title="Net GST Payable"
              value={gstReport?.summary?.net_gst_payable || 0}
              prefix="₹"
              icon={IndianRupee}
              color={(gstReport?.summary?.net_gst_payable || 0) >= 0 ? '#F59E0B' : '#10B981'}
              gradient={(gstReport?.summary?.net_gst_payable || 0) >= 0 ? 'from-amber-500/10 to-yellow-400/5' : 'from-emerald-500/10 to-teal-400/5'}
              delay={0.3}
            />
          </div>

          {/* GST Record Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">GST Audit Journal Entries</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="p-4">Type</th>
                    <th className="p-4">Invoice No</th>
                    <th className="p-4">GSTIN</th>
                    <th className="p-4">Taxable Value</th>
                    <th className="p-4">CGST</th>
                    <th className="p-4">SGST</th>
                    <th className="p-4">Total GST</th>
                    <th className="p-4">Created Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(gstReport?.records || []).map((row: any) => {
                    const isSales = row.record_type === 'sales';
                    return (
                      <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="p-4">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isSales ? 'text-green-700 bg-green-50 border-green-200' : 'text-blue-700 bg-blue-50 border-blue-200'
                          }`}>
                            {isSales ? 'SALES' : 'PURCHASE'}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-xs font-bold text-gray-950">
                          {isSales ? (row.job_invoice || `Job #${row.invoice_id}`) : (row.purchase_invoice || `Purchase #${row.purchase_id}`)}
                        </td>
                        <td className="p-4 font-semibold text-gray-700">{row.gstin || '—'}</td>
                        <td className="p-4 font-medium text-gray-900">{formatINR(row.taxable_amount)}</td>
                        <td className="p-4 text-gray-600">{formatINR(row.cgst)}</td>
                        <td className="p-4 text-gray-600">{formatINR(row.sgst)}</td>
                        <td className="p-4 font-bold text-gray-900">{formatINR(row.total_gst)}</td>
                        <td className="p-4 text-gray-500 text-xs">
                          {new Date(row.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </td>
                      </tr>
                    );
                  })}
                  {(!gstReport?.records || gstReport.records.length === 0) && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-xs text-gray-400 font-bold uppercase">
                        No GST records found for this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: Returns Ledger */}
      {activeTab === 'returns' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Returns & Billing Reversals</h3>
              <p className="text-xs text-gray-500">Record sales returns (refunds/credit notes) and purchase returns (debit notes).</p>
            </div>
            <button
              onClick={() => setReturnModalOpen(true)}
              className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-blue-800 text-white text-xs font-bold rounded-xl hover:from-blue-700 hover:to-blue-900 transition flex items-center gap-1 shadow-sm shadow-blue-500/25"
            >
              <Plus size={14} /> Log Return Note
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="p-4">Return Date</th>
                    <th className="p-4">Return ID</th>
                    <th className="p-4">Original Bill ID</th>
                    <th className="p-4">Return Type</th>
                    <th className="p-4">Refunded Amount</th>
                    <th className="p-4">Reason / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(returnsList || []).map((row: any) => {
                    const isSalesReturn = row.return_type === 'sales_return';
                    return (
                      <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="p-4 text-gray-600 font-medium">
                          {new Date(row.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="p-4 font-mono text-xs text-gray-950 font-bold">
                          #RET-{String(row.id).padStart(4, '0')}
                        </td>
                        <td className="p-4 font-mono text-xs font-semibold text-gray-700">
                          {isSalesReturn ? `Bill #${row.original_bill_id}` : `Purchase #${row.original_bill_id}`}
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isSalesReturn ? 'text-blue-700 bg-blue-50 border-blue-200' : 'text-blue-700 bg-blue-50 border-blue-200'
                          }`}>
                            {isSalesReturn ? 'SALES RETURN' : 'PURCHASE RETURN'}
                          </span>
                        </td>
                        <td className="p-4 font-black text-gray-900">{formatINR(row.amount)}</td>
                        <td className="p-4 text-gray-500 text-xs font-medium">{row.reason || '—'}</td>
                      </tr>
                    );
                  })}
                  {(!returnsList || returnsList.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-xs text-gray-400 font-bold uppercase">
                        No return notes logged yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      <Modal open={showExport} onClose={() => setShowExport(false)} title="Export Financial Statement">
        <div className="space-y-4 py-2">
          <Input type="date" label="From Date" value={exportForm.from_date} onChange={e => setExportForm({...exportForm, from_date: e.target.value})} />
          <Input type="date" label="To Date" value={exportForm.to_date} onChange={e => setExportForm({...exportForm, to_date: e.target.value})} />
          <Select label="Format" options={[{value:'excel', label:'Excel (.xlsx)'}, {value:'pdf', label:'PDF (.pdf)'}]} value={exportForm.format} onChange={e => setExportForm({...exportForm, format: e.target.value as any})} />
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowExport(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleExport} loading={exportMutation.isPending}>Download Document</Button>
          </div>
        </div>
      </Modal>

      {/* Add Purchase Bill Modal */}
      <Modal
        open={purchaseModalOpen}
        onClose={() => setPurchaseModalOpen(false)}
        title="Record Purchase Bill"
        size="lg"
        footer={
          <div className="flex justify-end gap-2.5 w-full">
            <Button variant="secondary" type="button" onClick={() => setPurchaseModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="button" onClick={handlePurchaseSubmit} loading={createPurchaseMutation.isPending}>Record Bill</Button>
          </div>
        }
      >
        <form onSubmit={handlePurchaseSubmit} className="space-y-4 py-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Select Vendor *"
              value={purchaseForm.vendor_id}
              onChange={e => setPurchaseForm({ ...purchaseForm, vendor_id: e.target.value })}
              options={[
                { value: '', label: 'Select Vendor' },
                ...(vendorsList?.data || []).map((v: any) => ({ value: String(v.id), label: v.name }))
              ]}
              required
            />
            <Input
              type="date"
              label="Purchase Date *"
              value={purchaseForm.purchase_date}
              onChange={e => setPurchaseForm({ ...purchaseForm, purchase_date: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="text"
              label="Invoice Number"
              placeholder="e.g. INV-9901"
              value={purchaseForm.invoice_number}
              onChange={e => setPurchaseForm({ ...purchaseForm, invoice_number: e.target.value })}
            />
            <Input
              type="number"
              label="GST / Tax Amount"
              placeholder="0.00"
              value={purchaseForm.tax_amount}
              onChange={e => setPurchaseForm({ ...purchaseForm, tax_amount: e.target.value })}
            />
          </div>

          <div className="border-t border-gray-100 pt-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Purchase Line Items</span>
              <button
                type="button"
                onClick={handleAddPurchaseItem}
                className="px-2 py-1 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-[10px] font-bold rounded-lg transition flex items-center gap-0.5"
              >
                <Plus size={10} /> Add Item
              </button>
            </div>

            <div className="space-y-3">
              {purchaseForm.items.map((item, idx) => (
                <div key={idx} className="p-3 border border-gray-200 rounded-xl bg-gray-50/60 space-y-2.5 relative">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Item #{idx + 1}</span>
                    {purchaseForm.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemovePurchaseItem(idx)}
                        className="text-blue-600 hover:text-blue-700 p-1 hover:bg-blue-50 rounded-lg transition"
                        title="Remove Item"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div>
                    <Select
                      label="Product *"
                      value={item.item_id}
                      onChange={e => handlePurchaseItemChange(idx, 'item_id', e.target.value)}
                      options={[
                        { value: '', label: '-- Select Inventory Product --' },
                        ...(inventory?.data || []).map((p: any) => ({ value: String(p.id), label: `${p.product_name} (${p.category || 'Item'})` }))
                      ]}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Input
                      type="text"
                      label="HSN/SAC"
                      placeholder="e.g. 3402"
                      value={item.hsn_sac || ''}
                      onChange={e => handlePurchaseItemChange(idx, 'hsn_sac', e.target.value)}
                    />
                    <Input
                      type="number"
                      label="Qty *"
                      placeholder="1"
                      value={item.quantity}
                      onChange={e => handlePurchaseItemChange(idx, 'quantity', e.target.value)}
                      required
                    />
                    <Input
                      type="number"
                      label="Unit Cost (₹) *"
                      placeholder="0.00"
                      value={item.unit_price}
                      onChange={e => handlePurchaseItemChange(idx, 'unit_price', e.target.value)}
                      required
                    />
                    <Select
                      label="GST %"
                      value={item.gst_rate || '18'}
                      onChange={e => handlePurchaseItemChange(idx, 'gst_rate', e.target.value)}
                      options={[
                        { value: '0', label: '0%' },
                        { value: '5', label: '5%' },
                        { value: '12', label: '12%' },
                        { value: '18', label: '18%' },
                        { value: '28', label: '28%' }
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Input
            type="text"
            label="Internal Notes"
            placeholder="e.g. Raw materials delivery"
            value={purchaseForm.notes}
            onChange={e => setPurchaseForm({ ...purchaseForm, notes: e.target.value })}
          />
        </form>
      </Modal>

      {/* Log Return Note Modal */}
      <Modal open={returnModalOpen} onClose={() => setReturnModalOpen(false)} title="Log Return / Reversal Note">
        <form onSubmit={handleReturnSubmit} className="space-y-4 py-2">
          <Select
            label="Return Type *"
            value={returnForm.return_type}
            onChange={e => setReturnForm({ ...returnForm, return_type: e.target.value })}
            options={[
              { value: 'sales_return', label: 'Sales Return (Credit Note to Customer)' },
              { value: 'purchase_return', label: 'Purchase Return (Debit Note to Vendor)' }
            ]}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="number"
              label="Original Invoice / Bill ID *"
              placeholder="e.g. 15"
              value={returnForm.original_bill_id}
              onChange={e => setReturnForm({ ...returnForm, original_bill_id: e.target.value })}
              required
            />
            <Input
              type="number"
              label="Reversal Amount *"
              placeholder="0.00"
              value={returnForm.amount}
              onChange={e => setReturnForm({ ...returnForm, amount: e.target.value })}
              required
            />
          </div>

          <Input
            type="text"
            label="Reason for Return *"
            placeholder="e.g. Defective stock / cancelled service"
            value={returnForm.reason}
            onChange={e => setReturnForm({ ...returnForm, reason: e.target.value })}
            required
          />

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="secondary" onClick={() => setReturnModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={createReturnMutation.isPending}>Log Note</Button>
          </div>
        </form>
      </Modal>

      {/* Record Product Sale Modal */}
      <Modal open={saleModalOpen} onClose={() => setSaleModalOpen(false)} title="Record Product Sale">
        <form onSubmit={handleSaleSubmit} className="space-y-4 py-2">
          <Input
            type="text"
            label="Customer / Party Name *"
            placeholder="e.g. John Doe / Auto Solutions"
            value={saleForm.party_name}
            onChange={e => setSaleForm({ ...saleForm, party_name: e.target.value })}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Sale Type *"
              value={saleForm.type}
              onChange={e => setSaleForm({ ...saleForm, type: e.target.value })}
              options={[
                { value: 'sell_b2c', label: 'B2C (Retail Sale)' },
                { value: 'sell_b2b', label: 'B2B (Business Sale)' }
              ]}
              required
            />
            <Select
              label="Select Product *"
              value={saleForm.product_id}
              onChange={e => {
                const val = e.target.value;
                const selected = (inventory?.data || []).find((p: any) => p.id === Number(val)) as any;
                setSaleForm(prev => ({
                  ...prev,
                  product_id: val,
                  unit_price: selected ? String(selected.selling_price || selected.retail_price || 0) : '0'
                }));
              }}
              options={[
                { value: '', label: 'Select Product...' },
                ...(inventory?.data || []).map((p: any) => ({ value: String(p.id), label: `${p.product_name} (${p.unit})` }))
              ]}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              type="number"
              label="Quantity *"
              placeholder="1"
              value={saleForm.quantity}
              onChange={e => setSaleForm({ ...saleForm, quantity: e.target.value })}
              required
            />
            <Input
              type="number"
              label="Unit Selling Price (₹) *"
              placeholder="0.00"
              value={saleForm.unit_price}
              onChange={e => setSaleForm({ ...saleForm, unit_price: e.target.value })}
              required
            />
            <Input
              type="date"
              label="Transaction Date *"
              value={saleForm.transaction_date}
              onChange={e => setSaleForm({ ...saleForm, transaction_date: e.target.value })}
              required
            />
          </div>

          <Input
            type="text"
            label="Internal Notes"
            placeholder="e.g. Sold with warranty details"
            value={saleForm.notes}
            onChange={e => setSaleForm({ ...saleForm, notes: e.target.value })}
          />

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="secondary" onClick={() => setSaleModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={createBuySellMutation.isPending}>Record Sale</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
