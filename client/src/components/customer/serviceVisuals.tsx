import FitImg from '../shared/FitImg';
import { Droplets, Sparkles, ShieldCheck, Armchair, Wrench, Paintbrush, Wind, Layers, Car, Gem, SprayCan, Sun } from 'lucide-react';
import { fileUrl } from '../../utils/endpoints';
import { MEDIA_LIBRARY } from './serviceMedia';

/** Icon + tint for a service / category name (keeps tiles colourful without stock photos). */
export function visualFor(name: string = '') {
  const n = name.toLowerCase();
  if (/ppf|film|wrap|protection/.test(n)) return { Icon: ShieldCheck, tint: 'from-indigo-500 to-blue-600', soft: 'bg-indigo-50 text-indigo-600' };
  if (/ceramic|coat|graphene|9h|10h/.test(n)) return { Icon: Gem, tint: 'from-sky-500 to-blue-600', soft: 'bg-sky-50 text-sky-600' };
  if (/interior|seat|cabin|vacuum|upholster|leather/.test(n)) return { Icon: Armchair, tint: 'from-amber-500 to-orange-500', soft: 'bg-amber-50 text-amber-600' };
  if (/polish|rubbing|compound|buff|detail/.test(n)) return { Icon: Sparkles, tint: 'from-violet-500 to-fuchsia-500', soft: 'bg-violet-50 text-violet-600' };
  if (/paint|dent|scratch|bumper/.test(n)) return { Icon: Paintbrush, tint: 'from-rose-500 to-red-500', soft: 'bg-rose-50 text-rose-600' };
  if (/ac\b|a\/c|air/.test(n)) return { Icon: Wind, tint: 'from-cyan-500 to-teal-500', soft: 'bg-cyan-50 text-cyan-600' };
  if (/engine|service|repair|mechanic/.test(n)) return { Icon: Wrench, tint: 'from-slate-600 to-slate-800', soft: 'bg-slate-100 text-slate-700' };
  if (/package|amc|member/.test(n)) return { Icon: Layers, tint: 'from-emerald-500 to-teal-600', soft: 'bg-emerald-50 text-emerald-600' };
  if (/foam|wash|shampoo|spa|clean/.test(n)) return { Icon: Droplets, tint: 'from-blue-500 to-cyan-500', soft: 'bg-blue-50 text-blue-600' };
  if (/glass|sun|tint/.test(n)) return { Icon: Sun, tint: 'from-yellow-400 to-amber-500', soft: 'bg-yellow-50 text-yellow-600' };
  if (/spray|perfume|fragrance|sanit/.test(n)) return { Icon: SprayCan, tint: 'from-pink-500 to-rose-500', soft: 'bg-pink-50 text-pink-600' };
  return { Icon: Car, tint: 'from-blue-600 to-indigo-600', soft: 'bg-blue-50 text-blue-600' };
}

/** 3D illustrations bundled with the app (public/illustrations) — used when the studio hasn't uploaded a photo. */
export const ILLUSTRATIONS = {
  wash: '/illustrations/wash.webp',
  ceramic: '/illustrations/ceramic.webp',
  ppf: '/illustrations/ppf.webp',
  interior: '/illustrations/interior.webp',
  polish: '/illustrations/polish.webp',
  packages: '/illustrations/packages.webp',
  shop: '/illustrations/shop.webp',
  history: '/illustrations/history.webp',
  rewards: '/illustrations/rewards.webp',
  refer: '/illustrations/refer.webp',
  help: '/illustrations/help.webp',
  dentpaint: '/illustrations/dentpaint.webp',
  ac: '/illustrations/ac.webp',
  mechanic: '/illustrations/mechanic.webp',
  offer: '/illustrations/offer.webp',
  graphene: '/illustrations/lib-graphene.webp',
  headlight: '/illustrations/lib-headlight.webp',
  glass: '/illustrations/lib-glass.webp',
  wheels: '/illustrations/lib-wheels.webp',
  engine: '/illustrations/lib-engine.webp',
  underbody: '/illustrations/lib-underbody.webp',
  sanitize: '/illustrations/lib-sanitize.webp',
  leather: '/illustrations/lib-leather.webp',
  tint: '/illustrations/lib-tint.webp',
  bike: '/illustrations/lib-bike.webp',
  pickup: '/illustrations/lib-pickup.webp',
  wax: '/illustrations/lib-wax.webp',
  scratch: '/illustrations/lib-scratch.webp',
  steam: '/illustrations/lib-steam.webp',
  rodent: '/illustrations/lib-rodent.webp',
  doorstep: '/illustrations/lib-doorstep.webp',
  inspection: '/illustrations/lib-inspection.webp',
  wrap: '/illustrations/lib-wrap.webp',
} as const;

