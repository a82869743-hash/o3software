import { useState } from 'react';
import { ArrowUp, ArrowDown, Plus, Trash2, Home, Eye, EyeOff, Pencil } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import PicturePicker from './PicturePicker';
import { useServiceCategories, useSaveCategory, useDeleteCategory, useReorder } from '../../api/hooks/useServices';
import { useUIStore } from '../../store/uiStore';
import { illustrationFor, pictureSrc, ILLUSTRATIONS } from '../customer/serviceVisuals';

/** Picture shown for a category tile in the customer app. */
export const categoryArt = (c: { name: string; image_url?: string | null }) =>
  c.image_url ? pictureSrc(c.image_url) : (illustrationFor(c.name) || ILLUSTRATIONS.wash);

/**
 * Service categories = the groups customers browse by. Categories marked "Show on home" become the
 * big picture tiles on the customer home screen, in this order.
 */
export default function CategoriesManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useUIStore(s => s.toast);
  const { data: cats = [] } = useServiceCategories();
  const save = useSaveCategory();
  const del = useDeleteCategory();
  const reorder = useReorder('categories');
  const [edit, setEdit] = useState<any>(null);

  const run = async (p: Promise<any>, ok?: string) => {
    try { await p; if (ok) toast('success', ok); } catch (e: any) { toast('error', e?.response?.data?.error || e.message || 'Failed'); }
  };
  const move = (i: number, dir: -1 | 1) => {
    const ids = cats.map((c: any) => c.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(reorder.mutateAsync(ids));
  };
  const submit = async () => {
    if (!edit?.name?.trim()) { toast('error', 'Type a name'); return; }
    await run(save.mutateAsync({ id: edit.id, name: edit.name, image_url: edit.image_url || null, show_on_home: !!edit.show_on_home }), edit.id ? 'Category saved' : 'Category added');
    setEdit(null);
  };
  const onHome = cats.filter((c: any) => c.show_on_home && c.is_active).length;

  return (
    <>
      <Modal open={open && !edit} onClose={onClose} title="Categories & home screen" size="lg"
        footer={<><Button variant="ghost" onClick={onClose}>Done</Button><Button icon={<Plus size={16} />} onClick={() => setEdit({ name: '', image_url: '', show_on_home: true })}>Add category</Button></>}>
        <p className="text-xs text-slate-500 mb-3">
          Customers browse services by these groups. Turn on <b>Home</b> to show a category as a big picture tile on the customer home screen (only once it has at least one service)
          {onHome ? ` (${onHome} shown now)` : ' — none chosen yet, so the app shows Washing, Ceramic and PPF tiles'}. Use the arrows to set the order.
        </p>
        <div className="space-y-2">
          {cats.map((c: any, i: number) => (
            <div key={c.id} className={`flex flex-wrap sm:flex-nowrap items-center gap-x-2.5 gap-y-1.5 rounded-2xl border p-2.5 ${c.is_active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
              <img src={categoryArt(c)} alt="" className="w-11 h-11 rounded-xl object-contain bg-sky-50 mix-blend-multiply shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-slate-900 truncate">{c.name}</p>
                <p className="text-[11px] text-slate-500">{!c.is_active ? 'Hidden from customers' : c.show_on_home ? 'On home screen' : 'In services list'}</p>
              </div>
              <div className="flex items-center justify-end gap-0.5 shrink-0 w-full sm:w-auto border-t sm:border-0 border-slate-100 pt-1.5 sm:pt-0">
                <button title="Show on home screen" onClick={() => run(save.mutateAsync({ id: c.id, show_on_home: !c.show_on_home }))}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.show_on_home ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-100'}`}><Home size={15} /></button>
                <button title={c.is_active ? 'Hide from customers' : 'Show to customers'} onClick={() => run(save.mutateAsync({ id: c.id, is_active: !c.is_active }))}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100">{c.is_active ? <Eye size={15} /> : <EyeOff size={15} />}</button>
                <button title="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="w-7 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={15} /></button>
                <button title="Move down" disabled={i === cats.length - 1} onClick={() => move(i, 1)} className="w-7 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={15} /></button>
                <button title="Edit" onClick={() => setEdit({ ...c })} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100"><Pencil size={14} /></button>
                <button title="Delete" onClick={() => { if (confirm(`Delete "${c.name}"? Its services stay, just without a category.`)) run(del.mutateAsync(c.id), 'Category deleted'); }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-rose-500 hover:bg-rose-50"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {!cats.length && <p className="text-center text-sm text-slate-400 py-6">No categories yet — add one.</p>}
        </div>
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit category' : 'New category'}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={submit} loading={save.isPending}>Save</Button></>}>
        {edit && (
          <div className="space-y-4">
            <Input label="Category name *" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Ceramic Coating" />
            <PicturePicker name={edit.name} kind="service" value={edit.image_url || ''} onChange={url => setEdit({ ...edit, image_url: url })} />
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={!!edit.show_on_home} onChange={e => setEdit({ ...edit, show_on_home: e.target.checked })} className="w-4 h-4 accent-blue-600" />
              Show as a tile on the customer home screen
            </label>
          </div>
        )}
      </Modal>
    </>
  );
}
