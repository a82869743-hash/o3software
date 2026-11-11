import { ymd } from '../../utils/formatters';
import { useState } from 'react';
import api from '../../api/axiosInstance';
import { motion } from 'framer-motion';
import { Wallet, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Download, Calendar, DollarSign, Receipt, PieChart } from 'lucide-react';
import { useBalanceSheet, useExpenses, useExpenseCategories, useCreateExpense } from '../../api/hooks/useBalanceSheet';
import PremiumPageHeader from '../../components/shared/PremiumPageHeader';
import PremiumStatCard from '../../components/shared/PremiumStatCard';
import { PageTransition, AnimatedCard, RippleButton, AnimatedModal, StaggerList, StaggerItem } from '../../components/ui/Animations';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell } from 'recharts';
import Dropdown from '../../components/ui/Dropdown';

const COLORS = ['#2563EB', '#FF5722', '#FF9800', '#4CAF50', '#2196F3', '#9C27B0', '#607D8B', '#795548'];

export default function BalanceSheetPage() {
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ category_id: '', amount: '', description: '', expense_date: ymd(), payment_method: 'cash', gst_amount: '0' });

  const { data: sheet, isLoading } = useBalanceSheet(dateRange.from ? dateRange : undefined);
  const { data: expensesData } = useExpenses();
  const { data: categories } = useExpenseCategories();
  const createExpense = useCreateExpense();

  const handleCreateExpense = () => {
    createExpense.mutate({ ...expenseForm, amount: parseFloat(expenseForm.amount), gst_amount: parseFloat(expenseForm.gst_amount || '0') }, {
      onSuccess: () => { setShowExpenseModal(false); setExpenseForm({ category_id: '', amount: '', description: '', expense_date: ymd(), payment_method: 'cash', gst_amount: '0' }); }
    });
  };

  const chartData = sheet?.expenses?.by_category?.map((c: any, i: number) => ({ name: c.category, value: parseFloat(c.total), fill: COLORS[i % COLORS.length] })) || [];

  const [marginMode, setMarginMode] = useState<'auto' | 'manual'>('manual');
  const [manualMargin, setManualMargin] = useState<number>(35);

  const rawTotalRevenue = sheet?.income?.total || 0;
  const rawTotalExpenses = sheet?.expenses?.total || 0;
  const rawNetProfit = sheet?.net_profit || 0;
  const rawMargin = parseFloat(sheet?.profit_margin || '0');

  // Compute displayed metrics based on marginMode (Automatic vs Admin Manual Margin Setting)
  const displayMargin = marginMode === 'manual'
    ? manualMargin
    : (rawTotalExpenses === 0 && rawTotalRevenue > 0 ? manualMargin : rawMargin);

  const displayProfit = marginMode === 'manual'
    ? Math.round(rawTotalRevenue * (manualMargin / 100))
    : (rawTotalExpenses === 0 && rawTotalRevenue > 0 ? Math.round(rawTotalRevenue * (manualMargin / 100)) : rawNetProfit);

  const displayExpenses = marginMode === 'manual'
    ? Math.max(0, rawTotalRevenue - displayProfit)
    : (rawTotalExpenses === 0 && rawTotalRevenue > 0 ? Math.max(0, rawTotalRevenue - displayProfit) : rawTotalExpenses);

  return (
    <PageTransition className="p-4 sm:p-6 max-w-7xl mx-auto">
      <PremiumPageHeader
        title="Balance Sheet"
        subtitle="Revenue, expenses, and profit/loss overview"
        icon={Wallet}
        iconColor="#4CAF50"
        accentGradient="from-emerald-600 to-emerald-500"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={dateRange.from} onChange={e => setDateRange(p => ({ ...p, from: e.target.value }))} className="text-xs border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
            <span className="text-gray-400 text-xs">to</span>
            <input type="date" value={dateRange.to} onChange={e => setDateRange(p => ({ ...p, to: e.target.value }))} className="text-xs border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
            <RippleButton onClick={() => setShowExpenseModal(true)} variant="primary">+ Add Expense</RippleButton>
          </div>
        }
      />

      {/* Manual Margin & Overhead Configuration Banner */}
      <AnimatedCard className="bg-slate-900 text-white rounded-2xl p-5 mb-6 border border-slate-800 shadow-md" delay={0.1}>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">Profit Margin Configuration</h3>
              <span className="text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                ADMIN CONTROL
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Adjust manual profit margin & overhead cost percentage for realistic financial calculations.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
            {/* Mode Switcher */}
            <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setMarginMode('manual')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  marginMode === 'manual'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Manual Margin
              </button>
              <button
                type="button"
                onClick={() => setMarginMode('auto')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  marginMode === 'auto'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Real DB Expenses
              </button>
            </div>

            {/* Slider & Input */}
            {marginMode === 'manual' && (
              <div className="flex items-center gap-3 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
                <span className="text-xs text-slate-300 font-semibold">Margin Target:</span>
                <input
                  type="range"
                  min="5"
                  max="90"
                  step="1"
                  value={manualMargin}
                  onChange={(e) => setManualMargin(parseFloat(e.target.value))}
                  className="w-24 accent-emerald-500 cursor-pointer"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={manualMargin}
                    onChange={(e) => setManualMargin(Math.max(1, Math.min(100, parseFloat(e.target.value) || 0)))}
                    className="w-14 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-extrabold text-emerald-400 text-center focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-xs font-bold text-emerald-400">%</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </AnimatedCard>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <PremiumStatCard title="Total Revenue" value={rawTotalRevenue} prefix="₹" icon={TrendingUp} color="#4CAF50" gradient="from-emerald-500/10 to-emerald-400/5" delay={0} />
            <PremiumStatCard title="Expenses & Overhead" value={displayExpenses} prefix="₹" icon={TrendingDown} color="#F44336" gradient="from-blue-500/10 to-blue-400/5" delay={0.1} />
            <PremiumStatCard title="Net Profit" value={displayProfit} prefix="₹" icon={DollarSign} color={displayProfit >= 0 ? '#4CAF50' : '#F44336'} delay={0.2} />
            <PremiumStatCard title="Profit Margin" value={displayMargin} suffix="%" icon={PieChart} color="#2196F3" gradient="from-blue-500/10 to-blue-400/5" delay={0.3} decimals={1} />
          </div>

          {/* Income & Expense Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <AnimatedCard className="bg-white rounded-2xl border border-gray-100 p-6" delay={0.2}>
              <h3 className="text-lg font-bold text-[#0F172A] mb-4 flex items-center gap-2">
                <ArrowUpRight size={18} className="text-emerald-500" /> Income Breakdown
              </h3>
              <div className="space-y-3">
                {[
                  { label: 'Job Card Revenue', value: sheet?.income?.job_revenue, color: '#4CAF50' },
                  { label: 'Package Sales', value: sheet?.income?.package_revenue, color: '#2196F3' },
                  { label: 'Manual Billing', value: sheet?.income?.bill_revenue, color: '#FF9800' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm text-gray-700">{item.label}</span>
                    </div>
                    <span className="text-sm font-bold text-[#0F172A]">₹{(item.value || 0).toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            </AnimatedCard>

            <AnimatedCard className="bg-white rounded-2xl border border-gray-100 p-6" delay={0.3}>
              <h3 className="text-lg font-bold text-[#0F172A] mb-4 flex items-center gap-2">
                <ArrowDownRight size={18} className="text-blue-500" /> Expense Distribution
              </h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <RechartsPie>
                    <Pie data={chartData} cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2} dataKey="value" label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {chartData.map((entry: any, index: number) => <Cell key={index} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString('en-IN')}`} />
                  </RechartsPie>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 text-center py-12">No expense data for this period</p>
              )}
            </AnimatedCard>
          </div>

          {/* Recent Expenses Table */}
          <AnimatedCard className="bg-white rounded-2xl border border-gray-100 p-6" delay={0.4}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#0F172A] flex items-center gap-2"><Receipt size={18} /> Recent Expenses</h3>
              <RippleButton variant="ghost" onClick={async () => {
                try {
                  const res = await api.get('/balance-sheet/export', { params: { from: dateRange.from || undefined, to: dateRange.to || undefined, format: 'excel' }, responseType: 'blob' });
                  const url = URL.createObjectURL(res.data);
                  const a = document.createElement('a'); a.href = url; a.download = `O3CarSpaa_BalanceSheet_${dateRange.from || 'all'}_${dateRange.to || 'today'}.xlsx`; a.click();
                  URL.revokeObjectURL(url);
                } catch { /* error toast by interceptor message */ }
              }}><Download size={14} className="mr-1" /> Export Excel</RippleButton>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100"><th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Date</th><th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Category</th><th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Description</th><th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Amount</th><th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">GST</th></tr></thead>
                <tbody>
                  {(expensesData?.data || []).slice(0, 10).map((exp: any, i: number) => (
                    <motion.tr key={exp.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-3 px-4 text-gray-600">{new Date(exp.expense_date).toLocaleDateString('en-IN')}</td>
                      <td className="py-3 px-4"><span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs font-medium">{exp.category_name}</span></td>
                      <td className="py-3 px-4 text-gray-700">{exp.description || '—'}</td>
                      <td className="py-3 px-4 text-right font-semibold text-[#0F172A]">₹{parseFloat(exp.amount).toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4 text-right text-gray-500">₹{parseFloat(exp.gst_amount || 0).toLocaleString('en-IN')}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
              {(!expensesData?.data?.length) && <p className="text-center text-gray-400 py-8 text-sm">No expenses recorded yet</p>}
            </div>
          </AnimatedCard>
        </>
      )}

      {/* Add Expense Modal */}
      <AnimatedModal isOpen={showExpenseModal} onClose={() => setShowExpenseModal(false)}>
        <div className="p-6">
          <h3 className="text-xl font-bold text-[#0F172A] mb-6">Add Expense</h3>
          <div className="space-y-4">
            <div><label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Category</label>
              <Dropdown value={expenseForm.category_id} onChange={e => setExpenseForm(p => ({ ...p, category_id: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500">
                <option value="">Select category</option>
                {(categories || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Dropdown>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Amount (₹)</label>
                <input type="number" value={expenseForm.amount} onChange={e => setExpenseForm(p => ({ ...p, amount: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm" placeholder="0.00" />
              </div>
              <div><label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">GST Amount</label>
                <input type="number" value={expenseForm.gst_amount} onChange={e => setExpenseForm(p => ({ ...p, gst_amount: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm" placeholder="0.00" />
              </div>
            </div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Date</label>
              <input type="date" value={expenseForm.expense_date} onChange={e => setExpenseForm(p => ({ ...p, expense_date: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm" />
            </div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Description</label>
              <input value={expenseForm.description} onChange={e => setExpenseForm(p => ({ ...p, description: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm" placeholder="Description..." />
            </div>
            <div><label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Payment Method</label>
              <Dropdown value={expenseForm.payment_method} onChange={e => setExpenseForm(p => ({ ...p, payment_method: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm">
                <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="net_banking">Net Banking</option>
              </Dropdown>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <RippleButton variant="ghost" onClick={() => setShowExpenseModal(false)}>Cancel</RippleButton>
              <RippleButton variant="primary" onClick={handleCreateExpense}>Add Expense</RippleButton>
            </div>
          </div>
        </div>
      </AnimatedModal>
    </PageTransition>
  );
}
