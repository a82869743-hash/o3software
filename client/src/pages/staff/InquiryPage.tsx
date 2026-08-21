import { useState } from 'react';
import { Send, UserPlus } from 'lucide-react';
import { useCreateInquiry } from '../../api/hooks/useInquiries';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import { useUIStore } from '../../store/uiStore';

export default function StaffInquiryPage() {
  const toast = useUIStore((s) => s.toast);
  const createMut = useCreateInquiry();

  const [form, setForm] = useState({
    name: '',
    mobile: '',
    email: '',
    vehicle_brand: '',
    vehicle_model: '',
    services_interested: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.mobile) {
      toast('error', 'Name and Mobile number are required');
      return;
    }

    try {
      await createMut.mutateAsync({ ...form, source: 'staff' });
      toast('success', 'Walk-in inquiry recorded successfully');
      setForm({
        name: '', mobile: '', email: '',
        vehicle_brand: '', vehicle_model: '', services_interested: ''
      });
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to submit inquiry');
    }
  };

  return (
    <>
      <AdminTopBar
        title="Walk-in Inquiries"
        subtitle="Record leads who visit the studio"
      />

      <div className="max-w-2xl mx-auto">
        <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-[#2563EB]/5 to-[#2563EB]/10 rounded-xl border border-[#2563EB]/20 mb-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#1D4ED8] to-[#2563EB]" />
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2563EB]/20 to-[#2563EB]/10 flex items-center justify-center mb-3">
            <UserPlus size={28} className="text-[#2563EB]" />
          </div>
          <h2 className="text-xl font-black text-[#0F172A] mb-1">New Customer Lead</h2>
          <p className="text-sm text-[#5f5e5e] text-center max-w-md">
            Record details for walk-in customers or callers so the admin team can follow up later.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#1D4ED8] via-[#2563EB] to-transparent" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 mt-2">
            <Input 
              label="Customer Name *" 
              value={form.name} 
              onChange={e => setForm({...form, name: e.target.value})} 
              placeholder="Full name" 
            />
            <Input 
              label="Mobile Number *" 
              value={form.mobile} 
              onChange={e => setForm({...form, mobile: e.target.value.replace(/\D/g, '').slice(0,10)})} 
              placeholder="10 digit number" 
            />
          </div>
          
          <div className="mb-4">
            <Input 
              label="Email Address (Optional)" 
              type="email"
              value={form.email} 
              onChange={e => setForm({...form, email: e.target.value})} 
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Input 
              label="Vehicle Brand (Optional)" 
              value={form.vehicle_brand} 
              onChange={e => setForm({...form, vehicle_brand: e.target.value})} 
              placeholder="e.g. Hyundai" 
            />
            <Input 
              label="Vehicle Model (Optional)" 
              value={form.vehicle_model} 
              onChange={e => setForm({...form, vehicle_model: e.target.value})} 
              placeholder="e.g. i20 Elite" 
            />
          </div>

          <div className="mb-8">
            <Textarea
              label="Services Interested In / Notes (Optional)"
              value={form.services_interested}
              onChange={e => setForm({...form, services_interested: e.target.value})}
              placeholder="E.g., wants quotation for ceramic coating next week."
              className="h-24"
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" loading={createMut.isPending} icon={<Send size={16} />}>
              Submit Lead
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