/** Friendly names shown in the admin picture library. */
export const LIBRARY_LABELS: Record<string, string> = {
  wash: 'Car wash', ceramic: 'Ceramic coating', ppf: 'PPF / protection film', interior: 'Interior spa',
  polish: 'Polish & rubbing', packages: 'Package / plan', shop: 'Products', history: 'Service record',
  rewards: 'Rewards', refer: 'Refer & earn', help: 'Support', dentpaint: 'Denting & painting',
  ac: 'AC service', mechanic: 'Repair / mechanical', offer: 'Offer / gift',
  graphene: 'Graphene coating', headlight: 'Headlight restoration', glass: 'Glass coating / windshield',
  wheels: 'Tyre & rim cleaning', engine: 'Engine bay cleaning', underbody: 'Underbody / anti-rust',
  sanitize: 'Sanitisation / odour', leather: 'Leather care', tint: 'Sun film / tint', bike: 'Bike wash',
  pickup: 'Pickup & drop', wax: 'Wax', scratch: 'Scratch removal', steam: 'Steam wash',
  rodent: 'Rodent protection', doorstep: 'Doorstep wash', inspection: 'Inspection / check-up',
  wrap: 'Colour wrap',
};

/**
 * Picks a picture from the built-in library by the service / package name, so anything the admin adds
 * later gets a fitting picture automatically (an uploaded or AI picture always wins over this).
 */
export function illustrationFor(name: string = ''): string | null {
  const n = name.toLowerCase();
  if (/package|amc|member|plan|subscription|monthly|annual|combo|pass/.test(n)) return ILLUSTRATIONS.packages;
  if (/bike|two.?wheeler|scooter|motorcycle/.test(n)) return ILLUSTRATIONS.bike;
  if (/doorstep|at home|home wash|on.?site/.test(n)) return ILLUSTRATIONS.doorstep;
  if (/pick.?up|drop/.test(n)) return ILLUSTRATIONS.pickup;
  if (/wrap|vinyl|colou?r change/.test(n)) return ILLUSTRATIONS.wrap;
  if (/graphene/.test(n)) return ILLUSTRATIONS.graphene;
  if (/headlight|head lamp|tail ?light/.test(n)) return ILLUSTRATIONS.headlight;
  if (/glass|windshield|windscreen|rain repell/.test(n)) return ILLUSTRATIONS.glass;
  if (/tint|sun ?film|sun ?control|window film/.test(n)) return ILLUSTRATIONS.tint;
  if (/rodent|\brats?\b|mouse/.test(n)) return ILLUSTRATIONS.rodent;
  if (/underbody|under.?chassis|anti.?rust|rust/.test(n)) return ILLUSTRATIONS.underbody;
  if (/engine (bay|clean|dress|wash)/.test(n)) return ILLUSTRATIONS.engine;
  if (/leather/.test(n)) return ILLUSTRATIONS.leather;
  if (/steam/.test(n)) return ILLUSTRATIONS.steam;
  if (/sanitiz|sanitis|odou?r|ozone|disinfect|fragrance|aroma/.test(n)) return ILLUSTRATIONS.sanitize;
  if (/scratch|swirl|paint correction/.test(n)) return ILLUSTRATIONS.scratch;
  if (/\bwax/.test(n)) return ILLUSTRATIONS.wax;
  if (/tyre|tire|\brims?\b|wheel|alloy/.test(n)) return ILLUSTRATIONS.wheels;
  if (/inspection|check.?up|health ?check|diagnos/.test(n)) return ILLUSTRATIONS.inspection;
  if (/ppf|film|wrap|protection|tint|sun ?control|clear bra/.test(n)) return ILLUSTRATIONS.ppf;
  if (/ceramic|graphene|coat|9h|10h|teflon|nano|sealant|glass guard/.test(n)) return ILLUSTRATIONS.ceramic;
  if (/interior|seat|cabin|vacuum|upholster|leather|steam|dashboard|roof|carpet|mat|odou?r|sanitiz|ozone|fragrance|aroma/.test(n)) return ILLUSTRATIONS.interior;
  if (/polish|rubbing|compound|buff|detail|headlight|swirl|wax|shine|restoration/.test(n)) return ILLUSTRATIONS.polish;
  if (/dent|paint|bumper|scratch|touch.?up|body ?shop/.test(n)) return ILLUSTRATIONS.dentpaint;
  if (/\bac\b|a\/c|air ?con|cooling|cabin filter|gas refill/.test(n)) return ILLUSTRATIONS.ac;
  if (/engine|repair|mechanic|general service|car service|battery|brake|oil|clutch|suspension|alignment|balancing|inspection|check.?up/.test(n)) return ILLUSTRATIONS.mechanic;
  if (/foam|wash|shampoo|spa|clean|underbody|tyre|tire|rim|wheel|bike|express/.test(n)) return ILLUSTRATIONS.wash;
  if (/product|accessor|perfume|cover|kit|cloth|spray/.test(n)) return ILLUSTRATIONS.shop;
  if (/gift|voucher|reward/.test(n)) return ILLUSTRATIONS.rewards;
  return null;
}

