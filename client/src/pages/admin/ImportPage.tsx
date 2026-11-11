import { useState, useRef } from 'react';
import api from '../../api/axiosInstance';
import { useAuthStore } from '../../store/authStore';
import { can } from '../../utils/access';
import { Upload, FileSpreadsheet, Users, Box, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useImportCustomers, useImportInventory } from '../../api/hooks/useImport';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import { useUIStore } from '../../store/uiStore';

export default function ImportPage() {
  const user = useAuthStore(st => st.user);
  const toast = useUIStore((s) => s.toast);
  const custMut = useImportCustomers();
  const invMut = useImportInventory();
  
  const [activeTab, setActiveTab] = useState<'customers' | 'inventory' | 'services'>('customers');
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);
  
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setUploadResult(null); // reset prev result
    }
  };

  const downloadTemplate = async () => {
    try {
      const res = await api.get('/import/template', { params: { type: activeTab }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = `${activeTab}_import_template.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast('error', 'Could not download template'); }
  };

  const [stockMode, setStockMode] = useState<'add' | 'set'>('add');
  const busy = custMut.isPending || invMut.isPending;

  // dryRun = check the file and show what would be saved, without saving anything
  const handleUpload = async (dryRun: boolean) => {
    if (!file) {
      toast('error', 'Please select a file first.');
      return;
    }
    try {
      if (activeTab === 'services') {
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await api.post('/import/services', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        setUploadResult({ total: data.data.totalParsed, created: data.data.inserted, updated: data.data.updated, errors: data.data.validationErrors || [] });
        toast('success', data.message);
      } else {
        const res = activeTab === 'customers'
          ? await custMut.mutateAsync({ file, dryRun })
          : await invMut.mutateAsync({ file, dryRun, stock: stockMode });
        setUploadResult(res.data);
        toast('success', res.message);
      }
      if (!dryRun) {
        setFile(null);
        if (fileInput.current) fileInput.current.value = '';
      }
    } catch (err: any) {
      const d = err?.response?.data;
      if (d?.data) setUploadResult({ ...d.data, failed: d.error });
      toast('error', d?.error || 'Import failed');
    }
  };

  const r = uploadResult || {};
  const errs: any[] = r.errors || [];
  const warns: any[] = r.warnings || [];
  const lineOf = (e: any) => (typeof e === 'string' ? e : `${e.where || (e.row ? `Row ${e.row}` : '')}: ${e.reason || e.message || ''}`);
  const tiles: [string, any, string][] = activeTab === 'customers'
    ? [['Rows read', r.total, 'text-[#0F172A]'], ['New customers', r.customers_created, 'text-green-700'], ['Existing customers updated', r.customers_updated, 'text-blue-700'],
      ['Cars added', r.cars_added, 'text-[#0F172A]'], ['Packages added', r.packages_added, 'text-green-700'], ['Packages already there', r.packages_already_there, 'text-orange-600'],
      ['Balances due added', r.balances_added, 'text-orange-600'], ['Total pending', r.pending_total !== undefined ? `₹${Number(r.pending_total).toLocaleString('en-IN')}` : undefined, 'text-red-600'],
      ['Rows with errors', errs.length, 'text-red-600']]
    : [['Rows read', r.total, 'text-[#0F172A]'], ['New', r.created, 'text-green-700'], ['Updated', r.updated, 'text-blue-700'], ['Rows with errors', errs.length, 'text-red-600']];

  return (
    <>
      <AdminTopBar title="Data Import" subtitle="Bulk upload data via Excel/CSV" />

      <div className="flex gap-4 mb-6">
        <button
          onClick={() => { setActiveTab('customers'); setFile(null); setUploadResult(null); }}
          className={`flex-1 p-6 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-3 ${
            activeTab === 'customers' ? 'border-[#2563EB] bg-[#2563EB]/5' : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className={`p-3 rounded-full ${activeTab === 'customers' ? 'bg-[#2563EB] text-white' : 'bg-gray-100 text-gray-400'}`}>
            <Users size={24} />
          </div>
          <div className="text-center">
            <h3 className={`font-bold ${activeTab === 'customers' ? 'text-[#0F172A]' : 'text-gray-500'}`}>Import Customers</h3>
            <p className="text-xs text-gray-400 mt-1">Old customers with car, package, paid and pending</p>
          </div>
        </button>

        <button
          onClick={() => { setActiveTab('inventory'); setFile(null); setUploadResult(null); }}
          className={`flex-1 p-6 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-3 ${
            activeTab === 'inventory' ? 'border-[#2563EB] bg-[#2563EB]/5' : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className={`p-3 rounded-full ${activeTab === 'inventory' ? 'bg-[#2563EB] text-white' : 'bg-gray-100 text-gray-400'}`}>
            <Box size={24} />
          </div>
          <div className="text-center">
            <h3 className={`font-bold ${activeTab === 'inventory' ? 'text-[#0F172A]' : 'text-gray-500'}`}>Import Inventory</h3>
            <p className="text-xs text-gray-400 mt-1">Upload .xlsx with Product Name, Stock, Unit columns</p>
          </div>
        </button>
      </div>

      {can(user, 'services', 'create') && (
        <button onClick={() => { setActiveTab('services'); setFile(null); setUploadResult(null); }}
          className={`w-full mb-6 p-4 rounded-xl border-2 text-left ${activeTab === 'services' ? 'border-[#2563EB] bg-[#2563EB]/5' : 'border-gray-200 bg-white'}`}>
          <h3 className="font-bold text-[#0F172A]">Import Services & Prices (HQ)</h3>
          <p className="text-xs text-gray-400 mt-1">Service name, category, duration and a price for each car type (Hatchback … Luxury)</p>
        </button>
      )}

      <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm mb-6 flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-[#F1F5F9] flex items-center justify-center mb-4 text-[#2563EB]">
          <FileSpreadsheet size={32} />
        </div>
        
        <h2 className="text-xl font-bold text-[#0F172A] mb-2">Upload {activeTab === 'customers' ? 'Customer' : activeTab === 'services' ? 'Services & Prices' : 'Inventory'} File</h2>
        <p className="text-sm text-[#64748B] mb-3 text-center max-w-md">
          Every sheet is read. Column names are matched by meaning (e.g. "Mobile", "Phone", "Mobile No." all work), and dates like 15/03/2026 are read as day/month.
          {activeTab === 'customers' && ' Only Name and Mobile are needed. Car, package, paid, advance, pending, services used and last visit are read when present; any other column is kept in the customer\'s notes. Old customers are matched by mobile, so importing the same file again does not double anything.'}
        </p>
        <button type="button" onClick={downloadTemplate} className="mb-6 text-sm font-bold text-[#2563EB] hover:underline">
          ⬇ Download the {activeTab} template
        </button>

        <input 
          type="file" 
          accept=".csv, .xlsx, .xls"
          className="hidden"
          ref={fileInput}
          onChange={handleFileChange}
        />
        
        {activeTab === 'inventory' && (
          <div className="flex gap-4 mb-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={stockMode === 'add'} onChange={() => setStockMode('add')} /> Add file quantity to current stock</label>
            <label className="flex items-center gap-2"><input type="radio" checked={stockMode === 'set'} onChange={() => setStockMode('set')} /> File quantity is the stock now</label>
          </div>
        )}

        {!file ? (
          <Button onClick={() => fileInput.current?.click()} icon={<Upload size={16} />}>Choose File</Button>
        ) : (
          <div className="w-full max-w-sm">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200 mb-4">
              <span className="text-sm font-medium text-gray-700 truncate mr-3">{file.name}</span>
              <button className="text-xs text-blue-500 font-bold uppercase tracking-wider" onClick={() => { setFile(null); setUploadResult(null); }}>Remove</button>
            </div>
            {activeTab !== 'services' && (
              <Button onClick={() => handleUpload(true)} loading={busy} variant="secondary" className="w-full mb-2">Check file first (saves nothing)</Button>
            )}
            <Button onClick={() => handleUpload(false)} loading={busy} className="w-full">Import & Save</Button>
          </div>
        )}
      </div>

      {uploadResult && (
        <div className={`${r.failed ? 'bg-red-50 border-red-200' : r.dry_run ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'} border rounded-xl p-6 mb-6`}>
          <div className="flex items-center gap-3 mb-4">
            {r.failed ? <AlertCircle size={24} className="text-red-600" /> : <CheckCircle2 size={24} className={r.dry_run ? 'text-blue-600' : 'text-green-600'} />}
            <h3 className="font-bold text-[#0F172A] text-lg">
              {r.failed ? r.failed : r.dry_run ? 'File checked: nothing saved yet. This is what will be saved:' : 'Import complete'}
            </h3>
          </div>

          {!r.failed && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
              {tiles.filter(t => t[1] !== undefined).map(([label, val, cls]) => (
                <div key={label} className="bg-white p-3 rounded shadow-sm">
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">{label}</p>
                  <p className={`text-xl font-black ${cls}`}>{val ?? 0}</p>
                </div>
              ))}
            </div>
          )}
          {r.stock_mode && !r.failed && <p className="text-xs text-gray-600 mb-4">Stock: {r.stock_mode === 'set' ? 'file quantity is the stock now' : 'file quantity added to current stock'}</p>}

          {Array.isArray(r.sheets) && r.sheets.length > 0 && (
            <div className="bg-white p-4 rounded border border-gray-200 mb-4">
              <h4 className="font-bold text-sm text-[#0F172A] mb-2">Columns read from your file</h4>
              {r.sheets.map((sh: any) => (
                <div key={sh.sheet} className="text-xs text-gray-700 mb-2">
                  <b>Sheet "{sh.sheet}"</b>{sh.used ? ` — headers on row ${sh.header_row}, ${sh.rows} rows` : ` — skipped (${sh.reason})`}
                  {sh.used && (
                    <>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {sh.mapped.map((m: any) => <span key={m.header} className="px-2 py-0.5 rounded bg-green-50 border border-green-200">{m.header} → {m.field.replace(/_/g, ' ')}</span>)}
                      </div>
                      {sh.unknown.length > 0 && (
                        <p className="mt-1 text-gray-500">Not a known column (kept in the customer's notes): {sh.unknown.join(', ')}</p>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {errs.length > 0 && (
            <div className="bg-red-50 p-4 rounded border border-red-200 mb-3">
              <h4 className="font-bold text-red-900 text-sm mb-2 flex items-center gap-2"><AlertCircle size={16} /> Not imported ({errs.length})</h4>
              <ul className="text-xs text-red-700 list-disc list-inside space-y-1 max-h-48 overflow-y-auto">
                {errs.map((e, i) => <li key={i}>{lineOf(e)}</li>)}
              </ul>
            </div>
          )}
          {warns.length > 0 && (
            <div className="bg-amber-50 p-4 rounded border border-amber-200">
              <h4 className="font-bold text-amber-900 text-sm mb-2">Imported, please check ({warns.length})</h4>
              <ul className="text-xs text-amber-800 list-disc list-inside space-y-1 max-h-48 overflow-y-auto">
                {warns.map((e, i) => <li key={i}>{lineOf(e)}</li>)}
              </ul>
            </div>
          )}
          {r.dry_run && file && !r.failed && (
            <Button onClick={() => handleUpload(false)} loading={busy} className="mt-4">Looks right — Import & Save</Button>
          )}
        </div>
      )}
    </>
  );
}
