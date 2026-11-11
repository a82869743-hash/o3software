/**
 * seed_rate_card.js — loads O3 Car Spa's real rate card (Oct 2026 price list) as services and wash plans.
 * Prices are per car type, in rate-card order: Hatchback, Sedan, Mini SUV, SUV, Luxury, Luxury + SUV
 * (stored as price_hatchback, price_sedan, price_semi_sedan, price_suv, price_premium_sedan, price_premium_suv).
 *
 *   node scripts/seed_rate_card.js            (server must be running; logs in as super_admin from LOGINS.local.txt)
 *   API=https://YOUR-DOMAIN/api SA_MOBILE=… SA_PASSWORD=… node scripts/seed_rate_card.js   (live server)
 *
 * Safe to run again: items are matched by name and updated. The old sample services and packages
 * are switched off (kept, not deleted). Durations are estimates — adjust them in Admin → Services.
 */
const fs = require('fs');
const path = require('path');

const API = process.env.API || 'http://localhost:5000/api';
let creds = { mobile: process.env.SA_MOBILE, password: process.env.SA_PASSWORD };
if (!creds.mobile) {
  for (const l of fs.readFileSync(path.join(__dirname, '..', '..', 'LOGINS.local.txt'), 'utf8').split('\n')) {
    const m = l.match(/^super_admin\s*\|.*mobile (\d{10}) \| password (\S+)/);
    if (m) creds = { mobile: m[1], password: m[2] };
  }
}
let tok;
const call = async (method, url, body) => {
  const r = await fetch(API + url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok, 'x-franchise-id': '1' }, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch { /* */ }
  return { ok: r.status < 300, s: r.status, j };
};
const out = [];
const note = (ok, label, r) => out.push(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `  [${r.s}] ${r.j.error || ''}`}`);

// [hatchback, sedan, mini SUV, SUV, luxury, luxury + SUV] → price columns
const P = ([h, s, mini, suv, lux, luxSuv]) => ({
  price_hatchback: h, price_sedan: s, price_semi_sedan: mini, price_suv: suv, price_premium_sedan: lux, price_premium_suv: luxSuv,
});

// name, category, prices, minutes, picture, featured, premium, description
const SERVICES = [
  // Services
  ['Exterior Wash + Shampoo & Vacuum', 'washing', [400, 500, 500, 500, 500, 700], 60, '/illustrations/wash.webp', true, false, 'Exterior foam wash with shampoo, plus interior vacuum.'],
  ['Intensive Shiny Interior', 'interior', [1500, 2000, 2000, 2500, 2500, 3500], 180, '/illustrations/interior.webp', true, false, 'Deep interior cleaning: seats, carpets, roof and dashboard.'],
  ['Ozone Treatment & Odour Removal', 'interior', [600, 700, 700, 800, 800, 1000], 45, '/illustrations/lib-sanitize.webp', false, false, 'Ozone sanitising that removes smells and germs from the cabin.'],
  ['Leather Care Treatment', 'interior', [400, 500, 500, 800, 800, 1000], 60, '/illustrations/lib-leather.webp', false, false, 'Leather seats cleaned and conditioned.'],
  ['Headlight Restoration', 'detailing', [1000, 1000, 1000, 1200, 1200, 1500], 60, '/illustrations/lib-headlight.webp', false, false, 'Yellowed headlights sanded, polished and sealed.'],
  // Colour protection & coating treatments
  ['Rodent Repellent Coating', 'detailing', [1000, 1200, 1200, 1200, 1500, 2000], 45, '/illustrations/lib-rodent.webp', false, false, 'Engine-bay coating that keeps rats away from wires.'],
  ['Engine Coating', 'detailing', [2000, 2500, 2500, 3000, 3000, 4000], 60, '/illustrations/lib-engine.webp', false, false, 'Engine bay cleaned and protected with a coating.'],
  ['Alloy Wheel Coating', 'coating', [2500, 2500, 3000, 3500, 2500, 3500], 90, '/illustrations/lib-wheels.webp', false, false, 'Protective coating on alloy wheels against brake dust.'],
  ['Windshield Coating', 'coating', [2000, 2500, 2500, 3000, 3500, 4500], 60, '/illustrations/lib-glass.webp', false, false, 'Water-repellent glass coating for clearer rain driving.'],
  ['Leather Shield', 'interior', [4000, 5000, 5000, 6000, 5500, 7000], 120, '/illustrations/lib-leather.webp', false, false, 'Protective coating for leather seats.'],
  ['Fabric Shield', 'interior', [4000, 5000, 5000, 6000, 5500, 7000], 120, '/illustrations/photo-interior.webp', false, false, 'Stain-resistant coating for fabric seats and carpets.'],
  ['Trim Shield', 'coating', [2500, 3000, 3500, 4000, 3500, 5000], 90, '/illustrations/lib-wrap.webp', false, false, 'Coating that restores and protects plastic trims.'],
  ['Machine Polish & Wax', 'detailing', [1200, 1500, 1500, 2000, 3000, 4000], 150, '/illustrations/lib-wax.webp', true, false, 'Machine polish for gloss, finished with a wax layer.'],
  ['Compounding Hi-tech Wax (2 Steps)', 'detailing', [2500, 3000, 3000, 3500, 4000, 5000], 240, '/illustrations/polish.webp', false, false, '2-step compounding to remove swirls and light scratches, then wax.'],
  ['O3 Coating (3 Steps)', 'coating', [5000, 6000, 6000, 7000, 6000, 8000], 300, '/illustrations/photo-coating.webp', false, false, 'O3 Car Spaa 3-step paint coating.'],
  // Ceramic coating
  ['Ceramic Shield - 1 Year', 'coating', [9000, 10000, 10000, 12000, 12000, 15000], 480, '/illustrations/ceramic.webp', false, true, 'Ceramic coating with 1 year of protection.'],
  ['Ceramic Shield - 2 Years', 'coating', [10000, 12000, 12000, 14000, 14000, 18000], 480, '/illustrations/ceramic.webp', false, true, 'Ceramic coating with 2 years of protection.'],
  ['Ceramic Shield - 3 Years', 'coating', [15000, 18000, 18000, 20000, 18000, 20000], 480, '/illustrations/ceramic.webp', true, true, 'Ceramic coating with 3 years of protection.'],
  ['Ceramic Shield - 5 Years', 'coating', [20000, 25000, 25000, 30000, 25000, 35000], 540, '/illustrations/ceramic.webp', false, true, 'Ceramic coating with 5 years of protection.'],
  ['Ceramic Shield - 2 Years + 1 CoatCare', 'coating', [18000, 20000, 20000, 25000, 25000, 30000], 480, '/illustrations/banner-ceramic.webp', false, true, '2-year ceramic coating with 1 CoatCare maintenance visit.'],
  ['Ceramic Shield - 3 Years + 2 CoatCare', 'coating', [25000, 30000, 30000, 35000, 35000, 40000], 480, '/illustrations/banner-ceramic.webp', false, true, '3-year ceramic coating with 2 CoatCare maintenance visits.'],
  ['Ceramic Shield - 5 Years + 4 CoatCare', 'coating', [30000, 35000, 35000, 40000, 40000, 45000], 540, '/illustrations/banner-ceramic.webp', false, true, '5-year ceramic coating with 4 CoatCare maintenance visits.'],
  // Graphene coating
  ['Graphene Armor - 2 Years', 'coating', [14000, 16000, 16000, 18000, 20000, 25000], 540, '/illustrations/lib-graphene.webp', false, true, 'Graphene coating with 2 years of protection.'],
  ['Graphene Armor - 3 Years', 'coating', [18000, 20000, 20000, 22000, 25000, 30000], 540, '/illustrations/lib-graphene.webp', true, true, 'Graphene coating with 3 years of protection.'],
  ['Graphene Armor - 5 Years', 'coating', [22000, 25000, 25000, 30000, 30000, 35000], 600, '/illustrations/lib-graphene.webp', false, true, 'Graphene coating with 5 years of protection.'],
  ['Graphene Armor - 2 Years + 1 CoatCare', 'coating', [20000, 24000, 24000, 28000, 30000, 35000], 540, '/illustrations/lib-graphene.webp', false, true, '2-year graphene coating with 1 CoatCare maintenance visit.'],
  ['Graphene Armor - 3 Years + 2 CoatCare', 'coating', [30000, 35000, 35000, 40000, 35000, 45000], 540, '/illustrations/lib-graphene.webp', false, true, '3-year graphene coating with 2 CoatCare maintenance visits.'],
  ['Graphene Armor - 5 Years + 4 CoatCare', 'coating', [35000, 40000, 40000, 45000, 40000, 50000], 600, '/illustrations/lib-graphene.webp', false, true, '5-year graphene coating with 4 CoatCare maintenance visits.'],
  // Maintenance coating
  ['Maintenance Coating - 1 Time', 'coating', [1000, 1200, 1200, 1500, 1500, 2000], 90, '/illustrations/photo-coating.webp', false, false, 'One maintenance top-up coat.'],
  ['Ceramic Maintenance - 1 Time', 'coating', [5000, 6000, 6000, 8000, 8000, 10000], 180, '/illustrations/ceramic.webp', false, false, 'One maintenance visit for a ceramic-coated car.'],
  ['Graphene Maintenance - 1 Time', 'coating', [6000, 7000, 7000, 9000, 12000, 15000], 180, '/illustrations/lib-graphene.webp', false, false, 'One maintenance visit for a graphene-coated car.'],
  // Paint protection film
  ['PPF Clear (TPH) - 3 Years', 'ppf & protection', [60000, 65000, 65000, 70000, 70000, 90000], 2880, '/illustrations/ppf.webp', false, true, 'Clear paint protection film, thermoplastic hybrid, 3 years.'],
  ['PPF Clear (TPH) - 5 Years', 'ppf & protection', [70000, 80000, 80000, 90000, 80000, 100000], 2880, '/illustrations/ppf.webp', true, true, 'Clear paint protection film, thermoplastic hybrid, 5 years.'],
  ['PPF Gloss (TPU) - 5 Years', 'ppf & protection', [90000, 100000, 100000, 130000, 150000, 180000], 2880, '/illustrations/photo-ppf.webp', false, true, 'Gloss paint protection film, thermoplastic polyurethane, 5 years.'],
  ['PPF Gloss (TPU) - 7 Years', 'ppf & protection', [100000, 130000, 130000, 150000, 180000, 210000], 2880, '/illustrations/photo-ppf.webp', false, true, 'Gloss paint protection film, thermoplastic polyurethane, 7 years.'],
  ['PPF Matt (TPH) - 3 Years', 'ppf & protection', [70000, 75000, 75000, 80000, 80000, 100000], 2880, '/illustrations/lib-wrap.webp', false, true, 'Matt paint protection film, thermoplastic hybrid, 3 years.'],
  ['PPF Matt (TPU) - 5 Years', 'ppf & protection', [100000, 110000, 110000, 150000, 150000, 180000], 2880, '/illustrations/lib-wrap.webp', false, true, 'Matt paint protection film, thermoplastic polyurethane, 5 years.'],
  ['PPF Matt (TPU) - 7 Years', 'ppf & protection', [120000, 150000, 150000, 180000, 180000, 210000], 2880, '/illustrations/lib-wrap.webp', false, true, 'Matt paint protection film, thermoplastic polyurethane, 7 years.'],
  ['PPF Black (TPH) - 3 Years', 'ppf & protection', [70000, 75000, 75000, 80000, 80000, 100000], 2880, '/illustrations/lib-wrap.webp', false, true, 'Black paint protection film, thermoplastic hybrid, 3 years.'],
  ['PPF Black (TPH) - 5 Years', 'ppf & protection', [100000, 110000, 110000, 150000, 150000, 180000], 2880, '/illustrations/lib-wrap.webp', false, true, 'Black paint protection film, thermoplastic hybrid, 5 years.'],
  ['PPF Black (TPU) - 7 Years', 'ppf & protection', [120000, 150000, 150000, 180000, 180000, 210000], 2880, '/illustrations/lib-wrap.webp', false, true, 'Black paint protection film, thermoplastic polyurethane, 7 years.'],
  ['PPF Colour (TPH) - 3 Years', 'ppf & protection', [100000, 120000, 120000, 150000, 150000, 180000], 2880, '/illustrations/lib-wrap.webp', false, true, 'Coloured paint protection film, thermoplastic hybrid, 3 years.'],
  // Anti-rust
  ['O3 Undershield Anti-Rust (2 Years)', 'detailing', [2000, 2500, 2500, 3500, 4000, 5000], 120, '/illustrations/lib-underbody.webp', false, false, 'Anti-rust under-shield body coating, 2 years.'],
];

// Special washing offer rates → wash plans: name, washes, months, prices
const PLANS = [
  ['12 Washes - 12 Months', 12, 12, [3000, 3600, 4200, 4200, 4200, 5000]],
  ['24 Washes - 24 Months', 24, 24, [6000, 7200, 8400, 8400, 8400, 10000]],
  ['36 Washes - 36 Months', 36, 36, [9000, 10500, 12500, 12500, 12500, 15000]],
  ['60 Washes - 60 Months', 60, 60, [15000, 18000, 21000, 21000, 21000, 25000]],
];
const WASH_SERVICE = 'Exterior Wash + Shampoo & Vacuum';

(async () => {
  const lr = await fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds) });
  tok = (await lr.json()).data?.token;
  if (!tok) { console.error('Login failed — check the super admin mobile and password.'); process.exit(1); }

  const cats = (await call('GET', '/services/categories/list')).j.data || [];
  const catId = n => cats.find(c => c.name.toLowerCase() === n)?.id || null;

  // 1) services from the rate card
  const all = (await call('GET', '/services?limit=500')).j.data || [];
  const existing = new Map(all.map(s => [s.name.toLowerCase(), s.id]));
  const keep = new Set(SERVICES.map(s => s[0].toLowerCase()));
  const svcId = {};
  let order = 1;
  for (const [name, cat, prices, mins, img, featured, premium, desc] of SERVICES) {
    const body = { name, description: desc, category_id: catId(cat), duration_minutes: mins, image_url: img, is_featured: featured, is_premium: premium,
      is_active: true, show_in_app: true, sort_order: order++, ...P(prices) };
    const id = existing.get(name.toLowerCase());
    const r = id ? await call('PUT', `/services/${id}`, body) : await call('POST', '/services', body);
    svcId[name] = id || r.j.data?.id;
    note(r.ok, `${id ? 'Updated' : 'Added'}: ${name} (₹${prices[0]}–₹${Math.max(...prices)})`, r);
  }

  // 2) switch off the old sample services (kept for old bookings, hidden from customers)
  for (const s of all) {
    if (keep.has(s.name.toLowerCase()) || !(s.is_active === 1 || s.is_active === true)) continue;
    const r = await call('PUT', `/services/${s.id}`, { is_active: false, show_in_app: false });
    note(r.ok, `Switched off old service: ${s.name}`, r);
  }

  // 3) wash plans
  const pkgs = (await call('GET', '/packages')).j.data || [];
  const pkgId = new Map(pkgs.map(p => [p.name.toLowerCase(), p.id]));
  for (const [name, washes, months, prices] of PLANS) {
    const pr = P(prices);
    const body = {
      name, description: `${washes} exterior washes (shampoo + vacuum), use within ${months} months.`, ...pr,
      pricing: Object.entries(pr).map(([k, v]) => ({ car_type: k.replace('price_', ''), pricing_type: 'basic', price: v })),
      wash_count: washes, package_validity: months, is_published: true, visible_to_customer: true, is_active: true,
      services: svcId[WASH_SERVICE] ? [{ service_id: svcId[WASH_SERVICE], total_count: washes }] : [],
    };
    const id = pkgId.get(name.toLowerCase());
    const r = id ? await call('PUT', `/packages/${id}`, body) : await call('POST', '/packages', body);
    note(r.ok, `${id ? 'Updated' : 'Added'} plan: ${name} (₹${prices[0]}–₹${Math.max(...prices)})`, r);
  }

  // 4) switch off the old sample packages (customers who bought one can still use it)
  const planNames = new Set(PLANS.map(p => p[0].toLowerCase()));
  for (const p of pkgs) {
    const live = [p.visible_to_customer, p.is_active].some(v => v === 1 || v === true);
    if (planNames.has(p.name.toLowerCase()) || !live) continue;
    const r = await call('PUT', `/packages/${p.id}`, { visible_to_customer: false, is_published: false, is_active: false });
    note(r.ok, `Switched off old package: ${p.name}`, r);
  }

  console.log(out.join('\n'));
  console.log(`\n${out.filter(l => l.startsWith('✗')).length} problems`);
})();
