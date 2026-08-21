import React from 'react';
import { Menu, Bell, Search } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';

interface AdminTopBarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function AdminTopBar({ title, subtitle, actions }: AdminTopBarProps) {
  const { setSidebarOpen } = useUIStore();

  return (
    <header className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="lg:hidden p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors shadow-sm"
          title="Open Menu"
        >
          <Menu size={20} />
        </button>

        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
            {title}
          </h2>
          {subtitle && (
            <p className="text-slate-500 text-sm font-medium mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      {actions && <div className="flex gap-2.5 items-center ml-auto sm:ml-0">{actions}</div>}
    </header>
  );
}
