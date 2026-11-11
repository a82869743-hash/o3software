import { TextareaHTMLAttributes, forwardRef } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="block text-[12px] font-semibold text-slate-600 mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={3}
          className={`w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 font-medium shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-[#2563EB] placeholder:text-slate-400 transition-all duration-200 text-base md:text-sm resize-y min-h-[90px] whitespace-pre-wrap break-words ${
            error ? 'ring-2 ring-blue-400' : ''
          } ${className}`}

          {...props}
        />
        {error && <p className="text-[11.5px] text-rose-600 mt-1.5 font-medium">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
export default Textarea;
