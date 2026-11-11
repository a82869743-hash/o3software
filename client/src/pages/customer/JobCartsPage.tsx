import MyPackages from '../../components/customer/MyPackages';
import { useState } from 'react';
import { ClipboardList, ChevronDown, ChevronUp, Download, Calendar, Car, Hash } from 'lucide-react';
import { useJobCarts } from '../../api/hooks/useJobCarts';
import { useAuthStore } from '../../store/authStore';
import StatusBadge from '../../components/shared/StatusBadge';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import { formatINR, formatDate } from '../../utils/formatters';
import type { JobPhoto } from '../../types';
import PhotoBanner from '../../components/customer/PhotoBanner';
import { PHOTOS as BANNER_PHOTOS } from '../../components/customer/serviceVisuals';
import { API_BASE } from '../../utils/endpoints';

/** hidePackages: set when this list is shown inside My bookings, which already shows the packages. */
export default function CustomerJobCartsPage({ hidePackages = false }: { hidePackages?: boolean } = {}) {
  const { data, isLoading, isError, refetch } = useJobCarts({ page: 1, limit: 100 });
  const [expanded, setExpanded] = useState<number | null>(null);
  const token = useAuthStore((s) => s.token);

  if (isError) {
    return (
      <div className="pt-4">
        <h2 className="sr-only">My Job Cards</h2>
        <ErrorState
          message="Failed to load job cards. Please check your connection and try again."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 pt-4">
        <h2 className="sr-only">My Job Cards</h2>
        <div className="grid gap-4">{[1, 2, 3].map(i => <SkeletonCard key={i} />)}</div>
      </div>
    );
  }

  const carts = data?.data || [];

  if (!carts.length) {
    return (
      <div className="pt-4">
        <h2 className="sr-only">My Job Cards</h2>
        {!hidePackages && <MyPackages />}
        <EmptyState
          icon={ClipboardList}
          title="No Job Cards Yet"
          description="Your service history will appear here after your first visit"
        />
      </div>
    );
  }

  const handleDownloadInvoice = (cartId: number) => {
    const apiBase = API_BASE;
    window.open(
      `${apiBase}/job-carts/${cartId}/invoice?token=${token}`,
      '_blank'
    );
  };

  return (
    <div className="pt-4">
      <PhotoBanner img={BANNER_PHOTOS.polish} kicker="Service history" line="Every service, photo and invoice" />
      <h2 className="sr-only">My Job Cards</h2>
      {!hidePackages && <MyPackages />}
      <h3 className="text-[15px] font-extrabold text-slate-900 mb-2">Service history</h3>

      <div className="space-y-3">
        {carts.map((cart: any, idx: number) => {
          const isOpen = expanded === cart.id;
          return (
            <div
              key={cart.id}
              className="bg-white rounded-xl shadow-sm overflow-hidden transition-all border border-gray-100 card-premium opacity-0 animate-fade-in-up"
              style={{ animationDelay: `${idx * 0.04}s`, animationFillMode: 'forwards' }}
            >
              {/* Red accent side */}
              <div className="flex">
                <div className={`w-1 shrink-0 transition-colors duration-200 ${isOpen ? 'bg-gradient-to-b from-[#1D4ED8] to-[#2563EB]' : 'bg-transparent'}`} />
                <div className="flex-1">
                  {/* Card Header */}
                  <button
                    onClick={() => setExpanded(isOpen ? null : cart.id)}
                    className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-[#F8FAFC] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-extrabold text-[#0F172A] tracking-wide">{cart.registration_no}</span>
                        <StatusBadge status={cart.status} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#64748B]">
                        <span className="flex items-center gap-1"><Car size={12} /> {cart.brand} {cart.model}</span>
                        <span className="flex items-center gap-1"><Calendar size={12} /> {formatDate(cart.visit_date)}</span>
                        <span className="flex items-center gap-1"><Hash size={12} /> Visit #{cart.visit_number}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      <span className="text-lg font-black text-[#0F172A] tracking-tight">{formatINR(cart.total_amount)}</span>
                      <div className={`p-1 rounded-full transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                        <ChevronDown size={18} className="text-gray-500" />
                      </div>
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isOpen && (
                    <div className="px-5 pb-5 border-t border-gray-100 animate-fade-in">
                      <div className="py-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B] mb-2">Services Performed</p>
                        {cart.services && cart.services.length > 0 ? (
                          <div className="space-y-1.5 mb-2">
                            {cart.services.map((s: any, sIdx: number) => (
                              <div key={s.id || sIdx} className="flex items-center justify-between text-xs py-1.5 px-3 bg-gray-50 rounded-lg border border-gray-100">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-[#0F172A]">{s.service_name}</span>
                                  {s.custom_notes && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
                                      📝 {s.custom_notes}
                                    </span>
                                  )}
                                </div>
                                <span className="font-extrabold text-[#0F172A]">
                                  {formatINR(s.custom_price || s.service_price || 0)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-[#64748B]">{cart.services_count || 1} service(s) · Total: {formatINR(cart.total_amount)}</p>
                        )}

                        {cart.discount_amount > 0 && (
                          <div className="mt-2 p-2 bg-amber-50/70 border border-amber-200/60 rounded-lg text-xs text-amber-900 flex justify-between items-center">
                            <span>Discount Applied {cart.discount_reason ? `(${cart.discount_reason})` : ''}</span>
                            <span className="font-bold">- {formatINR(cart.discount_amount)}</span>
                          </div>
                        )}
                      </div>

                      {cart.status === 'complete' && (
                        <div className="pt-3 border-t border-gray-100">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownloadInvoice(cart.id); }}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-br from-[#1D4ED8] to-[#2563EB] text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:shadow-blue-glow transition-all hover:-translate-y-0.5"
                          >
                            <Download size={14} /> Download Invoice
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
