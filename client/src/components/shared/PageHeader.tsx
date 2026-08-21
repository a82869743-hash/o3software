interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
      <div className="border-l-4 border-gradient-red pl-6" style={{ borderImage: 'linear-gradient(to bottom, #1D4ED8, #2563EB) 1' }}>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F172A] uppercase">
          {title}
        </h2>
        {subtitle && (
          <p className="text-[#5f5e5e] text-sm font-medium mt-1">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex gap-3 flex-wrap">{actions}</div>}
    </header>
  );
}
