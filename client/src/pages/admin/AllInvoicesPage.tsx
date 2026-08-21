import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../store/authStore';
import {
  FileText, Download, Search, Filter, Calendar,
  RefreshCw, Loader2, ChevronLeft, ChevronRight,
  Receipt, Wallet, ShoppingCart, ClipboardList, X, Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';

import api from '../../api/axiosInstance';
import ConfirmModal from '../../components/ui/ConfirmModal';

type BillType = 'all' | 'job_cart' | 'manual_bill' | 'salary' | 'buy_sell_buy' | 'buy_sell_sell';

interface InvoiceRecord {
  id: number;
  type: string;
  reference: string;
  party_name: string;
  party_mobile: string | null;
  date: string;
  amount: number;
  registration_no: string | null;
  discount_type: string | null;
  discount_value: number | null;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof FileText }> = {
  job_cart:          { label: 'Job Card',    color: '#1565C0', bg: '#E3F2FD', icon: ClipboardList },
  manual_bill:       { label: 'Manual Bill', color: '#2E7D32', bg: '#E8F5E9', icon: Receipt },
  salary:            { label: 'Salary Slip', color: '#6A1B9A', bg: '#F3E5F5', icon: Wallet },
  buy_sell_buy:      { label: 'Purchase',    color: '#E65100', bg: '#FFF3E0', icon: ShoppingCart },
  buy_sell_sell:     { label: 'Sale',        color: '#00695C', bg: '#E0F2F1', icon: ShoppingCart },
  quick_wash:        { label: 'Quick Wash',  color: '#0277BD', bg: '#E1F5FE', icon: Receipt },
  package_purchase:  { label: 'Package',     color: '#AD1457', bg: '#FCE4EC', icon: Receipt },
};

const TAB_FILTERS: { key: BillType | 'quick_wash'; label: string; icon: typeof FileText }[] = [
  { key: 'all',           label: 'All Bills',    icon: FileText },
  { key: 'job_cart',      label: 'Job Cards',    icon: ClipboardList },
  { key: 'quick_wash',    label: 'Quick Washes', icon: Receipt },
  { key: 'manual_bill',   label: 'Manual Bills', icon: Receipt },
  { key: 'salary',        label: 'Salary Slips', icon: Wallet },
  { key: 'buy_sell_buy',  label: 'Purchases',    icon: ShoppingCart },
  { key: 'buy_sell_sell', label: 'Sales',        icon: ShoppingCart },
];

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatINR(n: number) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function AllInvoicesPage() {
  const { token } = useAuthStore();
  const [records, setRecords] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<BillType | 'quick_wash'>('all');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [voidConfirmRecord, setVoidConfirmRecord] = useState<InvoiceRecord | null>(null);
  const [voiding, setVoiding] = useState(false);
  const limit = 25;
  // Resolve api type filter — buy_sell_buy/sell both map to buy_sell on the server
  const apiType = activeType === 'buy_sell_buy' || activeType === 'buy_sell_sell' ? 'buy_sell' : activeType;

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        page: String(page),
        limit: String(limit),
        type: apiType,
      };
      if (search)   params.search = search;
      if (fromDate) params.from_date = fromDate;
      if (toDate)   params.to_date = toDate;

      const res = await api.get('/invoices', { params });
      const json = res.data;
      if (json.success) {
        // Client-side filter for buy/sell sub-types
        let data: InvoiceRecord[] = json.data;
        if (activeType === 'buy_sell_buy')  data = data.filter(r => r.type === 'buy_sell_buy');
        if (activeType === 'buy_sell_sell') data = data.filter(r => r.type === 'buy_sell_sell');
        setRecords(data);
        setTotal(json.pagination?.total ?? data.length);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, apiType, activeType, search, fromDate, toDate]);

  useEffect(() => { setPage(1); }, [activeType, search, fromDate, toDate]);
  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const downloadInvoice = async (rec: InvoiceRecord) => {
    const key = `${rec.type}-${rec.id}`;
    setDownloading(key);
    try {
      let path = '';
      if (rec.type === 'job_cart')    path = `/job-carts/${rec.id}/invoice`;
      if (rec.type === 'manual_bill') path = `/billing/${rec.id}/invoice`;
      if (rec.type === 'salary')      path = `/salary/${rec.id}/slip`;
      if (rec.type === 'quick_wash')  path = `/quick-wash/${rec.id}/invoice`;
      if (rec.type === 'package_purchase') path = `/packages/requests/${rec.id}/invoice`;
      if (rec.type.startsWith('buy_sell')) path = `/buy-sell/${rec.id}/invoice`;

      if (!path) { toast.error('PDF not available for this record type'); return; }
      const resp = await api.get(path, { responseType: 'blob', timeout: 30000 });
      const blob = new Blob([resp.data], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${rec.reference}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      toast.error('Could not generate invoice. Please try again.');
    } finally {
      setDownloading(null);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit);
  const hasFilters = search || fromDate || toDate;

  const handleVoidClick = (rec: InvoiceRecord) => {
    setVoidConfirmRecord(rec);
  };

  const handleVoidConfirm = async () => {
    if (!voidConfirmRecord) return;
    setVoiding(true);
    const rec = voidConfirmRecord;
    const typeLabel = rec.type === 'manual_bill' ? 'bill' : rec.type === 'job_cart' ? 'job card' : 'record';
    try {
      if (rec.type === 'manual_bill') {
        await api.delete(`/billing/${rec.id}`);
      } else if (rec.type === 'job_cart') {
        await api.delete(`/job-carts/${rec.id}`);
      }
      toast.success(`${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} voided`);
      setVoidConfirmRecord(null);
      fetchRecords();
    } catch {
      toast.error(`Failed to void ${typeLabel}`);
    } finally {
      setVoiding(false);
    }
  };

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", minHeight: '100vh' }}>
      {/* ─── Page Header ─── */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.5px' }}>
              All Invoices & Bills
            </h1>
            <p style={{ color: '#5f5e5e', fontSize: '13px', marginTop: '4px' }}>
              Unified view of all financial records — newest first
            </p>
          </div>
          <button
            onClick={fetchRecords}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563EB', color: 'white', border: 'none', borderRadius: '10px', padding: '10px 20px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
      </div>

      {/* ─── Type Tabs ─── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {TAB_FILTERS.map(({ key, label, icon: Icon }) => {
          const active = activeType === key;
          return (
            <button
              key={key}
              id={`tab-${key}`}
              onClick={() => setActiveType(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '20px', border: 'none',
                background: active ? '#2563EB' : '#f6f3f2',
                color: active ? 'white' : '#5f5e5e',
                fontWeight: active ? 700 : 500,
                fontSize: '13px', cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: active ? '0 2px 8px rgba(211,47,47,0.25)' : 'none',
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>

      {/* ─── Filters ─── */}
      <div style={{
        background: 'white', borderRadius: '14px', padding: '16px 20px',
        border: '1px solid #ede8e7', marginBottom: '20px',
        display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1', minWidth: '200px', background: '#f9f6f5', borderRadius: '8px', padding: '8px 14px' }}>
          <Search size={16} color="#9e9e9e" />
          <input
            id="invoice-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, mobile, reference..."
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', color: '#0F172A', width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f9f6f5', borderRadius: '8px', padding: '8px 14px' }}>
          <Calendar size={14} color="#9e9e9e" />
          <span style={{ fontSize: '12px', color: '#9e9e9e' }}>From</span>
          <input
            id="from-date"
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
            id="to-date"
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
          <div style={{ color: '#9e9e9e', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Records</div>
          <div style={{ color: 'white', fontSize: '22px', fontWeight: 800 }}>{total}</div>
        </div>
        <div style={{ width: '1px', height: '36px', background: 'rgba(255,255,255,0.1)' }} />
        <div>
          <div style={{ color: '#9e9e9e', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>This Page</div>
          <div style={{ color: 'white', fontSize: '22px', fontWeight: 800 }}>{records.length}</div>
        </div>
        <div style={{ width: '1px', height: '36px', background: 'rgba(255,255,255,0.1)' }} />
        <div>
          <div style={{ color: '#9e9e9e', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Page Total (₹)</div>
          <div style={{ color: '#ef9a9a', fontSize: '22px', fontWeight: 800 }}>
            ₹{formatINR(records.reduce((s, r) => s + Number(r.amount || 0), 0))}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={14} color="#9e9e9e" />
          <span style={{ color: '#9e9e9e', fontSize: '12px' }}>Sorted newest first</span>
        </div>
      </div>

      {/* ─── Table ─── */}
      <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #ede8e7', overflowX: 'auto', overflowY: 'hidden' }}>
        <div style={{ minWidth: '950px' }}>
        {/* Table Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '140px 1fr 1fr 120px 120px 120px',
          padding: '12px 20px',
          background: '#f9f6f5',
          borderBottom: '1px solid #ede8e7',
        }}>
          {['Type', 'Reference', 'Party / Customer', 'Date', 'Amount', 'Invoice'].map((h) => (
            <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: '#9e9e9e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <Loader2 size={32} color="#2563EB" style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#9e9e9e', marginTop: '12px', fontSize: '14px' }}>Loading invoices...</p>
          </div>
        ) : records.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <FileText size={40} color="#e0e0e0" style={{ marginBottom: '12px' }} />
            <p style={{ color: '#9e9e9e', fontSize: '15px', fontWeight: 600 }}>No records found</p>
            <p style={{ color: '#bdbdbd', fontSize: '13px', marginTop: '4px' }}>Try adjusting your filters</p>
          </div>
        ) : records.map((rec, idx) => {
          const cfg = TYPE_CONFIG[rec.type] || TYPE_CONFIG['manual_bill'];
          const Icon = cfg.icon;
          const dlKey = `${rec.type}-${rec.id}`;
          const isDownloading = downloading === dlKey;

          return (
            <div
              key={dlKey}
              style={{
                display: 'grid',
                gridTemplateColumns: '140px 1fr 1fr 120px 120px 120px 40px',
                padding: '14px 20px',
                borderBottom: idx < records.length - 1 ? '1px solid #f5f0ef' : 'none',
                alignItems: 'center',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#fafaf9')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {/* Type Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  background: cfg.bg, color: cfg.color,
                  padding: '4px 10px', borderRadius: '20px',
                  fontSize: '11px', fontWeight: 700,
                }}>
                  <Icon size={11} />
                  {cfg.label}
                </div>
              </div>

              {/* Reference */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', fontFamily: 'monospace' }}>{rec.reference}</div>
                {rec.registration_no && (
                  <div style={{ fontSize: '11px', color: '#9e9e9e', marginTop: '2px' }}>🚗 {rec.registration_no}</div>
                )}
              </div>

              {/* Party */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#2d2c2c' }}>{rec.party_name || '—'}</div>
                {rec.party_mobile && (
                  <div style={{ fontSize: '11px', color: '#9e9e9e', marginTop: '2px' }}>📞 {rec.party_mobile}</div>
                )}
              </div>

              {/* Date */}
              <div style={{ fontSize: '12px', color: '#5f5e5e', fontWeight: 500 }}>
                {formatDate(rec.date)}
              </div>

              {/* Amount */}
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#2563EB' }}>
                  ₹{formatINR(Number(rec.amount || 0))}
                </div>
                {rec.discount_type && rec.discount_value && Number(rec.discount_value) > 0 && (
                  <div style={{ fontSize: '10px', color: '#9e9e9e', marginTop: '2px' }}>
                    -{rec.discount_type === 'percentage' ? `${rec.discount_value}%` : `₹${formatINR(Number(rec.discount_value))}`} disc
                  </div>
                )}
              </div>

              {/* Download */}
              <div>
                <button
                  id={`download-${dlKey}`}
                  onClick={() => downloadInvoice(rec)}
                  disabled={isDownloading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '7px 14px', borderRadius: '8px',
                    border: '1.5px solid #2563EB',
                    background: isDownloading ? '#f6f3f2' : 'white',
                    color: '#2563EB', fontSize: '12px', fontWeight: 700,
                    cursor: isDownloading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!isDownloading) { (e.currentTarget as HTMLElement).style.background = '#2563EB'; (e.currentTarget as HTMLElement).style.color = 'white'; }}}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'white'; (e.currentTarget as HTMLElement).style.color = '#2563EB'; }}
                >
                  {isDownloading
                    ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Download size={13} />
                  }
                  {isDownloading ? 'Generating...' : 'PDF'}
                </button>
              </div>

              {/* Void */}
              <div>
                {(rec.type === 'manual_bill' || rec.type === 'job_cart') && (
                  <button
                    onClick={() => handleVoidClick(rec)}
                    title="Void / Archive"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '7px', borderRadius: '8px', border: 'none',
                      background: 'transparent', cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#FEE2E2')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Trash2 size={14} color="#9e9e9e" />
                  </button>
                )}
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
          <span style={{ fontSize: '13px', color: '#5f5e5e', fontWeight: 600 }}>
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
        open={voidConfirmRecord !== null}
        onClose={() => setVoidConfirmRecord(null)}
        onConfirm={handleVoidConfirm}
        title="Void Record"
        description={`Are you sure you want to void this ${voidConfirmRecord?.type === 'manual_bill' ? 'bill' : 'job card'}? It will be moved to the Recycle Bin.`}
        confirmText="Void Record"
        isDestructive={true}
        loading={voiding}
      />

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
