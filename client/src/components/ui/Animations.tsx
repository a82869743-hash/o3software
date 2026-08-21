import { motion, AnimatePresence, type Variants, HTMLMotionProps } from 'framer-motion';
import { type ReactNode } from 'react';


// ─── Reusable Animation Variants ────────────────────────────

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.4 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
};

export const fadeInDown: Variants = {
  initial: { opacity: 0, y: -20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  exit: { opacity: 0, y: 20 },
};

export const slideInLeft: Variants = {
  initial: { opacity: 0, x: -30 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { opacity: 0, x: -30 },
};

export const slideInRight: Variants = {
  initial: { opacity: 0, x: 30 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { opacity: 0, x: 30 },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: [0.34, 1.56, 0.64, 1] } },
  exit: { opacity: 0, scale: 0.9 },
};

export const staggerContainer: Variants = {
  animate: { transition: { staggerChildren: 0.06 } },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

// ─── Page Transition Wrapper ────────────────────────────────
export function PageTransition({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Animated Card ──────────────────────────────────────────
export function AnimatedCard({
  children,
  className = '',
  delay = 0,
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  hover?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: 'easeOut' }}
      whileHover={hover ? { y: -4, boxShadow: '0 12px 32px rgba(0,0,0,0.12)' } : undefined}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Animated Counter (for KPIs) ────────────────────────────
export function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
  className = '',
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  return (
    <motion.span
      className={className}
      key={value}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {prefix}{typeof value === 'number' ? value.toLocaleString('en-IN') : value}{suffix}
    </motion.span>
  );
}

// ─── Magnetic Button ────────────────────────────────────────
export function MagneticButton({
  children,
  className = '',
  onClick,
  type = 'button',
  ...props
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
} & Omit<HTMLMotionProps<'button'>, 'children' | 'className' | 'onClick' | 'type'>) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      className={className}
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}

// ─── Ripple Button ──────────────────────────────────────────
export function RippleButton({
  children,
  className = '',
  onClick,
  variant = 'primary',
  ...props
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
} & Omit<HTMLMotionProps<'button'>, 'children' | 'className' | 'onClick'>) {
  const baseStyles: Record<string, string> = {
    primary: 'bg-gradient-to-r from-[#1D4ED8] to-[#2563EB] text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40',
    secondary: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50',
    danger: 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100',
  };

  return (
    <motion.button
      onClick={onClick}
      className={`relative overflow-hidden px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${baseStyles[variant]} ${className}`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.96 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}

// ─── Animated Modal Wrapper ─────────────────────────────────
export function AnimatedModal({
  isOpen,
  onClose,
  children,
  className = '',
}: {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none`}
          >
            <div className={`pointer-events-auto bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto ${className}`} onClick={e => e.stopPropagation()}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Stagger List ───────────────────────────────────────────
export function StaggerList({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={staggerItem} className={className}>
      {children}
    </motion.div>
  );
}

// ─── Glow Card (Premium hover effect) ───────────────────────
export function GlowCard({
  children,
  className = '',
  glowColor = 'rgba(211, 47, 47, 0.15)',
}: {
  children: ReactNode;
  className?: string;
  glowColor?: string;
}) {
  return (
    <motion.div
      className={`relative rounded-2xl bg-white border border-gray-100 overflow-hidden ${className}`}
      whileHover={{
        boxShadow: `0 0 30px ${glowColor}, 0 8px 24px rgba(0,0,0,0.08)`,
        y: -4,
      }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
}

// ─── Skeleton Loader (Car themed) ───────────────────────────
export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gray-200" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-2/3" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-3 bg-gray-100 rounded" style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  );
}

export { motion, AnimatePresence };
