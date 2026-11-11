import { useEffect, useRef, useState } from 'react';
import { Play, MoveHorizontal } from 'lucide-react';
import type { ServiceMedia } from './serviceMedia';
import FitImg from '../shared/FitImg';

/** Drag (or tap) to compare the same spot before and after the work. */
export function BeforeAfter({ before, after, className = 'h-44', alt = '' }: { before: string; after: string; className?: string; alt?: string }) {
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const moveTo = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div ref={box} className={`relative w-full overflow-hidden select-none touch-pan-y cursor-ew-resize ${className}`}
      onPointerDown={e => { dragging.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); moveTo(e.clientX); }}
      onPointerMove={e => { if (dragging.current) moveTo(e.clientX); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
      role="slider" aria-label={`${alt} before and after`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pos)} tabIndex={0}
      onKeyDown={e => { if (e.key === 'ArrowLeft') setPos(p => Math.max(0, p - 5)); if (e.key === 'ArrowRight') setPos(p => Math.min(100, p + 5)); }}>
      <FitImg src={after} alt={`${alt} after`} className="absolute inset-0 h-full" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <FitImg src={before} alt={`${alt} before`} className="h-full" />
      </div>
      <span className="absolute top-2 left-2 text-[10px] font-extrabold uppercase tracking-wider bg-black/55 text-white rounded-md px-1.5 py-0.5">Before</span>
      <span className="absolute top-2 right-2 text-[10px] font-extrabold uppercase tracking-wider bg-black/55 text-white rounded-md px-1.5 py-0.5">After</span>
      <div className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.4)] pointer-events-none" style={{ left: `${pos}%` }}>
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
          <MoveHorizontal size={16} className="text-slate-800" />
        </span>
      </div>
    </div>
  );
}

/** Short silent process video; it only downloads once it is on screen, and pauses when scrolled away. */
export function ProcessVideo({ src, poster, className = 'h-44' }: { src: string; poster?: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [load, setLoad] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setLoad(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setLoad(true); el.play?.().catch(() => {}); } else el.pause?.();
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <video ref={ref} src={load ? src : undefined} poster={poster} muted loop playsInline preload="none" autoPlay
      className={`w-full object-contain bg-slate-900 ${className}`} />
  );
}

/**
 * Service picture with "Before / After" and "Video" when the studio has them.
 * `still` (an uploaded photo) is shown first if given; otherwise the before/after slider.
 */
export default function MediaShowcase({ media, name, still, className = 'h-44' }: { media: ServiceMedia; name: string; still?: string | null; className?: string }) {
  const hasPair = !!(media.before && media.after);
  const modes = [still || (!hasPair && media.photo) ? 'photo' : null, hasPair ? 'ba' : null, media.video ? 'video' : null].filter(Boolean) as ('photo' | 'ba' | 'video')[];
  const [mode, setMode] = useState(modes[0]);

  return (
    <div className="relative">
      {mode === 'photo' && <FitImg src={(still || media.photo)!} alt={name} className={className} />}
      {mode === 'ba' && <BeforeAfter before={media.before!} after={media.after!} alt={name} className={className} />}
      {mode === 'video' && <ProcessVideo src={media.video!} poster={media.poster} className={className} />}

      {modes.length > 1 && (
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 pointer-events-none">
          <span className="text-[11px] font-bold text-white drop-shadow flex items-center gap-1">
            {mode === 'video' ? <><Play size={12} className="fill-white" /> The process</> : mode === 'ba' ? 'Drag to compare' : ''}
          </span>
          <div className="pointer-events-auto flex bg-black/45 backdrop-blur rounded-full p-0.5">
            {modes.map(k => (
              <button key={k} type="button" onClick={e => { e.stopPropagation(); setMode(k); }}
                className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold transition-colors ${mode === k ? 'bg-white text-slate-900' : 'text-white/90'}`}>
                {k === 'photo' ? 'Photo' : k === 'ba' ? 'Before / After' : 'Video'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
