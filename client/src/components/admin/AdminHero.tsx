import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { pageArt } from '../../utils/pageArt';
import { PHOTOS } from '../customer/serviceVisuals';
import { sectionFor } from './AdminSectionBar';

// Each module gets a studio photo behind its title (same family as the customer app)
const PHOTO_RULES: Array<[RegExp, string]> = [
  [/pickup|deliver|tracking/i, PHOTOS.pickup],
  [/quick ?wash|doorstep/i, PHOTOS.doorstep],
  [/job ?card|job ?cart|workshop|mechanic/i, PHOTOS.mechanic],
  [/slot|calendar|booking/i, PHOTOS.studio],
  [/inventory|stock|product|order|buy|sell|vendor|purchase/i, PHOTOS.shop],
  [/package|membership|amc|loyalty|reward|referral/i, PHOTOS.showroom],
  [/service|premium|coating/i, PHOTOS.beading],
  [/quotation|estimate|inspection|feedback|review/i, PHOTOS.inspection],
  [/invoice|bill|payment|account|balance|salary|payroll|finance/i, PHOTOS.polish],
  [/staff|hr|attendance|team|role|permission/i, PHOTOS.engine],
  [/customer|lead|inquir|whatsapp|message|registration/i, PHOTOS.leather],
  [/franchise|studio|setting|import|archive|recycle|report|dashboard/i, PHOTOS.studio],
];
const photoFor = (title: string) => (PHOTO_RULES.find(([rx]) => rx.test(title)) || [null, PHOTOS.studio])[1];

/** Admin page header: photo banner with the module's 3D symbol, section, title, and actions underneath. */
export default function AdminHero({ title, subtitle, actions, badge }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; badge?: string }) {
  const { pathname } = useLocation();
  const sec = sectionFor(pathname);
  const art = pageArt(title) || sec?.img || '/illustrations/adm-reports.webp';
  return (
    <header className="mb-5">
      <div className="relative overflow-hidden rounded-3xl bg-[#0B1F4D] shadow-[0_12px_30px_rgba(11,31,77,0.18)]">
        <img src={photoFor(`${title} ${pathname}`)} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F4D] via-[#0B1F4D]/85 to-[#1D4ED8]/35" />
        <div className="relative flex items-center gap-4 p-4 sm:p-6">
          <span className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white shadow-lg flex items-center justify-center shrink-0">
            <img src={art} alt="" className="w-12 h-12 sm:w-14 sm:h-14 object-contain mix-blend-multiply" />
          </span>
          <div className="min-w-0 text-white">
            <nav className="flex items-center gap-1 text-[11px] font-semibold text-sky-200/90 mb-0.5">
              <Link to="/admin" className="hover:text-white">Dashboard</Link>
              {sec && <><ChevronRight size={12} /><span className="truncate">{sec.group}</span></>}
            </nav>
            <h1 className="flex items-center gap-2 text-[21px] sm:text-[27px] font-black tracking-tight leading-tight">
              <span className="line-clamp-2 break-words">{title}</span>
              {badge && <span className="text-[9px] font-black bg-amber-400 text-slate-900 px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">{badge}</span>}
            </h1>
            {subtitle && <p className="text-[12.5px] sm:text-sm text-white/75 font-medium mt-0.5 line-clamp-2">{subtitle}</p>}
          </div>
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2 items-center mt-3">{actions}</div>}
    </header>
  );
}
