import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Gift, CheckCircle, Clock, Plus, Search, Star } from 'lucide-react';
import { useCustomerRewards, useAwardWelcomeReward, useRedeemReward } from '../../api/hooks/useCustomerRewards';
import api from '../../api/axiosInstance';
import PremiumPageHeader from '../../components/shared/PremiumPageHeader';
import { PageTransition, AnimatedCard, RippleButton, AnimatedModal } from '../../components/ui/Animations';


export default function CustomerRewardsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAwardModal, setShowAwardModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  useEffect(() => {
    if (showAwardModal) {
      setLoadingCustomers(true);
      api.get('/customers')
        .then(res => {
          if (res.data.success) {
            setCustomers(res.data.data);
          }
        })
        .catch(err => console.error(err))
        .finally(() => setLoadingCustomers(false));
    }
  }, [showAwardModal]);

  const { data: rewardsData, isLoading } = useCustomerRewards(statusFilter ? { redeemed: statusFilter === 'redeemed' } : undefined);

  const awardWelcome = useAwardWelcomeReward();
  const redeemReward = useRedeemReward();

  const handleAward = () => {
    if (!selectedCustomerId) return;
    awardWelcome.mutate({ customer_id: selectedCustomerId }, {
      onSuccess: () => {
        setShowAwardModal(false);
        setSelectedCustomerId('');
      }
    });
  };

  const handleRedeem = (id: number) => {
    if (window.confirm('Mark this reward as redeemed?')) {
      redeemReward.mutate(id);
    }
  };

  const rewards = rewardsData?.data || [];
  
  // Filter rewards locally if search is present
  const filteredRewards = rewards.filter((r: any) => {
    if (!search) return true;
    return r.customer_name?.toLowerCase().includes(search.toLowerCase()) || 
           r.customer_mobile?.includes(search);
  });

  return (
    <PageTransition className="p-4 sm:p-6 max-w-7xl mx-auto">
      <PremiumPageHeader
        title="Customer Rewards"
        subtitle="Manage welcome rewards, points, and promotional discounts"
        icon={Gift}
        iconColor="#E91E63"
        accentGradient="from-pink-600 to-pink-500"
        badge="LOYALTY"
        actions={
          <RippleButton onClick={() => setShowAwardModal(true)} variant="primary" className="bg-[#E91E63] hover:bg-[#d81b60]">
            <Plus size={14} className="mr-1" /> Award Welcome
          </RippleButton>
        }
      />

      {/* Filters */}
      <AnimatedCard className="bg-white rounded-2xl border border-gray-100 p-4 mb-6 flex flex-wrap items-center gap-3" delay={0.2}>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="Search by customer name or mobile..." 
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500" 
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-pink-500/20">
          <option value="">All Statuses</option>
          <option value="active">Active (Not Redeemed)</option>
          <option value="redeemed">Redeemed</option>
        </select>
      </AnimatedCard>

      {/* Rewards Table */}
      <AnimatedCard className="bg-white rounded-2xl border border-gray-100 overflow-hidden" delay={0.3}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Customer</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Reward Type</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Benefits</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Expiry</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => <tr key={i}><td colSpan={6} className="py-4 px-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>)
              ) : filteredRewards.map((r: any, i: number) => {
                const isExpired = r.expires_at ? new Date(r.expires_at) < new Date() : false;
                return (
                  <motion.tr 
                    key={r.id || i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="border-b border-gray-50 hover:bg-gray-50/50"
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-[#0F172A]">{r.customer_name || `Customer #${r.customer_id}`}</div>
                      <div className="text-[11px] text-gray-400">{r.customer_mobile || ''}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-lg uppercase tracking-wider">{r.reward_type}</span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {r.points_awarded > 0 && <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium mr-2"><Star size={12} /> {r.points_awarded} pts</span>}
                      {r.discount_pct > 0 && <span className="text-emerald-600 text-xs font-medium">{r.discount_pct}% Off</span>}
                      <div className="text-[10px] text-gray-400 mt-0.5">{r.description}</div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {r.redeemed ? (
                        <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-medium uppercase">Redeemed</span>
                      ) : isExpired ? (
                        <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full font-medium uppercase">Expired</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full font-medium uppercase">Active</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center text-gray-500 text-xs">
                      {r.expires_at ? new Date(r.expires_at).toLocaleDateString('en-IN') : 'No Expiry'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {!r.redeemed && !isExpired && (
                        <button 
                          onClick={() => handleRedeem(r.id)}
                          className="text-xs font-medium text-[#E91E63] hover:text-[#d81b60] bg-pink-50 hover:bg-pink-100 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Redeem
                        </button>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          {!filteredRewards.length && !isLoading && (
            <div className="text-center py-12">
              <Gift size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">No rewards found</p>
            </div>
          )}
        </div>
      </AnimatedCard>

      {/* Award Modal */}
      <AnimatedModal isOpen={showAwardModal} onClose={() => setShowAwardModal(false)}>
        <div className="p-6">
          <h3 className="text-xl font-bold text-[#0F172A] mb-6 flex items-center gap-2">
            <Gift size={20} className="text-[#E91E63]" /> Award Welcome Reward
          </h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Select Customer</label>
              <select 
                value={selectedCustomerId} 
                onChange={e => setSelectedCustomerId(e.target.value)} 
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
              >
                <option value="">-- Choose Customer --</option>
                {loadingCustomers ? (
                  <option disabled>Loading customers...</option>
                ) : (
                  customers.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.mobile})
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="bg-pink-50 border border-pink-100 p-4 rounded-xl flex items-start gap-3">
              <Star className="text-[#E91E63] shrink-0 mt-0.5" size={18} />
              <div>
                <h4 className="text-sm font-bold text-[#E91E63]">Welcome Package</h4>
                <p className="text-xs text-pink-700 mt-1">Customer will receive 500 Loyalty Points and a 10% discount on their first service. Valid for 30 days.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <RippleButton variant="ghost" onClick={() => setShowAwardModal(false)}>Cancel</RippleButton>
              <RippleButton variant="primary" onClick={handleAward} className={`bg-[#E91E63] hover:bg-[#d81b60] ${(!selectedCustomerId || awardWelcome.isPending) ? 'opacity-50 pointer-events-none' : ''}`}>
                {awardWelcome.isPending ? 'Awarding...' : 'Award Reward'}
              </RippleButton>
            </div>
          </div>
        </div>
      </AnimatedModal>
    </PageTransition>
  );
}
