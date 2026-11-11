/**
 * leadIntake — one entry point for every lead source (WhatsApp agent, website form, Instagram/Facebook/Google
 * lead forms via webhook, walk-ins, phone calls, Excel import, outbound campaigns, referrals).
 * De-duplicates by phone per franchise and keeps a simple lead score.
 */
const pool = require('../config/db');
const { normalizeMobile } = require('../utils/validators');

const SOURCES = ['whatsapp_inbound', 'website', 'instagram', 'facebook', 'google', 'justdial', 'walk_in', 'phone_call',
  'referral', 'excel_import', 'outbound_call', 'campaign', 'other'];

function scoreOf(l) {
  let s = 10;
  if (l.vehicle_model) s += 20;
  if (l.service_interest) s += 25;
  if (l.timeline && /today|tomorrow|week|asap|urgent/i.test(l.timeline)) s += 25;
  else if (l.timeline) s += 10;
  if (l.email) s += 5;
  if (['referral', 'walk_in', 'phone_call'].includes(l.source)) s += 15;
  return Math.min(100, s);
}

async function upsertLead(input) {
  const franchiseId = Number(input.franchiseId) || 1;
  const mobile = normalizeMobile(input.phone || input.mobile);
  if (!/^[6-9]\d{9}$/.test(mobile)) throw Object.assign(new Error('Valid 10-digit mobile number is required'), { status: 400 });
  const phone = mobile; // stored as 10 digits
  const source = SOURCES.includes(input.source) ? input.source : 'other';
  const direction = input.direction === 'outbound' ? 'outbound' : 'inbound';
  const fields = {
    name: input.name ? String(input.name).trim().slice(0, 100) : null,
    email: input.email ? String(input.email).trim().slice(0, 150) : null,
    vehicle_model: input.vehicle_model ? String(input.vehicle_model).slice(0, 100) : null,
    service_interest: input.service_interest ? String(input.service_interest).slice(0, 100) : null,
    timeline: input.timeline ? String(input.timeline).slice(0, 50) : null,
    campaign: input.campaign ? String(input.campaign).slice(0, 100) : null,
  };

  // Existing customer? link it
  const [[cust]] = await pool.query("SELECT id FROM users WHERE mobile = ? AND role = 'customer' AND is_deleted = 0", [mobile]);

  const [[existing]] = await pool.query(
    "SELECT * FROM leads WHERE franchise_id = ? AND RIGHT(phone, 10) = ? AND stage NOT IN ('converted','lost') ORDER BY id DESC LIMIT 1",
    [franchiseId, mobile]
  );
  const note = input.notes ? `[${new Date().toISOString().slice(0, 16).replace('T', ' ')} · ${source}] ${String(input.notes).slice(0, 500)}` : null;

  if (existing) {
    const merged = { ...existing, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v)) };
    await pool.query(
      `UPDATE leads SET name = COALESCE(?, name), email = COALESCE(?, email), vehicle_model = COALESCE(?, vehicle_model),
         service_interest = COALESCE(?, service_interest), timeline = COALESCE(?, timeline), campaign = COALESCE(?, campaign),
         customer_id = COALESCE(customer_id, ?), score = ?, notes = IF(? IS NULL, notes, CONCAT_WS('\\n', notes, ?)), updated_at = NOW()
       WHERE id = ?`,
      [fields.name, fields.email, fields.vehicle_model, fields.service_interest, fields.timeline, fields.campaign,
        cust?.id || null, scoreOf({ ...merged, source: existing.source }), note, note, existing.id]
    );
    return { id: existing.id, created: false };
  }

  const [ins] = await pool.query(
    `INSERT INTO leads (franchise_id, customer_id, phone, name, email, vehicle_model, service_interest, timeline, stage, source,
       direction, campaign, assigned_to, next_follow_up_at, score, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?)`,
    [franchiseId, cust?.id || null, phone, fields.name, fields.email, fields.vehicle_model, fields.service_interest, fields.timeline,
      source, direction, fields.campaign, input.assigned_to || null, input.next_follow_up_at || null,
      scoreOf({ ...fields, source }), note]
  );
  return { id: ins.insertId, created: true };
}

module.exports = { upsertLead, SOURCES, scoreOf };
