import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

type Credit = { kind: string; brand: string; model?: string; file: string; title: string; author: string; license: string; source: string };

/** Credits for free-licensed photos and logos (required by their licences). Trademarks belong to their owners. */
export default function ImageCreditsPage() {
  const [items, setItems] = useState<Credit[]>([]);
  useEffect(() => { fetch('/image-credits.json').then(r => r.json()).then(setItems).catch(() => setItems([])); }, []);
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 max-w-2xl mx-auto">
      <button onClick={() => history.back()} className="flex items-center gap-1 text-sm font-bold text-[#2563EB] mb-3"><ArrowLeft size={16} /> Back</button>
      <h1 className="text-xl font-black text-slate-900">Image credits</h1>
      <p className="text-xs text-slate-500 mt-1 mb-4">Car photos and brand logos come from Wikimedia Commons under the licences shown (background removed / resized). Car brand names and logos are trademarks of their owners and are used only to identify your vehicle. Other artwork is original to O3 Car Spaa.</p>
      <div className="space-y-2">
        {items.map(c => (
          <a key={c.file} href={c.source} target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-white rounded-xl p-2.5 shadow-sm">
            <img src={c.file} alt="" className="w-14 h-10 object-contain shrink-0" loading="lazy" />
            <span className="min-w-0 text-[11.5px] leading-snug">
              <span className="block font-bold text-slate-800 truncate">{c.kind === 'logo' ? `${c.brand} logo` : `${c.brand} ${c.model}`}</span>
              <span className="block text-slate-500 truncate">{c.author} · {c.license}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
