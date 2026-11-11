import { Children, isValidElement, ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState, CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

type Opt = { value: string; label: string; disabled?: boolean; group?: string };

/** Plain text of an <option>'s children ("₹" + 499 → "₹499"). */
function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as any).children);
  return '';
}

/** Reads <option> / <optgroup> children (also inside fragments and .map arrays). */
function readOptions(children: ReactNode, group?: string, out: Opt[] = []): Opt[] {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    const p: any = c.props;
    if (c.type === 'option') {
      const label = textOf(p.children);
      out.push({ value: p.value !== undefined ? String(p.value) : label, label, disabled: !!p.disabled, group });
    } else if (c.type === 'optgroup') {
      readOptions(p.children, p.label, out);
    } else if (p && p.children) {
      readOptions(p.children, group, out);
    }
  });
  return out;
}

interface DropdownProps {
  value?: string | number | null;
  defaultValue?: string | number;
  onChange?: (e: any) => void;
  onBlur?: (e: any) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
  children?: ReactNode;
  'aria-label'?: string;
  [key: string]: any;
}

/**
 * Drop-in replacement for a native <select>: same props and <option> children, same
 * onChange(e) with e.target.value. Opens a searchable list (bottom sheet on phones).
 */
export default function Dropdown({ value, defaultValue, onChange, onBlur, name, id, disabled, required, className = '', style, title, children, ...rest }: DropdownProps) {
  const options = useMemo(() => readOptions(children), [children]);
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue !== undefined ? String(defaultValue) : (options[0]?.value ?? ''));
  const current = controlled ? (value == null ? '' : String(value)) : inner;
  const selected = options.find(o => o.value === current);

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const isPhone = typeof window !== 'undefined' && window.innerWidth < 640;
  const searchable = options.length > 8;

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter(o => o.label.toLowerCase().includes(s)) : options;
  }, [options, q]);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    setPos({ top: r.bottom + 6, left: r.left, width: Math.max(r.width, 180), up: below < 280 && r.top > below });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || btn.current?.contains(t)) return;
      setOpen(false);
    };
    const move = (e: Event) => { if (!panel.current?.contains(e.target as Node)) place(); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', move, true);
    setActive(Math.max(0, shown.findIndex(o => o.value === current)));
    setTimeout(() => (searchable && !isPhone ? searchBox.current?.focus() : panel.current?.focus()), 0);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', move, true);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active, open]);

  const pick = (o: Opt) => {
    if (o.disabled) return;
    if (!controlled) setInner(o.value);
    setOpen(false);
    setQ('');
    btn.current?.focus();
    if (o.value !== current) {
      const target = { value: o.value, name, id };
      onChange?.({ target, currentTarget: target, preventDefault() {}, stopPropagation() {} });
    }
  };

  const key = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btn.current?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(shown.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) pick(shown[active]); }
    else if (!searchable && e.key.length === 1) {
      const i = shown.findIndex(o => o.label.toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) setActive(i);
    }
  };

  // The trigger keeps the page's own select classes so layouts stay the same
  const looksStyled = /\b(border|bg-|px-|py-|p-)/.test(className);
  // custom-styled dropdowns still fill their box (else long labels spill into the next field)
  const base = looksStyled ? `${/\bw-/.test(className) ? '' : 'w-full'} min-w-0 ${className}` : `w-full min-w-0 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium ${className}`;

  let lastGroup: string | undefined;
  const items = shown.map((o, i) => {
    const head = o.group && o.group !== lastGroup ? <p key={`g-${o.group}`} className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{o.group}</p> : null;
    lastGroup = o.group;
    const isSel = o.value === current;
    return [head,
      <div key={`${o.value}-${i}`} data-i={i} role="option" aria-selected={isSel} aria-disabled={o.disabled}
        onMouseEnter={() => setActive(i)} onClick={() => pick(o)}
        className={`flex items-center gap-2 px-3 py-2.5 sm:py-2 rounded-lg text-sm cursor-pointer select-none transition-colors ${o.disabled ? 'opacity-40 cursor-not-allowed' : ''} ${i === active ? 'bg-blue-50 text-blue-800' : 'text-slate-700'} ${isSel ? 'font-bold' : 'font-medium'}`}>
        <span className="flex-1 min-w-0 break-words">{o.label || <span className="text-slate-400">—</span>}</span>
        {isSel && <Check size={15} className="text-blue-600 shrink-0" />}
      </div>];
  });

  const panelBody = (
    <div ref={panel} tabIndex={-1} onKeyDown={key} role="listbox"
      className={`outline-none bg-white shadow-2xl border border-slate-200 flex flex-col ${isPhone ? 'rounded-t-3xl w-full max-h-[70vh] pb-[env(safe-area-inset-bottom)] animate-[o3SlideUp_.2s_ease-out]' : 'rounded-2xl max-h-72 animate-[o3FadeIn_.12s_ease-out]'}`}>
      {isPhone && <div className="pt-2.5 pb-1 flex justify-center"><span className="w-10 h-1 rounded-full bg-slate-300" /></div>}
      {searchable && (
        <div className="p-2 border-b border-slate-100">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-2.5">
            <Search size={14} className="text-slate-400" />
            <input ref={searchBox} value={q} onChange={e => { setQ(e.target.value); setActive(0); }} onKeyDown={key}
              placeholder="Search…" className="w-full bg-transparent py-2 text-sm outline-none" />
          </div>
        </div>
      )}
      <div ref={list} className="overflow-y-auto p-1.5 overscroll-contain">
        {items}
        {!shown.length && <p className="px-3 py-4 text-sm text-slate-400 text-center">No matches</p>}
      </div>
    </div>
  );

  return (
    <div className={`relative min-w-0 ${/\bw-full\b/.test(className) || !/\bw-/.test(className) ? 'w-full' : 'inline-block'}`} style={style}>
      <button ref={btn} type="button" id={id} title={title} disabled={disabled} aria-haspopup="listbox" aria-expanded={open}
        aria-label={rest['aria-label']} onClick={() => setOpen(o => !o)} onKeyDown={key} onBlur={onBlur}
        className={`${base} !flex items-center justify-between gap-2 text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-[#2563EB] ${open ? 'ring-4 ring-blue-500/10 border-[#2563EB]' : ''}`}>
        <span className={`truncate ${selected && selected.value !== '' ? '' : 'text-slate-400'}`}>{selected ? selected.label : (options[0]?.label || 'Select…')}</span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {/* Keeps native form behaviour: required check + FormData */}
      <input tabIndex={-1} aria-hidden name={name} required={required} value={current} onChange={() => {}}
        className="absolute bottom-0 left-1/2 w-px h-px opacity-0 pointer-events-none" />
      {open && pos && createPortal(
        isPhone
          ? <div className="fixed inset-0 z-[1000] bg-black/40 flex items-end" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>{panelBody}</div>
          : <div className="fixed z-[1000]" style={{ left: Math.min(pos.left, window.innerWidth - pos.width - 8), width: pos.width, ...(pos.up ? { bottom: window.innerHeight - (btn.current?.getBoundingClientRect().top || 0) + 6 } : { top: pos.top }) }}>{panelBody}</div>,
        document.body)}
    </div>
  );
}
