/** Wide studio photo with a short tagline — the visual top of customer pages (title already sits in the top bar). */
export default function PhotoBanner({ img, kicker, line, className = '' }: { img: string; kicker: string; line: string; className?: string }) {
  return (
    <div className={`rise relative overflow-hidden rounded-3xl h-36 sm:h-44 mb-4 shadow-[0_10px_30px_rgba(11,31,77,0.16)] ${className}`}>
      <img src={img} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F4D]/90 via-[#0B1F4D]/55 to-transparent" />
      <div className="relative h-full flex flex-col justify-end p-4 sm:p-6 text-white max-w-[75%]">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">{kicker}</span>
        <p className="text-[19px] sm:text-2xl font-black leading-tight mt-1">{line}</p>
      </div>
    </div>
  );
}
