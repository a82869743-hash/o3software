import { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  label?: string;
  options: Option[];
  value: string;
  onChange: (e: { target: { value: string; name?: string } }) => void;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
  error?: string;
}

export default function SearchableSelect({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  name,
  error,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={`w-full relative animate-fade-in-up ${isOpen ? 'z-50' : 'z-0'}`} ref={containerRef}>
      {label && (
        <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[#5f5e5e] mb-2">
          {label}
        </label>
      )}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full px-4 py-3 bg-[#f6f3f2] rounded-lg text-[#0F172A] font-medium flex items-center justify-between cursor-pointer text-base md:text-sm ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        } ${isOpen ? 'ring-2 ring-[#2563EB]/20 bg-white border border-[#2563EB]/30' : ''} ${
          error ? 'ring-2 ring-blue-400' : ''
        }`}
      >
        <span className={selectedOption ? 'text-[#0F172A]' : 'text-gray-400'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={16} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden min-w-[200px]">
          <div className="p-2 border-b border-gray-100 flex items-center gap-2 bg-gray-50/80">
            <Search size={14} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full text-sm bg-transparent border-none focus:outline-none focus:ring-0 p-1"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearch('');
                }}
                className="p-1 hover:bg-gray-200 rounded text-gray-400"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-2 text-xs text-gray-400">No matches found</div>
            ) : (
              filteredOptions.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => {
                    onChange({ target: { value: opt.value, name } });
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`px-4 py-2 text-sm cursor-pointer hover:bg-blue-50 hover:text-[#2563EB] ${
                    opt.value === value ? 'bg-blue-50/50 text-[#2563EB] font-semibold' : 'text-gray-700'
                  }`}
                >
                  {opt.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {error && <p className="text-[11px] text-blue-600 mt-1.5 font-medium">{error}</p>}
    </div>
  );
}
