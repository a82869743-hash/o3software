import { useState } from 'react';
import { Plus, ShoppingCart, Download, Search, Filter, RefreshCw, BarChart3, TrendingUp, TrendingDown, Clock, CheckCircle } from 'lucide-react';
import { useBuySellList, useCreateBuySell, useCompleteBuySell, downloadBuySellInvoice } from '../../api/hooks/useBuySell';
import { useInventory } from '../../api/hooks/useInventory';
import { useVendors } from '../../api/hooks/useVendors';
import { useUIStore } from '../../store/uiStore';
import PremiumPageHeader from '../../components/shared/PremiumPageHeader';
import PremiumStatCard from '../../components/shared/PremiumStatCard';
import StatusBadge from '../../components/shared/StatusBadge';
import SkeletonLoader from '../../components/ui/SkeletonLoader';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { formatINR, ymd } from '../../utils/formatters';
import Dropdown from '../../components/ui/Dropdown';

export default function BuySellPage() {
  const toast = useUIStore(s => s.toast);
  
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const { data: buySell, isLoading: isBuySellLoading, refetch } = useBuySellList({ limit: 100 });
  const { data: inventory } = useInventory({});
  const { data: vendorsList } = useVendors();
  
  const createBuySellMutation = useCreateBuySell();
  const completeBuySellMutation = useCompleteBuySell();
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const [showBsModal, setShowBsModal] = useState(false);
  const [bsForm, setBsForm] = useState({
    type: 'buy', vendor_id: '', party_name: '', party_mobile: '', product_id: '', product_name: '',
    quantity: '', unit_price: '', transaction_date: ymd()
  });

  const handleCreateBs = async () => {
    if (!bsForm.party_name || !bsForm.product_name || !bsForm.quantity || !bsForm.unit_price) {
      toast('error', 'Please fill all required fields');
      return;
    }
    try {
      const payload = {
        ...bsForm,
        type: bsForm.type as any,
        vendor_id: bsForm.vendor_id ? parseInt(bsForm.vendor_id) : undefined,
        quantity: parseFloat(bsForm.quantity),
        unit_price: parseFloat(bsForm.unit_price),
        product_id: bsForm.product_id ? parseInt(bsForm.product_id) : undefined
      };
      await createBuySellMutation.mutateAsync(payload);
      toast('success', 'Record created successfully');
      setShowBsModal(false);
      // Reset form
      setBsForm({
        type: 'buy', vendor_id: '', party_name: '', party_mobile: '', product_id: '', product_name: '',
        quantity: '', unit_price: '', transaction_date: ymd()
      });
      refetch();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to create record');
    }
  };

  const handleCompleteBs = async (id: number) => {
    try {
      await completeBuySellMutation.mutateAsync(id);
      toast('success', 'Transaction marked complete');
      refetch();
    } catch(err: any) {
      toast('error', 'Failed to complete transaction');
    }
  };

  const handleDownloadInvoice = async (id: number) => {
    setDownloadingId(id);
    try {
      await downloadBuySellInvoice(id);
    } catch (err) {
      toast('error', 'Failed to download invoice');
    } finally {
      setDownloadingId(null);
    }
  };

  // Compute stat totals (corporate style)
  const allRecords = buySell?.data || [];
  
  // Filter records based on search and type filter
  const filteredRecords = allRecords.filter((r: any) => {
    const matchesSearch = 
      r.party_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.product_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.party_mobile?.includes(search);
    const matchesType = typeFilter ? r.type === typeFilter : true;
    return matchesSearch && matchesType;
  });

  const totalBuy = allRecords
    .filter((r: any) => r.type === 'buy')
    .reduce((sum: number, r: any) => sum + (parseFloat(r.total_amount) || 0), 0);

  const totalSellB2B = allRecords
    .filter((r: any) => r.type === 'sell_b2b')
    .reduce((sum: number, r: any) => sum + (parseFloat(r.total_amount) || 0), 0);

  const totalSellB2C = allRecords
    .filter((r: any) => r.type === 'sell_b2c')
    .reduce((sum: number, r: any) => sum + (parseFloat(r.total_amount) || 0), 0);

  const netRevenue = (totalSellB2B + totalSellB2C) - totalBuy;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 font-sans">
      {/* Page Header */}
      <PremiumPageHeader
        title="Corporate Buy & Sell Ledger"
        subtitle="Track vendor procurements (Buy) and customer B2B/B2C trade cycles."
        icon={ShoppingCart}
        iconColor="#10B981"
        accentGradient="from-emerald-600 to-teal-600"
        actions={
          <Button variant="primary" onClick={() => setShowBsModal(true)} className="shadow-lg shadow-emerald-500/20">
            <Plus className="w-4 h-4 mr-2" /> Add Entry
          </Button>
        }
      />

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PremiumStatCard
          title="Procurements (Buy)"
          value={totalBuy}
          prefix="₹"
          icon={TrendingDown}
          color="#EF4444"
          gradient="from-blue-500/10 to-rose-400/5"
          delay={0.1}
        />
        <PremiumStatCard
          title="B2B Bulk Sales"
          value={totalSellB2B}
          prefix="₹"
          icon={TrendingUp}
          color="#3B82F6"
          gradient="from-blue-500/10 to-indigo-400/5"
          delay={0.2}
        />
        <PremiumStatCard
          title="B2C Direct Sales"
          value={totalSellB2C}
          prefix="₹"
          icon={CheckCircle}
          color="#10B981"
          gradient="from-emerald-500/10 to-teal-400/5"
          delay={0.3}
        />
        <PremiumStatCard
          title="Net Cash Flow"
          value={netRevenue}
          prefix="₹"
          icon={BarChart3}
          color={netRevenue >= 0 ? '#10B981' : '#EF4444'}
          gradient={netRevenue >= 0 ? 'from-emerald-500/10 to-teal-400/5' : 'from-blue-500/10 to-rose-400/5'}
          delay={0.4}
        />
      </div>

      {/* Filters & Search Panel */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by party name, mobile, or product name..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full md:w-48">
          <Dropdown
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Entry Types</option>
            <option value="buy">Buy (Procurement)</option>
            <option value="sell_b2b">Sell (B2B Bulk)</option>
            <option value="sell_b2c">Sell (B2C Direct)</option>
          </Dropdown>
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {isBuySellLoading ? (
          <div className="p-12 text-center">
            <RefreshCw className="animate-spin w-8 h-8 text-emerald-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Loading ledger records...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <ShoppingCart size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-semibold text-gray-700">No Transactions Found</p>
            <p className="text-xs text-gray-400 mt-1">Try resetting search or filter parameters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
              <thead className="bg-gray-50">
                <tr className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <th className="p-4">Date</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Party Details</th>
                  <th className="p-4">Product details</th>
                  <th className="p-4">Qty</th>
                  <th className="p-4">Total Amount</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRecords.map((row: any) => {
                  let badgeColor = '';
                  let label = '';
                  if (row.type === 'buy') {
                    badgeColor = 'text-blue-700 bg-blue-50 border-blue-200';
                    label = 'BUY';
                  } else if (row.type === 'sell_b2b') {
                    badgeColor = 'text-blue-700 bg-blue-50 border-blue-200';
                    label = 'SELL (B2B)';
                  } else {
                    badgeColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
                    label = 'SELL (B2C)';
                  }

                  return (
                    <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="p-4 font-medium text-gray-600">
                        {new Date(row.transaction_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex px-2.5 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}>
                          {label}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900">{row.party_name}</span>
                          <span className="text-xs text-gray-400">{row.party_mobile || 'No Mobile'}</span>
                        </div>
                      </td>
                      <td className="p-4 font-medium text-gray-800">
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
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDownloadInvoice(row.id)}
                            loading={downloadingId === row.id}
                            icon={<Download size={13} />}
                          >
                            Invoice
                          </Button>
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

      {/* Buy/Sell Modal */}
      <Modal open={showBsModal} onClose={() => setShowBsModal(false)} title="Create Ledger Entry" size="md">
        <div className="space-y-4 py-2">
          <Select
            label="Transaction Type *"
            options={[
              { value: 'buy', label: 'Buy (Vendor Procurement)' },
              { value: 'sell_b2b', label: 'Sell B2B (Bulk Trade)' },
              { value: 'sell_b2c', label: 'Sell B2C (Customer Direct)' }
            ]}
            value={bsForm.type}
            onChange={e => setBsForm({ ...bsForm, type: e.target.value })}
          />
          
          <Select
            label="Link Registered Vendor (Optional)"
            options={[
              { value: '', label: '-- Custom Party / Unregistered --' },
              ...((vendorsList?.data || []).map((v: any) => ({ value: String(v.id), label: `${v.name} (${v.phone || 'No phone'})` })))
            ]}
            value={bsForm.vendor_id || ''}
            onChange={e => {
              const vId = e.target.value;
              const foundV = (vendorsList?.data || []).find((x: any) => String(x.id) === vId);
              setBsForm({
                ...bsForm,
                vendor_id: vId,
                party_name: foundV ? foundV.name : bsForm.party_name,
                party_mobile: foundV ? (foundV.phone || bsForm.party_mobile) : bsForm.party_mobile
              });
            }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Party Name *" placeholder="e.g. Acme Corp" value={bsForm.party_name} onChange={e => setBsForm({ ...bsForm, party_name: e.target.value })} />
            <Input label="Party Mobile" placeholder="e.g. 9876543210" value={bsForm.party_mobile} onChange={e => setBsForm({ ...bsForm, party_mobile: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select 
              label="Inventory Link (Optional)" 
              options={[{ value: '', label: 'Custom Item (Not in Inventory)' }, ...((inventory?.data || []).map((i: any) => {
                // selling needs stock; buying can restock anything
                const out = bsForm.type !== 'buy' && Number(i.quantity) <= 0;
                return { value: i.id.toString(), label: `${i.product_name} ${out ? '— 0 stock left, kindly reorder from main admin' : `(${Number(i.quantity)} in stock)`}`, disabled: out };
              }))]}
              value={bsForm.product_id}
              onChange={e => {
                const p = inventory?.data.find(x => x.id.toString() === e.target.value);
                setBsForm({ ...bsForm, product_id: e.target.value, product_name: p ? p.product_name : bsForm.product_name });
              }}
            />
            <Input label="Product Name *" placeholder="e.g. Teflon Polish" value={bsForm.product_name} onChange={e => setBsForm({ ...bsForm, product_name: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Quantity *" type="number" placeholder="0" value={bsForm.quantity} onChange={e => setBsForm({ ...bsForm, quantity: e.target.value })} />
            <Input label="Unit Price (₹) *" type="number" placeholder="0" value={bsForm.unit_price} onChange={e => setBsForm({ ...bsForm, unit_price: e.target.value })} />
          </div>
          
          <Input type="date" label="Transaction Date *" value={bsForm.transaction_date} onChange={e => setBsForm({ ...bsForm, transaction_date: e.target.value })} />

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowBsModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreateBs} loading={createBuySellMutation.isPending}>Save Entry</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
