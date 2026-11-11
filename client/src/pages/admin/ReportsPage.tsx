import { ymd } from '../../utils/formatters';
import {
  BarChart3, FileText, Download, Calendar, ShieldAlert,
  Clock, CheckCircle, Package, ArrowUpRight, ArrowDownRight, TrendingUp, Star
} from 'lucide-react';
import { useSalesReport, useInventoryReport, useJobCardReport, useWelcomeRewardsReport, downloadReport } from '../../api/hooks/useReports';
import PremiumPageHeader from '../../components/shared/PremiumPageHeader';
import { PageTransition, AnimatedCard, RippleButton } from '../../components/ui/Animations';

import { useState } from 'react';
import Dropdown from '../../components/ui/Dropdown';

type TabType = 'sales' | 'inventory' | 'jobcards' | 'welcomerewards' | 'packagehistory';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('sales');
  
  // Date states for reports
  const today = ymd();
  const firstDayOfMonth = ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [dateRange, setDateRange] = useState({ from: firstDayOfMonth, to: today });
  
  // Job card report additional filters
  const [jobCardFilters, setJobCardFilters] = useState({ status: 'all', staff_id: '' });

  // Query Hooks
  const { data: salesData, isLoading: salesLoading } = useSalesReport({
    from_date: dateRange.from,
    to_date: dateRange.to
  });
  
  const { data: inventoryData, isLoading: inventoryLoading } = useInventoryReport();
  
  const { data: jobCardData, isLoading: jobCardLoading } = useJobCardReport({
    from_date: dateRange.from,
    to_date: dateRange.to,
    status: jobCardFilters.status,
    staff_id: jobCardFilters.staff_id
  });

  const { data: welcomeRewardsData, isLoading: welcomeRewardsLoading } = useWelcomeRewardsReport();

  const [downloading, setDownloading] = useState<string | null>(null);

  const handleDownload = async (type: 'sales' | 'inventory' | 'job-cards' | 'package-history', format: 'xlsx' | 'pdf') => {
    const key = `${type}-${format}`;
    setDownloading(key);
    try {
      const params = type === 'inventory' || type === 'package-history' ? {} : {
        from_date: dateRange.from,
        to_date: dateRange.to,
        ...(type === 'job-cards' ? jobCardFilters : {})
      };
      await downloadReport(type, params, format);
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <PageTransition className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <PremiumPageHeader
        title="Reports & Analytics"
        subtitle="Generate, view, and export business performance metrics"
        icon={BarChart3}
        iconColor="#EF4444"
        accentGradient="from-blue-600 to-blue-500"
        badge="ENTERPRISE"
      />

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-gray-100 rounded-xl max-w-2xl">
        {(['sales', 'inventory', 'jobcards', 'welcomerewards', 'packagehistory'] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg capitalize transition-all duration-200 ${
              activeTab === tab
                ? 'bg-white text-[#0F172A] shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab === 'jobcards' ? 'Job Cards' : tab === 'welcomerewards' ? 'Welcome Rewards' : tab === 'packagehistory' ? 'Package History' : tab}
          </button>
        ))}
      </div>

      {/* Filters Card (except for Inventory/Welcome Rewards/Package History tab which doesn't need date filters) */}
      {activeTab !== 'inventory' && activeTab !== 'welcomerewards' && activeTab !== 'packagehistory' && (
        <AnimatedCard className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-end justify-between gap-3" delay={0.1}>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-2 w-full sm:w-auto">
            <p className="col-span-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500"><Calendar size={13} /> Period</p>
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange((prev) => ({ ...prev, from: e.target.value }))}
              className="w-full sm:w-auto text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange((prev) => ({ ...prev, to: e.target.value }))}
              className="w-full sm:w-auto text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />

            {activeTab === 'jobcards' && (
              <>
                <Dropdown
                  value={jobCardFilters.status}
                  onChange={(e) => setJobCardFilters((prev) => ({ ...prev, status: e.target.value }))}
                  className="text-xs border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="delivered">Delivered</option>
                </Dropdown>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
            <RippleButton
              onClick={() => handleDownload(activeTab === 'sales' ? 'sales' : 'job-cards', 'xlsx')}
              className="flex items-center justify-center gap-1.5 text-sm font-bold py-2.5 px-4 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl"
              disabled={!!downloading}
            >
              <Download size={14} />
              {downloading === `${activeTab === 'sales' ? 'sales' : 'job-cards'}-xlsx` ? 'Exporting...' : 'Excel'}
            </RippleButton>
            {activeTab === 'sales' && (
              <RippleButton
                onClick={() => handleDownload('sales', 'pdf')}
                className="flex items-center justify-center gap-1.5 text-sm font-bold py-2.5 px-4 bg-[#2563EB] text-white hover:bg-blue-700 rounded-xl"
                disabled={!!downloading}
              >
                <FileText size={14} />
                {downloading === 'sales-pdf' ? 'Exporting...' : 'PDF'}
              </RippleButton>
            )}
          </div>
        </AnimatedCard>
      )}

      {/* SALES TAB CONTENT */}
      {activeTab === 'sales' && (
        <div className="space-y-6">
          {salesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-gray-100 rounded-2xl" />
              ))}
            </div>
          ) : salesData?.success ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <AnimatedCard className="bg-white p-5 rounded-2xl border border-gray-100 flex items-center justify-between" delay={0.15}>
                  <div>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Income</span>
                    <h3 className="text-2xl font-bold text-[#0F172A] mt-1">₹{Number(salesData.data.summary.total_income).toLocaleString('en-IN')}</h3>
                    <div className="flex items-center gap-1 text-xs text-emerald-600 mt-1">
                      <TrendingUp size={12} />
                      <span>Inflow</span>
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <ArrowUpRight size={20} />
                  </div>
                </AnimatedCard>

                <AnimatedCard className="bg-white p-5 rounded-2xl border border-gray-100 flex items-center justify-between" delay={0.2}>
                  <div>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Expenses</span>
                    <h3 className="text-2xl font-bold text-[#0F172A] mt-1">₹{Number(salesData.data.summary.total_expenses).toLocaleString('en-IN')}</h3>
                    <div className="flex items-center gap-1 text-xs text-rose-600 mt-1">
                      <ArrowDownRight size={12} />
                      <span>Outflow</span>
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                    <ArrowDownRight size={20} />
                  </div>
                </AnimatedCard>

                <AnimatedCard className="bg-white p-5 rounded-2xl border border-gray-100 flex items-center justify-between" delay={0.25}>
                  <div>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Job Revenue</span>
                    <h3 className="text-2xl font-bold text-[#0F172A] mt-1">₹{Number(salesData.data.summary.job_revenue).toLocaleString('en-IN')}</h3>
                    <p className="text-[10px] text-gray-400 mt-1">Auto repair & detailing</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <FileText size={20} />
                  </div>
                </AnimatedCard>

                <AnimatedCard className="bg-white p-5 rounded-2xl border border-gray-100 flex items-center justify-between" delay={0.3}>
                  <div>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Product Sales</span>
                    <h3 className="text-2xl font-bold text-[#0F172A] mt-1">₹{Number(Number(salesData.data.summary.b2b_sales) + Number(salesData.data.summary.b2c_sales)).toLocaleString('en-IN')}</h3>
                    <p className="text-[10px] text-gray-400 mt-1">B2C & B2B Inventory</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Package size={20} />
                  </div>
                </AnimatedCard>
              </div>

              {/* Daily Revenue Table */}
              <AnimatedCard className="bg-white rounded-2xl border border-gray-100 overflow-hidden" delay={0.35}>
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-bold text-[#0F172A]">Daily Breakdown</h3>
                  <span className="text-xs text-gray-400">{salesData.data.daily.length} days recorded</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs font-semibold">
                        <th className="p-4">Date</th>
                        <th className="p-4 text-right">Income</th>
                        <th className="p-4 text-right">Expenses</th>
                        <th className="p-4 text-right">Net Profit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-sm">
                      {salesData.data.daily.map((day: any, i: number) => (
                        <tr key={i} className="hover:bg-gray-50/50">
                          <td className="p-4 font-medium">{new Date(day.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                          <td className="p-4 text-right text-emerald-600 font-semibold">+₹{Number(day.income).toLocaleString('en-IN')}</td>
                          <td className="p-4 text-right text-rose-600 font-semibold">-₹{Number(day.expenses).toLocaleString('en-IN')}</td>
                          <td className={`p-4 text-right font-bold ${Number(day.net) >= 0 ? 'text-[#0F172A]' : 'text-rose-600'}`}>
                            {Number(day.net) >= 0 ? '+' : ''}₹{Number(day.net).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                      {!salesData.data.daily.length && (
                        <tr>
                          <td colSpan={4} className="p-8 text-center text-gray-400">No transactions found in this period</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </AnimatedCard>
            </>
          ) : (
            <div className="bg-rose-50 text-rose-700 p-4 rounded-xl text-sm border border-rose-100">Failed to load sales report data.</div>
          )}
        </div>
      )}

      {/* INVENTORY TAB CONTENT */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          {inventoryLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-24 bg-gray-100 rounded-2xl" />
              <div className="h-64 bg-gray-100 rounded-2xl" />
            </div>
          ) : inventoryData?.success ? (
            <>
              {/* Header card with action */}
              <AnimatedCard className="bg-white p-5 rounded-2xl border border-gray-100 flex flex-wrap items-center justify-between gap-4" delay={0.15}>
                <div className="flex gap-6">
                  <div>
                    <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Total Stock Items</span>
                    <h3 className="text-2xl font-bold text-[#0F172A] mt-0.5">{inventoryData.data.total_items}</h3>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Low Stock Items</span>
                    <h3 className={`text-2xl font-bold mt-0.5 ${inventoryData.data.low_stock_count > 0 ? 'text-blue-500' : 'text-[#0F172A]'}`}>
                      {inventoryData.data.low_stock_count}
                    </h3>
                  </div>
                </div>

                <RippleButton
                  onClick={() => handleDownload('inventory', 'xlsx')}
                  className="flex items-center gap-1.5 text-xs py-2.5 px-4 bg-[#0F172A] text-white hover:bg-[#2c2b2b] rounded-xl font-semibold shadow-sm"
                  disabled={!!downloading}
                >
                  <Download size={14} />
                  {downloading === 'inventory-xlsx' ? 'Exporting...' : 'Export Inventory List'}
                </RippleButton>
              </AnimatedCard>

              {/* Two column grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Low Stock Alert Table */}
                <AnimatedCard className="bg-white rounded-2xl border border-gray-100 overflow-hidden lg:col-span-2" delay={0.2}>
                  <div className="p-5 border-b border-gray-100">
                    <h3 className="font-bold text-[#0F172A] flex items-center gap-2">
                      <ShieldAlert className="text-amber-500" size={18} />
                      Stock Status Table
                    </h3>
                  </div>
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs font-semibold">
                          <th className="p-4">Item Name</th>
                          <th className="p-4 text-right">Qty</th>
                          <th className="p-4 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-sm">
                        {inventoryData.data.stock.map((item: any) => (
                          <tr key={item.id} className="hover:bg-gray-50/50">
                            <td className="p-4 font-medium text-[#0F172A]">{item.product_name}</td>
                            <td className="p-4 text-right font-semibold">{item.quantity} {item.unit}</td>
                            <td className="p-4 text-center">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                item.is_low_stock
                                  ? 'bg-rose-50 text-rose-600 border border-rose-100'
                                  : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                              }`}>
                                {item.is_low_stock ? 'Low Stock' : 'In Stock'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </AnimatedCard>

                {/* Top Usage in 30 Days */}
                <AnimatedCard className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4" delay={0.25}>
                  <h3 className="font-bold text-[#0F172A] flex items-center gap-2 border-b border-gray-100 pb-3">
                    <Clock className="text-blue-500" size={18} />
                    Top Usage (30 Days)
                  </h3>
                  <div className="space-y-4">
                    {inventoryData.data.usage_last_30_days.map((usage: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-sm">
                        <span className="text-gray-600 truncate max-w-[180px]">{usage.product_name}</span>
                        <span className="font-bold text-gray-800 shrink-0 bg-gray-50 px-2 py-1 rounded-lg">{usage.total_used} units used</span>
                      </div>
                    ))}
                    {!inventoryData.data.usage_last_30_days.length && (
                      <p className="text-xs text-gray-400 text-center py-6">No product usage recorded</p>
                    )}
                  </div>
                </AnimatedCard>
              </div>
            </>
          ) : (
            <div className="bg-rose-50 text-rose-700 p-4 rounded-xl text-sm border border-rose-100">Failed to load inventory report.</div>
          )}
        </div>
      )}

      {/* JOB CARDS TAB CONTENT */}
      {activeTab === 'jobcards' && (
        <div className="space-y-6">
          {jobCardLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="h-20 bg-gray-100 rounded-xl" />
                <div className="h-20 bg-gray-100 rounded-xl" />
                <div className="h-20 bg-gray-100 rounded-xl" />
              </div>
              <div className="h-64 bg-gray-100 rounded-2xl" />
            </div>
          ) : jobCardData?.success ? (
            <>
              {/* Summary Widgets */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <AnimatedCard className="bg-white p-5 rounded-2xl border border-gray-100 flex items-center justify-between" delay={0.15}>
                  <div>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Jobs Created</span>
                    <h3 className="text-2xl font-bold text-[#0F172A] mt-1">{jobCardData.data.total_jobs}</h3>
                    <p className="text-[10px] text-gray-400 mt-1">Within selected period</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    #{jobCardData.data.total_jobs}
                  </div>
                </AnimatedCard>

                <AnimatedCard className="bg-white p-5 rounded-2xl border border-gray-100 flex items-center justify-between" delay={0.2}>
                  <div>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Job Value</span>
                    <h3 className="text-2xl font-bold text-[#0F172A] mt-1">₹{Number(jobCardData.data.total_revenue).toLocaleString('en-IN')}</h3>
                    <p className="text-[10px] text-gray-400 mt-1">Includes billing & labor</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    ₹
                  </div>
                </AnimatedCard>

                <AnimatedCard className="bg-white p-5 rounded-2xl border border-gray-100 flex items-center justify-between" delay={0.25}>
                  <div>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Completed / Delivered</span>
                    <h3 className="text-2xl font-bold text-[#0F172A] mt-1">
                      {Number(jobCardData.data.status_breakdown.completed || 0) + Number(jobCardData.data.status_breakdown.delivered || 0)}
                    </h3>
                    <p className="text-[10px] text-gray-400 mt-1">Completed status counts</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <CheckCircle size={20} />
                  </div>
                </AnimatedCard>
              </div>

              {/* Job Card List */}
              <AnimatedCard className="bg-white rounded-2xl border border-gray-100 overflow-hidden" delay={0.3}>
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-bold text-[#0F172A]">Job Card Records</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs font-semibold">
                        <th className="p-4">Visit Info</th>
                        <th className="p-4">Vehicle</th>
                        <th className="p-4">Customer</th>
                        <th className="p-4">Services Done</th>
                        <th className="p-4 text-right">Total Amount</th>
                        <th className="p-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-sm">
                      {jobCardData.data.jobs.map((job: any) => (
                        <tr key={job.id} className="hover:bg-gray-50/50">
                          <td className="p-4">
                            <div className="font-medium text-[#0F172A]">Visit #{job.visit_number}</div>
                            <div className="text-[10px] text-gray-400">{new Date(job.visit_date).toLocaleDateString('en-IN')}</div>
                          </td>
                          <td className="p-4">
                            <div className="font-semibold text-gray-700">{job.registration_no}</div>
                            <div className="text-[10px] text-gray-400">{job.brand} {job.model}</div>
                          </td>
                          <td className="p-4">
                            <div className="font-medium">{job.customer_name}</div>
                            <div className="text-xs text-gray-500">{job.customer_mobile}</div>
                          </td>
                          <td className="p-4 max-w-xs truncate text-xs text-gray-600" title={job.services_done}>
                            {job.services_done || '—'}
                          </td>
                          <td className="p-4 text-right font-bold text-[#0F172A]">₹{Number(job.total_amount).toLocaleString('en-IN')}</td>
                          <td className="p-4 text-center">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                              job.status === 'delivered' ? 'bg-indigo-50 text-indigo-600' :
                              job.status === 'completed' ? 'bg-emerald-50 text-emerald-600' :
                              job.status === 'in_progress' ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {job.status.replace('_', ' ')}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {!jobCardData.data.jobs.length && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-gray-400">No job cards found for the selected filter criteria</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </AnimatedCard>
            </>
          ) : (
            <div className="bg-rose-50 text-rose-700 p-4 rounded-xl text-sm border border-rose-100">Failed to load job cards report data.</div>
          )}
        </div>
      )}

      {/* WELCOME REWARDS TAB CONTENT */}
      {activeTab === 'welcomerewards' && (
        <div className="space-y-6">
          {welcomeRewardsLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-64 bg-gray-100 rounded-2xl" />
            </div>
          ) : welcomeRewardsData?.success ? (
            <>
              <AnimatedCard className="bg-white rounded-2xl border border-gray-100 overflow-hidden" delay={0.2}>
                <div className="p-5 border-b border-gray-100">
                  <h3 className="font-bold text-[#0F172A]">Welcome Reward Records</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse border-spacing-0">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs font-semibold">
                        <th className="p-4">Customer</th>
                        <th className="p-4">Benefits</th>
                        <th className="p-4">Description</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-center">Expiry</th>
                        <th className="p-4 text-center">Awarded Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-sm">
                      {welcomeRewardsData.data.map((r: any, idx: number) => {
                        const isExpired = r.expires_at ? new Date(r.expires_at) < new Date() : false;
                        return (
                          <tr key={r.id || idx} className="hover:bg-gray-50/50">
                            <td className="p-4">
                              <div className="font-medium text-[#0F172A]">{r.customer_name || `Customer #${r.customer_id}`}</div>
                              <div className="text-[10px] text-gray-400">{r.customer_mobile || ''}</div>
                            </td>
                            <td className="p-4">
                              {r.points_awarded > 0 && <span className="inline-flex items-center gap-1 text-amber-600 font-bold"><Star size={12} /> {r.points_awarded} pts</span>}
                              {r.discount_pct > 0 && <span className="text-emerald-600 font-bold ml-2">{r.discount_pct}% Off</span>}
                            </td>
                            <td className="p-4 text-gray-600 text-xs">{r.description || '—'}</td>
                            <td className="p-4 text-center">
                              {r.redeemed ? (
                                <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-medium uppercase">Redeemed</span>
                              ) : isExpired ? (
                                <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full font-medium uppercase">Expired</span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full font-medium uppercase">Active</span>
                              )}
                            </td>
                            <td className="p-4 text-center text-xs text-gray-500">
                              {r.expires_at ? new Date(r.expires_at).toLocaleDateString('en-IN') : 'No Expiry'}
                            </td>
                            <td className="p-4 text-center text-xs text-gray-500">
                              {new Date(r.created_at).toLocaleDateString('en-IN')}
                            </td>
                          </tr>
                        );
                      })}
                      {!welcomeRewardsData.data.length && (
                         <tr>
                           <td colSpan={6} className="p-8 text-center text-gray-400">No welcome rewards found</td>
                         </tr>
                       )}
                    </tbody>
                  </table>
                </div>
              </AnimatedCard>
            </>
          ) : (
            <div className="bg-rose-50 text-rose-700 p-4 rounded-xl text-sm border border-rose-100">Failed to load welcome rewards report data.</div>
          )}
        </div>
      )}

      {/* PACKAGE HISTORY TAB CONTENT */}
      {activeTab === 'packagehistory' && (
        <div className="space-y-6">
          <AnimatedCard className="bg-white p-6 rounded-2xl border border-gray-100 overflow-hidden text-center max-w-xl mx-auto space-y-6" delay={0.2}>
            <div className="mx-auto w-12 h-12 bg-blue-50 text-[#2563EB] rounded-full flex items-center justify-center">
              <Package size={24} />
            </div>
            <div>
              <h3 className="font-black text-lg text-gray-900">Export Customer Package History</h3>
              <p className="text-sm text-gray-500 mt-1">
                Download consolidated logs of all assigned customer packages, including service consumption, pricing segmentations, and active/expired status flags.
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <RippleButton
                onClick={() => handleDownload('package-history', 'xlsx')}
                className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-emerald-700 transition flex items-center gap-1.5"
              >
                <Download size={14} /> Export Excel
              </RippleButton>
              <RippleButton
                onClick={() => handleDownload('package-history', 'pdf')}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-blue-700 transition flex items-center gap-1.5"
              >
                <Download size={14} /> Export PDF
              </RippleButton>
            </div>
          </AnimatedCard>
        </div>
      )}
    </PageTransition>
  );
}
