import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Users, Box, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useImportCustomers, useImportInventory } from '../../api/hooks/useImport';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import { useUIStore } from '../../store/uiStore';

export default function ImportPage() {
  const toast = useUIStore((s) => s.toast);
  const custMut = useImportCustomers();
  const invMut = useImportInventory();
  
  const [activeTab, setActiveTab] = useState<'customers' | 'inventory'>('customers');
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);
  
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setUploadResult(null); // reset prev result
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast('error', 'Please select a file first.');
      return;
    }
    
    try {
      if (activeTab === 'customers') {
        const res = await custMut.mutateAsync(file);
        setUploadResult(res.data);
        toast('success', 'Customer data imported successfully');
      } else {
        const res = await invMut.mutateAsync(file);
        setUploadResult(res.data);
        toast('success', 'Inventory data imported successfully');
      }
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Import failed');
    }
  };

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
            <p className="text-xs text-gray-400 mt-1">Upload .xlsx with Name, Mobile, Email columns</p>
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

      <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm mb-6 flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-[#f6f3f2] flex items-center justify-center mb-4 text-[#2563EB]">
          <FileSpreadsheet size={32} />
        </div>
        
        <h2 className="text-xl font-bold text-[#0F172A] mb-2">Upload {activeTab === 'customers' ? 'Customer' : 'Inventory'} File</h2>
        <p className="text-sm text-[#5f5e5e] mb-6 text-center max-w-md">
          Please ensure your file has headers on the first row. We accept .csv and .xlsx files.
        </p>

        <input 
          type="file" 
          accept=".csv, .xlsx, .xls"
          className="hidden"
          ref={fileInput}
          onChange={handleFileChange}
        />
        
        {!file ? (
          <Button onClick={() => fileInput.current?.click()} icon={<Upload size={16} />}>Choose File</Button>
        ) : (
          <div className="w-full max-w-sm">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200 mb-4">
              <span className="text-sm font-medium text-gray-700 truncate mr-3">{file.name}</span>
              <button className="text-xs text-blue-500 font-bold uppercase tracking-wider" onClick={() => setFile(null)}>Remove</button>
            </div>
            <Button onClick={handleUpload} loading={custMut.isPending || invMut.isPending} className="w-full">Upload & Process</Button>
          </div>
        )}
      </div>

      {uploadResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 size={24} className="text-green-600" />
            <h3 className="font-bold text-green-900 text-lg">Import Complete</h3>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white p-4 rounded shadow-sm">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Items Found</p>
              <p className="text-2xl font-black text-[#0F172A]">{uploadResult.totalParsed}</p>
            </div>
            <div className="bg-white p-4 rounded shadow-sm">
              <p className="text-xs font-bold text-green-600 uppercase tracking-wider mb-1">New Inserted</p>
              <p className="text-2xl font-black text-green-700">{uploadResult.inserted}</p>
            </div>
            <div className="bg-white p-4 rounded shadow-sm">
              <p className="text-xs font-bold text-orange-500 uppercase tracking-wider mb-1">
                {activeTab === 'customers' ? 'Skipped (Duplicate)' : 'Updated (Existing)'}
              </p>
              <p className="text-2xl font-black text-orange-600">
                {activeTab === 'customers' ? uploadResult.skipped : uploadResult.updated}
              </p>
            </div>
          </div>

          {uploadResult.validationErrors && uploadResult.validationErrors.length > 0 && (
            <div className="bg-blue-50 p-4 rounded border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={16} className="text-blue-600" />
                <h4 className="font-bold text-blue-900 text-sm">Validation Issues Ignored:</h4>
              </div>
              <ul className="text-xs text-blue-700 list-disc list-inside space-y-1 max-h-32 overflow-y-auto">
                {uploadResult.validationErrors.map((e: string, i: number) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}
