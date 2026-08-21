import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}

export default function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  debounceMs = 300,
  className = '',
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { setLocalValue(value); }, [value]);

  const handleChange = (val: string) => {
    setLocalValue(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(val), debounceMs);
  };

  const handleClear = () => {
    setLocalValue('');
    onChange('');
  };

  return (
    <div className={`relative ${className}`}>
      <Search size={16} className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${isFocused ? 'text-[#2563EB]' : 'text-[#8f6f6c]'}`} />
      <input
        type="text"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        className="w-full pl-11 pr-10 py-3 bg-[#f6f3f2] border border-transparent rounded-lg text-sm font-medium text-[#0F172A] focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white focus:border-[#2563EB]/30 focus:shadow-sm placeholder:text-[#8f6f6c]/60 transition-all duration-200"
      />
      {localValue && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-200 text-gray-400 transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
