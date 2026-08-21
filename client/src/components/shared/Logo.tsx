interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
  variant?: 'dark' | 'light';
}

const sizeMap = {
  sm: { icon: 24, text: 'text-sm' },
  md: { icon: 32, text: 'text-base' },
  lg: { icon: 44, text: 'text-xl' },
};

export default function Logo({ size = 'md', showText = true, className = '', variant = 'dark' }: LogoProps) {
  const { icon, text } = sizeMap[size];
  const isLight = variant === 'light';

  return (
    <div className={`flex items-center gap-2.5 font-sans ${className}`}>
      {/* Official O3 Car Spa Logo Badge */}
      <img
        src="/assets/o3_logo.jpeg"
        alt="O3 Car Spa Logo"
        style={{ width: `${icon}px`, height: `${icon}px` }}
        className="rounded-lg object-contain shrink-0 shadow-xs"
      />

      {showText && (
        <div className="flex flex-col leading-none">
          <div className="flex items-baseline gap-1">
            <span className={`font-black tracking-tight ${isLight ? 'text-white' : 'text-slate-900'} ${text}`}>
              O3
            </span>
            <span className={`font-extrabold tracking-wider text-[11px] uppercase ${isLight ? 'text-sky-400' : 'text-[#0284C7]'}`}>
              CAR-SPA
            </span>
          </div>
          <span className={`text-[9px] font-bold tracking-widest uppercase ${isLight ? 'text-slate-400' : 'text-slate-500'} mt-0.5`}>
            Car Detailing Studio
          </span>
        </div>
      )}
    </div>
  );
}