/** Picture paths: bundled library pictures load from the app itself, uploaded ones from the server. */
export function pictureSrc(url?: string | null): string {
  if (!url) return '';
  return url.startsWith('/illustrations/') || url.startsWith('/photos/') || url.startsWith('/media/') ? url : fileUrl(url);
}

/** Service image if the studio uploaded one, otherwise a 3D illustration, otherwise a branded gradient tile. */
export function ServiceArt({ name, imageUrl, className = 'h-36' }: { name: string; imageUrl?: string | null; className?: string }) {
  const { Icon, tint } = visualFor(name);
  // library / AI pictures (white background) sit on the soft card; real photos fill the frame
  const isArt = !!imageUrl && !/\/illustrations\/photo-|^\/photos\/|^\/media\//.test(imageUrl) && (imageUrl.startsWith('/illustrations/') || imageUrl.includes('/illustrations/ai_'));
  if (imageUrl && !isArt) return <FitImg src={pictureSrc(imageUrl)} alt={name} className={className} />;
  const photo = (!imageUrl || isArt) ? photoFor(name) : null;
  if (photo) return <FitImg src={photo} alt={name} className={className} />;
  const art = isArt ? pictureSrc(imageUrl) : illustrationFor(name);
  if (art) return (
    <div className={`w-full bg-gradient-to-br from-sky-50 to-blue-100/70 flex items-center justify-center overflow-hidden ${className}`}>
      <img src={art} alt="" className="h-full w-full object-contain mix-blend-multiply" loading="lazy" />
    </div>
  );
  return (
    <div className={`w-full bg-gradient-to-br ${tint} relative overflow-hidden flex items-center justify-center ${className}`}>
      <div className="absolute -right-6 -bottom-8 w-32 h-32 rounded-full bg-white/10" />
      <div className="absolute -left-4 -top-6 w-20 h-20 rounded-full bg-white/10" />
      <Icon size={44} className="text-white drop-shadow" />
    </div>
  );
}

/** Where an item's picture comes from — shown to admins so they can see what still needs attention. */
export function pictureSource(name: string, imageUrl?: string | null): { label: string; cls: string; needs: boolean } {
  if (imageUrl) {
    if (imageUrl.includes('/illustrations/ai_')) return { label: 'AI picture', cls: 'bg-violet-50 text-violet-700', needs: false };
    if (imageUrl.startsWith('/illustrations/')) return { label: 'Library', cls: 'bg-sky-50 text-sky-700', needs: false };
    return { label: 'Own photo', cls: 'bg-emerald-50 text-emerald-700', needs: false };
  }
  if (illustrationFor(name)) return { label: 'Automatic', cls: 'bg-slate-100 text-slate-600', needs: false };
  return { label: 'Needs picture', cls: 'bg-amber-50 text-amber-700', needs: true };
}

/** One-line count of picture sources for an admin list (services / packages). */
export function PictureSummary({ items, kind }: { items: { name: string; image_url?: string | null }[]; kind: string }) {
  if (!items.length) return null;
  const counts: Record<string, number> = {};
  let needs = 0;
  items.forEach(it => { const p = pictureSource(it.name, it.image_url); counts[p.label] = (counts[p.label] || 0) + 1; if (p.needs) needs++; });
  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs rounded-xl px-3 py-2 border ${needs ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
      <span className="font-bold">Pictures:</span>
      {Object.entries(counts).map(([k, v]) => <span key={k}>{v} {k.toLowerCase()}</span>)}
      {needs > 0 && <span className="font-semibold">— {needs} {kind} without a matching picture: open Edit → Picture to choose one.</span>}
    </div>
  );
}

