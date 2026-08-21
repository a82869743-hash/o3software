import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  className?: string;
}

export default function StatCard({ label, value, icon: Icon, trend, className = '' }: StatCardProps) {
  return (
    <div className={`bg-white p-6 rounded-lg border-b-2 border-transparent hover:border-[#2563EB] transition-all duration-300 shadow-sm hover:shadow-card-hover hover:-translate-y-1 group ${className}`}>
      <div className="flex justify-between items-start mb-4">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] group-hover:text-[#2563EB] transition-colors">
          {label}
        </span>
        <span className="bg-gradient-to-br from-[#2563EB]/10 to-[#2563EB]/5 p-2.5 rounded-lg group-hover:shadow-blue-glow transition-shadow duration-300">
          <Icon size={20} className="text-[#2563EB]" />
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-black tracking-tighter text-[#0F172A]">{value}</span>
      </div>
      {trend && (
        <div className={`mt-4 flex items-center text-[10px] font-bold uppercase ${
          trend.positive ? 'text-green-600' : 'text-blue-600'
        }`}>
          <span>{trend.value}</span>
        </div>
      )}
    </div>
  );
}
