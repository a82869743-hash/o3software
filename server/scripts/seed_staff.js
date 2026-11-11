/**
 * seed_staff.js — adds O3 Car Spa's team (Oct 2026 list) with their designations and the right app access.
 *
 *   node scripts/seed_staff.js     (server must be running; logs in as the studio admin from LOGINS.local.txt)
 *   API=https://YOUR-DOMAIN/api ADMIN_MOBILE=… ADMIN_PASSWORD=… node scripts/seed_staff.js   (live server)
 *
 * Access (custom roles, created if missing):
 *   Manager (built-in)  — Operations Manager, Sales Manager, Head – PPF Division
 *   Accountant          — billing, invoices, payments, accounts, salary, reports
 *   Front Desk          — bookings, slots, customers, leads, WhatsApp inbox, job cards, quotations
 *   Staff (built-in)    — technicians and installers: the staff app (job cards, check-in/out)
 *
 * Mobile numbers: put each person's real number in TEAM below before running on the live server.
 * Numbers starting 90000001 are placeholders — change them in Admin → Staff before that person logs in.
 * Temporary passwords are written to LOGINS.local.txt (never printed); everyone must change it at first login.
 * Safe to run again: people already added (same mobile) are skipped. Old "Test Staff" accounts are switched off.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOGINS = path.join(__dirname, '..', '..', 'LOGINS.local.txt');
const API = process.env.API || 'http://localhost:5000/api';
let creds = { mobile: process.env.ADMIN_MOBILE, password: process.env.ADMIN_PASSWORD };
if (!creds.mobile && fs.existsSync(LOGINS)) {
  for (const l of fs.readFileSync(LOGINS, 'utf8').split('\n')) {
    const m = l.match(/^admin\s*\|.*mobile (\d{10}) \| password (\S+)/);
    if (m) creds = { mobile: m[1], password: m[2] };
  }
}
let tok;
const call = async (method, url, body) => {
  const r = await fetch(API + url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch { /* */ }
  return { ok: r.status < 300, s: r.status, j };
};

// name, designation, access, mobile
const TEAM = [
  ['Katariya', 'Accountant', 'Accountant', '9000000101'],
  ['Steve D’Souza', 'Sales Manager – OEM & Business Development', 'manager', '9000000102'],
  ['Jay Patel', 'Receptionist & Customer Relationship Executive', 'Front Desk', '9000000103'],
  ['Aakash Patel', 'Operations Manager', 'manager', '9000000104'],
  ['Devang Parmar', 'Head – PPF Division', 'manager', '9000000105'],
  ['Sahil Belim', 'Senior Coating Technician / Coating Team Leader', 'staff', '9000000106'],
  ['Sohil Khan', 'Junior Coating Technician', 'staff', '9000000107'],
  ['Ajay', 'Senior Coating Specialist', 'staff', '9000000108'],
  ['Anil', 'Senior Coating Technician', 'staff', '9000000109'],
  ['Jayesh', 'Junior Coating Technician', 'staff', '9000000110'],
  ['Dharmesh', 'Car Wash & Detailing Specialist', 'staff', '9000000111'],
  ['Sanjay', 'Senior PPF Installer', 'staff', '9000000112'],
  ['Arun', 'Senior PPF Installer', 'staff', '9000000113'],
  ['Sunil', 'Junior PPF Installer', 'staff', '9000000114'],
];

