import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#2563EB', // Remapped to Royal Blue (Zero Red)
          'red-dark': '#1D4ED8',
          'red-deep': '#1E40AF',
          'red-light': '#EFF6FF',
          'red-glow': '#3B82F6',
          blue: '#2563EB',
          'blue-dark': '#1D4ED8',
          'blue-deep': '#1E40AF',
          'blue-light': '#EFF6FF',
          'blue-glow': '#3B82F6',
          black: '#0F172A',
          charcoal: '#0F172A',
          sidebar: '#FFFFFF',
          cream: '#F8FAFC',
          'text-primary': '#0F172A',
          'text-secondary': '#475569',
          'text-muted': '#64748B',
          surface: '#F8FAFC',
        },
        slate: {
          950: '#0F172A',
          900: '#0F172A',
          800: '#1E293B',
          700: '#334155',
          600: '#475569',
          500: '#64748B',
          400: '#94A3B8',
          300: '#CBD5E1',
          200: '#E2E8F0',
          100: '#F1F5F9',
          50: '#F8FAFC',
        },
        blue: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        }
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['Manrope', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
        'card-hover': '0 10px 25px rgba(37,99,235,0.08), 0 4px 10px rgba(0,0,0,0.03)',
        'blue-glow': '0 4px 14px rgba(37,99,235,0.3)',
      },
      backgroundImage: {
        'blue-banner': 'linear-gradient(135deg, #1D4ED8 0%, #2563EB 60%, #3B82F6 100%)',
        'surface-card': 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
} satisfies Config;
