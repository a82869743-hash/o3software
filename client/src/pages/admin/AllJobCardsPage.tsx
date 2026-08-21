import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../store/authStore';
import {
  ClipboardList, Download, Search, Calendar,
  RefreshCw, ChevronLeft, ChevronRight, X, Trash2, Eye
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axiosInstance';
import ConfirmModal from '../../components/ui/ConfirmModal';

interface JobCardRecord {
  id: number;
  visit_date: string;
  visit_number: number;
  status: string;
  notes: string | null;
  registration_no: string;
  brand: string;
  model: string;
  customer_name: string;
  customer_mobile: string;
  services_count: number;
  total_amount: number;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatINR(n: number) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function AllJobCardsPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<JobCardRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [serviceCategoryFilter, setServiceCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [cancelTargetId, setCancelTargetId] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const limit = 20;

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        page: String(page),
        limit: String(limit),
        status: statusFilter,
      };
      if (search) params.search = search;
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (serviceCategoryFilter && serviceCategoryFilter !== 'all') params.category = serviceCategoryFilter;

      const res = await api.get('/job-carts', { params });
      if (res.data.success) {
        setRecords(res.data.data || []);
        setTotal(res.data.pagination?.total ?? res.data.data.length);
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load job cards');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, serviceCategoryFilter, search, fromDate, toDate]);

  useEffect(() => { setPage(1); }, [statusFilter, serviceCategoryFilter, search, fromDate, toDate]);
  useEffect(() => { fetchRecords(); }, [fetchRecords]);


  const downloadJobCardPDF = async (id: number, regNo: string) => {
    setDownloading(id);
    try {
      const resp = await api.get(`/job-carts/${id}/pdf`, { responseType: 'blob', timeout: 30000 });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `JobCard-${regNo}-${id}.pdf`;
      link.click();

      URL.revokeObjectURL(link.href);
      toast.success('Downloaded Job Card PDF');
    } catch (e) {
      toast.error('Could not generate Job Card PDF. Please try again.');
    } finally {
      setDownloading(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTargetId) return;
    setCancelling(true);
    try {
      await api.delete(`/job-carts/${cancelTargetId}`);
      toast.success('Job card cancelled');
      setCancelTargetId(null);
      fetchRecords();
    } catch {
      toast.error('Failed to cancel job card');
    } finally {
      setCancelling(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setFromDate('');
    setToDate('');
    setStatusFilter('all');
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit);
  const hasFilters = search || fromDate || toDate || statusFilter !== 'all';

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">

      {/* ── Page Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF' }}>
              <ClipboardList size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: 0, letterSpacing: '-0.5px' }}>
                All Job Cards
              </h1>
              <p style={{ fontSize: '13px', color: '#64748B', margin: 0, marginTop: '2px', fontWeight: 500 }}>
                View, filter, search, print and download official PDF job cards & bills
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => navigate('/admin/job-carts/new')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563EB', color: 'white', border: 'none', borderRadius: '10px', padding: '10px 20px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,0.25)' }}
          >
            + New Job Card
          </button>
          <button
            onClick={fetchRecords}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FFFFFF', color: '#475569', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '10px 16px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Status Tab Filter Bar ── */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '12px' }}>
        {[
          { key: 'all', label: 'All Cards' },
          { key: 'draft', label: 'Draft' },
          { key: 'open', label: 'Open / In Progress' },
          { key: 'complete', label: 'Completed' },
          { key: 'invoiced', label: 'Invoiced' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              border: 'none',
              transition: 'all 0.15s ease',
              background: statusFilter === tab.key ? '#2563EB' : '#FFFFFF',
              color: statusFilter === tab.key ? '#FFFFFF' : '#64748B',
              boxShadow: statusFilter === tab.key ? '0 2px 8px rgba(37,99,235,0.25)' : '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Service Category Subdivision Bar ── */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '20px' }}>
        {[
          { key: 'all', label: 'All Categories' },
          { key: 'ceramic', label: '🛡️ Ceramic & Coating' },
          { key: 'wash', label: '🧼 Car Spa & Wash' },
          { key: 'denting', label: '🎨 Denting & Painting' },
          { key: 'ppf', label: '🛡️ PPF & Wrapping' },
          { key: 'interior', label: '✨ Interior Detailing' },
          { key: 'other', label: '🔧 Other Services' },
        ].map((cat) => (
          <button
            key={cat.key}
            onClick={() => setServiceCategoryFilter(cat.key)}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '11px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              border: serviceCategoryFilter === cat.key ? '1px solid #2563EB' : '1px solid #E2E8F0',
              transition: 'all 0.15s ease',
              background: serviceCategoryFilter === cat.key ? '#EFF6FF' : '#FFFFFF',
              color: serviceCategoryFilter === cat.key ? '#1D4ED8' : '#475569',
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* ── Filter Bar ── */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '16px 20px', border: '1px solid #E2E8F0', marginBottom: '20px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search reg no, name, phone, car brand..."
            style={{ width: '100%', paddingLeft: 40, paddingRight: 14, paddingTop: 9, paddingBottom: 9, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '13px', color: '#0F172A', outline: 'none' }}
          />
        </div>

        {/* Date From */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>From:</span>
          <div style={{ position: 'relative' }}>
            <Calendar size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 8, paddingBottom: 8, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '13px', color: '#0F172A', outline: 'none' }}
            />
          </div>
        </div>

        {/* Date To */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>To:</span>
          <div style={{ position: 'relative' }}>
            <Calendar size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 8, paddingBottom: 8, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '13px', color: '#0F172A', outline: 'none' }}
            />
          </div>
        </div>

        {/* Clear Filters */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#F1F5F9', color: '#64748B', border: 'none', borderRadius: '10px', padding: '9px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            <X size={14} /> Clear Filters
          </button>
        )}
      </div>

      {/* ── Summary Stats Strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B' }}>Total Job Cards</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', marginTop: '4px' }}>{total}</div>
        </div>
        <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B' }}>Page Count</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#2563EB', marginTop: '4px' }}>{records.length}</div>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748B' }}>
            <div className="animate-spin" style={{ display: 'inline-block', width: 30, height: 30, border: '3px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', marginBottom: 12 }} />
            <p style={{ fontWeight: 600, margin: 0 }}>Loading Job Cards...</p>
          </div>
        ) : records.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748B' }}>
            <ClipboardList size={48} style={{ color: '#CBD5E1', marginBottom: 12 }} />
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1E293B', margin: 0 }}>No Job Cards Found</h3>
            <p style={{ fontSize: '13px', margin: '4px 0 16px' }}>Try adjusting your search query or filters</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '14px 20px' }}>Job Card #</th>
                <th style={{ padding: '14px 20px' }}>Vehicle</th>
                <th style={{ padding: '14px 20px' }}>Customer</th>
                <th style={{ padding: '14px 20px' }}>Visit Date</th>
                <th style={{ padding: '14px 20px', textAlign: 'center' }}>Services</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Total Amount</th>
                <th style={{ padding: '14px 20px', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((rec) => (
                <tr
                  key={rec.id}
                  onClick={() => navigate(`/admin/job-carts/${rec.id}`)}
                  style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer', transition: 'background 0.15s ease' }}
                  className="hover:bg-blue-50/50"
                >
                  {/* ID */}
                  <td style={{ padding: '14px 20px', fontWeight: 800, color: '#2563EB' }}>
                    #{rec.id}
                  </td>

                  {/* Vehicle */}
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ fontWeight: 800, color: '#0F172A' }}>{rec.registration_no}</div>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>{rec.brand} {rec.model}</div>
                  </td>

                  {/* Customer */}
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ fontWeight: 700, color: '#1E293B' }}>{rec.customer_name}</div>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>{rec.customer_mobile}</div>
                  </td>

                  {/* Visit Date */}
                  <td style={{ padding: '14px 20px', color: '#475569', fontWeight: 500 }}>
                    {formatDate(rec.visit_date)}
                    <span style={{ display: 'block', fontSize: '10px', color: '#94A3B8' }}>Visit #{rec.visit_number}</span>
                  </td>

                  {/* Services */}
                  <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                    <span style={{ background: '#F1F5F9', padding: '4px 10px', borderRadius: '20px', fontWeight: 700, fontSize: '11px', color: '#475569' }}>
                      {rec.services_count} services
                    </span>
                  </td>

                  {/* Total */}
                  <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>
                    ₹{formatINR(rec.total_amount)}
                  </td>

                  {/* Status */}
                  <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      background: rec.status === 'complete' ? '#DCFCE7' : rec.status === 'open' ? '#DBEAFE' : '#F1F5F9',
                      color: rec.status === 'complete' ? '#15803D' : rec.status === 'open' ? '#1D4ED8' : '#64748B',
                    }}>
                      {rec.status}
                    </span>
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '14px 20px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => navigate(`/admin/job-carts/${rec.id}`)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#F8FAFC', border: '1px solid #CBD5E1', color: '#334155', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                        title="View Job Card Details"
                      >
                        <Eye size={14} /> View
                      </button>
                      <button
                        onClick={() => downloadJobCardPDF(rec.id, rec.registration_no)}
                        disabled={downloading === rec.id}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#2563EB', border: 'none', color: '#FFFFFF', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                        title="Download Printable PDF"
                      >
                        <Download size={14} /> {downloading === rec.id ? 'PDF...' : 'PDF'}
                      </button>
                      {rec.status !== 'cancelled' && (
                        <button
                          onClick={() => setCancelTargetId(rec.id)}
                          style={{ background: 'transparent', border: 'none', color: '#94A3B8', padding: '6px', cursor: 'pointer' }}
                          title="Cancel Job Card"
                        >
                          <Trash2 size={16} className="hover:text-red-500 transition-colors" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderTop: '1px solid #E2E8F0', background: '#F8FAFC' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 500 }}>
              Page {page} of {totalPages} ({total} total cards)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                style={{ padding: '6px 12px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                style={{ padding: '6px 12px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.5 : 1 }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>


      <ConfirmModal
        open={cancelTargetId !== null}
        onClose={() => setCancelTargetId(null)}
        onConfirm={handleConfirmCancel}
        title="Cancel Job Card"
        description="Are you sure you want to cancel this job card?"
        confirmText="Cancel Job Card"
        isDestructive={true}
        loading={cancelling}
      />
    </div>
  );
}
