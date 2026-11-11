import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { ILLUSTRATIONS, PHOTOS } from './serviceVisuals';
import { fileUrl } from '../../utils/endpoints';

type Slide = {
  key: string;
  img: string;
  photo?: boolean; // uploaded banner photo (full-bleed) vs 3D illustration on a light card
  title: string;
  subtitle?: string;
  code?: string;
  cta: string;
  to: string;
};

/**
 * Home banner carousel (Hoora-style): swipe or auto-slides every few seconds.
 * The studio's own banner/offer from Admin → Settings comes first; the rest are evergreen slides.
 */
export default function HeroCarousel({ settings }: { settings: any }) {
  const navigate = useNavigate();
  const s = settings || {};
  const slides: Slide[] = useMemo(() => {
    const list: Slide[] = [];
    if (s.app_banner_url) {
      list.push({ key: 'banner', img: fileUrl(s.app_banner_url), photo: true, title: s.app_offer_title || '', subtitle: s.app_offer_subtitle, code: s.app_offer_code, cta: 'Book now', to: '/customer/services' });
    } else if (s.app_offer_title) {
      list.push({ key: 'offer', img: PHOTOS.showroom, photo: true, title: s.app_offer_title, subtitle: s.app_offer_subtitle, code: s.app_offer_code, cta: 'Book now', to: '/customer/services' });
    }
    list.push(
      { key: 'shine', img: PHOTOS.studio, photo: true, title: 'Showroom shine, every single time', subtitle: 'Premium wash, coating, PPF & interior spa', cta: 'Book a service', to: '/customer/services' },
      { key: 'ceramic', img: PHOTOS.beading, photo: true, title: 'Ceramic & graphene coating', subtitle: 'Deep gloss that stays clean longer', cta: 'Explore', to: '/customer/services?q=ceramic' },
      { key: 'pickup', img: PHOTOS.pickup, photo: true, title: 'We pick up, we drop back', subtitle: 'Doorstep pickup & drop for your car', cta: 'Book with pickup', to: '/customer/bookings/new' },
      { key: 'refer', img: PHOTOS.showroom, photo: true, title: 'Refer friends, earn rewards', subtitle: 'Share your code on WhatsApp', cta: 'Invite now', to: '/customer/refer' },
    );
    return list;
  }, [s.app_banner_url, s.app_offer_title, s.app_offer_subtitle, s.app_offer_code]);

  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const pausedUntil = useRef(0);

  // auto-slide (pauses for a while after the customer touches it)
  useEffect(() => {
    const t = setInterval(() => {
      const el = track.current;
      if (!el || Date.now() < pausedUntil.current || document.hidden) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % slides.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    }, 4500);
    return () => clearInterval(t);
  }, [slides.length]);

  const onScroll = () => {
    const el = track.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };
  const goTo = (i: number) => {
    pausedUntil.current = Date.now() + 8000;
    track.current?.scrollTo({ left: i * (track.current?.clientWidth || 0), behavior: 'smooth' });
  };

  return (
    <div>
      <div ref={track} onScroll={onScroll} onPointerDown={() => { pausedUntil.current = Date.now() + 8000; }}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar scroll-smooth">
        {slides.map(sl => (
          <div key={sl.key} className="snap-center shrink-0 w-full px-4">
            <button onClick={() => navigate(sl.to)} className="tap relative w-full h-[172px] rounded-3xl overflow-hidden text-left shadow-[0_10px_30px_rgba(37,99,235,0.15)]">
              {sl.photo ? (
                <>
                  {/* uploaded banner (light 3D banner from Settings): soft light fade on the left keeps the text readable */}
                  <img src={sl.img} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  {/* the studio's uploaded banner keeps a light fade; real studio photos get a navy fade + white text */}
                  <div className={`absolute inset-0 bg-gradient-to-r ${sl.key === 'banner' ? 'from-[#EEF5FF]/95 via-[#EEF5FF]/55' : 'from-[#0B1F4D]/92 via-[#0B1F4D]/60'} to-transparent`} />
                  <div className="relative h-full flex flex-col justify-center pl-4 pr-[38%]">
                    {sl.title && <p className={`text-[18px] font-black leading-[1.15] ${sl.key === 'banner' ? 'text-[#0B1F4D]' : 'text-white'}`}>{sl.title}</p>}
                    {sl.subtitle && <p className={`text-[11.5px] font-medium mt-1 leading-snug ${sl.key === 'banner' ? 'text-[#334E7E]' : 'text-white/80'}`}>{sl.subtitle}</p>}
                    <SlideActions slide={sl} dark={sl.key !== 'banner'} />
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#EEF5FF] via-[#DCE9FF] to-[#BFD6FF]">
                  <div className="absolute -right-10 -top-12 w-44 h-44 rounded-full bg-white/50" />
                  <div className="absolute right-16 -bottom-16 w-40 h-40 rounded-full bg-[#2563EB]/10" />
                  <img src={sl.img} alt="" className="absolute right-1 bottom-1 h-[150px] w-[46%] object-contain mix-blend-multiply" />
                  <div className="relative h-full flex flex-col justify-center pl-4 pr-[46%]">
                    <p className="text-[18px] font-black leading-[1.15] text-[#0B1F4D]">{sl.title}</p>
                    {sl.subtitle && <p className="text-[11.5px] font-medium text-[#334E7E] mt-1 leading-snug">{sl.subtitle}</p>}
                    <SlideActions slide={sl} />
                  </div>
                </div>
              )}
            </button>
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2.5">
          {slides.map((sl, i) => (
            <button key={sl.key} onClick={() => goTo(i)} aria-label={`Slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-5 bg-[#2563EB]' : 'w-1.5 bg-slate-300'}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function SlideActions({ slide, dark }: { slide: Slide; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2 mt-2.5 flex-wrap">
      <span className={`inline-flex items-center gap-0.5 text-[12px] font-extrabold px-3 py-1.5 rounded-xl ${dark ? 'bg-white text-[#1D4ED8]' : 'bg-[#0B1F4D] text-white'}`}>
        {slide.cta} <ChevronRight size={14} />
      </span>
      {slide.code && (
        <span className="text-[11px] font-black px-2.5 py-1.5 rounded-xl bg-amber-400 text-slate-900">CODE: {slide.code}</span>
      )}
    </div>
  );
}
