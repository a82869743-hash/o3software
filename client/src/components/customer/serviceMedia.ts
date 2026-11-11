/**
 * Real studio media bundled with the app (public/media, public/photos, public/illustrations).
 * Every service gets its OWN picture: options of one treatment (Ceramic 1 / 2 / 3 / 5 years, the PPF films…)
 * each take a different item from that treatment's pool, and an item used once is never used again.
 * A before/after pair and a process video of the same job count as two items.
 */
export type ServiceMedia = { before?: string; after?: string; photo?: string; video?: string; poster?: string };

const pair = (slug: string): ServiceMedia => ({ before: `/media/${slug}-before.webp`, after: `/media/${slug}-after.webp` });
const vid = (slug: string): ServiceMedia => ({ video: `/media/${slug}.mp4`, poster: `/media/${slug}-poster.webp` });
const pic = (path: string): ServiceMedia => ({ photo: path });

// Pools, most specific first. Each entry: [name rule, items in order of best fit].
// Only real photos / before-after pairs / process videos here (no cartoon illustrations).
const POOLS: [RegExp, ServiceMedia[]][] = [
  [/ppf|paint protection|film/, [pic('/illustrations/photo-ppf.webp'), pic('/photos/wrap.webp'), pic('/photos/scratch.webp'), pic('/media/lib-luxury-sedan.webp'),
    pic('/photos/inspection.webp'), pic('/photos/studio-hero.webp'), pic('/photos/packages.webp'), pic('/photos/pickup.webp'),
    pic('/photos/dentpaint.webp'), pic('/photos/tint.webp'), vid('lib-foam-luxury'), pic('/photos/shop.webp'),
    vid('polish'), vid('compound'), vid('o3coat'), pic('/photos/glass.webp'), vid('trim')]],
  [/rodent/, [pic('/photos/mechanic.webp'), pic('/photos/engine.webp')]],
  [/undershield|anti.?rust|underbody/, [pair('antirust'), vid('antirust'), pic('/photos/underbody.webp')]],
  [/graphene/, [pair('graphene'), vid('graphene'), pic('/photos/graphene.webp'), pic('/photos/inspection.webp'),
    vid('lib-wash-white-suv'), pic('/photos/studio-hero.webp'), pic('/photos/packages.webp'), pic('/photos/pickup.webp')]],
  [/ceramic/, [pair('ceramic'), vid('ceramic'), pic('/illustrations/photo-coating.webp'), pic('/photos/scratch.webp'),
    vid('lib-wash-white-car'), pic('/photos/wrap.webp'), pic('/photos/studio-hero.webp'), pic('/photos/tint.webp'), pic('/photos/shop.webp')]],
  [/maintenance|coatcare.*only/, [pic('/media/maintenance.webp'), vid('lib-wash-red-hatch'), pic('/photos/steam.webp')]],
  [/o3 coating/, [pair('o3coat'), vid('o3coat')]],
  [/compound/, [pair('compound'), vid('compound')]],
  [/polish|wax/, [pair('polish'), vid('polish'), pic('/photos/scratch.webp')]],
  [/windshield|glass/, [pair('glass'), vid('glass'), pic('/photos/glass.webp')]],
  [/alloy|wheel|\brims?\b/, [pair('wheel'), vid('wheel'), pic('/photos/wheels.webp')]],
  [/engine/, [pair('engine'), vid('engine'), pic('/photos/engine.webp')]],
  [/headlight/, [pair('headlight'), vid('headlight')]],
  [/trim|dashboard/, [pair('trim'), vid('trim')]],
  [/fabric/, [pair('fabric'), vid('fabric')]],
  [/ozone|odou?r|ac vent|a\/c/, [pair('acvent'), vid('acvent'), pic('/photos/sanitize.webp'), pic('/photos/ac.webp')]],
  [/leather shield/, [pic('/media/lib-beige-interior.webp'), vid('leather'), pic('/photos/leather.webp')]],
  [/leather/, [pair('leather'), vid('leather'), pic('/photos/leather.webp')]],
  [/interior|cabin|vacuum only/, [pair('interior'), vid('interior'), pic('/photos/steam.webp'), pic('/illustrations/photo-interior.webp')]],
  [/wash|shampoo|vacuum|foam/, [pair('wash'), vid('wash'), vid('lib-wash-scorpio'), vid('lib-wash-white-car'), vid('lib-wash-red-hatch'), vid('lib-foam-luxury'),
    pic('/illustrations/photo-wash.webp'), pic('/photos/doorstep.webp')]],
];

// Used only when a service's own pool has run out (real photos only).
const SPARE: ServiceMedia[] = [pic('/photos/studio-hero.webp'), pic('/photos/shop.webp'), pic('/photos/inspection.webp'), pic('/photos/mechanic.webp'),
  pic('/photos/tint.webp'), pic('/photos/doorstep.webp'), pic('/photos/packages.webp'), pic('/photos/pickup.webp'), pic('/illustrations/photo-wash.webp'), pic('/photos/dentpaint.webp')];

const keyOf = (md: ServiceMedia) => md.before || md.video || md.photo || '';
const poolFor = (name: string) => POOLS.find(([rx]) => rx.test(name.toLowerCase()))?.[1] || null;

let assigned = new Map<string, ServiceMedia | null>();

/**
 * Hand out media for the whole service list at once (in the list's order), so no item is used twice.
 * Call with the full list on the pages that show services; mediaFor() then returns the same picks everywhere.
 */
export function assignServiceMedia(names: string[]): Map<string, ServiceMedia | null> {
  const used = new Set<string>([keyOf(HOME_MEDIA)]);
  const out = new Map<string, ServiceMedia | null>();
  for (const name of names) {
    if (out.has(name)) continue;
    const pool = poolFor(name);
    if (!pool) { out.set(name, null); continue; }
    const pick = pool.find(md => !used.has(keyOf(md))) || SPARE.find(md => !used.has(keyOf(md))) || null;
    if (pick) used.add(keyOf(pick));
    out.set(name, pick);
  }
  assigned = out;
  return out;
}

/** Media for a service name (its own pick from assignServiceMedia), or null when the studio has none for it. */
export function mediaFor(name: string = ''): ServiceMedia | null {
  if (assigned.has(name)) return assigned.get(name) || null;
  return poolFor(name)?.[0] || null;
}

/** Home screen showcase. */
export const HOME_MEDIA: ServiceMedia = { ...pair('home'), ...vid('home') };

/** Extra studio media for the admin picture library (not placed on any screen yet). */
export const MEDIA_LIBRARY: { key: string; url: string; label: string }[] = [
  ['lib-bike-tank-before', 'Bike tank — before'],
  ['lib-bike-tank-after', 'Bike tank — after'],
  ['lib-bike-muddy', 'Muddy motorcycle'],
  ['lib-bike-clean', 'Clean motorcycle'],
].map(([key, label]) => ({ key, url: `/media/${key}.webp`, label }));
