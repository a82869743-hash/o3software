import { useState, useEffect } from 'react';
import { Star, Settings, Award, TrendingUp, Users, ArrowDownRight, ArrowUpRight, RefreshCw, Search } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axiosInstance';
import { useUIStore } from '../../store/uiStore';
import AdminTopBar from '../../components/layout/AdminTopBar';
import type { LoyaltySettings, LoyaltyTransaction } from '../../types';

export default function LoyaltySettingsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');

  const tabs = [
    { key: 'overview' as const, label: 'Customer Lookup', icon: Users },
    { key: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  return (
    <>
      <AdminTopBar
        title="Loyalty Program"
        subtitle="Configure & manage customer loyalty points"
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-100">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 transition-all -mb-px ${
              activeTab === tab.key
                ? 'text-[#0F172A] border-[#2563EB]'
                : 'text-[#64748B] border-transparent hover:text-[#0F172A]'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <CustomerLoyaltyLookup />}
      {activeTab === 'settings' && <LoyaltySettingsTab />}
    </>
  );
}

// ─── Customer Loyalty Lookup ────────────────
function CustomerLoyaltyLookup() {
  const [query, setQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const toast = useUIStore((s) => s.toast);

  const { data: searchResults = [], isLoading: searching } = useQuery({
    queryKey: ['loyalty-search', query],
    queryFn: async () => {
      const { data } = await api.get('/loyalty/search', { params: { q: query } });
      return data.data;
    },
  });

  const { data: transactions = [] } = useQuery<LoyaltyTransaction[]>({
    queryKey: ['loyalty-history', selectedCustomerId],
    queryFn: async () => {
      const { data } = await api.get(`/loyalty/${selectedCustomerId}/history`);
      return data.data;
    },
    enabled: !!selectedCustomerId,
  });

  const queryClient = useQueryClient();
  const earnMutation = useMutation({
    mutationFn: async (payload: { customer_id: number; amount: number }) => {
      const { data } = await api.post('/loyalty/earn', payload);
      return data;
    },
    onSuccess: (data) => {
      toast('success', data.message || 'Points awarded');
      queryClient.invalidateQueries({ queryKey: ['loyalty-search'] });
      queryClient.invalidateQueries({ queryKey: ['loyalty-history'] });
    },
    onError: () => toast('error', 'Failed to award points'),
  });

  const [earnAmount, setEarnAmount] = useState('');

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customer by name or mobile..."
          className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-[#0F172A] placeholder-gray-400 focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/40 outline-none shadow-sm"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-gray-200 border-t-[#2563EB] rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {searchResults.map((c: { id: number; name: string; mobile: string; credits: number; free_washes: number; points: number }) => (
            <button
              key={c.id}
              onClick={() => setSelectedCustomerId(c.id)}
              className={`p-4 rounded-xl border text-left transition-all ${
                selectedCustomerId === c.id
                  ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-200/50'
                  : 'bg-white border-gray-100 hover:border-gray-200 shadow-sm'
              }`}
            >
              <p className="text-[#0F172A] font-bold text-sm">{c.name}</p>
              <p className="text-xs text-[#64748B] mt-0.5">{c.mobile}</p>
              <div className="flex gap-4 mt-3">
                <div>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-[#64748B]">Points</p>
                  <p className="text-lg font-extrabold text-amber-600">{c.points || 0}</p>
                </div>
                <div>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-[#64748B]">Credits</p>
                  <p className="text-lg font-extrabold text-emerald-600">₹{c.credits || 0}</p>
                </div>
                <div>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-[#64748B]">Free Washes</p>
                  <p className="text-lg font-extrabold text-blue-600">{c.free_washes || 0}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Selected Customer Actions */}
      {selectedCustomerId && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Quick Award */}
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <h3 className="text-[#0F172A] font-bold text-sm flex items-center gap-2 mb-4">
              <Award size={18} className="text-amber-500" />
              Award Points
            </h3>
            <div className="flex gap-3">
              <input
                type="number"
                value={earnAmount}
                onChange={(e) => setEarnAmount(e.target.value)}
                placeholder="Invoice amount (₹)"
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-[#0F172A] placeholder-gray-400 outline-none focus:ring-2 focus:ring-amber-500/20"
              />
              <button
                onClick={() => {
                  if (!earnAmount || parseFloat(earnAmount) <= 0) {
                    toast('error', 'Enter a valid amount');
                    return;
                  }
                  earnMutation.mutate({ customer_id: selectedCustomerId, amount: parseFloat(earnAmount) });
                  setEarnAmount('');
                }}
                disabled={earnMutation.isPending}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-500/20 disabled:opacity-50 whitespace-nowrap"
              >
                {earnMutation.isPending ? 'Awarding...' : 'Award'}
              </button>
            </div>
            {earnMutation.data && (
              <p className="text-emerald-600 text-xs font-medium mt-2">
                +{earnMutation.data.data?.points_earned} points (Balance: {earnMutation.data.data?.new_balance})
              </p>
            )}
          </div>

          {/* Transaction History */}
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <h3 className="text-[#0F172A] font-bold text-sm flex items-center gap-2 mb-4">
              <TrendingUp size={18} className="text-blue-500" />
              Recent Transactions
            </h3>
            {transactions.length === 0 ? (
              <p className="text-[#64748B] text-sm text-center py-6">No transactions yet</p>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {transactions.slice(0, 20).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${tx.points >= 0 ? 'bg-emerald-50' : 'bg-blue-50'}`}>
                        {tx.points >= 0 ? (
                          <ArrowUpRight size={14} className="text-emerald-600" />
                        ) : (
                          <ArrowDownRight size={14} className="text-blue-500" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#0F172A]">{tx.description || tx.type}</p>
                        <p className="text-[10px] text-[#64748B]">
                          {new Date(tx.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-extrabold tabular-nums ${tx.points >= 0 ? 'text-emerald-600' : 'text-blue-500'}`}>
                        {tx.points >= 0 ? '+' : ''}{tx.points}
                      </p>
                      <p className="text-[10px] text-[#64748B] tabular-nums">Bal: {tx.balance_after}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Loyalty Settings Tab ───────────────────
function LoyaltySettingsTab() {
  const toast = useUIStore((s) => s.toast);
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<LoyaltySettings>({
    queryKey: ['loyalty-settings'],
    queryFn: async () => {
      const { data } = await api.get('/loyalty/settings');
      return data.data;
    },
  });

  const [form, setForm] = useState<Partial<LoyaltySettings>>({});

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (payload: Partial<LoyaltySettings>) => {
      const { data } = await api.patch('/loyalty/settings', payload);
      return data;
    },
    onSuccess: (data) => {
      toast('success', data.message || 'Settings saved');
      queryClient.invalidateQueries({ queryKey: ['loyalty-settings'] });
    },
    onError: () => toast('error', 'Failed to update settings'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-3 border-gray-200 border-t-[#2563EB] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-white border border-gray-100 rounded-xl p-6 space-y-5 shadow-sm">
        <h3 className="text-[#0F172A] font-bold text-sm flex items-center gap-2">
          <Settings size={18} className="text-gray-400" />
          Loyalty Configuration
        </h3>

        <div>
          <label className="block text-xs text-[#64748B] mb-1.5 font-bold uppercase tracking-widest">Points Ratio (₹ per 1 point)</label>
          <input
            type="number"
            value={form.points_ratio || ''}
            onChange={(e) => setForm((f) => ({ ...f, points_ratio: parseFloat(e.target.value) }))}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-[#0F172A] outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/30"
          />
          <p className="text-[11px] text-[#64748B] mt-1">Customer earns 1 point for every ₹{form.points_ratio || 100} spent</p>
        </div>

        <div>
          <label className="block text-xs text-[#64748B] mb-1.5 font-bold uppercase tracking-widest">Point Value (₹ per point)</label>
          <input
            type="number"
            value={form.point_value || ''}
            onChange={(e) => setForm((f) => ({ ...f, point_value: parseFloat(e.target.value) }))}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-[#0F172A] outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/30"
          />
          <p className="text-[11px] text-[#64748B] mt-1">1 point = ₹{form.point_value || 1} when redeemed</p>
        </div>

        <div>
          <label className="block text-xs text-[#64748B] mb-1.5 font-bold uppercase tracking-widest">Minimum Redeem Points</label>
          <input
            type="number"
            value={form.min_redeem || ''}
            onChange={(e) => setForm((f) => ({ ...f, min_redeem: parseFloat(e.target.value) }))}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-[#0F172A] outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/30"
          />
        </div>

        <div>
          <label className="block text-xs text-[#64748B] mb-1.5 font-bold uppercase tracking-widest">Points for 1 Free Wash</label>
          <input
            type="number"
            min={1}
            step={1}
            value={form.free_wash_points || ''}
            onChange={(e) => setForm((f) => ({ ...f, free_wash_points: parseInt(e.target.value, 10) }))}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-[#0F172A] outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/30"
          />
          <p className="text-[11px] text-[#64748B] mt-1">Customers see this on their Loyalty page</p>
        </div>

        <div className="flex items-center justify-between py-3 border-t border-gray-100">
          <div>
            <p className="text-sm text-[#0F172A] font-bold">Loyalty program on / off</p>
            <p className="text-xs text-[#64748B]">When off, no points are given on any bill. Turn on again anytime.</p>
          </div>
          <button
            onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
            className={`w-12 h-6 rounded-full transition-all relative ${
              form.enabled ? 'bg-emerald-500' : 'bg-gray-300'
            }`}
          >
            <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all shadow-sm ${
              form.enabled ? 'left-[26px]' : 'left-0.5'
            }`} />
          </button>
        </div>

        <button
          onClick={() => updateMutation.mutate(form)}
          disabled={updateMutation.isPending}
          className="w-full py-2.5 bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-white rounded-xl text-sm font-bold shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 hover:shadow-xl transition-shadow"
        >
          {updateMutation.isPending ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <RefreshCw size={14} />
              Save Settings
            </>
          )}
        </button>
      </div>
    </div>
  );
}
