import { SelectHTMLAttributes, forwardRef } from 'react';
import Dropdown from './Dropdown';

interface Option {
  value: string | number;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Option[];
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className = '', id, ...props }, _ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-[12px] font-semibold text-slate-600 mb-1.5">
            {label}
          </label>
        )}
        <Dropdown
          id={selectId}
          className={`w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 font-medium shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-[#2563EB] placeholder:text-slate-400 transition-all duration-200 text-base md:text-sm ${
            error ? 'ring-2 ring-blue-400' : ''
          } ${className}`}
          {...(props as any)}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </Dropdown>
        {error && <p className="text-[11.5px] text-rose-600 mt-1.5 font-medium">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
export default Select;