/**
 * Real (AI-generated, photoreal) studio photos. A service/package uses one when its name matches a key below
 * and that photo exists; otherwise it falls back to the 3D illustration. To add a photo: save it as
 * /public/photos/<key>.webp and add the key to PHOTO_FILES.
 */
export const PHOTO_LABELS: Record<string, string> = {
  wash: 'Foam wash', ceramic: 'Ceramic coating', ppf: 'PPF / protection film', interior: 'Interior detailing',
  polish: 'Machine polishing', wax: 'Wax application', headlight: 'Headlight restoration', glass: 'Glass coating',
  wheels: 'Wheels & tyres', engine: 'Engine bay', underbody: 'Underbody anti-rust', sanitize: 'Sanitisation',
  leather: 'Leather care', steam: 'Steam cleaning', tint: 'Sun film / tint', scratch: 'Scratch removal',
  dentpaint: 'Denting & painting', ac: 'AC service', mechanic: 'General service', inspection: 'Paint inspection',
  wrap: 'Vinyl wrap', graphene: 'Graphene coating', pickup: 'Pickup & drop', doorstep: 'Doorstep wash',
  packages: 'Studio / packages', shop: 'Car-care products', 'studio-hero': 'Studio (wide)',
};
// The first 4 came with the app; the rest are generated from IMAGE_PROMPTS_FLOW.md and saved as /photos/<key>.webp.
// Add a key here once its file is in client/public/photos/ and it appears everywhere + in the admin library.
const READY_PHOTOS: string[] = ['studio-hero', 'shop', 'packages', 'doorstep', 'pickup', 'graphene', 'wrap', 'inspection', 'mechanic', 'ac',
  'dentpaint', 'scratch', 'tint', 'steam', 'leather', 'sanitize', 'underbody', 'engine', 'wheels', 'glass'];
const PHOTO_FILES: Record<string, string> = {
  wash: '/illustrations/photo-wash.webp',
  ceramic: '/illustrations/photo-coating.webp',
  ppf: '/illustrations/photo-ppf.webp',
  interior: '/illustrations/photo-interior.webp',
  ...Object.fromEntries(READY_PHOTOS.map(k => [k, `/photos/${k}.webp`])),
};
/** Real photos for the admin picture library. */
export const PHOTO_LIBRARY = [...Object.entries(PHOTO_FILES).map(([key, url]) => ({ key, url, label: PHOTO_LABELS[key] || key })), ...MEDIA_LIBRARY];
export const PHOTOS = { wash: PHOTO_FILES.wash, coating: PHOTO_FILES.ceramic, ppf: PHOTO_FILES.ppf, interior: PHOTO_FILES.interior,
  studio: '/photos/studio-hero.webp', showroom: '/photos/packages.webp', shop: '/photos/shop.webp', pickup: '/photos/pickup.webp', doorstep: '/photos/doorstep.webp',
  beading: '/photos/graphene.webp', glass: '/photos/glass.webp', inspection: '/photos/inspection.webp', mechanic: '/photos/mechanic.webp', leather: '/photos/leather.webp',
  wheels: '/photos/wheels.webp', polish: '/photos/scratch.webp', paint: '/photos/dentpaint.webp', wrap: '/photos/wrap.webp', engine: '/photos/engine.webp', steam: '/photos/steam.webp', tint: '/photos/tint.webp', ac: '/photos/ac.webp' };
const PHOTO_ALIAS: Record<string, string> = { polish: 'scratch', wax: 'graphene', headlight: 'scratch', rodent: 'underbody', bike: 'doorstep', offer: 'studio-hero', rewards: 'studio-hero', refer: 'studio-hero' };

/** Real photo for a service / package name, or null. */
export function photoFor(name: string): string | null {
  const art = illustrationFor(name);
  if (!art) return null;
  const key = Object.entries(ILLUSTRATIONS).find(([, url]) => url === art)?.[0];
  if (!key) return null;
  return PHOTO_FILES[key] || PHOTO_FILES[PHOTO_ALIAS[key]] || null;
}
