import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, User, Car, Package, Building2 } from 'lucide-react';
import { useGlobalSearch } from '../../api/hooks/useSearch';
import type { GlobalSearchResult } from '../../types';

interface LiveSearchProps {
  className?: string;
  placeholder?: string;
}

export default function LiveSearch({ className = '', placeholder = 'Search customers, vehicles...' }: LiveSearchProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data, isLoading } = useGlobalSearch(debouncedQuery);

  // Debounce the search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const handleSelect = useCallback((type: string, id: number) => {
    setIsOpen(false);
    setQuery('');
    switch (type) {
      case 'customer':
        navigate(`/admin/customers/${id}`);
        break;
      case 'vehicle':
        navigate(`/admin/job-carts?vehicle=${id}`);
        break;
      case 'inventory':
        navigate(`/admin/inventory`);
        break;
      case 'vendor':
        navigate(`/admin/vendors`);
        break;
    }
  }, [navigate]);

  const hasResults = data && (
    data.customers.length > 0 ||
    data.vehicles.length > 0 ||
    data.inventory.length > 0 ||
    data.vendors.length > 0
  );

  return (
    <div className={`relative ${className}`}>
      {/* Search input */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (query.length >= 2) setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full pl-10 pr-16 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-extrabold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:border-[#2563EB] transition-all shadow-sm"
          id="global-search-input"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {query && (
            <button
              onClick={() => { setQuery(''); setIsOpen(false); }}
              className="text-slate-400 hover:text-slate-900 p-0.5 transition-colors"
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] text-slate-600 bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded font-mono font-bold shadow-xs">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Dropdown results */}
      {isOpen && debouncedQuery.length >= 2 && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl max-h-[400px] overflow-y-auto z-[100]"
        >
          {isLoading && (
            <div className="px-4 py-6 text-center text-gray-500 text-sm">
              <div className="w-5 h-5 border-2 border-gray-600 border-t-[#2563EB] rounded-full animate-spin mx-auto mb-2" />
              Searching...
            </div>
          )}

          {!isLoading && !hasResults && (
            <div className="px-4 py-6 text-center text-gray-500 text-sm">
              No results for "{debouncedQuery}"
            </div>
          )}

          {!isLoading && hasResults && (
            <div className="py-2">
              {/* Customers */}
              {data!.customers.length > 0 && (
                <ResultSection
                  title="Customers"
                  icon={User}
                  items={data!.customers.map(c => ({
                    id: c.id,
                    primary: c.name,
                    secondary: c.mobile,
                    onClick: () => handleSelect('customer', c.id),
                  }))}
                />
              )}

              {/* Vehicles */}
              {data!.vehicles.length > 0 && (
                <ResultSection
                  title="Vehicles"
                  icon={Car}
                  items={data!.vehicles.map(v => ({
                    id: v.id,
                    primary: `${v.brand} ${v.model}`,
                    secondary: v.registration_no,
                    onClick: () => handleSelect('vehicle', v.id),
                  }))}
                />
              )}

              {/* Inventory */}
              {data!.inventory.length > 0 && (
                <ResultSection
                  title="Inventory"
                  icon={Package}
                  items={data!.inventory.map(i => ({
                    id: i.id,
                    primary: i.product_name,
                    secondary: `Qty: ${i.quantity}`,
                    onClick: () => handleSelect('inventory', i.id),
                  }))}
                />
              )}

              {/* Vendors */}
              {data!.vendors.length > 0 && (
                <ResultSection
                  title="Vendors"
                  icon={Building2}
                  items={data!.vendors.map(v => ({
                    id: v.id,
                    primary: v.name,
                    secondary: v.phone || '',
                    onClick: () => handleSelect('vendor', v.id),
                  }))}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultSection({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: React.ElementType;
  items: { id: number; primary: string; secondary: string; onClick: () => void }[];
}) {
  return (
    <div className="mb-1">
      <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2">
        <Icon size={12} />
        {title}
      </div>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={item.onClick}
          className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-white/5 transition-colors text-left"
        >
          <span className="text-sm text-white font-medium truncate">{item.primary}</span>
          <span className="text-xs text-gray-500 shrink-0 ml-3">{item.secondary}</span>
        </button>
      ))}
    </div>
  );
}
