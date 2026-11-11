import { useState } from 'react';
import {
  Users, Plus, Search, Edit2, Trash2, Phone, Mail,
  MapPin, Wrench, AlertCircle, ShoppingBag, ArrowUpRight, ArrowDownLeft, FileText
} from 'lucide-react';
import {
  useVendors, useCreateVendor, useUpdateVendor, useDeleteVendor
} from '../../api/hooks/useVendors';
import PremiumPageHeader from '../../components/shared/PremiumPageHeader';
import { PageTransition, AnimatedCard, RippleButton, AnimatedModal } from '../../components/ui/Animations';

interface BuySellHistoryItem {
  id: number;
  type: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  transaction_date: string;
  status?: string;
}

interface PurchaseHistoryItem {
  purchase_id: number;
  invoice_number?: string;
  purchase_date: string;
  bill_total: number;
  quantity: number;
  unit_price: number;
  line_total: number;
  product_name: string;
}

interface Vendor {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  service_type?: string;
  address?: string;
  is_active: number;
  buy_sell_history?: BuySellHistoryItem[];
  purchase_history?: PurchaseHistoryItem[];
}

export default function VendorsPage() {
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyVendor, setHistoryVendor] = useState<Vendor | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    service_type: '',
    address: '',
    is_active: true
  });

  const { data: vendorsResponse, isLoading } = useVendors({
    search: search || undefined,
    active_only: activeOnly || undefined
  });

  const createMutation = useCreateVendor();
  const updateMutation = useUpdateVendor();
  const deleteMutation = useDeleteVendor();

  const handleOpenCreate = () => {
    setSelectedVendor(null);
    setFormData({
      name: '',
      phone: '',
      email: '',
      service_type: '',
      address: '',
      is_active: true
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setFormData({
      name: vendor.name,
      phone: vendor.phone || '',
      email: vendor.email || '',
      service_type: vendor.service_type || '',
      address: vendor.address || '',
      is_active: vendor.is_active === 1
    });
    setIsModalOpen(true);
  };

  const handleOpenDelete = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setIsDeleteModalOpen(true);
  };

  const handleOpenHistory = (vendor: Vendor) => {
    setHistoryVendor(vendor);
    setIsHistoryModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    try {
      if (selectedVendor) {
        await updateMutation.mutateAsync({
          id: selectedVendor.id,
          ...formData
        });
      } else {
        await createMutation.mutateAsync(formData);
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedVendor) return;
    try {
      await deleteMutation.mutateAsync(selectedVendor.id);
      setIsDeleteModalOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const vendors = vendorsResponse?.data || [];

  return (
    <PageTransition className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <PremiumPageHeader
        title="Vendor Management"
        subtitle="Manage supplier directories, inventory partners, and service providers"
        icon={Users}
        iconColor="#EF4444"
        accentGradient="from-blue-600 to-blue-500"
        badge="SUPPLIERS"
      />

      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
        <div className="flex flex-1 flex-wrap gap-3 items-center">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search vendors by name, phone, or service type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer bg-white px-3 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 select-none">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="rounded text-blue-500 focus:ring-blue-500/20 h-4 w-4 border-gray-300"
            />
            Active Only
          </label>
        </div>

        <RippleButton
          onClick={handleOpenCreate}
          className="flex items-center justify-center gap-1.5 py-2.5 px-4 bg-[#0F172A] text-white hover:bg-[#2c2b2b] rounded-xl text-xs font-bold shadow-sm shrink-0"
        >
          <Plus size={16} />
          Add Vendor
        </RippleButton>
      </div>

      {/* Vendors Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-64 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vendors.map((vendor: Vendor, idx: number) => {
            const hasBsHistory = (vendor.buy_sell_history?.length || 0) > 0;
            const hasPurHistory = (vendor.purchase_history?.length || 0) > 0;
            const totalTxns = (vendor.buy_sell_history?.length || 0) + (vendor.purchase_history?.length || 0);

            return (
              <AnimatedCard
                key={vendor.id}
                className={`bg-white border rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow duration-200 ${
                  vendor.is_active === 0 ? 'border-gray-200/60 opacity-75' : 'border-gray-100'
                }`}
                delay={idx * 0.05}
              >
                {/* Active Badge */}
                <div className="absolute right-4 top-4">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                    vendor.is_active === 1
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                      : 'bg-gray-100 text-gray-400 border border-gray-200'
                  }`}>
                    {vendor.is_active === 1 ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>

                <div className="space-y-4">
                  {/* Info Header */}
                  <div>
                    <h4 className="font-bold text-base text-[#0F172A] pr-12 truncate">{vendor.name}</h4>
                    {vendor.service_type && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-gray-500 bg-gray-50 px-2 py-0.5 rounded-lg">
                        <Wrench size={10} />
                        {vendor.service_type}
                      </span>
                    )}
                  </div>

                  {/* Contacts */}
                  <div className="space-y-1.5 text-xs text-gray-600 border-t border-gray-50 pt-3">
                    {vendor.phone && (
                      <div className="flex items-center gap-2">
                        <Phone size={12} className="text-gray-400" />
                        <span>{vendor.phone}</span>
                      </div>
                    )}
                    {vendor.email && (
                      <div className="flex items-center gap-2">
                        <Mail size={12} className="text-gray-400 shrink-0" />
                        <span className="truncate" title={vendor.email}>{vendor.email}</span>
                      </div>
                    )}
                    {vendor.address && (
                      <div className="flex items-start gap-2">
                        <MapPin size={12} className="text-gray-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-2" title={vendor.address}>{vendor.address}</span>
                      </div>
                    )}
                  </div>

                  {/* Products Bought / Sold Summary */}
                  <div className="border-t border-gray-100 pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-gray-700 flex items-center gap-1">
                        <ShoppingBag size={12} className="text-blue-500" />
                        Products Bought / Sold
                      </span>
                      <button
                        onClick={() => handleOpenHistory(vendor)}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-700 underline"
                      >
                        View All ({totalTxns})
                      </button>
                    </div>

                    {hasBsHistory || hasPurHistory ? (
                      <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                        {vendor.buy_sell_history?.slice(0, 3).map((bs) => (
                          <div key={`bs-${bs.id}`} className="flex items-center justify-between text-[11px] bg-gray-50 p-1.5 rounded-lg border border-gray-100">
                            <div className="flex items-center gap-1.5 truncate">
                              {bs.type === 'buy' ? (
                                <span className="p-0.5 bg-blue-100 text-blue-700 rounded text-[9px] font-bold flex items-center gap-0.5">
                                  <ArrowDownLeft size={10} /> BOUGHT
                                </span>
                              ) : (
                                <span className="p-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-bold flex items-center gap-0.5">
                                  <ArrowUpRight size={10} /> SOLD
                                </span>
                              )}
                              <span className="font-medium text-gray-800 truncate">{bs.product_name}</span>
                            </div>
                            <span className="font-semibold text-gray-700 shrink-0">₹{Number(bs.total_amount || (bs.quantity * bs.unit_price)).toLocaleString()}</span>
                          </div>
                        ))}

                        {vendor.purchase_history?.slice(0, 2).map((pur, idx) => (
                          <div key={`pur-${pur.purchase_id}-${idx}`} className="flex items-center justify-between text-[11px] bg-purple-50/60 p-1.5 rounded-lg border border-purple-100">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="p-0.5 bg-purple-100 text-purple-700 rounded text-[9px] font-bold flex items-center gap-0.5">
                                <FileText size={10} /> PURCHASE
                              </span>
                              <span className="font-medium text-gray-800 truncate">{pur.product_name || 'Inventory Item'}</span>
                            </div>
                            <span className="font-semibold text-gray-700 shrink-0">₹{Number(pur.line_total || pur.bill_total).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-gray-400 italic">No products bought or sold yet</p>
                    )}
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="flex justify-between items-center border-t border-gray-50 pt-3 mt-3">
                  <button
                    onClick={() => handleOpenHistory(vendor)}
                    className="text-xs font-semibold text-gray-600 hover:text-blue-600 flex items-center gap-1"
                  >
                    <ShoppingBag size={13} />
                    Transactions History
                  </button>

                  <div className="flex gap-2">
                    <RippleButton
                      onClick={() => handleOpenEdit(vendor)}
                      className="p-1.5 text-gray-400 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Edit Vendor"
                    >
                      <Edit2 size={13} />
                    </RippleButton>
                    <RippleButton
                      onClick={() => handleOpenDelete(vendor)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Delete Vendor"
                    >
                      <Trash2 size={13} />
                    </RippleButton>
                  </div>
                </div>
              </AnimatedCard>
            );
          })}

          {!vendors.length && (
            <div className="col-span-full py-16 text-center">
              <Users size={40} className="mx-auto text-gray-200 mb-3" />
              <p className="text-sm text-gray-400 font-medium">No vendors found</p>
            </div>
          )}
        </div>
      )}

      {/* DETAILED VENDOR TRANSACTIONS & PRODUCTS MODAL */}
      <AnimatedModal isOpen={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)}>
        <div className="p-6 space-y-5 max-w-2xl w-full">
          <div>
            <div className="flex items-center gap-2">
              <ShoppingBag size={20} className="text-blue-500" />
              <h3 className="text-lg font-bold text-[#0F172A]">
                {historyVendor?.name} — Products & Transactions History
              </h3>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Complete log of products bought, sold, and inventory purchase bills for this vendor.
            </p>
          </div>

          {/* Buy & Sell Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <ArrowDownLeft size={14} className="text-blue-500" />
              Buy & Sell Products Ledger
            </h4>
            {(historyVendor?.buy_sell_history?.length || 0) > 0 ? (
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold">
                    <tr>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Type</th>
                      <th className="p-2.5">Product Name</th>
                      <th className="p-2.5">Qty</th>
                      <th className="p-2.5">Unit Price</th>
                      <th className="p-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {historyVendor?.buy_sell_history?.map((bs) => (
                      <tr key={bs.id} className="hover:bg-gray-50/80">
                        <td className="p-2.5 text-gray-500">
                          {bs.transaction_date ? new Date(bs.transaction_date).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            bs.type === 'buy' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {bs.type?.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-2.5 font-semibold text-gray-800">{bs.product_name}</td>
                        <td className="p-2.5 text-gray-700">{bs.quantity}</td>
                        <td className="p-2.5 text-gray-700">₹{Number(bs.unit_price).toLocaleString()}</td>
                        <td className="p-2.5 text-right font-bold text-gray-900">
                          ₹{Number(bs.total_amount || (bs.quantity * bs.unit_price)).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic bg-gray-50 p-3 rounded-xl border border-gray-100">
                No Buy & Sell entries recorded for this vendor.
              </p>
            )}
          </div>

          {/* Inventory Purchases Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <FileText size={14} className="text-purple-500" />
              Inventory Purchase Bills
            </h4>
            {(historyVendor?.purchase_history?.length || 0) > 0 ? (
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold">
                    <tr>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Invoice #</th>
                      <th className="p-2.5">Item Name</th>
                      <th className="p-2.5">Qty</th>
                      <th className="p-2.5">Rate</th>
                      <th className="p-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {historyVendor?.purchase_history?.map((pur, idx) => (
                      <tr key={`pur-modal-${pur.purchase_id}-${idx}`} className="hover:bg-gray-50/80">
                        <td className="p-2.5 text-gray-500">
                          {pur.purchase_date ? new Date(pur.purchase_date).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="p-2.5 font-mono text-gray-600">{pur.invoice_number || `#${pur.purchase_id}`}</td>
                        <td className="p-2.5 font-semibold text-gray-800">{pur.product_name || 'Inventory Item'}</td>
                        <td className="p-2.5 text-gray-700">{pur.quantity}</td>
                        <td className="p-2.5 text-gray-700">₹{Number(pur.unit_price).toLocaleString()}</td>
                        <td className="p-2.5 text-right font-bold text-gray-900">
                          ₹{Number(pur.line_total || pur.bill_total).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic bg-gray-50 p-3 rounded-xl border border-gray-100">
                No Inventory Purchase bills recorded for this vendor.
              </p>
            )}
          </div>

          <div className="flex justify-end pt-3 border-t border-gray-100">
            <RippleButton
              type="button"
              variant="ghost"
              onClick={() => setIsHistoryModalOpen(false)}
            >
              Close
            </RippleButton>
          </div>
        </div>
      </AnimatedModal>

      {/* CREATE / EDIT MODAL */}
      <AnimatedModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-[#0F172A]">
              {selectedVendor ? 'Edit Supplier' : 'Add New Supplier'}
            </h3>
            <p className="text-xs text-gray-500">Provide registration details for the vendor.</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Company / Vendor Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                placeholder="e.g. Shine Detailing Supplies"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  placeholder="e.g. 9876543210"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Email Address</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  placeholder="e.g. supply@gkdetailing.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Service / Material Type</label>
              <input
                type="text"
                value={formData.service_type}
                onChange={(e) => setFormData((prev) => ({ ...prev, service_type: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                placeholder="e.g. Cleaning Solvents, Spare Parts, Oils"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Office Address</label>
              <textarea
                value={formData.address}
                onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                rows={3}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                placeholder="Complete street address..."
              />
            </div>

            {selectedVendor && (
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer select-none mt-2">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                  className="rounded text-blue-500 focus:ring-blue-500/20 h-4 w-4 border-gray-300"
                />
                Vendor Active Status
              </label>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
            <RippleButton
              type="button"
              variant="ghost"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </RippleButton>
            <RippleButton
              type="submit"
              className="py-2 px-4 bg-[#0F172A] text-white hover:bg-[#2c2b2b] rounded-xl text-xs font-bold shadow-sm"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {selectedVendor ? 'Save Changes' : 'Add Supplier'}
            </RippleButton>
          </div>
        </form>
      </AnimatedModal>

      {/* DELETE CONFIRM MODAL */}
      <AnimatedModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)}>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 text-blue-600">
            <AlertCircle size={24} />
            <h3 className="text-lg font-bold">Remove Supplier?</h3>
          </div>
          
          <p className="text-xs text-gray-500">
            Are you sure you want to delete <span className="font-semibold text-gray-800">{selectedVendor?.name}</span>? This action is permanent and cannot be undone.
          </p>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
            <RippleButton
              type="button"
              variant="ghost"
              onClick={() => setIsDeleteModalOpen(false)}
            >
              Cancel
            </RippleButton>
            <RippleButton
              type="button"
              className="py-2 px-4 bg-red-600 text-white hover:bg-red-700 rounded-xl text-xs font-bold shadow-sm"
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <div className="flex items-center gap-1.5">
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Deleting...</span>
                </div>
              ) : (
                'Delete Vendor'
              )}
            </RippleButton>
          </div>
        </div>
      </AnimatedModal>
    </PageTransition>
  );
}
