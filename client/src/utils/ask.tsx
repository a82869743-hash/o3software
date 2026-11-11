import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Modal from '../components/ui/Modal';

/**
 * In-app replacement for window.prompt (which is clunky on phones and unreliable in some webviews).
 *   const v = await askText('Reason?', 'default');          // string, or null when cancelled
 *   const f = await askForm('Add QR', [{ name: 'title', label: 'Title', required: true }]);
 */
export interface AskField {
  name: string;
  label: string;
  value?: string;
  placeholder?: string;
  required?: boolean;
  type?: 'text' | 'number' | 'tel';
  options?: Array<{ value: string; label: string }>;
  multiline?: boolean;
}

function mount<T>(render: (done: (v: T) => void) => React.ReactNode): Promise<T> {
  return new Promise<T>((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v: T) => {
      resolve(v);
      setTimeout(() => { root.unmount(); host.remove(); }, 0);
    };
    root.render(<>{render(done)}</>);
  });
}

function AskDialog({ title, message, fields, okLabel, done }: {
  title: string; message?: string; fields: AskField[]; okLabel: string;
  done: (v: Record<string, string> | null) => void;
}) {
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(fields.map(f => [f.name, f.value ?? (f.options?.[0]?.value ?? '')]))
  );
  const [err, setErr] = useState('');
  const submit = () => {
    const missing = fields.find(f => f.required && !String(vals[f.name] ?? '').trim());
    if (missing) { setErr(`Please fill "${missing.label}"`); return; }
    done(vals);
  };
  const cls = 'w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500';
  return (
    <Modal open onClose={() => done(null)} title={title} size="sm"
      footer={
        <>
          <button type="button" onClick={() => done(null)} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="button" onClick={submit} className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#2563EB] hover:bg-blue-700">{okLabel}</button>
        </>
      }>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); submit(); }}>
        {message && <p className="text-sm text-slate-600 whitespace-pre-line">{message}</p>}
        {fields.map((f, i) => (
          <label key={f.name} className="block">
            {(fields.length > 1 || !message) && <span className="block text-xs font-bold text-slate-700 mb-1">{f.label}{f.required ? ' *' : ''}</span>}
            {f.options ? (
              <select className={cls} value={vals[f.name]} onChange={e => setVals(v => ({ ...v, [f.name]: e.target.value }))}>
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.multiline ? (
              <textarea className={cls} rows={3} autoFocus={i === 0} placeholder={f.placeholder} value={vals[f.name]}
                onChange={e => setVals(v => ({ ...v, [f.name]: e.target.value }))} />
            ) : (
              <input className={cls} autoFocus={i === 0} type={f.type || 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined}
                placeholder={f.placeholder} value={vals[f.name]} onChange={e => setVals(v => ({ ...v, [f.name]: e.target.value }))} />
            )}
          </label>
        ))}
        {err && <p className="text-xs font-bold text-rose-600">{err}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export function askForm(title: string, fields: AskField[], opts: { message?: string; okLabel?: string } = {}) {
  return mount<Record<string, string> | null>(done => (
    <AskDialog title={title} message={opts.message} fields={fields} okLabel={opts.okLabel || 'OK'} done={done} />
  ));
}

/** Same as window.prompt: resolves to the typed text, or null when cancelled. */
export async function askText(message: string, defaultValue = '', opts: { title?: string; okLabel?: string; type?: AskField['type']; options?: AskField['options'] } = {}) {
  const r = await askForm(opts.title || 'Please confirm', [{ name: 'v', label: message, value: defaultValue, type: opts.type, options: opts.options }], { message, okLabel: opts.okLabel });
  return r ? r.v : null;
}
