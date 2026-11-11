import { useState } from 'react';
import { RefreshCw, X, Package, CreditCard, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useRenewPackage } from '../../api/hooks/useUserPackages';
import api from '../../api/axiosInstance';
import { useToastStore } from '../../store/toastStore';
import Dropdown from '../ui/Dropdown';

interface PackageRenewModalProps {
  isOpen: boolean;
  onClose: () => void;
  userPackage: {
    id: number;
    package_name: string;
    customer_name: string;
    customer_id: number;
    package_id: number;
    expiry_date: string;
    package_status: string;
  };
}

export default function PackageRenewModal({ isOpen, onClose, userPackage }: PackageRenewModalProps) {
  const [selectedPackageId, setSelectedPackageId] = useState(userPackage.package_id);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const renewMutation = useRenewPackage();
  const { addToast } = useToastStore();

  // Fetch available packages for upgrade option
  const { data: packages = [] } = useQuery({
    queryKey: ['packages-list'],
    queryFn: async () => {
      const res = await api.get('/packages');
      return res.data.data || [];
    },
    enabled: isOpen,
  });

  if (!isOpen) return null;

  const isUpgrade = selectedPackageId !== userPackage.package_id;
  const selectedPkg = packages.find((p: { id: number }) => p.id === selectedPackageId);
  const isExpired = userPackage.package_status === 'expired';
  const isExpiring = userPackage.package_status === 'expiring_soon';

  const handleRenew = async () => {
    try {
      await renewMutation.mutateAsync({
        user_package_id: userPackage.id,
        ...(isUpgrade && { package_id: selectedPackageId }),
        ...(paymentAmount && { payment_amount: parseFloat(paymentAmount) }),
        payment_mode: paymentMode,
      });
      addToast('success', isUpgrade ? 'Package upgraded successfully!' : 'Package renewed successfully!');
      onClose();
    } catch (err: any) {
      addToast('error', err?.response?.data?.message || 'Renewal failed');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl">
              <RefreshCw size={20} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {isExpired ? 'Reactivate' : 'Renew'} Package
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">{userPackage.customer_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Current Package Info */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Current Package</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-semibold">{userPackage.package_name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {isExpired ? 'Expired' : 'Expires'}: {new Date(userPackage.expiry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${
                isExpired
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  : isExpiring
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              }`}>
                {userPackage.package_status.replace(/_/g, ' ')}
              </span>
            </div>
          </div>

          {/* Package Selection */}
          <div>
            <label className="block text-xs text-gray-400 mb-2 font-medium flex items-center gap-1.5">
              <Package size={14} />
              Renew or Upgrade To
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {packages.map((pkg: { id: number; name: string; price: number; duration_days: number; vehicle_category: string }) => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => setSelectedPackageId(pkg.id)}
                  className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                    selectedPackageId === pkg.id
                      ? 'bg-[#2563EB]/10 border-[#2563EB]/40'
                      : 'bg-white/[0.02] border-white/10 hover:bg-white/5'
                  }`}
                >
                  <div>
                    <p className={`text-sm font-medium ${selectedPackageId === pkg.id ? 'text-white' : 'text-gray-300'}`}>
                      {pkg.name}
                      {pkg.id === userPackage.package_id && (
                        <span className="ml-2 text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">Same</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{pkg.duration_days} days · {pkg.vehicle_category}</p>
                  </div>
                  <span className="text-sm font-bold text-white">₹{pkg.price}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Payment */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium flex items-center gap-1.5">
                <CreditCard size={14} />
                Amount Paid
              </label>
              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder={selectedPkg ? `₹${selectedPkg.price}` : '₹0'}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-[#2563EB]/40"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Payment Mode</label>
              <Dropdown
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white outline-none focus:ring-2 focus:ring-[#2563EB]/40 appearance-none"
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank Transfer</option>
              </Dropdown>
            </div>
          </div>

          {/* Summary */}
          {isUpgrade && selectedPkg && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 flex items-center gap-3">
              <ArrowRight size={18} className="text-blue-400 shrink-0" />
              <p className="text-xs text-blue-300">
                Upgrading from <strong>{userPackage.package_name}</strong> to <strong>{selectedPkg.name}</strong>.
                A new subscription will be created linked to the previous one.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-white/5 text-gray-300 rounded-xl border border-white/10 hover:bg-white/10 text-sm font-medium transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleRenew}
              disabled={renewMutation.isPending}
              className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl shadow-lg text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {renewMutation.isPending ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <RefreshCw size={14} />
                  {isUpgrade ? 'Upgrade & Renew' : 'Renew Package'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
