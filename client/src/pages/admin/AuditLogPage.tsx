import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Search, Filter, Clock, User, Activity, AlertTriangle, Eye } from 'lucide-react';
import { useAuditLogs, useAuditSummary } from '../../api/hooks/useAudit';
import PremiumPageHeader from '../../components/shared/PremiumPageHeader';
import { PageTransition, AnimatedCard, RippleButton, AnimatedModal } from '../../components/ui/Animations';

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  update: 'bg-blue-50 text-blue-700 border-blue-200',
  delete: 'bg-blue-50 text-blue-700 border-blue-200',
  login: 'bg-purple-50 text-purple-700 border-purple-200',
  logout: 'bg-gray-100 text-gray-600 border-gray-200',
  payment: 'bg-amber-50 text-amber-700 border-amber-200',
};

const ACTION_ICONS: Record<string, React.ElementType> = {
  create: Activity,
  update: Activity,
  delete: AlertTriangle,
  login: User,
  logout: User,
};

export default function AuditLogPage() {
  const [filters, setFilters] = useState({ action: '', entity_type: '', from: '', to: '' });
  const [detailModal, setDetailModal] = useState<any>(null);
  const { data: logsData, isLoading } = useAuditLogs(
    Object.fromEntries(Object.entries(filters).filter(([_, v]) => v))
  );
  const { data: summary } = useAuditSummary();

  const formatTime = (d: string) => {
    const dt = new Date(d);
    const now = new Date();
    const diffMs = now.getTime() - dt.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <PageTransition className="p-4 sm:p-6 max-w-7xl mx-auto">
      <PremiumPageHeader
        title="Audit Logs"
        subtitle="System activity and change tracking"
        icon={Shield}
        iconColor="#7C3AED"
        accentGradient="from-purple-600 to-purple-500"
        badge="SECURE"
      />

      {/* Quick Stats */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {(summary.actions || []).slice(0, 4).map((a: any, i: number) => (
            <motion.div key={a.action} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
              className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <p className="text-2xl font-bold text-[#0F172A]">{a.count}</p>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-1 capitalize">{a.action}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Filters */}
      <AnimatedCard className="bg-white rounded-2xl border border-gray-100 p-4 mb-6" delay={0.15}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select value={filters.action} onChange={e => setFilters(p => ({ ...p, action: e.target.value }))}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 appearance-none bg-white">
              <option value="">All Actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="login">Login</option>
              <option value="payment">Payment</option>
            </select>
          </div>
          <select value={filters.entity_type} onChange={e => setFilters(p => ({ ...p, entity_type: e.target.value }))}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-purple-500/20 min-w-[140px]">
            <option value="">All Entities</option>
            <option value="job_cart">Job Card</option>
            <option value="payment">Payment</option>
            <option value="user">User</option>
            <option value="booking">Booking</option>
            <option value="inventory">Inventory</option>
          </select>
          <input type="date" value={filters.from} onChange={e => setFilters(p => ({ ...p, from: e.target.value }))}
            className="text-xs border border-gray-200 rounded-xl px-3 py-2" />
          <span className="text-gray-400 text-xs">to</span>
          <input type="date" value={filters.to} onChange={e => setFilters(p => ({ ...p, to: e.target.value }))}
            className="text-xs border border-gray-200 rounded-xl px-3 py-2" />
          {(filters.action || filters.entity_type || filters.from) && (
            <RippleButton variant="ghost" onClick={() => setFilters({ action: '', entity_type: '', from: '', to: '' })}>Clear</RippleButton>
          )}
        </div>
      </AnimatedCard>

      {/* Audit Timeline */}
      <AnimatedCard className="bg-white rounded-2xl border border-gray-100 overflow-hidden" delay={0.2}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-[#0F172A] flex items-center gap-2"><Clock size={18} /> Activity Timeline</h3>
          <span className="text-xs text-gray-400">{logsData?.pagination?.total || 0} events</span>
        </div>

        <div className="divide-y divide-gray-50">
          {isLoading ? (
            [...Array(6)].map((_, i) => (
              <div key={i} className="p-4 flex gap-4 animate-pulse">
                <div className="w-9 h-9 rounded-xl bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-2"><div className="h-3 bg-gray-100 rounded w-2/3" /><div className="h-3 bg-gray-50 rounded w-1/3" /></div>
              </div>
            ))
          ) : (logsData?.data || []).map((log: any, i: number) => {
            const IconComp = ACTION_ICONS[log.action] || Activity;
            const colorClass = ACTION_COLORS[log.action] || 'bg-gray-50 text-gray-600 border-gray-200';
            return (
              <motion.div key={log.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                className="p-4 flex items-start gap-4 hover:bg-gray-50/50 transition-colors cursor-pointer group"
                onClick={() => setDetailModal(log)}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${colorClass}`}>
                  <IconComp size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-[#0F172A] capitalize">{log.action}</span>
                    <span className="text-[11px] px-2 py-0.5 bg-gray-100 rounded-full text-gray-500 font-medium capitalize">{log.entity_type?.replace('_', ' ')}</span>
                    {log.entity_id && <span className="text-[10px] text-gray-400">#{log.entity_id}</span>}
                  </div>
                  <p className="text-xs text-gray-500">
                    by <span className="font-medium text-gray-700">{log.user_name || 'System'}</span>
                    {log.user_role && <span className="text-gray-400"> ({log.user_role})</span>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] text-gray-400">{formatTime(log.created_at)}</p>
                  <Eye size={14} className="text-gray-300 group-hover:text-purple-500 mt-1 ml-auto transition-colors" />
                </div>
              </motion.div>
            );
          })}
          {!logsData?.data?.length && !isLoading && (
            <div className="p-12 text-center">
              <Shield size={40} className="mx-auto text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">No audit events found</p>
            </div>
          )}
        </div>
      </AnimatedCard>

      {/* Detail Modal */}
      <AnimatedModal isOpen={!!detailModal} onClose={() => setDetailModal(null)}>
        {detailModal && (
          <div className="p-6">
            <h3 className="text-xl font-bold text-[#0F172A] mb-4 capitalize">{detailModal.action} — {detailModal.entity_type?.replace('_', ' ')}</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-gray-100"><span className="text-gray-500">Event ID</span><span className="font-mono text-gray-700">#{detailModal.id}</span></div>
              <div className="flex justify-between py-2 border-b border-gray-100"><span className="text-gray-500">User</span><span className="font-medium">{detailModal.user_name || 'System'}</span></div>
              <div className="flex justify-between py-2 border-b border-gray-100"><span className="text-gray-500">Role</span><span className="capitalize">{detailModal.user_role}</span></div>
              <div className="flex justify-between py-2 border-b border-gray-100"><span className="text-gray-500">Entity ID</span><span className="font-mono">#{detailModal.entity_id || '—'}</span></div>
              <div className="flex justify-between py-2 border-b border-gray-100"><span className="text-gray-500">IP Address</span><span className="font-mono text-xs">{detailModal.ip_address || '—'}</span></div>
              <div className="flex justify-between py-2 border-b border-gray-100"><span className="text-gray-500">Timestamp</span><span>{new Date(detailModal.created_at).toLocaleString('en-IN')}</span></div>
              {detailModal.details && (
                <div className="pt-2">
                  <p className="text-gray-500 mb-2">Details</p>
                  <pre className="bg-gray-50 rounded-xl p-3 text-xs text-gray-700 overflow-x-auto max-h-40">{typeof detailModal.details === 'string' ? detailModal.details : JSON.stringify(detailModal.details, null, 2)}</pre>
                </div>
              )}
            </div>
            <div className="flex justify-end mt-6">
              <RippleButton variant="ghost" onClick={() => setDetailModal(null)}>Close</RippleButton>
            </div>
          </div>
        )}
      </AnimatedModal>
    </PageTransition>
  );
}
