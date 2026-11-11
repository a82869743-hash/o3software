import { useState } from 'react';
import { Search, Award, User } from 'lucide-react';
import { useLoyaltySearch, useUpdateLoyalty } from '../../api/hooks/useLoyalty';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import SearchInput from '../../components/ui/SearchInput';
import { useUIStore } from '../../store/uiStore';
import { formatINR } from '../../utils/formatters';

export default function LoyaltyAwardPage() {
  const toast = useUIStore((s) => s.toast);
  const [searchQ, setSearchQ] = useState('');
  const { data: customers } = useLoyaltySearch(searchQ);
  const updateMut = useUpdateLoyalty();

  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [credits, setCredits] = useState(0);
  const [washes, setWashes] = useState(0);
  const [wax, setWax] = useState(0);
  const [note, setNote] = useState('');

  const handleAward = async () => {
    if (!selectedCustomer) return;
    if (!credits && !washes && !wax) { toast('error', 'Enter at least one reward'); return; }
    try {
      await updateMut.mutateAsync({
        customerId: selectedCustomer.id,
        credits, free_washes: washes, wax_count: wax, note,
      });
      toast('success', `Rewards awarded to ${selectedCustomer.name}`);
      setCredits(0); setWashes(0); setWax(0); setNote('');
      // Update local display
      setSelectedCustomer({
        ...selectedCustomer,
        credits: parseFloat(selectedCustomer.credits) + credits,
        free_washes: selectedCustomer.free_washes + washes,
        wax_count: selectedCustomer.wax_count + wax,
      });
    } catch (err: any) { toast('error', err?.response?.data?.error || 'Failed'); }
  };

  return (
    <>
      <AdminTopBar title="Loyalty Awards" subtitle="Quick award benefits to customers" />

      <div className="max-w-xl space-y-6">
        {/* Search */}
        <div className="relative">
          <SearchInput
            value={searchQ}
            onChange={setSearchQ}
            placeholder="Search customer by name or mobile..."
            className="w-full"
          />

          {/* Dropdown results */}
          {searchQ.length >= 2 && customers?.length > 0 && !selectedCustomer && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-100 max-h-60 overflow-y-auto">
              {customers.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedCustomer(c); setSearchQ(''); }}
                  className="w-full px-4 py-3 text-left hover:bg-[#F1F5F9] transition-colors flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-bold text-[#0F172A]">{c.name}</p>
                    <p className="text-xs text-[#64748B]">{c.mobile}</p>
                  </div>
                  <div className="text-right text-[10px] text-[#64748B]">
                    <p>₹{c.credits} · {c.free_washes}W · {c.wax_count}X</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected Customer Card */}
        {selectedCustomer && (
          <div className="bg-white rounded-lg p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F1F5F9] flex items-center justify-center">
                  <User size={18} className="text-[#64748B]" />
                </div>
                <div>
                  <p className="font-bold text-[#0F172A]">{selectedCustomer.name}</p>
                  <p className="text-xs text-[#64748B]">{selectedCustomer.mobile}</p>
                </div>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="text-xs font-bold text-[#2563EB] hover:underline">Change</button>
            </div>

            {/* Current Balances */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5 p-3 bg-[#F1F5F9] rounded-lg">
              <div className="text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#64748B]">Credits</p>
                <p className="text-sm font-extrabold text-[#0F172A]">{formatINR(selectedCustomer.credits)}</p>
              </div>
              <div className="text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#64748B]">Washes</p>
                <p className="text-sm font-extrabold text-[#0F172A]">{selectedCustomer.free_washes}</p>
              </div>
              <div className="text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#64748B]">Wax</p>
                <p className="text-sm font-extrabold text-[#0F172A]">{selectedCustomer.wax_count}</p>
              </div>
            </div>

            {/* Award Form */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input label="Credits ₹" type="number" value={credits || ''} onChange={e => setCredits(parseFloat(e.target.value) || 0)} />
                <Input label="Free Washes" type="number" value={washes || ''} onChange={e => setWashes(parseInt(e.target.value) || 0)} />
                <Input label="Wax Treatments" type="number" value={wax || ''} onChange={e => setWax(parseInt(e.target.value) || 0)} />
              </div>
              <Input label="Note (Optional)" value={note} onChange={e => setNote(e.target.value)} placeholder="Reason for award..." />
              <Button onClick={handleAward} loading={updateMut.isPending} icon={<Award size={14} />} className="w-full">
                Award Benefits
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
