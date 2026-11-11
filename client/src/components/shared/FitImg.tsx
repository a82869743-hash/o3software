/**
 * Whole picture, never cropped: the image is fitted inside the box and a blurred copy of it fills
 * the leftover space, so square photos in wide cards still look full and clean.
 */
export default function FitImg({ src, alt = '', className = '', loading = 'lazy' }: { src: string; alt?: string; className?: string; loading?: 'lazy' | 'eager' }) {
  return (
    <div className={`relative w-full overflow-hidden bg-slate-100 ${className}`}>
      <img src={src} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-70" loading={loading} draggable={false} />
      <img src={src} alt={alt} className="relative w-full h-full object-contain" loading={loading} draggable={false} />
    </div>
  );
}
