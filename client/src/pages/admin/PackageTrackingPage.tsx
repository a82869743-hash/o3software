import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers, Search, CheckCircle, Clock, BarChart3, Eye, AlertTriangle, RefreshCw
} from 'lucide-react';
import { useAllUserPackages, useRenewPackage } from '../../api/hooks/useUserPackages';
import PremiumPageHeader from '../../components/shared/PremiumPageHeader';
import PremiumStatCard from '../../components/shared/PremiumStatCard';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { useUIStore } from '../../store/uiStore';

export default function PackageTrackingPage() {
  const navigate = useNavigate();
  const toast = useUIStore((s) => s.toast);

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Fetch all user packages
  const { data: allPackages, isLoading, refetch } = useAllUserPackages({
    status: statusFilter,
    search: searchQuery,
  });

  // Renewal Mutation
  const renewMut = useRenewPackage();
  const [renewModalOpen, setRenewModalOpen] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState<any>(null);
  const [renewAmount, setRenewAmount] = useState<string>('');
  const [renewMode, setRenewMode] = useState<string>('cash');

  const handleOpenRenew = (pkg: any) => {
    setSelectedPkg(pkg);
    setRenewAmount(String(pkg.price_paid || 0));
    setRenewMode('cash');
    setRenewModalOpen(true);
  };

  const handleConfirmRenew = async () => {
    if (!selectedPkg) return;
    try {
      await renewMut.mutateAsync({
        user_package_id: selectedPkg.id,
        payment_amount: parseFloat(renewAmount) || 0,
        payment_mode: renewMode,
      });
      toast('success', 'Package renewed successfully');
      setRenewModalOpen(false);
      setSelectedPkg(null);
      refetch();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to renew package');
    }
  };

  // Compute stat totals from all records (unfiltered)
  const unfilteredPackages = allPackages || [];
  
  const totalSubscribed = unfilteredPackages.length;
  const totalActive = unfilteredPackages.filter((p: any) => p.package_status === 'active').length;
  const totalExpired = unfilteredPackages.filter((p: any) => p.package_status === 'expired').length;
  const totalExpiringSoon = unfilteredPackages.filter(
    (p: any) => p.package_status === 'active' && p.days_remaining !== null && p.days_remaining <= 30
  ).length;

  const totalRevenue = unfilteredPackages
    .filter((p: any) => p.payment_status === 'paid' || p.payment_status === 'completed')
    .reduce((sum: number, p: any) => sum + (parseFloat(p.price_paid) || 0), 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <PremiumPageHeader
        title="Package Subscriptions Tracking"
        subtitle="Live tracking dashboard for customer packages, usage balances, and renewals."
        icon={Layers}
        iconColor="#2563EB"
        accentGradient="from-blue-600 to-indigo-600"
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PremiumStatCard
          title="Total Subscriptions"
          value={totalSubscribed}
          icon={Layers}
          color="#2563EB"
          gradient="from-blue-500/10 to-indigo-400/5"
          delay={0.1}
        />
        <PremiumStatCard
          title="Active Packages"
          value={totalActive}
          icon={CheckCircle}
          color="#10B981"
          gradient="from-emerald-500/10 to-teal-400/5"
          delay={0.2}
        />
        <PremiumStatCard
          title="Expiring Soon (≤30 Days)"
          value={totalExpiringSoon}
          icon={Clock}
          color="#F59E0B"
          gradient="from-amber-500/10 to-yellow-400/5"
          delay={0.3}
        />
        <PremiumStatCard
          title="Total Revenue"
          value={totalRevenue}
          prefix="₹"
          icon={BarChart3}
          color="#8B5CF6"
          gradient="from-purple-500/10 to-indigo-400/5"
          delay={0.4}
        />
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by customer name, mobile, registration number, or package name..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="w-full md:w-48">
          <select
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="renewed">Renewed</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="animate-spin text-blue-600 w-8 h-8" />
            <p className="text-sm text-gray-500">Loading package records...</p>
          </div>
        ) : unfilteredPackages.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center">
              <Layers className="text-gray-400 w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">No Packages Found</h3>
            <p className="text-xs text-gray-500">There are no package records matching the current filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Customer</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Vehicle / Segment</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Package Detail</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Start & End</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Days Left</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Usage Status</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allPackages.map((pkg: any) => {
                  let daysLeftColor = 'text-green-700 bg-green-50 border-green-200';
                  let daysLeftText = `${pkg.days_remaining} Days`;

                  if (pkg.package_status === 'expired') {
                    daysLeftColor = 'text-blue-700 bg-blue-50 border-blue-200';
                    daysLeftText = 'Expired';
                  } else if (pkg.package_status === 'renewed') {
                    daysLeftColor = 'text-gray-600 bg-gray-50 border-gray-200';
                    daysLeftText = 'Renewed';
                  } else if (pkg.days_remaining === null) {
                    daysLeftColor = 'text-gray-600 bg-gray-50 border-gray-200';
                    daysLeftText = 'Unlimited';
                  } else if (pkg.days_remaining === 0) {
                    daysLeftColor = 'text-blue-700 bg-blue-50 border-blue-200';
                    daysLeftText = 'Expires Today';
                  } else if (pkg.days_remaining <= 30) {
                    daysLeftColor = 'text-amber-700 bg-amber-50 border-amber-200';
                  }

                  return (
                    <tr key={pkg.id} className="hover:bg-gray-50/50 transition-colors">
                      {/* Customer Info */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900">{pkg.customer_name}</span>
                          <span className="text-xs text-gray-500">{pkg.customer_mobile}</span>
                        </div>
                      </td>

                      {/* Vehicle Info */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          {pkg.vehicle_reg_no ? (
                            <>
                              <span className="font-medium text-gray-900">{pkg.vehicle_reg_no}</span>
                              <span className="text-xs text-gray-500">
                                {pkg.vehicle_brand} {pkg.vehicle_model}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-gray-400">No vehicle linked</span>
                          )}
                          <span className="inline-block w-fit mt-1 text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                            {pkg.vehicle_segment || 'General'}
                          </span>
                        </div>
                      </td>

                      {/* Package Info */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900">{pkg.package_name}</span>
                          <span className="text-xs text-gray-500">Price Paid: ₹{parseFloat(pkg.price_paid || 0).toLocaleString('en-IN')}</span>
                          <span className={`inline-block w-fit mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            pkg.package_status === 'active' ? 'bg-emerald-100 text-emerald-800' :
                            pkg.package_status === 'expired' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {pkg.package_status.toUpperCase()}
                          </span>
                        </div>
                      </td>

                      {/* Dates */}
                      <td className="py-4 px-4 text-xs text-gray-600">
                        <div className="flex flex-col space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-400 w-10">Start:</span>
                            <span className="font-medium">{new Date(pkg.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-400 w-10">End:</span>
                            <span className="font-medium">{pkg.end_date ? new Date(pkg.end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Lifetime'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Days Left */}
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${daysLeftColor}`}>
                          {daysLeftText}
                        </span>
                      </td>

                      {/* Usage */}
                      <td className="py-4 px-4 text-xs">
                        <div className="space-y-1.5 max-w-[200px]">
                          {(pkg.usage || []).map((u: any, idx: number) => {
                            const pct = Math.min(100, Math.round((u.used_count / u.total_count) * 100));
                            return (
                              <div key={idx} className="space-y-0.5">
                                <div className="flex justify-between text-[10px] font-medium">
                                  <span className="text-gray-700 truncate w-32">{u.service_name}</span>
                                  <span className="text-gray-900 font-bold">{u.used_count}/{u.total_count}</span>
                                </div>
                                <div className="w-full bg-gray-100 h-1 rounded-full overflow-hidden">
                                  <div
                                    className="bg-blue-600 h-full rounded-full transition-all duration-300"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="p-1.5 rounded-lg"
                            title="View Customer Profile"
                            onClick={() => navigate(`/admin/customers/${pkg.user_id}`)}
                          >
                            <Eye size={15} />
                          </Button>
                          {(pkg.package_status === 'expired' || (pkg.package_status === 'active' && pkg.days_remaining !== null && pkg.days_remaining <= 30)) && (
                            <Button
                              variant="primary"
                              size="sm"
                              className="flex items-center gap-1 text-xs"
                              onClick={() => handleOpenRenew(pkg)}
                            >
                              <RefreshCw size={12} />
                              Renew
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Renewal Dialog Modal */}
      {renewModalOpen && selectedPkg && (
        <Modal
          open={renewModalOpen}
          onClose={() => setRenewModalOpen(false)}
          title={`Renew Package: ${selectedPkg.package_name}`}
        >
          <div className="space-y-4 py-2">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
              <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
              <div className="text-xs text-amber-800 space-y-1">
                <p className="font-semibold">Confirming Package Renewal</p>
                <p>This action will reset the wash/wax/detailing remaining counts for {selectedPkg.customer_name} to their default values and start a new subscription cycle.</p>
              </div>
            </div>

            <Input
              label="Original Price Paid"
              type="text"
              disabled
              value={`₹${parseFloat(selectedPkg.price_paid || 0).toLocaleString('en-IN')}`}
            />

            <Input
              label="Renewal Payment Amount (₹) *"
              type="number"
              placeholder="Enter amount collected"
              value={renewAmount}
              onChange={(e) => setRenewAmount(e.target.value)}
            />

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700">Payment Mode *</label>
              <select
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                value={renewMode}
                onChange={(e) => setRenewMode(e.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI Manual</option>
                <option value="card">Credit/Debit Card</option>
                <option value="razorpay">Razorpay Online</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="secondary" onClick={() => setRenewModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmRenew}
                disabled={renewMut.isPending}
                className="flex items-center gap-1.5"
              >
                {renewMut.isPending && <RefreshCw size={14} className="animate-spin" />}
                Confirm Renewal
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
