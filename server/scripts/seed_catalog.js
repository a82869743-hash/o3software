/**
 * seed_catalog.js — a realistic sample catalogue (services, packages, products) for testing.
 * Created as the Super Admin (only HQ may set prices). Server must be running.
 *   node scripts/seed_catalog.js
 * Also switches off the half-made "Test …" items from earlier test runs so the catalogue looks real.
 * Before launch: scripts/reset_clean_production_db.js removes everything.
 */
const fs = require('fs');
const path = require('path');

const API = process.env.API || 'http://localhost:5000/api';
const creds = {};
for (const l of fs.readFileSync(path.join(__dirname, '..', '..', 'LOGINS.local.txt'), 'utf8').split('\n')) {
  const m = l.match(/^(\w+)\s*\|.*mobile (\d{10}) \| password (\S+)/);
  if (m) creds[m[1]] = { mobile: m[2], password: m[3] };
}
let tok;
const call = async (method, url, body) => {
  const r = await fetch(API + url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok, 'x-franchise-id': '1' }, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch { /* */ }
  return { ok: r.status < 300, s: r.status, j };
};
const out = [];
const note = (ok, label, r) => out.push(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `  [${r.s}] ${r.j.error || ''}`}`);

// six car-type prices from a hatchback price, rounded to …49 / …99
const r99 = n => Math.max(99, Math.round(n / 50) * 50 - 1);
const prices = (base) => ({
  price_hatchback: r99(base), price_semi_sedan: r99(base * 1.1), price_sedan: r99(base * 1.2),
  price_premium_sedan: r99(base * 1.4), price_suv: r99(base * 1.5), price_premium_suv: r99(base * 1.8),
});

const SERVICES = [
  ['Foam Wash', 'washing', 399, 45, '/illustrations/wash.webp', true, false, 'Snow-foam exterior wash with hand dry.',
    ['Snow foam pre-wash', 'pH-neutral shampoo hand wash', 'Microfiber dry', 'Tyre dressing']],
  ['Premium Wash & Wax', 'washing', 699, 75, '/illustrations/lib-wax.webp', true, false, 'Foam wash plus a protective carnauba wax layer.',
    ['Everything in Foam Wash', 'Carnauba wax coat', 'Glass cleaning', 'Interior vacuum']],
  ['Interior Deep Cleaning', 'interior', 1499, 180, '/illustrations/interior.webp', true, false, 'Seats, carpets, roof and dashboard deep cleaned.',
    ['Vacuum & shampoo seats and carpets', 'Roof lining cleaning', 'Dashboard & door pads', 'Odour removal']],
  ['Leather Seat Conditioning', 'interior', 999, 60, '/illustrations/lib-leather.webp', false, false, 'Clean and condition leather seats.',
    ['Leather cleaner', 'Conditioner', 'UV protection']],
  ['Engine Bay Cleaning', 'detailing', 599, 45, '/illustrations/lib-engine.webp', false, false, 'Safe degrease and dressing of the engine bay.',
    ['Degreasing', 'Low-pressure rinse', 'Plastic dressing']],
  ['Headlight Restoration', 'detailing', 799, 60, '/illustrations/lib-headlight.webp', false, false, 'Yellowed headlights sanded, polished and sealed.',
    ['Wet sanding', 'Machine polish', 'UV sealant']],
  ['Rubbing & Polishing', 'detailing', 2499, 240, '/illustrations/polish.webp', true, false, 'Machine compounding to remove swirls and light scratches.',
    ['3-step machine polish', 'Swirl and scratch removal', 'Gloss enhancement']],
  ['Ceramic Coating 9H', 'coating', 14999, 480, '/illustrations/ceramic.webp', true, true, '9H ceramic coating with up to 3 years of gloss and protection.',
    ['Paint decontamination', 'Machine polish', '9H ceramic coating', '3-year warranty card']],
  ['Graphene Coating', 'coating', 21999, 540, '/illustrations/lib-graphene.webp', false, true, 'Graphene-infused coating with 5 years of protection.',
    ['Paint correction', 'Graphene coating', '5-year warranty card']],
  ['PPF Full Body', 'ppf & protection', 64999, 1440, '/illustrations/ppf.webp', false, true, 'Self-healing paint protection film on all painted panels.',
    ['Full-body TPU film', 'Self-healing top coat', '7-year warranty']],
  ['AC Service', 'mechanical', 1499, 90, '/illustrations/ac.webp', false, false, 'AC vent cleaning, filter check and gas top-up check.',
    ['Cabin filter cleaning', 'Vent sanitisation', 'Cooling check']],
  ['Underbody Anti-Rust Coating', 'detailing', 1999, 120, '/illustrations/lib-underbody.webp', false, false, 'Rubberised anti-rust coating for the underbody.',
    ['Underbody wash', 'Anti-rust coating', 'Wheel arch protection']],
];

const PRODUCTS = [   // name, category, sell, cost, stock, description, photo in /product-library
  ['Car Shampoo 1L', 'Car Care', 449, 220, 40, 'pH-neutral foam shampoo, 1 litre.', 'car-shampoo'],
  ['Microfiber Cloth (Pack of 3)', 'Accessories', 299, 120, 60, '400 GSM, scratch-free microfiber cloths.', 'microfiber-cloth'],
  ['Tyre Shine Spray', 'Car Care', 349, 160, 25, 'Long-lasting black tyre gloss.', 'tyre-shine'],
  ['Dashboard Polish', 'Car Care', 299, 130, 30, 'Matte finish dashboard and trim dressing.', 'dashboard-polish'],
  ['Glass Cleaner 500ml', 'Car Care', 249, 100, 35, 'Streak-free glass and mirror cleaner.', 'glass-cleaner'],
  ['Car Perfume (Gel)', 'Accessories', 199, 80, 3, 'Long-lasting cabin fragrance (low stock).', 'car-perfume-gel'],
  ['Ceramic Spray Sealant', 'Car Care', 899, 450, 0, 'Top-up ceramic spray (out of stock).', 'ceramic-spray'],
  ['Carnauba Wax 200g', 'Car Care', 699, 320, 20, 'Hand-applied carnauba wax for a deep, warm gloss.', 'carnauba-wax'],
  ['Cordless Car Vacuum', 'Accessories', 1999, 1100, 12, 'Rechargeable handheld vacuum with crevice nozzle.', 'car-vacuum'],
  ['Digital Tyre Inflator', 'Accessories', 2499, 1400, 10, 'Set the pressure, it stops on its own. 12V plug.', 'tyre-inflator'],
  ['Premium Seat Cover Set', 'Seat Covers', 6999, 3800, 6, 'Quilted leatherette with blue stitching, full set.', 'seat-cover'],
  ['3D Floor Mats', 'Floor Mats', 2999, 1500, 8, 'Custom-fit, washable mats with raised edges.', 'floor-mats'],
];

(async () => {
  const l = await fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds.super_admin) });
  tok = (await l.json()).data?.token;
  if (!tok) { console.error('Super admin login failed — check LOGINS.local.txt / server'); process.exit(1); }

  // 1) tidy away half-made test items from earlier runs (switched off, not deleted)
  const oldSvc = ((await call('GET', '/services')).j.data || []).filter(s => /^test /i.test(s.name));
  for (const s of oldSvc) if (s.is_active) await call('PUT', `/services/${s.id}`, { is_active: false });
  const oldPkg = ((await call('GET', '/packages')).j.data || []).filter(p => /^test/i.test(p.name));
  for (const p of oldPkg) await call('PUT', `/packages/${p.id}`, { is_published: false, visible_to_customer: false });
  const oldInv = ((await call('GET', '/inventory?limit=500')).j.data || []).filter(i => /^test /i.test(i.product_name || ''));
  for (const i of oldInv) await call('DELETE', `/inventory/${i.id}`);
  out.push(`✓ Switched off earlier test items: ${oldSvc.length} services, ${oldPkg.length} packages, ${oldInv.length} products`);

  // 2) categories (PPF added) + home tiles
  let cats = (await call('GET', '/services/categories/list')).j.data || [];
  if (!cats.some(c => c.name.toLowerCase() === 'ppf & protection')) {
    await call('POST', '/services/categories', { name: 'PPF & Protection', show_on_home: true });
    cats = (await call('GET', '/services/categories/list')).j.data || [];
  }
  const catId = n => cats.find(c => c.name.toLowerCase() === n)?.id || null;
  for (const n of ['washing', 'coating', 'interior', 'ppf & protection']) if (catId(n)) await call('PUT', `/services/categories/${catId(n)}`, { show_on_home: true, is_active: true });
  for (const n of ['premium wash', 'other']) if (catId(n)) await call('PUT', `/services/categories/${catId(n)}`, { show_on_home: false });
  out.push('✓ Home tiles: Washing, Coating, Interior, PPF & Protection');

  // 3) services (skips ones that already exist by name)
  const existing = new Map(((await call('GET', '/services')).j.data || []).map(s => [s.name.toLowerCase(), s.id]));
  const svcId = {};
  let order = 1;
  for (const [name, cat, base, mins, img, featured, premium, desc, included] of SERVICES) {
    const body = { name, description: desc, category_id: catId(cat), duration_minutes: mins, image_url: img, is_featured: featured, is_premium: premium,
      is_active: true, show_in_app: true, sort_order: order++, whats_included_json: included, features_json: included.slice(0, 2), ...prices(base) };
    if (existing.has(name.toLowerCase())) {
      const id = existing.get(name.toLowerCase()); const r = await call('PUT', `/services/${id}`, body); svcId[name] = id; note(r.ok, `Service updated: ${name}`, r);
    } else {
      const r = await call('POST', '/services', body); svcId[name] = r.j.data?.id; note(r.ok, `Service: ${name} (from ₹${prices(base).price_hatchback})`, r);
    }
  }

  // 4) packages with basic + premium price for every car type
  const PKGS = [
    ['Silver Care Package', 'Monthly wash plan — 6 foam washes and a wax.', 2499, [['Foam Wash', 6], ['Premium Wash & Wax', 1]]],
    ['Gold Care Package', 'Our most popular plan — washes, wax and an interior clean.', 4999, [['Foam Wash', 12], ['Premium Wash & Wax', 2], ['Interior Deep Cleaning', 1]]],
    ['Platinum Care Package', 'Full-year care including a machine polish.', 9999, [['Foam Wash', 24], ['Premium Wash & Wax', 4], ['Interior Deep Cleaning', 2], ['Rubbing & Polishing', 1]]],
  ];
  const pkgNames = new Map(((await call('GET', '/packages')).j.data || []).map(p => [p.name.toLowerCase(), p.id]));
  for (const [name, desc, base, items] of PKGS) {
    const basic = prices(base), premium = prices(base * 1.3);
    const pricing = ['basic', 'premium'].flatMap(pt => Object.entries(pt === 'basic' ? basic : premium)
      .map(([k, v]) => ({ car_type: k.replace('price_', ''), pricing_type: pt, price: v })));
    const body = { name, description: desc, ...basic, pricing, is_published: true, visible_to_customer: true,
      wash_count: items.reduce((a, [, n]) => a + n, 0), services: items.filter(([s]) => svcId[s]).map(([s, n]) => ({ service_id: svcId[s], total_count: n })) };
    const id = pkgNames.get(name.toLowerCase());
    const r = id ? await call('PUT', `/packages/${id}`, body) : await call('POST', '/packages', body);
    note(r.ok, `Package: ${name} (from ₹${basic.price_hatchback}, premium from ₹${premium.price_hatchback})`, r);
  }

  // 5) products customers can buy (price + stock)
  const invNames = new Set(((await call('GET', '/inventory?limit=500')).j.data || []).map(i => (i.product_name || '').toLowerCase()));
  for (const [name, category, sell, cost, qty, desc, photo] of PRODUCTS) {
    if (invNames.has(name.toLowerCase())) { out.push(`· Product exists: ${name}`); continue; }
    const r = await call('POST', '/inventory', { product_name: name, category, brand: 'O3 Care', description: desc, unit: 'pcs', quantity: qty,
      low_stock_threshold: 5, cost_price: cost, selling_price: sell, franchise_price: Math.round(cost * 1.2), staff_price: Math.round(sell * 0.9),
      price_visible_to_staff: 1, gst_pct: 18, images_json: [`/product-library/${photo}.webp`] });
    note(r.ok, `Product: ${name} ₹${sell} (stock ${qty})`, r);
  }

  console.log(out.join('\n'));
  console.log(`\nDone: ${out.filter(x => x.startsWith('✓')).length} ok, ${out.filter(x => x.startsWith('✗')).length} failed.`);
})();
