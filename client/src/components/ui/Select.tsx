import { SelectHTMLAttributes, forwardRef } from 'react';

interface Option {
  value: string | number;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Option[];
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className = '', id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-[10px] font-extrabold uppercase tracking-widest text-[#5f5e5e] mb-2">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`w-full px-4 py-3 bg-[#f6f3f2] border-none rounded-lg text-[#0F172A] font-medium focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white transition-all text-base md:text-sm ${
            error ? 'ring-2 ring-blue-400' : ''
          } ${className}`}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-[11px] text-blue-600 mt-1.5 font-medium">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
export default Select;
