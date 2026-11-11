import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CreditCard, 
  Droplets, 
  Sparkles, 
  Gift, 
  TrendingUp, 
  Star, 
  ArrowUpRight, 
  ArrowDownRight, 
  Coins, 
  Copy, 
  Check, 
  Share2, 
  Users, 
  Clock, 
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import { useLoyalty, useLoyaltyHistory } from '../../api/hooks/useLoyalty';
import { useAuthStore } from '../../store/authStore';
import Button from '../../components/ui/Button';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import ErrorState from '../../components/shared/ErrorState';
import { formatINR, formatDate } from '../../utils/formatters';
import { toast } from 'react-hot-toast';
import PhotoBanner from '../../components/customer/PhotoBanner';
import { PHOTOS as BANNER_PHOTOS } from '../../components/customer/serviceVisuals';
import api from '../../api/axiosInstance';

export default function LoyaltyPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data: loyalty, isLoading, isError, refetch } = useLoyalty('mine');
  const { data: history } = useLoyaltyHistory('mine');
  
  
  const [activeTab, setActiveTab] = useState<'loyalty' | 'referrals'>('loyalty');
  const [redeemingWash, setRedeemingWash] = useState(false);

  const handleRedeemWash = async () => {
    try {
      setRedeemingWash(true);
      const res = await api.post('/loyalty/redeem-wash');
      toast.success(res.data?.message || 'Redeemed points for 1 free wash');
      refetch();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.error || 'Failed to redeem points to wash');
    } finally {
      setRedeemingWash(false);
    }
  };

  if (isError) {
    return (
      <div className="pt-4">
        <ErrorState message="Failed to load your rewards. Please try again." onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="pt-4 space-y-4">
        <h2 className="sr-only">Loyalty & Rewards</h2>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  const points = loyalty?.points || 0;
  const pointValue = loyalty?.loyalty_settings?.point_value || 1;
  const pointsEnabled = loyalty?.loyalty_settings?.enabled !== false;
  const washPts = Number(loyalty?.loyalty_settings?.free_wash_points) || 1000;


  return (
    <div className="pt-4 max-w-4xl mx-auto">
      {/* ── Page Header ───────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="sr-only">Loyalty & Rewards</h2>
          <p className="text-xs text-gray-500 mt-1">Manage your loyalty wallet, redeem reward points, and refer friends.</p>
        </div>
        
        {/* Tab Switcher */}
        <div className="flex bg-gray-100 p-1 rounded-xl w-fit border border-gray-200/50">
          <button
            onClick={() => setActiveTab('loyalty')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'loyalty'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Coins size={14} />
            Loyalty Wallet
          </button>
          <button
            onClick={() => navigate('/customer/refer')}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all text-gray-500 hover:text-gray-900"
          >
            <Users size={14} />
            Refer & Earn
          </button>
        </div>
      </div>

      {/* ── Hero Stats Section ───────────────────────────── */}
      <div className="relative hero-bg rounded-2xl overflow-hidden mb-8 pattern-overlay">
        <img src={BANNER_PHOTOS.beading} alt="" className="absolute inset-0 w-full h-full object-cover opacity-45" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F4D]/85 via-[#0B1F4D]/55 to-transparent" />
        <div className="relative z-10 px-6 sm:px-10 py-8 sm:py-10">
          <div className="flex items-center gap-2 mb-4">
            <Gift size={16} className="text-[#2563EB]" />
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">Loyalty Account Summary</span>
          </div>
          
          {!(points > 0 || Number(loyalty?.credits) > 0 || Number(loyalty?.free_washes) > 0 || Number(loyalty?.wax_count) > 0) ? (
            <div>
              <p className="text-lg font-black text-white">No rewards yet</p>
              <p className="text-xs text-white/70 mt-1">You earn points with every completed service. They will show up here.</p>
            </div>
          ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
            {pointsEnabled && (
              <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '0.05s', animationFillMode: 'forwards' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Points Balance</p>
                <p className="text-2xl sm:text-3xl font-black text-amber-400 tracking-tight">{points}</p>
                <p className="text-[10px] text-gray-400 mt-1">Worth {formatINR(points * pointValue)}</p>
                <div className="w-12 h-1 bg-amber-400 rounded-full mt-2" />
              </div>
            )}
            <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Reward Points</p>
              <p className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {Math.round(loyalty?.credits || 0)} <span className="text-sm font-bold text-gray-400">Pts</span>
              </p>
              <p className="text-[10px] text-gray-400 mt-1">Points Balance</p>
              <div className="w-12 h-1 bg-[#2563EB] rounded-full mt-2" />
            </div>
            <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Free Washes</p>
              <p className="text-2xl sm:text-3xl font-black text-white tracking-tight">{loyalty?.free_washes || 0}</p>
              <p className="text-[10px] text-gray-400 mt-1">Available</p>
              <div className="w-12 h-1 bg-blue-500 rounded-full mt-2" />
            </div>
            <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Wax Treatments</p>
              <p className="text-2xl sm:text-3xl font-black text-white tracking-tight">{loyalty?.wax_count || 0}</p>
              <p className="text-[10px] text-gray-400 mt-1">Accrued</p>
              <div className="w-12 h-1 bg-purple-500 rounded-full mt-2" />
            </div>
          </div>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#2563EB] via-[#2563EB]/40 to-transparent" />
      </div>

      {/* ── Points = Free Wash Info Banner (points come from Loyalty settings) ── */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/60 rounded-xl p-4 sm:p-5 mb-6 flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
          <Gift size={20} className="text-emerald-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
            🎉 Earn Points, Get Free Washes!
          </p>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">
            Collect <span className="font-extrabold text-emerald-700">{washPts.toLocaleString('en-IN')} points</span> and redeem them for a <span className="font-extrabold text-emerald-700">FREE car wash</span>! 
            You earn points automatically every time you book a service with us. Keep washing, keep earning!
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-emerald-200 shadow-sm">
              <Coins size={14} className="text-amber-500" />
              <span className="text-[11px] font-bold text-gray-700">{washPts.toLocaleString('en-IN')} Pts = 1 Free Wash</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Active Tab Content ──────────────────────────── */}
      {activeTab === 'loyalty' ? (
        <div className="space-y-6">
          {/* Points Info Banner */}
          {pointsEnabled && points > 0 && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-xl p-4 sm:p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <Coins size={20} className="text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900">You have {points} reward points!</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Your points are worth {formatINR(points * pointValue)}. Points are automatically applied on your next service.
                </p>
              </div>
            </div>
          )}

          {/* Transaction History */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <TrendingUp size={16} className="text-[#2563EB]" />
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#64748B]">Reward Ledger History</h3>
            </div>
            {history?.length ? (
              <div className="divide-y divide-gray-50">
                {history.map((item: any, idx: number) => {
                  const isPointTx = item.type && ['earn', 'redeem', 'bonus', 'adjustment', 'expire'].includes(item.type);
                  const isPositive = isPointTx ? item.points >= 0 : item.amount > 0;

                  return (
                    <div
                      key={item.id}
                      className="px-6 py-3.5 flex items-center justify-between hover:bg-[#F8FAFC] transition-colors opacity-0 animate-fade-in-up"
                      style={{ animationDelay: `${idx * 0.04}s`, animationFillMode: 'forwards' }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                          isPositive ? 'bg-green-100' : 'bg-blue-50'
                        }`}>
                          {isPositive
                            ? <ArrowUpRight size={14} className="text-green-600" />
                            : <ArrowDownRight size={14} className="text-blue-500" />
                          }
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#0F172A]">{item.description}</p>
                          <p className="text-xs text-[#64748B] mt-0.5">{formatDate(item.created_at)}</p>
                        </div>
                      </div>

                      <div className="text-right shrink-0 ml-3">
                        {isPointTx ? (
                          <span className={`text-sm font-extrabold px-2.5 py-1 rounded-lg ${
                            isPositive ? 'text-green-600 bg-green-50' : 'text-blue-500 bg-blue-50'
                          }`}>
                            {isPositive ? '+' : ''}{item.points} pts
                          </span>
                        ) : item.amount > 0 ? (
                          <span className="text-sm font-extrabold text-green-600 bg-green-50 px-2.5 py-1 rounded-lg">
                            +{formatINR(item.amount)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-6 py-10 text-center text-sm text-[#64748B]">
                No reward history yet. Earn points automatically by booking services with us!
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
