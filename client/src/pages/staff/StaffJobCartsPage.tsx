import { useJobCarts } from '../../api/hooks/useJobCarts';
import AdminTopBar from '../../components/layout/AdminTopBar';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { Briefcase, CheckCircle, Clock, ChevronRight, PlusCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function StaffJobCartsPage() {
  const { data, isLoading, isError, refetch } = useJobCarts({});
  const jobs = data?.data || [];

  return (
    <>
      <AdminTopBar
        title="Today's Job Queue"
        subtitle={`${jobs.length} vehicles registered today`}
        actions={
          <Link
            to="/staff/job-carts/new"
            className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-br from-[#1D4ED8] to-[#2563EB] text-white font-bold rounded-lg shadow-lg shadow-[#2563EB]/20 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98] transition-all text-xs uppercase tracking-wider"
          >
            <PlusCircle size={14} /> New Job Card
          </Link>
        }
      />

      {isError ? (
        <ErrorState
          message="Failed to load today's job queue. Please check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><SkeletonCard/><SkeletonCard/><SkeletonCard/></div>
      ) : !jobs.length ? (
        <EmptyState icon={Briefcase} title="No Cards in Queue" description="No job cards have been created for today yet." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job: any, idx: number) => (
            <Link
              key={job.id}
              to={`/staff/job-carts/${job.id}`}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 card-premium block group relative overflow-hidden opacity-0 animate-fade-in-up"
              style={{ animationDelay: `${idx * 0.05}s`, animationFillMode: 'forwards' }}
            >
              {/* Status color bar */}
              <div className={`absolute top-0 left-0 w-1 h-full rounded-r ${
                job.status === 'in_progress' ? 'bg-blue-500' :
                job.status === 'open' ? 'bg-orange-500' :
                job.status === 'complete' || job.status === 'delivered' ? 'bg-emerald-500' : 'bg-gray-300'
              }`} />
              
              <div className="flex justify-between items-start mb-3 ml-2">
                 <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
                  job.status === 'in_progress' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  job.status === 'complete' || job.status === 'delivered' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  'bg-gray-50 text-gray-700 border-gray-200'
                 }`}>
                   {job.status.replace('_', ' ')}
                 </span>
                 <span className="text-gray-400 text-xs font-medium group-hover:text-[#2563EB] flex items-center gap-1 transition-colors">
                   View <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                 </span>
              </div>

              <div className="ml-2">
                <h3 className="font-bold text-[#0F172A] text-lg mb-1 group-hover:text-[#2563EB] transition-colors">{job.registration_no}</h3>
                <p className="text-sm text-[#64748B] mb-4">{job.brand} {job.model}</p>

                <div className="bg-[#F8FAFC] p-3 rounded-lg text-sm text-gray-600 mb-4 border border-gray-100">
                  <span className="font-medium text-gray-800 block mb-1 text-xs uppercase tracking-wider">Services:</span>
                  <span className="line-clamp-2">{job.services_count ? `${job.services_count} Service(s) assigned` : 'No services assigned'}</span>
                </div>

                <div className="mt-4 flex items-center text-xs text-gray-400 font-medium tracking-wide">
                  <Clock size={14} className="mr-1.5" />
                  Created: {new Date(job.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
