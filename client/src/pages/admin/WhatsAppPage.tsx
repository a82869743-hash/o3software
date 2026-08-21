import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Send, Users, CheckCircle, XCircle, Search, Clock } from 'lucide-react';
import { useWhatsAppMessages, useWhatsAppStats, useSendWhatsApp } from '../../api/hooks/useWhatsApp';
import PremiumPageHeader from '../../components/shared/PremiumPageHeader';
import PremiumStatCard from '../../components/shared/PremiumStatCard';
import { PageTransition, AnimatedCard, RippleButton, AnimatedModal } from '../../components/ui/Animations';

export default function WhatsAppPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showSendModal, setShowSendModal] = useState(false);
  const [messageForm, setMessageForm] = useState({ phone: '', message: '', customer_id: '' });

  const { data: messagesData, isLoading } = useWhatsAppMessages({ status: statusFilter });
  const { data: statsData } = useWhatsAppStats();
  const sendWhatsApp = useSendWhatsApp();

  const handleSendMessage = () => {
    sendWhatsApp.mutate(messageForm, {
      onSuccess: () => {
        setShowSendModal(false);
        setMessageForm({ phone: '', message: '', customer_id: '' });
      }
    });
  };

  const stats = statsData?.data || {};

  return (
    <PageTransition className="p-4 sm:p-6 max-w-7xl mx-auto">
      <PremiumPageHeader
        title="WhatsApp Integration"
        subtitle="Manage and send WhatsApp messages and automated reminders"
        icon={MessageCircle}
        iconColor="#25D366"
        accentGradient="from-green-600 to-green-500"
        badge="LIVE API"
        actions={
          <RippleButton onClick={() => setShowSendModal(true)} variant="primary" className="bg-[#25D366] hover:bg-[#1ebd5a]">
            <Send size={14} className="mr-1" /> Send Message
          </RippleButton>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <PremiumStatCard title="Total Sent" value={stats.total || 0} icon={MessageCircle} color="#25D366" gradient="from-green-500/10 to-green-400/5" />
        <PremiumStatCard title="Delivered" value={stats.delivered || 0} icon={CheckCircle} color="#4CAF50" gradient="from-emerald-500/10 to-emerald-400/5" delay={0.1} />
        <PremiumStatCard title="Pending/Sent" value={(stats.pending || 0) + (stats.sent || 0)} icon={Clock} color="#FF9800" gradient="from-amber-500/10 to-amber-400/5" delay={0.2} />
        <PremiumStatCard title="Failed" value={stats.failed || 0} icon={XCircle} color="#F44336" gradient="from-blue-500/10 to-blue-400/5" delay={0.3} />
      </div>

      {/* Filters */}
      <AnimatedCard className="bg-white rounded-2xl border border-gray-100 p-4 mb-6 flex flex-wrap items-center gap-3" delay={0.2}>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="Search by phone..." 
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500" 
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-green-500/20">
          <option value="">All Statuses</option>
          <option value="sent">Sent</option>
          <option value="delivered">Delivered</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
      </AnimatedCard>

      {/* Messages Table */}
      <AnimatedCard className="bg-white rounded-2xl border border-gray-100 overflow-hidden" delay={0.3}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Customer</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Phone</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase max-w-[300px]">Message</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Type</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => <tr key={i}><td colSpan={6} className="py-4 px-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>)
              ) : (messagesData?.data || []).map((m: any, i: number) => (
                <motion.tr key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }} className="border-b border-gray-50 hover:bg-green-50/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-medium text-[#0F172A] flex items-center gap-2">
                      <Users size={14} className="text-gray-400" />
                      {m.customer_name || 'Walk-in'}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600 font-mono text-xs">{m.phone}</td>
                  <td className="py-3 px-4 text-gray-600 max-w-[300px] truncate" title={m.message_body}>{m.message_body}</td>
                  <td className="py-3 px-4 text-center">
                    <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-lg uppercase tracking-wider">{m.message_type}</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase tracking-wider
                      ${m.status === 'sent' || m.status === 'delivered' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                        m.status === 'failed' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}
                    >
                      {m.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-500 text-xs">
                    {new Date(m.created_at).toLocaleString('en-IN')}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          {!messagesData?.data?.length && !isLoading && (
            <div className="text-center py-12">
              <MessageCircle size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">No WhatsApp messages found</p>
            </div>
          )}
        </div>
      </AnimatedCard>

      {/* Send Message Modal */}
      <AnimatedModal isOpen={showSendModal} onClose={() => setShowSendModal(false)}>
        <div className="p-6">
          <h3 className="text-xl font-bold text-[#0F172A] mb-6 flex items-center gap-2">
            <MessageCircle size={20} className="text-[#25D366]" /> Send WhatsApp Message
          </h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Phone Number (with country code)</label>
              <input 
                value={messageForm.phone} 
                onChange={e => setMessageForm(p => ({ ...p, phone: e.target.value }))} 
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#25D366]/20 focus:border-[#25D366]" 
                placeholder="e.g. 919876543210" 
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Message</label>
              <textarea 
                value={messageForm.message} 
                onChange={e => setMessageForm(p => ({ ...p, message: e.target.value }))} 
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#25D366]/20 focus:border-[#25D366]" 
                placeholder="Type your message here..."
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <RippleButton variant="ghost" onClick={() => setShowSendModal(false)}>Cancel</RippleButton>
              <RippleButton variant="primary" onClick={handleSendMessage} className="bg-[#25D366] hover:bg-[#1ebd5a]">
                Send Message
              </RippleButton>
            </div>
          </div>
        </div>
      </AnimatedModal>
    </PageTransition>
  );
}
