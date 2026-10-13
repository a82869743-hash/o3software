import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  listOptions?: string[];
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, listOptions, className = '', id, list, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const autoListId = listOptions ? `${inputId}-list` : list;

    const isSearchOrQuery = props.type === 'search' ||
                            /search|query|filter|find/i.test(props.name || '') ||
                            /search|query|filter|find/i.test(props.placeholder || '') ||
                            /search|query|filter|find/i.test(label || '') ||
                            /search|query|filter|find/i.test(className || '');

    const isPhoneInput = !isSearchOrQuery && (
      props.type === 'tel' || 
      (label && /^(customer\s*)?(mobile|phone|contact)(\s*number)?$/i.test(label.trim())) ||
      (props.name && /^(mobile|phone|contact|customer_mobile)$/i.test(props.name.trim()))
    );

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isPhoneInput) {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
      }
      if (props.onChange) {
        props.onChange(e);
      }
    };

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-[10px] font-extrabold uppercase tracking-widest text-[#5f5e5e] mb-2">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          list={autoListId}
          maxLength={isPhoneInput ? 10 : props.maxLength}
          {...props}
          onChange={handleInputChange}
          className={`w-full px-4 py-3 bg-[#f6f3f2] border border-transparent rounded-lg text-slate-900 font-extrabold focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white focus:border-[#2563EB]/30 focus:shadow-sm placeholder:text-slate-400 transition-all duration-200 text-base md:text-sm ${
            error ? 'ring-2 ring-blue-400 border-blue-400' : ''
          } ${className}`}
        />
        {listOptions && (
          <datalist id={autoListId}>
            {listOptions.map((opt, idx) => (
              <option key={idx} value={opt} />
            ))}
          </datalist>
        )}
        {error && <p className="text-[11px] text-blue-600 mt-1.5 font-medium">{error}</p>}
        {hint && !error && <p className="text-[11px] text-[#8f6f6c] mt-1.5">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
