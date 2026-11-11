/**
 * seed_test_data.js — one small set of TEST records so every module has something to open and try.
 * Uses the app's own API (same rules as the screens), so the server must be running.
 *
 *   node scripts/seed_test_data.js            (server on http://localhost:5000)
 *   API=https://your-site/api node scripts/seed_test_data.js
 *
 * Logins come from LOGINS.local.txt (super_admin, admin, customer). Everything created here has
 * "TEST" in its name/notes. Remove it all before launch with scripts/reset_clean_production_db.js.
 */
const fs = require('fs');
const path = require('path');

const API = process.env.API || 'http://localhost:5000/api';
const creds = {};
for (const l of fs.readFileSync(path.join(__dirname, '..', '..', 'LOGINS.local.txt'), 'utf8').split('\n')) {
  const m = l.match(/^(\w+)\s*\|.*mobile (\d{10}) \| password (\S+)/);
  if (m) creds[m[1]] = { mobile: m[2], password: m[3] };
}

const log = [];
async function call(tok, method, url, body) {
  const r = await fetch(API + url, {
    method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = {}; try { j = await r.json(); } catch { /* not json */ }
  return { ok: r.status < 300, s: r.status, j };
}
async function step(label, fn) {
  try {
    const r = await fn();
    log.push(`${r.ok ? '✓' : '✗'} ${label}${r.ok ? '' : `  [${r.s}] ${r.j.error || JSON.stringify(r.j).slice(0, 120)}`}`);
    return r.ok ? r.j : null;
  } catch (e) { log.push(`✗ ${label}  ${e.message}`); return null; }
}
const idOf = j => j && (j.data?.id || j.id || j.data?.insertId || j.data?.job_cart_id || j.data?.quotation_id || j.requestId || j.data?.customer_id);
const day = n => new Date(Date.now() + 5.5 * 36e5 + n * 864e5).toISOString().slice(0, 10);
const prices = (base) => ({ price_hatchback: base, price_semi_sedan: Math.round(base * 1.1), price_sedan: Math.round(base * 1.2),
  price_premium_sedan: Math.round(base * 1.4), price_suv: Math.round(base * 1.5), price_premium_suv: Math.round(base * 1.8) });

(async () => {
  const login = async (c) => (await call(null, 'POST', '/auth/login', c)).j.data?.token;
  const sup = await login(creds.super_admin), adm = await login(creds.admin), cust = await login(creds.customer);
  if (!sup || !adm || !cust) { console.error('Could not log in — check LOGINS.local.txt and that the server is running'); process.exit(1); }
  const sfx = String(Date.now()).slice(-4);

  // ── Catalogue: categories, services, package ──────────────────────
  const cats = (await call(sup, 'GET', '/services/categories/list')).j.data || [];
  const catId = n => cats.find(c => c.name.toLowerCase() === n)?.id;
  for (const n of ['washing', 'coating', 'interior']) if (catId(n)) await call(sup, 'PUT', `/services/categories/${catId(n)}`, { show_on_home: true, is_active: true });
  log.push('✓ Home tiles: Washing, Coating, Interior');
  const svc = async (name, base, cat, extra = {}) => idOf(await step(`Service: ${name}`, () => call(sup, 'POST', '/services', {
    name, description: 'TEST service', duration_minutes: 60, category_id: catId(cat) || null, ...prices(base), ...extra,
    whats_included_json: ['Snow foam pre-wash', 'Hand wash & dry', 'Tyre dressing'],
  })));
  const s1 = await svc(`TEST Foam Wash ${sfx}`, 499, 'washing', { is_featured: true });
  const s2 = await svc(`TEST Ceramic Coating 9H ${sfx}`, 14999, 'coating', { is_featured: true, is_premium: true });
  const s3 = await svc(`TEST Interior Deep Clean ${sfx}`, 1999, 'interior');
  const pkg = await step('Package: TEST Gold Wash Package', () => call(sup, 'POST', '/packages', {
    name: `TEST Gold Wash Package ${sfx}`, description: '12 foam washes + 1 interior clean (TEST)', ...prices(4999),
    is_published: true, visible_to_customer: true, wash_count: 12,
    services: [s1 && { service_id: s1, total_count: 12 }, s3 && { service_id: s3, total_count: 1 }].filter(Boolean),
  }));
  const pkgId = idOf(pkg);

  // ── Stock, vendor ─────────────────────────────────────────────────
  const inv = await step('Product: TEST Car Shampoo (in stock)', () => call(adm, 'POST', '/inventory', { product_name: `TEST Car Shampoo ${sfx}`, name: `TEST Car Shampoo ${sfx}`, category: 'Chemicals', quantity: 25, unit: 'L', cost_price: 300, selling_price: 450, min_stock: 5, low_stock_threshold: 5 }));
  await step('Product: TEST Microfiber Cloth (low stock)', () => call(adm, 'POST', '/inventory', { product_name: `TEST Microfiber Cloth ${sfx}`, name: `TEST Microfiber Cloth ${sfx}`, category: 'Accessories', quantity: 2, unit: 'pcs', cost_price: 80, selling_price: 150, min_stock: 10, low_stock_threshold: 10 }));
  const invId = idOf(inv);
  const ven = await step('Vendor: TEST Shine Supplies', () => call(adm, 'POST', '/vendors', { name: `TEST Shine Supplies ${sfx}`, phone: '9811100' + sfx.slice(0, 3), service_type: 'Chemicals', address: 'Anand' }));
  if (idOf(ven) && invId) await step('Purchase bill from vendor', () => call(adm, 'POST', '/purchase-bills', { vendor_id: idOf(ven), purchase_date: day(0), invoice_number: `TEST-PB-${sfx}`, items: [{ item_id: invId, product_name: `TEST Car Shampoo ${sfx}`, quantity: 5, unit_price: 300 }], notes: 'TEST' }));
  if (invId) await step('Buy & sell record', () => call(adm, 'POST', '/buy-sell', { type: 'sell_b2c', party_name: 'TEST Walk-in', party_mobile: '9822222222', product_id: invId, product_name: `TEST Car Shampoo ${sfx}`, quantity: 1, unit_price: 450, total_amount: 450, transaction_date: day(0) }));

  // ── Slots for the next two days ───────────────────────────────────
  await step('Slots: tomorrow + day after, 9am–6pm', () => call(adm, 'POST', '/slots/bulk', { from_date: day(1), to_date: day(2), start_time: '09:00', end_time: '18:00', slot_duration_minutes: 60, max_capacity: 3 }));

  // ── Customers (one new, plus the test customer login) ─────────────
  const walkMobile = '97' + String(Date.now()).slice(-8);
  const nc = await step('Customer: TEST Rahul (added by studio)', () => call(adm, 'POST', '/customers/manual-registration', { name: `TEST Rahul ${sfx}`, mobile: walkMobile, brand: 'Maruti Suzuki', model: 'Dzire', registration_no: `GJ06TD${sfx}`, category: 'semi_sedan' }));
  const ncId = nc?.data?.customer_id, ncVeh = nc?.data?.vehicle_id;
  const myCars = (await call(cust, 'GET', '/vehicles/my-vehicles')).j.data || [];
  const myCar = myCars[0];

  // ── Bookings: one waiting for approval (customer), one confirmed (studio) ──
  const slots = ((await call(adm, 'GET', `/slots?from_date=${day(1)}&to_date=${day(2)}`)).j.data || []).filter(s => !s.is_deleted);
  if (slots[0] && s1 && myCar) await step('Booking by customer (pending approval)', () => call(cust, 'POST', '/bookings', { slot_id: slots[0].id, service_id: s1, vehicle_id: myCar.id, notes: 'TEST booking' }));
  if (slots[1] && s3 && ncId) await step('Booking by studio for new customer (confirmed)', () => call(adm, 'POST', '/bookings/manual', { customer_id: ncId, slot_id: slots[1].id, service_id: s3, vehicle_id: ncVeh, notes: 'TEST manual booking' }));

  // ── Job cards: one in progress, one completed (invoice, feedback, loyalty) ──
  const jcOpen = await step('Job card: in progress', () => call(adm, 'POST', '/job-carts', {
    customer_name: `TEST Rahul ${sfx}`, customer_mobile: walkMobile, car_brand: 'Maruti Suzuki', car_model: 'Dzire', registration_no: `GJ06TD${sfx}`,
    car_category: 'semi_sedan', services: [{ service_name: `TEST Interior Deep Clean ${sfx}`, service_price: prices(1999).price_semi_sedan }],
  }));
  if (idOf(jcOpen)) {
    await call(adm, 'PATCH', `/job-carts/${idOf(jcOpen)}/submit`, {});
    await step('Job card: moved to "Washing & Prep"', () => call(adm, 'PUT', `/job-carts/${idOf(jcOpen)}/stages`, { stage_name: 'Washing & Prep' }));
    await step('Advance payment on job card', () => call(adm, 'POST', '/payments/advance', { customer_id: ncId, job_cart_id: idOf(jcOpen), advance_amount: 500, total_amount: prices(1999).price_semi_sedan, payment_method: 'upi', notes: 'TEST advance' }));
  }
  if (myCar) {
    const me = (await call(cust, 'GET', '/auth/me')).j.data || {};
    const jcDone = await step('Job card: completed (invoice)', () => call(adm, 'POST', '/job-carts', {
      customer_name: me.name, customer_mobile: me.mobile, car_brand: myCar.brand, car_model: myCar.model, registration_no: myCar.registration_no,
      services: [{ service_name: `TEST Foam Wash ${sfx}`, service_price: prices(499).price_suv }],
    }));
    if (idOf(jcDone)) {
      await call(adm, 'PATCH', `/job-carts/${idOf(jcDone)}/submit`, {});
      await step('Job card completed + loyalty points', () => call(adm, 'PATCH', `/job-carts/${idOf(jcDone)}/complete`, { credits: 100 }));
      await step('Feedback request sent', () => call(adm, 'POST', '/feedback/request', { job_cart_id: idOf(jcDone) }));
    }
  }

  // ── Quick wash, quotation, manual bill ────────────────────────────
  if (ncId && s1) await step('Quick wash', () => call(adm, 'POST', '/quick-wash', { customer_id: ncId, vehicle_id: ncVeh, service_id: s1, vehicle_category: 'semi_sedan' }));
  await step('Quotation', () => call(adm, 'POST', '/quotations', {
    customer_name: `TEST Quote Customer ${sfx}`, customer_mobile: '9822' + sfx + '11', vehicle_no: `GJ06QT${sfx}`, car_brand: 'Kia', car_model: 'Seltos',
    items: [{ service_name: `TEST Ceramic Coating 9H ${sfx}`, quantity: 1, unit_price: prices(14999).price_suv }], tax_percentage: 18, valid_until: day(7),
  }));
  await step('Manual bill (counter sale)', () => call(adm, 'POST', '/billing', { customer_name: 'TEST Counter Customer', customer_mobile: '9811122233', items: [{ name: `TEST Car Shampoo ${sfx}`, price: 450, quantity: 1 }], payment_method: 'cash' }));

  // ── Customer-side requests ────────────────────────────────────────
  if (pkgId && myCar) await step('Package request by customer (to approve)', () => call(cust, 'POST', '/packages/requests', { vehicle_id: myCar.id, package_id: pkgId, pricing_type: 'basic' }));
  if (invId) await step('Product order by customer (to confirm)', () => call(cust, 'POST', '/products/orders', { product_id: invId, quantity: 1, payment_method: 'qr', qr_transaction_id: `TEST${sfx}` }));
  const myBk = ((await call(cust, 'GET', '/bookings')).j.data || [])[0];
  if (myBk) await step('Pickup request by customer', () => call(cust, 'POST', '/pickup-requests', { booking_id: myBk.id, address: 'TEST address, GIDC, Anand', scheduled_time: `${day(1)} 10:00:00`, notes: 'TEST pickup', request_type: 'pickup' }));
  await step('Support question by customer', () => call(cust, 'POST', '/inquiries', { type: 'support', subject: 'TEST question', message: 'TEST: can I reschedule my booking?' }));

  // ── Leads, referral, staff & HR ───────────────────────────────────
  await step('Lead', () => call(adm, 'POST', '/leads', { name: `TEST Lead ${sfx}`, mobile: '9833' + sfx + '22', source: 'instagram', notes: 'TEST — asked about ceramic coating' }));
  if (ncId) await step('Referral (customer referred a friend)', () => call(adm, 'POST', '/referrals', { referrer_type: 'external', referrer_name: 'TEST Referrer', referrer_mobile: '9844455566', customer_id: ncId, amount: 200, note: 'TEST referral' }));
  const staffList = (await call(adm, 'GET', '/staff')).j.data || [];
  const st = staffList[0];
  if (st) {
    await step('Leave request (to approve)', () => call(adm, 'POST', '/staff-hr/leaves', { staff_id: st.id, leave_type: 'casual', from_date: day(3), to_date: day(3), reason: 'TEST leave' }));
    await step('Salary for this month', () => call(adm, 'POST', '/salary/calculate', { staff_id: st.id, user_id: st.id, month: new Date().getMonth() + 1, year: new Date().getFullYear() }));
  }
  if (invId) await step('Stock request to HQ', () => call(adm, 'POST', '/stock-requests', { product_id: invId, product_name: `TEST Car Shampoo ${sfx}`, quantity: 10, unit: 'L', notes: 'TEST stock request' }));

  console.log(log.join('\n'));
  console.log(`\nDone: ${log.filter(l => l.startsWith('✓')).length} created, ${log.filter(l => l.startsWith('✗')).length} failed.`);
})();
