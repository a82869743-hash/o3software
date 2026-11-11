interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3">
      <div>
        <h2 className="text-[22px] sm:text-[28px] font-black tracking-tight text-[#0F172A] leading-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="text-[#64748B] text-[13px] sm:text-sm font-medium mt-1">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex gap-2 sm:gap-3 flex-wrap">{actions}</div>}
    </header>
  );
}
