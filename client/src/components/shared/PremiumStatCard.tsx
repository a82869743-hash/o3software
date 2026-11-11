import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import { type LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { pageArt } from '../../utils/pageArt';

interface PremiumStatCardProps {
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  icon: LucideIcon;
  trend?: number;
  trendLabel?: string;
  color?: string;
  gradient?: string;
  delay?: number;
  decimals?: number;
}

export default function PremiumStatCard({
  title,
  value,
  prefix = '',
  suffix = '',
  icon: Icon,
  trend,
  trendLabel,
  color = '#2563EB',
  gradient = 'from-[#1D4ED8]/10 to-[#2563EB]/5',
  delay = 0,
  decimals = 0,
}: PremiumStatCardProps) {
  const isPositive = trend && trend > 0;
  const isNegative = trend && trend < 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ y: -4, boxShadow: `0 12px 32px ${color}15, 0 4px 12px rgba(0,0,0,0.06)` }}
      className="relative bg-white rounded-2xl border border-slate-100 shadow-[0_4px_18px_rgba(15,23,42,0.05)] p-4 sm:p-5 overflow-hidden group cursor-default min-h-[118px]"
    >
      {/* Colour accent + module picture */}
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${color}, ${color}55)` }} />
      {pageArt(title) && trend === undefined && <img src={pageArt(title)!} alt="" className="absolute right-3 top-3 w-11 h-11 object-contain mix-blend-multiply pointer-events-none" />}
      {/* Background gradient accent */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

      {/* Content */}
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <motion.div
            whileHover={{ rotate: 10, scale: 1.1 }}
            transition={{ type: 'spring', stiffness: 300 }}
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
            style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
          >
            <Icon size={19} className="text-white" />
          </motion.div>

          {trend !== undefined && (
            <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
              isPositive ? 'text-emerald-600 bg-emerald-50' :
              isNegative ? 'text-blue-600 bg-blue-50' :
              'text-gray-500 bg-gray-100'
            }`}>
              {isPositive ? <TrendingUp size={12} /> : isNegative ? <TrendingDown size={12} /> : <Minus size={12} />}
              {Math.abs(trend)}%
            </div>
          )}
        </div>

        <p className="text-xs font-medium text-[#64748B] uppercase tracking-wider mb-1">{title}</p>

        <div className="flex items-baseline gap-1">
          <span className="text-[22px] sm:text-2xl font-black text-[#0F172A] leading-tight break-words">
            {prefix}
            <CountUp end={value} duration={1.5} delay={delay} separator="," decimals={decimals} />
            {suffix}
          </span>
        </div>

        {trendLabel && (
          <p className="text-[11px] text-[#94A3B8] mt-1">{trendLabel}</p>
        )}
      </div>

      {/* Hover glow effect */}
      <div
        className="absolute -bottom-2 -right-2 w-20 h-20 rounded-full opacity-0 group-hover:opacity-30 transition-opacity duration-500 blur-xl"
        style={{ backgroundColor: color }}
      />
    </motion.div>
  );
}
