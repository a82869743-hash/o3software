import { motion } from 'framer-motion';
import { type LucideIcon } from 'lucide-react';

interface PremiumPageHeaderProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  accentGradient?: string;
  actions?: React.ReactNode;
  badge?: string;
}

export default function PremiumPageHeader({
  title,
  subtitle,
  icon: Icon,
  iconColor = '#2563EB',
  accentGradient = 'from-[#1D4ED8] to-[#2563EB]',
  actions,
  badge,
}: PremiumPageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="mb-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Animated icon container */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 20 }}
            className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${accentGradient} flex items-center justify-center shadow-lg`}
            style={{ boxShadow: `0 4px 20px ${iconColor}30` }}
          >
            <Icon size={22} className="text-white" />
          </motion.div>

          <div>
            <div className="flex items-center gap-2.5">
              <motion.h1
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 }}
                className="text-2xl font-bold text-[#0F172A] tracking-tight"
              >
                {title}
              </motion.h1>
              {badge && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.3, type: 'spring' }}
                  className="text-[9px] font-bold bg-[#2563EB] text-white px-2 py-0.5 rounded-full uppercase tracking-wider"
                >
                  {badge}
                </motion.span>
              )}
            </div>
            {subtitle && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-sm text-[#5f5e5e] mt-0.5"
              >
                {subtitle}
              </motion.p>
            )}
          </div>
        </div>

        {actions && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 }}
            className="flex flex-wrap items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0"
          >
            {actions}
          </motion.div>
        )}
      </div>

      {/* Animated underline accent */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.3, duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="mt-4 h-px origin-left"
        style={{ background: `linear-gradient(90deg, ${iconColor}40, transparent)` }}
      />
    </motion.div>
  );
}
