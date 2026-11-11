import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Download, Search, Filter, Calendar,
  RefreshCw, Loader2, ChevronLeft, ChevronRight,
  X, Trash2, Plus, Edit, Briefcase
} from 'lucide-react';
import toast from 'react-hot-toast';

import { useQuotations, useDeleteQuotation } from '../../api/hooks/useQuotations';
import api from '../../api/axiosInstance';
import AdminHero from '../../components/admin/AdminHero';
import ConfirmModal from '../../components/ui/ConfirmModal';
import Dropdown from '../../components/ui/Dropdown';

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatINR(n: number) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft:    { label: 'Draft',    color: '#D84315', bg: '#FBE9E7' },
  sent:     { label: 'Sent',     color: '#1565C0', bg: '#E3F2FD' },
  accepted: { label: 'Accepted', color: '#2E7D32', bg: '#E8F5E9' },
  declined: { label: 'Declined', color: '#C62828', bg: '#DBEAFE' },
  converted:{ label: 'Converted',color: '#6A1B9A', bg: '#F3E5F5' },
};

export default function QuotationsListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const [downloading, setDownloading] = useState<number | null>(null);
  const [voidConfirmId, setVoidConfirmId] = useState<number | null>(null);

  const { data: res, isLoading, refetch } = useQuotations({
    page,
    limit,
    status,
    search,
    from_date: fromDate,
    to_date: toDate
  });

  const deleteMutation = useDeleteQuotation();

  const handleDownloadPDF = async (id: number, quotationNumber: string) => {
    setDownloading(id);
    try {
      const resp = await api.get(`/quotations/${id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${quotationNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success('PDF downloaded successfully');
    } catch (e) {
      toast.error('Failed to generate PDF. Please try again.');
    } finally {
      setDownloading(null);
    }
  };

  const handleVoidConfirm = async () => {
    if (!voidConfirmId) return;
    try {
      await deleteMutation.mutateAsync(voidConfirmId);
      toast.success('Quotation voided (moved to archive)');
      setVoidConfirmId(null);
    } catch (err) {
      toast.error('Failed to void quotation');
    }
  };

  const handleConvertToJobCart = async (q: any) => {
    try {
      const { data } = await api.post(`/quotations/${q.id}/convert`);
      refetch();
      navigate('/admin/job-carts/new', { state: { prefill: data.data } });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not convert quotation');
    }
  };

  const handleSendWhatsApp = async (q: any) => {
    try {
      const { data } = await api.post(`/quotations/${q.id}/whatsapp`);
      toast.success(data.message);
      refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not send quotation');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const records = res?.data || [];
  const total = res?.pagination?.total || 0;
  const totalPages = Math.ceil(total / limit);
  const hasFilters = search || status || fromDate || toDate;

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif", minHeight: '100vh' }}>
      <AdminHero title={'Service Quotations & Estimates'} subtitle={'Manage, print, and convert customer quotations to job cards'} />
      {/* ─── Header ─── */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            
            
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => refetch()}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F1F5F9', color: '#64748B', border: '1px solid #ede8e7', borderRadius: '10px', padding: '10px 16px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
            >
              <RefreshCw size={15} />
              Refresh
            </button>
            <button
              onClick={() => navigate('/admin/quotations/new')}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563EB', color: 'white', border: 'none', borderRadius: '10px', padding: '10px 20px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(211,47,47,0.25)' }}
            >
              <Plus size={15} />
              Create Quotation
            </button>
          </div>
        </div>
      </div>

      {/* ─── Filters ─── */}
      <div style={{
        background: 'white', borderRadius: '14px', padding: '16px 20px',
        border: '1px solid #ede8e7', marginBottom: '20px',
        display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1', minWidth: '220px', background: '#f9f6f5', borderRadius: '8px', padding: '8px 14px' }}>
          <Search size={16} color="#9e9e9e" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search customer, mobile, vehicle, no..."
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', color: '#0F172A', width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f9f6f5', borderRadius: '8px', padding: '8px 14px' }}>
          <Filter size={14} color="#9e9e9e" />
          <Dropdown
            value={status}
            onChange={e => setStatus(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', color: '#0F172A', cursor: 'pointer' }}
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
          </Dropdown>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f9f6f5', borderRadius: '8px', padding: '8px 14px' }}>
          <Calendar size={14} color="#9e9e9e" />
          <span style={{ fontSize: '12px', color: '#9e9e9e' }}>From</span>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', color: '#0F172A' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f9f6f5', borderRadius: '8px', padding: '8px 14px' }}>
          <Calendar size={14} color="#9e9e9e" />
          <span style={{ fontSize: '12px', color: '#9e9e9e' }}>To</span>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', color: '#0F172A' }}
          />
        </div>

        {hasFilters && (
          <button
            onClick={clearFilters}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #ede8e7', background: 'white', color: '#2563EB', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
          >
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {/* ─── Summary Banner ─── */}
      <div style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #2d2c2c 100%)',
        borderRadius: '14px', padding: '16px 24px', marginBottom: '20px',
        display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ color: '#9e9e9e', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Estimates</div>
          <div style={{ color: 'white', fontSize: '22px', fontWeight: 800 }}>{total}</div>
        </div>
        <div style={{ width: '1px', height: '36px', background: 'rgba(255,255,255,0.1)' }} />
        <div>
          <div style={{ color: '#9e9e9e', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>This Page</div>
          <div style={{ color: 'white', fontSize: '22px', fontWeight: 800 }}>{records.length}</div>
        </div>
        <div style={{ width: '1px', height: '36px', background: 'rgba(255,255,255,0.1)' }} />
        <div>
          <div style={{ color: '#9e9e9e', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Amount (₹)</div>
          <div style={{ color: '#ef9a9a', fontSize: '22px', fontWeight: 800 }}>
            ₹{formatINR(records.reduce((s: number, r: any) => s + Number(r.grand_total || 0), 0))}
          </div>
        </div>
      </div>

      {/* ─── Table ─── */}
      <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #ede8e7', overflowX: 'auto', overflowY: 'hidden' }}>
        <div style={{ minWidth: '1000px' }}>
          {/* Table Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '150px 140px 180px 180px 110px 110px 1fr',
            padding: '12px 20px',
            background: '#f9f6f5',
            borderBottom: '1px solid #ede8e7',
          }}>
            {['Quotation No', 'Date', 'Customer Details', 'Vehicle Details', 'Grand Total', 'Status', 'Actions'].map((h) => (
              <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: '#9e9e9e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          {isLoading ? (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <Loader2 size={32} color="#2563EB" style={{ animation: 'spin 1s linear infinite' }} />
              <p style={{ color: '#9e9e9e', marginTop: '12px', fontSize: '14px' }}>Loading quotations...</p>
            </div>
          ) : records.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <FileText size={40} color="#e0e0e0" style={{ marginBottom: '12px' }} />
              <p style={{ color: '#9e9e9e', fontSize: '15px', fontWeight: 600 }}>No quotations found</p>
              <p style={{ color: '#bdbdbd', fontSize: '13px', marginTop: '4px' }}>Create one by clicking the red button above</p>
            </div>
          ) : records.map((q: any, idx: number) => {
            const statusConfig = STATUS_CONFIG[q.status] || STATUS_CONFIG.draft;
            const isDownloading = downloading === q.id;

            return (
              <div
                key={q.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '150px 140px 180px 180px 110px 110px 1fr',
                  padding: '14px 20px',
                  borderBottom: idx < records.length - 1 ? '1px solid #f5f0ef' : 'none',
                  alignItems: 'center',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#fafaf9')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Quotation No */}
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', fontFamily: 'Manrope, sans-serif' }}>
                  {q.quotation_number}
                </div>

                {/* Date */}
                <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 500 }}>
                  {formatDate(q.created_at)}
                </div>

                {/* Customer */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#2d2c2c' }}>{q.customer_name}</div>
                  <div style={{ fontSize: '11px', color: '#9e9e9e', marginTop: '2px' }}>📞 {q.customer_mobile}</div>
                </div>

                {/* Vehicle */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#2d2c2c' }}>
                    {q.car_brand} {q.car_model}
                  </div>
                  {q.vehicle_no && (
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px', fontWeight: 600 }}>{q.vehicle_no}</div>
                  )}
                </div>

                {/* Grand Total */}
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#2563EB' }}>
                  ₹{formatINR(Number(q.grand_total))}
                </div>

                {/* Status */}
                <div>
                  <span style={{
                    display: 'inline-block',
                    background: statusConfig.bg,
                    color: statusConfig.color,
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}>
                    {statusConfig.label}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleDownloadPDF(q.id, q.quotation_number)}
                    disabled={isDownloading}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '6px 10px', borderRadius: '6px',
                      border: '1px solid #2563EB',
                      background: 'white', color: '#2563EB', fontSize: '11px', fontWeight: 700,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {isDownloading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={12} />}
                    PDF
                  </button>

                  <button
                    onClick={() => navigate(`/admin/quotations/edit/${q.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '6px 10px', borderRadius: '6px',
                      border: '1px solid #ede8e7',
                      background: 'white', color: '#64748B', fontSize: '11px', fontWeight: 600,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    <Edit size={12} />
                    Edit
                  </button>

                  <button
                    onClick={() => handleConvertToJobCart(q)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '6px 10px', borderRadius: '6px',
                      border: '1px solid #2E7D32',
                      background: '#E8F5E9', color: '#2E7D32', fontSize: '11px', fontWeight: 700,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    <Briefcase size={12} />
                    Job Card
                  </button>

                  <button
                    onClick={() => handleSendWhatsApp(q)}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px', borderRadius: '6px',
                      border: '1px solid #16a34a', background: '#f0fdf4', color: '#15803d', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    WhatsApp
                  </button>

                  <button
                    onClick={() => setVoidConfirmId(q.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '7px', borderRadius: '6px', border: 'none',
                      background: 'transparent', cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={13} color="#9e9e9e" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Pagination ─── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '24px' }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '9px 18px', borderRadius: '10px',
              border: '1.5px solid #ede8e7', background: 'white',
              color: page === 1 ? '#bdbdbd' : '#0F172A',
              fontSize: '13px', fontWeight: 600, cursor: page === 1 ? 'not-allowed' : 'pointer',
            }}
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '9px 18px', borderRadius: '10px',
              border: '1.5px solid #ede8e7', background: 'white',
              color: page === totalPages ? '#bdbdbd' : '#0F172A',
              fontSize: '13px', fontWeight: 600, cursor: page === totalPages ? 'not-allowed' : 'pointer',
            }}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}

      <ConfirmModal
        open={voidConfirmId !== null}
        onClose={() => setVoidConfirmId(null)}
        onConfirm={handleVoidConfirm}
        title="Void Quotation"
        description="Are you sure you want to void this quotation? It will be archived and hidden from this list."
        confirmText="Void Quotation"
        isDestructive={true}
        loading={deleteMutation.isPending}
      />

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
