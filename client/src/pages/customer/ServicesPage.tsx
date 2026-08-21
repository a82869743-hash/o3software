import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, CreditCard, Droplets, ArrowRight, Shield, Search, ArrowUpDown, X } from 'lucide-react';
import { useServices } from '../../api/hooks/useServices';
import { useLoyalty } from '../../api/hooks/useLoyalty';
import Button from '../../components/ui/Button';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import ErrorState from '../../components/shared/ErrorState';
import { formatINR } from '../../utils/formatters';
import ServiceDetailsModal from '../../components/shared/ServiceDetailsModal';

import { getCategoryForModel } from '../../utils/carData';

const FILTERS = ['all', 'hatchback', 'medium_hatchback', 'sedan', 'premium_sedan', 'suv'] as const;
type Filter = typeof FILTERS[number];

type SortOption = 'priority' | 'alpha_asc' | 'alpha_desc' | 'price_asc' | 'price_desc';

// ─── Service Priority Sorting ─────────────────
const HOT_KEYWORDS = ['wash', 'premium wash', 'basic wash', 'ppf', 'coating', 'ceramic', 'polish', 'wax', 'paint protection', 'interior clean', 'detailing'];

function getServicePriority(name: string): number {
  const lower = name.toLowerCase();
  for (let i = 0; i < HOT_KEYWORDS.length; i++) {
    if (lower.includes(HOT_KEYWORDS[i])) return i;
  }
  return HOT_KEYWORDS.length + 1;
}

function sortServicesByPriority(services: any[]): any[] {
  return [...services].sort((a, b) => getServicePriority(a.name) - getServicePriority(b.name));
}

