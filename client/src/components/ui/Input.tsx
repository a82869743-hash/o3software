import { InputHTMLAttributes, forwardRef, useState } from 'react';
import { regNoError } from '../../utils/validators';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  listOptions?: string[];
}

/**
 * Shared text field. Phone and number-plate fields are recognised by their label / name and kept in the
 * strict format everywhere: phone = 10 digits; plate = GJ06AB1234 style (uppercase, no spaces).
 * The server checks the same rules (middleware/fieldFormats.js).
 */
const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, listOptions, className = '', id, list, onBlur, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const autoListId = listOptions ? `${inputId}-list` : list;
    const [touched, setTouched] = useState(false);

    const text = `${label || ''} ${props.name || ''} ${props.placeholder || ''}`;
    const isSearchOrQuery = props.type === 'search' || /search|query|filter|find/i.test(`${text} ${className}`);

    const isPhoneInput = !isSearchOrQuery && (
      props.type === 'tel' ||
      /\b(mobile|phone|whatsapp|contact\s*(no|number)?)\b/i.test(`${label || ''} ${props.name || ''}`)
    );
    const isPlateInput = !isSearchOrQuery && !isPhoneInput &&
      /(reg(istration)?\.?\s*(no|number|num)|registration|vehicle\s*(no|number)|number\s*plate|car\s*number|reg_no|registration_no|vehicle_reg)/i.test(`${label || ''} ${props.name || ''}`);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isPhoneInput) e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
      if (isPlateInput) e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
      props.onChange?.(e);
    };

    // live format message once the person has left the field (or typed a full length)
    const val = String(props.value ?? '');
    let formatError = '';
    if (val && isPhoneInput && (touched || val.length >= 10) && !/^[6-9]\d{9}$/.test(val)) formatError = 'Enter a valid 10-digit mobile number';
    if (val && isPlateInput && (touched || val.length >= 9) && regNoError(val)) formatError = regNoError(val);
    const shownError = error || formatError;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-[12px] font-semibold text-slate-600 mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          list={autoListId}
          {...props}
          maxLength={isPhoneInput ? 10 : isPlateInput ? 11 : props.maxLength}
          inputMode={isPhoneInput ? 'numeric' : props.inputMode}
          onChange={handleInputChange}
          onBlur={(e) => { setTouched(true); onBlur?.(e); }}
          className={`w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 font-medium shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-[#2563EB] placeholder:text-slate-400 transition-all duration-200 text-base md:text-sm ${
            isPlateInput ? 'uppercase' : ''
          } ${shownError ? 'border-rose-400 ring-4 ring-rose-500/10' : ''} ${className}`}
        />
        {listOptions && (
          <datalist id={autoListId}>
            {listOptions.map((opt, idx) => (
              <option key={idx} value={opt} />
            ))}
          </datalist>
        )}
        {shownError && <p className="text-[11.5px] text-rose-600 mt-1.5 font-medium">{shownError}</p>}
        {hint && !shownError && <p className="text-[11px] text-[#94A3B8] mt-1.5">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