const ROLES = {
  Accountant: {
    description: 'Billing, invoices, payments, accounts, salary and reports',
    keys: ['dashboard.view', 'reports.view', 'reports.export', 'billing.view', 'billing.create', 'billing.edit', 'invoices.view', 'invoices.export',
      'payments.view', 'payments.create', 'payments.edit', 'accounts.view', 'accounts.create', 'accounts.edit', 'accounts.export',
      'balance_sheet.view', 'balance_sheet.export', 'balance_sheet.create', 'quotations.view', 'salary.view', 'salary.pay', 'salary.create',
      'staff_hr.view', 'customers.view', 'bookings.view', 'job_cards.view', 'inventory.view', 'packages.view', 'services.view'],
  },
  'Front Desk': {
    description: 'Bookings, slots, customers, leads, WhatsApp inbox, job cards and quotations',
    keys: ['dashboard.view', 'bookings.view', 'bookings.create', 'bookings.edit', 'slots.view', 'slots.edit', 'customers.view', 'customers.create',
      'customers.edit', 'leads.view', 'leads.create', 'leads.edit', 'inquiries.view', 'inquiries.create', 'inquiries.edit', 'whatsapp.view',
      'whatsapp.create', 'job_cards.view', 'job_cards.create', 'job_cards.edit', 'quick_wash.view', 'quick_wash.create', 'quotations.view',
      'quotations.create', 'quotations.edit', 'pickups.view', 'pickups.create', 'deliveries.view', 'deliveries.create', 'packages.view',
      'services.view', 'feedback.view', 'billing.view', 'invoices.view', 'payments.view', 'payments.create'],
  },
};

(async () => {
  const lr = await fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds) });
  tok = (await lr.json()).data?.token;
  if (!tok) { console.error('Login failed — check the admin mobile and password.'); process.exit(1); }
  const out = [];

  // 1) roles with their permissions
  const perms = (await call('GET', '/roles/permissions')).j.data || [];
  const permId = Object.fromEntries((Array.isArray(perms) ? perms : []).map(p => [p.permission_key || p.key || p.name, p.id]));
  let roles = (await call('GET', '/roles')).j.data || [];
  const roleId = {};
  for (const [name, def] of Object.entries(ROLES)) {
    let r = roles.find(x => x.role_name.toLowerCase() === name.toLowerCase());
    if (!r) {
      const c = await call('POST', '/roles', { role_name: name, description: def.description });
      if (!c.ok) { out.push(`✗ Role ${name}: ${c.j.error}`); continue; }
      roles = (await call('GET', '/roles')).j.data || [];
      r = roles.find(x => x.role_name.toLowerCase() === name.toLowerCase());
    }
    roleId[name] = r.id;
    const ids = def.keys.map(k => permId[k]).filter(Boolean);
    const s = await call('POST', `/roles/${r.id}/permissions`, { permission_ids: ids });
    out.push(`${s.ok ? '✓' : '✗'} Role ${name}: ${ids.length} permissions${s.ok ? '' : ` [${s.j.error}]`}`);
  }

  // 2) people
  const staff = (await call('GET', '/staff')).j.data || [];
  const have = new Set(staff.map(s => String(s.mobile)));
  const newLogins = [];
  for (const [name, designation, access, mobile] of TEAM) {
    if (have.has(mobile)) { out.push(`• Already added: ${name}`); continue; }
    const password = 'O3-' + crypto.randomBytes(4).toString('hex') + '7';
    const body = { name, mobile, password, specialisations: designation, role: access === 'manager' ? 'manager' : 'staff' };
    if (roleId[access]) body.custom_role_id = roleId[access];
    const r = await call('POST', '/staff', body);
    out.push(`${r.ok ? '✓' : '✗'} ${name} — ${designation} (${access === 'manager' ? 'Manager' : access === 'staff' ? 'Staff app' : access})${r.ok ? '' : ` [${r.j.error}]`}`);
    if (r.ok) newLogins.push(`staff_${name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')} | ${name} (${designation}) | mobile ${mobile} | password ${password}`);
  }
  if (newLogins.length && fs.existsSync(LOGINS)) {
    const txt = fs.readFileSync(LOGINS, 'utf8');
    fs.appendFileSync(LOGINS, `${txt.endsWith('\n') ? '' : '\n'}# O3 team (temporary passwords; must change at first login)\n${newLogins.join('\n')}\n`);
    out.push(`✓ ${newLogins.length} temporary passwords saved in LOGINS.local.txt`);
  }

  // 3) switch off old test accounts (kept, not deleted)
  for (const s of staff) {
    if (/^test staff/i.test(s.name) && (s.is_active === 1 || s.is_active === true)) {
      const r = await call('PATCH', `/staff/${s.id}/status`);
      out.push(`${r.ok ? '✓' : '✗'} Switched off: ${s.name}`);
    }
  }
  console.log(out.join('\n'));
})();