export default function CustomerServicesPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('priority');

  const { data: svcData, isLoading: svcLoading, isError, refetch } = useServices({ active_only: true });
  const { data: loyalty } = useLoyalty('mine');
  
  const [selectedDetailsSvc, setSelectedDetailsSvc] = useState<any>(null);

  const rawServices = svcData?.data || [];

  // Filter services by search term
  const filteredServices = rawServices.filter((svc: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      svc.name?.toLowerCase().includes(q) ||
      svc.description?.toLowerCase().includes(q) ||
      svc.category?.toLowerCase().includes(q)
    );
  });

  // Sort services based on selection
  const sortedServices = [...filteredServices].sort((a: any, b: any) => {
    if (sortBy === 'alpha_asc') {
      return (a.name || '').localeCompare(b.name || '');
    }
    if (sortBy === 'alpha_desc') {
      return (b.name || '').localeCompare(a.name || '');
    }
    if (sortBy === 'price_asc') {
      const pA = Number(a.price_sedan || a.price_hatchback || 0);
      const pB = Number(b.price_sedan || b.price_hatchback || 0);
      return pA - pB;
    }
    if (sortBy === 'price_desc') {
      const pA = Number(a.price_sedan || a.price_hatchback || 0);
      const pB = Number(b.price_sedan || b.price_hatchback || 0);
      return pB - pA;
    }
    // Priority default
    return getServicePriority(a.name || '') - getServicePriority(b.name || '');
  });

  const isLoading = svcLoading;
  const renderPrice = (val: any) => { const n = Number(val || 0); return n > 0 ? formatINR(n) : 'Ask Studio'; };

  if (isError) {
    return (
      <div className="pt-4">
        <ErrorState
          message="Failed to load services. Please check your connection and try again."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const getPriceKey = (f: Filter) => f === 'all' ? null : `price_${f}`;

  return (
    <div className="pt-4 pb-20 relative">
      {/* ── Hero Banner ──────────────────────────────────── */}
      <div className="relative bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden mb-8">
        <div className="relative z-10 px-6 sm:px-10 py-8 sm:py-12">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-[#2563EB] animate-pulse-dot" />
            <span className="text-[10px] text-[#2563EB] font-extrabold uppercase tracking-[0.2em]">Premium Detail Studio</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-tight mb-3">
            Our Services
          </h1>
          <p className="text-slate-700 text-sm sm:text-base max-w-lg font-bold leading-relaxed">
            Elevate your vehicle with our premium detailing services. Tap any service card to view English details and features.
          </p>

          <div className="flex gap-3 mt-6">
            <Button onClick={() => navigate('/customer/bookings/new')} icon={<ArrowRight size={16} />}>
              Book Now
            </Button>
          </div>
        </div>
      </div>

      {/* ── Search & Alphabetical Sorting Controls Bar ──────────────────── */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-6 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          {/* Search Input */}
          <div className="relative w-full sm:flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setSearchQuery(val);
                if (val.trim().length >= 2) {
                  const detectedCat = getCategoryForModel('', val);
                  if (detectedCat && FILTERS.includes(detectedCat as Filter)) {
                    setFilter(detectedCat as Filter);
                  }
                }
              }}
              placeholder="Search services or type car name (e.g. Virtus GT, Creta, Swift)..."
              className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Alphabetical & Price Sort Dropdown */}
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-xs font-bold text-gray-700 w-full sm:w-auto">
              <ArrowUpDown size={14} className="text-[#2563EB] shrink-0" />
              <span className="text-gray-400 font-normal">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="bg-transparent text-gray-900 font-extrabold cursor-pointer focus:outline-none text-xs"
              >
                <option value="priority">Recommended Priority</option>
                <option value="alpha_asc">Alphabetical: A to Z</option>
                <option value="alpha_desc">Alphabetical: Z to A</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
              </select>
            </div>
          </div>
        </div>

        {/* Vehicle Segment Filters */}
        <div className="flex gap-2 overflow-x-auto pt-2 border-t border-gray-100 scrollbar-hide">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`whitespace-nowrap px-3.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all duration-200 ${
                filter === f
                  ? 'bg-gradient-to-br from-[#1D4ED8] to-[#2563EB] text-white shadow-md shadow-[#2563EB]/20'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {f === 'all' ? 'All Segments' : f === 'medium_hatchback' ? 'Med Hatch' : f === 'premium_sedan' ? 'Prem Sedan' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">{[1,2,3,4].map(i => <SkeletonCard key={i} />)}</div>
      ) : sortedServices.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center space-y-3">
          <Droplets size={48} className="mx-auto text-gray-300" />
          <h3 className="font-bold text-gray-800 text-base">No services found</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Try adjusting your search query or vehicle segment filter to see all detailing options.
          </p>
          <button
            onClick={() => { setSearchQuery(''); setFilter('all'); setSortBy('priority'); }}
            className="px-4 py-2 bg-[#2563EB] text-white text-xs font-bold rounded-xl"
          >
            Clear Search & Filters
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          {/* ── Services Catalog ────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Shield size={14} className="text-[#2563EB]" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                  Services ({sortedServices.length}) — Tap Card for English Details
                </p>
              </div>
              <span className="text-[11px] font-bold text-gray-400">
                Sorted by {sortBy === 'alpha_asc' ? 'A-Z' : sortBy === 'alpha_desc' ? 'Z-A' : sortBy === 'price_asc' ? 'Price Low' : sortBy === 'price_desc' ? 'Price High' : 'Priority'}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {sortedServices.map((svc: any, idx: number) => {
                return (
                  <div
                    key={svc.id}
                    onClick={() => setSelectedDetailsSvc(svc)}
                    className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 card-premium group cursor-pointer hover:border-blue-200 transition-all opacity-0 animate-fade-in-up"
                    style={{ animationDelay: `${idx * 0.05}s`, animationFillMode: 'forwards' }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-bold text-[#0F172A] text-base group-hover:text-[#2563EB] transition-colors">{svc.name}</h3>
                      <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">View Details ℹ️</span>
                    </div>
                    {svc.description && <p className="text-xs text-[#5f5e5e] mt-1 line-clamp-2 leading-relaxed">{svc.description}</p>}

                    <div className="mt-4 pt-4 border-t border-gray-100">
                      {filter === 'all' ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5 text-center">
                          <div className="bg-[#F8FAFC] rounded-lg py-2">
                            <p className="text-[8px] font-bold uppercase text-[#5f5e5e]">Hatch</p>
                            <p className="text-xs font-extrabold text-[#0F172A]">{renderPrice(svc.price_hatchback)}</p>
                          </div>
                          <div className="bg-[#F8FAFC] rounded-lg py-2">
                            <p className="text-[8px] font-bold uppercase text-[#5f5e5e]">Med Hatch</p>
                            <p className="text-xs font-extrabold text-[#0F172A]">{renderPrice(svc.price_medium_hatchback)}</p>
                          </div>
                          <div className="bg-[#F8FAFC] rounded-lg py-2">
                            <p className="text-[8px] font-bold uppercase text-[#5f5e5e]">Sedan</p>
                            <p className="text-xs font-extrabold text-[#0F172A]">{renderPrice(svc.price_sedan)}</p>
                          </div>
                          <div className="bg-[#F8FAFC] rounded-lg py-2">
                            <p className="text-[8px] font-bold uppercase text-[#5f5e5e]">Prem Sedan</p>
                            <p className="text-xs font-extrabold text-[#0F172A]">{renderPrice(svc.price_premium_sedan)}</p>
                          </div>
                          <div className="bg-[#F8FAFC] rounded-lg py-2">
                            <p className="text-[8px] font-bold uppercase text-[#5f5e5e]">SUV</p>
                            <p className="text-xs font-extrabold text-[#0F172A]">{renderPrice(svc.price_suv)}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-lg font-black text-[#2563EB]">{renderPrice(svc[getPriceKey(filter)!])}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedDetailsSvc(svc)}
                      >
                        Details ℹ️
                      </Button>
                      <Button
                        size="sm"
                        className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold"
                        onClick={() => navigate(`/customer/bookings/new?service_id=${svc.id}`)}
                        icon={<ArrowRight size={14} />}
                      >
                        Book Now
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Service Details Modal */}
      <ServiceDetailsModal
        isOpen={!!selectedDetailsSvc}
        onClose={() => setSelectedDetailsSvc(null)}
        service={selectedDetailsSvc}
      />
    </div>
  );
}
