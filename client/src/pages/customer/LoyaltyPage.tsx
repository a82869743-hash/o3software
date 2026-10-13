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
import { useReferralCode, useReferralHistory, useApplyReferral } from '../../api/hooks/useReferrals';
import { useAuthStore } from '../../store/authStore';
import Button from '../../components/ui/Button';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import ErrorState from '../../components/shared/ErrorState';
import { formatINR, formatDate } from '../../utils/formatters';
import { toast } from 'react-hot-toast';
import api from '../../api/axiosInstance';

export default function LoyaltyPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data: loyalty, isLoading, isError, refetch } = useLoyalty('mine');
  const { data: history } = useLoyaltyHistory('mine');
  
  // Referral states & queries
  const { data: referral, isLoading: isRefLoading, isError: isRefError, refetch: refetchRef } = useReferralCode(user?.id || 'mine');
  const { data: refHistory, isError: isRefHistError, refetch: refetchRefHist } = useReferralHistory(user?.id || 'mine');
  const applyReferralMutation = useApplyReferral();
  
  const [activeTab, setActiveTab] = useState<'loyalty' | 'referrals'>('loyalty');
  const [copied, setCopied] = useState(false);
  const [friendCode, setFriendCode] = useState('');
  const [redeemingWash, setRedeemingWash] = useState(false);

  const handleRedeemWash = async () => {
    try {
      setRedeemingWash(true);
      const res = await api.post('/loyalty/redeem-wash');
      toast.success(res.data?.message || 'Successfully redeemed 1000 points for 1 Free Wash!');
      refetch();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.error || 'Failed to redeem points to wash');
    } finally {
      setRedeemingWash(false);
    }
  };

  if (isError || isRefError || isRefHistError) {
    return (
      <div className="pt-4">
        <ErrorState
          message="Failed to load loyalty or referral details. Please try again."
          onRetry={() => {
            refetch();
            refetchRef();
            refetchRefHist();
          }}
        />
      </div>
    );
  }

  if (isLoading || isRefLoading) {
    return (
      <div className="pt-4 space-y-4">
        <h2 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">Loyalty & Rewards</h2>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  const points = loyalty?.points || 0;
  const pointValue = loyalty?.loyalty_settings?.point_value || 1;
  const pointsEnabled = loyalty?.loyalty_settings?.enabled !== false;

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success('Referral code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsAppShare = (code: string) => {
    const text = `Hey! Sign up at O3 Car Spaa Car Detailing using my referral code *${code}* and we both earn ${referral?.reward_points || 100} bonus reward points on your first service! Check it out:`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleApplyFriendCode = () => {
    if (!friendCode.trim()) {
      toast.error('Please enter a valid referral code');
      return;
    }
    applyReferralMutation.mutate({
      code: friendCode.trim().toUpperCase(),
      new_customer_id: user?.id || ''
    }, {
      onSuccess: () => {
        setFriendCode('');
      }
    });
  };

  return (
    <div className="pt-4 max-w-4xl mx-auto">
      {/* ── Page Header ───────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">Loyalty & Rewards</h2>
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
            onClick={() => setActiveTab('referrals')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'referrals'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Users size={14} />
            Refer & Earn
          </button>
        </div>
      </div>

      {/* ── Hero Stats Section ───────────────────────────── */}
      <div className="relative hero-bg rounded-2xl overflow-hidden mb-8 pattern-overlay">
        <div className="relative z-10 px-6 sm:px-10 py-8 sm:py-10">
          <div className="flex items-center gap-2 mb-4">
            <Gift size={16} className="text-[#2563EB]" />
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">Loyalty Account Summary</span>
          </div>
          
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
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#2563EB] via-[#2563EB]/40 to-transparent" />
      </div>

      {/* ── 1000 Points = Free Wash Info Banner ────────── */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/60 rounded-xl p-4 sm:p-5 mb-6 flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
          <Gift size={20} className="text-emerald-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
            🎉 Earn Points, Get Free Washes!
          </p>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">
            Collect <span className="font-extrabold text-emerald-700">1,000 points</span> and redeem them for a <span className="font-extrabold text-emerald-700">FREE car wash</span>! 
            You earn points automatically every time you book a service with us. Keep washing, keep earning!
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-emerald-200 shadow-sm">
              <Coins size={14} className="text-amber-500" />
              <span className="text-[11px] font-bold text-gray-700">1,000 Pts = 1 Free Wash</span>
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
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#5f5e5e]">Reward Ledger History</h3>
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
                          <p className="text-xs text-[#5f5e5e] mt-0.5">{formatDate(item.created_at)}</p>
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
              <div className="px-6 py-10 text-center text-sm text-[#5f5e5e]">
                No reward history yet. Earn points automatically by booking services with us!
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Referral Card Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Share Code Card */}
            <div className="md:col-span-2 bg-white rounded-xl p-6 border border-gray-100 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Gift size={20} className="text-[#2563EB]" />
                  Invite Friends, Earn Rewards!
                </h3>
                <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                  Share your referral link/code with friends. Once they sign up and complete their first service, we'll automatically add <span className="font-bold text-amber-600">{referral?.reward_points || 100} reward points</span> to your wallet as a thank-you!
                </p>
              </div>

              {referral ? (
                <div className="mt-6">
                  <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-2">YOUR REFERRAL CODE</p>
                  <div className="flex flex-col sm:flex-row items-stretch gap-2">
                    <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between font-mono text-lg font-black text-gray-800 tracking-wider">
                      {referral.code}
                      <button 
                        onClick={() => handleCopyCode(referral.code)}
                        className="text-gray-400 hover:text-gray-800 transition-colors p-1"
                        title="Copy code"
                      >
                        {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                      </button>
                    </div>
                    <button
                      onClick={() => handleWhatsAppShare(referral.code)}
                      className="bg-[#25D366] hover:bg-[#20ba59] text-white font-bold text-xs px-5 py-3 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
                    >
                      <Share2 size={14} />
                      Share on WhatsApp
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-3 text-[10px] text-gray-400 font-medium">
                    <span>Current Uses: {referral.current_uses} / {referral.max_uses}</span>
                    <span>Expiry: Never</span>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-gray-400">Loading referral code...</div>
              )}
            </div>

            {/* Apply Code Card */}
            <div className="bg-white rounded-xl p-6 border border-gray-100 flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
                  <Star size={18} className="text-amber-500" />
                  Have a Code?
                </h3>
                <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                  Enter a friend's referral code below to claim your welcome reward points immediately!
                </p>
              </div>

              <div className="mt-6">
                <div className="space-y-2.5">
                  <input
                    type="text"
                    value={friendCode}
                    onChange={(e) => setFriendCode(e.target.value)}
                    placeholder="ENTER FRIEND'S CODE"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-center font-mono text-sm font-bold placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                  />
                  <Button
                    onClick={handleApplyFriendCode}
                    className="w-full text-xs font-bold py-2.5"
                    loading={applyReferralMutation.isPending}
                  >
                    Claim Welcome Reward
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Referred Friends Ledger */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <Users size={16} className="text-[#2563EB]" />
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#5f5e5e]">Referred Friends Status</h3>
            </div>
            {refHistory?.length ? (
              <div className="divide-y divide-gray-50">
                {refHistory.map((item: any, idx: number) => {
                  const isCredited = item.status === 'credited';

                  return (
                    <div
                      key={item.id}
                      className="px-6 py-3.5 flex items-center justify-between hover:bg-[#F8FAFC] transition-colors opacity-0 animate-fade-in-up"
                      style={{ animationDelay: `${idx * 0.04}s`, animationFillMode: 'forwards' }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          isCredited ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'
                        }`}>
                          {isCredited ? <CheckCircle size={16} /> : <Clock size={16} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#0F172A]">{item.referred_name || 'Anonymous User'}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-[#5f5e5e]">
                            <span>Code: {item.referral_code}</span>
                            <span>•</span>
                            <span>{formatDate(item.created_at)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 ml-3 flex flex-col items-end gap-1">
                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                          isCredited 
                            ? 'text-green-700 bg-green-50 border border-green-200' 
                            : 'text-amber-700 bg-amber-50 border border-amber-200'
                        }`}>
                          {item.status}
                        </span>
                        <span className="text-xs font-bold text-gray-500">
                          +{item.reward_value} pts
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-6 py-10 text-center text-xs text-[#5f5e5e] flex flex-col items-center gap-2">
                <HelpCircle size={32} className="text-gray-300" />
                <p>No referred friends yet. Share your code to start earning reward points!</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
