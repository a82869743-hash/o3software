import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-white shadow-md shadow-blue-600/20 hover:shadow-lg hover:shadow-blue-600/30 hover:-translate-y-0.5',
  secondary:
    'bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50 hover:border-slate-300',
  danger:
    'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 hover:border-rose-300',
  ghost:
    'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-[12.5px] gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-6 py-3 text-[15px] gap-2',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, icon, children, className = '', disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center font-bold rounded-xl transition-all duration-150 active:scale-[0.97] cursor-pointer touch-manipulation select-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}

        {...props}
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
