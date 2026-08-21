import { InputHTMLAttributes, forwardRef } from 'react';

interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  hint?: string;
}

const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-[10px] font-extrabold uppercase tracking-widest text-[#5f5e5e] mb-2">
            {label}
          </label>
        )}
        <input
          type="date"
          ref={ref}
          id={inputId}
          className={`w-full px-4 py-3 bg-[#f6f3f2] border-none rounded-lg text-[#0F172A] font-medium focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white placeholder:text-[#8f6f6c]/60 transition-all text-base md:text-sm ${
            error ? 'ring-2 ring-blue-400' : ''
          } ${className}`}
          {...props}
        />
        {error && <p className="text-[11px] text-blue-600 mt-1.5 font-medium">{error}</p>}
        {hint && !error && <p className="text-[11px] text-[#8f6f6c] mt-1.5">{hint}</p>}
      </div>
    );
  }
);

DatePicker.displayName = 'DatePicker';
export default DatePicker;
