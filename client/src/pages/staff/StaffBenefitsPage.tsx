import { IndianRupee, History, TrendingUp } from 'lucide-react';
import AdminTopBar from '../../components/layout/AdminTopBar';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import { useMyPayments } from '../../api/hooks/useStaff';
import { formatDate } from '../../utils/formatters';

export default function StaffBenefitsPage() {
  const { data, isLoading, isError, refetch } = useMyPayments();
  const benefits = data?.data || [];

  const pendingAmount = benefits.filter((b: any) => b.status === 'pending').reduce((sum: number, b: any) => sum + Number(b.amount), 0);

  return (
    <>
      <AdminTopBar title="My Benefits & Incentives" subtitle="Track your bonuses and compensation" />

      {isError ? (
        <div className="pt-4">
          <ErrorState
            message="Failed to load benefits history. Please check your connection and try again."
            onRetry={() => refetch()}
          />
        </div>
      ) : isLoading ? (
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <>
          {/* Premium pending card */}
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm mb-6 flex items-center gap-5 card-premium relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-500 via-green-400 to-green-500/20" />
            <div className="w-14 h-14 bg-gradient-to-br from-green-100 to-green-50 text-green-600 rounded-2xl flex items-center justify-center shadow-sm">
              <IndianRupee size={28} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1">
                <TrendingUp size={12} /> Pending Clearance
              </p>
              <h2 className="text-3xl font-black text-[#0F172A] tracking-tight">₹{pendingAmount.toLocaleString('en-IN')}</h2>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
             <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
               <History size={18} className="text-[#2563EB]"/>
               <h2 className="font-bold text-[#0F172A]">Payout History</h2>
             </div>
             
             {!benefits.length ? (
               <EmptyState icon={IndianRupee} title="No Payments Yet" description="No payments recorded yet. Your incentives will appear here." />
             ) : (
               <div className="divide-y divide-gray-50">
                 {benefits.map((b: any, idx: number) => (
                   <div
                     key={b.id}
                     className="p-4 flex items-center justify-between hover:bg-[#F8FAFC] transition-colors opacity-0 animate-fade-in-up"
                     style={{ animationDelay: `${idx * 0.05}s`, animationFillMode: 'forwards' }}
                   >
                     <div>
                       <h4 className="font-bold text-[#0F172A]">{b.purpose}</h4>
                       <p className="text-xs text-gray-600 mt-1">{formatDate(b.payment_date || b.created_at)}</p>
                     </div>
                     <div className="text-right">
                       <p className="font-black text-lg text-[#0F172A]">₹{Number(b.amount).toLocaleString('en-IN')}</p>
                       <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-lg border ${b.status === 'paid' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                         {b.status}
                       </span>
                     </div>
                   </div>
                 ))}
               </div>
             )}
          </div>
        </>
      )}
    </>
  );
}
