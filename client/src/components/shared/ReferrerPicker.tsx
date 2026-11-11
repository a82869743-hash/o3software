import { useEffect, useState } from 'react';
import api from '../../api/axiosInstance';
import Dropdown from '../ui/Dropdown';

export interface ReferrerValue {
  referrer_type: 'none' | 'staff' | 'customer' | 'external';
  referrer_user_id?: number | null;
  referrer_name?: string;
  referrer_mobile?: string;
}

interface Props {
  value: ReferrerValue;
  onChange: (v: ReferrerValue) => void;
  disabled?: boolean;
}

const fieldCls = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50';

/** "Referred by" — a staff member, an existing customer, or someone else (name + mobile). Feeds the Referrals module. */
export default function ReferrerPicker({ value, onChange, disabled }: Props) {
  const [staff, setStaff] = useState<{ id: number; name: string; role: string }[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);

  useEffect(() => {
    if (value.referrer_type === 'staff' && !staff.length) {
      api.get('/staff/technicians').then(r => setStaff(r.data.data || [])).catch(() => {});
    }
  }, [value.referrer_type, staff.length]);

  useEffect(() => {
    if (value.referrer_type !== 'customer' || query.trim().length < 3) { setResults([]); return; }
    const t = setTimeout(() => {
      api.get('/search/customers', { params: { q: query.trim(), limit: 8 } })
        .then(r => setResults(r.data.data || [])).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query, value.referrer_type]);

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-gray-700">Referred by</label>
      <Dropdown
        className={fieldCls}
        disabled={disabled}
        value={value.referrer_type}
        onChange={e => onChange({ referrer_type: e.target.value as ReferrerValue['referrer_type'] })}
      >
        <option value="none">No referral / walk-in</option>
        <option value="staff">Staff member</option>
        <option value="customer">Existing customer</option>
        <option value="external">Other person (name & mobile)</option>
      </Dropdown>

      {value.referrer_type === 'staff' && (
        <Dropdown
          className={fieldCls}
          disabled={disabled}
          value={value.referrer_user_id || ''}
          onChange={e => {
            const s = staff.find(x => x.id === Number(e.target.value));
            onChange({ ...value, referrer_user_id: s?.id || null, referrer_name: s?.name });
          }}
        >
          <option value="">Select staff member…</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
        </Dropdown>
      )}

      {value.referrer_type === 'customer' && (
        <div className="relative">
          {value.referrer_user_id ? (
            <div className="flex items-center justify-between px-3 py-2.5 border border-emerald-300 bg-emerald-50 rounded-lg text-sm">
              <span className="font-semibold text-emerald-900">{value.referrer_name} {value.referrer_mobile ? `· ${value.referrer_mobile}` : ''}</span>
              {!disabled && (
                <button type="button" className="text-xs font-bold text-emerald-700" onClick={() => onChange({ referrer_type: 'customer' })}>Change</button>
              )}
            </div>
          ) : (
            <>
              <input className={fieldCls} disabled={disabled} placeholder="Search customer by name or mobile…" value={query} onChange={e => setQuery(e.target.value)} />
              {results.length > 0 && (
                <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {results.map((c: any) => (
                    <button
                      type="button"
                      key={c.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                      onClick={() => { onChange({ referrer_type: 'customer', referrer_user_id: c.id, referrer_name: c.name, referrer_mobile: c.mobile }); setQuery(''); setResults([]); }}
                    >
                      <span className="font-semibold">{c.name}</span> <span className="text-gray-500">· {c.mobile}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {value.referrer_type === 'external' && (
        <div className="grid grid-cols-2 gap-2">
          <input className={fieldCls} disabled={disabled} placeholder="Name of person who referred" value={value.referrer_name || ''} onChange={e => onChange({ ...value, referrer_name: e.target.value })} />
          <input className={fieldCls} disabled={disabled} placeholder="Mobile (optional)" inputMode="numeric" maxLength={10} value={value.referrer_mobile || ''} onChange={e => onChange({ ...value, referrer_mobile: e.target.value.replace(/\D/g, '') })} />
        </div>
      )}
    </div>
  );
}

/** Body fields for the API from a picker value. */
export function referrerPayload(v: ReferrerValue) {
  if (!v || v.referrer_type === 'none') return { referrer_type: 'none' };
  return {
    referrer_type: v.referrer_type,
    referrer_user_id: v.referrer_user_id || null,
    referrer_name: v.referrer_name || '',
    referrer_mobile: v.referrer_mobile || '',
  };
}
