import React from 'react';
import { useLocation } from 'react-router-dom';
import { pageArt } from '../../utils/pageArt';
import AdminHero from '../admin/AdminHero';

interface AdminTopBarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function AdminTopBar({ title, subtitle, actions }: AdminTopBarProps) {
  const { pathname } = useLocation();
  if (pathname.startsWith('/admin')) return <AdminHero title={title} subtitle={subtitle} actions={actions} />;

  return (
    <header className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
      <div className="flex items-center gap-3">

        {pageArt(title) && (
          <span className="flex w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white border border-slate-200/80 shadow-sm items-center justify-center shrink-0">
            <img src={pageArt(title)!} alt="" className="w-10 h-10 object-contain mix-blend-multiply" />
          </span>
        )}
        <div>
          <h2 className="text-[21px] sm:text-[26px] font-black tracking-tight text-slate-900 leading-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-slate-500 text-[13px] sm:text-sm font-medium mt-1">{subtitle}</p>
          )}
        </div>
      </div>

      {actions && <div className="flex flex-wrap gap-2 items-center sm:ml-0">{actions}</div>}
    </header>
  );
}
