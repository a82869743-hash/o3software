import { useState } from 'react';
import { Mail, Send, Activity, Users } from 'lucide-react';
import { useMessagesLog, useSendBulkMessage, useMessagePreview } from '../../api/hooks/useMessages';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Textarea from '../../components/ui/Textarea';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import EmptyState from '../../components/shared/EmptyState';
import { useUIStore } from '../../store/uiStore';

export default function MessagesPage() {
  const toast = useUIStore((s) => s.toast);
  const { data, isLoading } = useMessagesLog();
  const sendBulkMut = useSendBulkMessage();

  const [modalOpen, setModalOpen] = useState(false);
  const [msgType, setMsgType] = useState('bulk_promotion');
  const [channel, setChannel] = useState('whatsapp');
  const [audience, setAudience] = useState('all');
  const [content, setContent] = useState('');

  const { data: previewData, isLoading: previewLoading } = useMessagePreview(msgType);
  const logs = data?.data || [];

  const handleSend = async () => {
    if (!content.trim()) {
      toast('error', 'Message content is required');
      return;
    }
    try {
      const res = await sendBulkMut.mutateAsync({
        message_type: msgType,
        channel,
        target_audience: audience,
        message_content: content
      });
      toast('success', `Sent to ${res.data.sent} users. Failed: ${res.data.failed}`);
      setModalOpen(false);
      setContent('');
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to send bulk message');
    }
  };

  return (
    <>
      <AdminTopBar
        title="Messaging Campaigns"
        subtitle={`${logs.length} messages sent previously`}
        actions={<Button onClick={() => setModalOpen(true)} icon={<Send size={16} />}>New Campaign</Button>}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-5 rounded-lg border-b-2 border-transparent shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-[#5f5e5e]"><Mail size={18}/> <h3 className="font-bold text-sm tracking-wider uppercase">Messages Sent</h3></div>
          <p className="text-3xl font-black text-[#0F172A]">{logs.length}</p>
        </div>
        <div className="bg-white p-5 rounded-lg border-b-2 border-transparent shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-[#5f5e5e]"><Activity size={18}/> <h3 className="font-bold text-sm tracking-wider uppercase">Delivery Rate</h3></div>
          <p className="text-3xl font-black text-green-600">
            {logs.length ? Math.round((logs.filter((l: any) => l.status === 'sent').length / logs.length) * 100) : 0}%
          </p>
        </div>
        <div className="bg-white p-5 rounded-lg border-b-2 border-transparent shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-[#5f5e5e]"><Users size={18}/> <h3 className="font-bold text-sm tracking-wider uppercase">Selected Audience</h3></div>
          <p className="text-3xl font-black text-[#0F172A]">{previewLoading ? '...' : previewData?.data?.target_count || 0}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="font-bold text-[#0F172A]">Recent Messages Log</h2>
        </div>
        {isLoading ? (
          <div className="p-6 grid gap-4 grid-cols-1 md:grid-cols-2"><SkeletonCard/><SkeletonCard/></div>
        ) : !logs.length ? (
          <EmptyState icon={Mail} title="No Messages Sent" description="Start a new campaign to reach out to customers" />
        ) : (
          <div className="divide-y divide-gray-100">
            {logs.map((log: any) => {
              const waLink = log.response_data?.wa_link;
              return (
                <div key={log.id} className="p-4 hover:bg-gray-50/50 transition-colors flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm text-[#0F172A]">{log.customer_name || 'Unknown'}</span>
                      <span className="text-xs text-gray-500">({log.mobile})</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        log.status === 'sent' ? 'bg-green-100 text-green-700' : 
                        log.status === 'failed' ? 'bg-blue-100 text-blue-700' : 
                        log.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {log.status}
                      </span>
                      {log.template_name && (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-medium border border-blue-100">
                          {log.template_name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#5f5e5e]">{log.message_preview}</p>
                    {log.channel === 'whatsapp' && waLink && (
                      <a 
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 transition-all shadow-sm hover:shadow"
                      >
                        💬 Send WhatsApp Manual
                      </a>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-xs uppercase font-bold text-gray-400 block tracking-widest">{log.channel}</span>
                    <span className="text-[10px] text-gray-400 block mt-1">{new Date(log.sent_at).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Messaging Campaign" size="md"
        footer={<><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={handleSend} loading={sendBulkMut.isPending}>Send Campaign</Button></>}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Message Type</label>
              <select className="w-full bg-[#f6f3f2] border-0 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-[#2563EB] outline-none" value={msgType} onChange={e => setMsgType(e.target.value)}>
                <option value="bulk_promotion">General Promotion</option>
                <option value="bulk_free_wash">Free Wash Campaign</option>
                <option value="bulk_credits">Store Credits Campaign</option>
                <option value="bulk_reengagement">Re-engagement</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Channel</label>
              <select className="w-full bg-[#f6f3f2] border-0 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-[#2563EB] outline-none" value={channel} onChange={e => setChannel(e.target.value)}>
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
              </select>
            </div>
          </div>
          <Textarea 
            label="Message Content" 
            value={content} 
            onChange={e => setContent(e.target.value)} 
            placeholder="Type your message text here..."
            className="h-32" 
          />
          <p className="text-xs text-gray-500 italic">Messages will be sent in batches to comply with anti-spam limits.</p>
        </div>
      </Modal>
    </>
  );
}
