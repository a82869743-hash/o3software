/**
 * priceVisibility.js — Applies the Super Admin's price visibility matrix to product/price rows.
 * Roles: admin (franchise admin), manager, staff, customer. Super Admin always sees everything.
 */
const pool = require('../config/db');

const PRICE_FIELDS = ['cost_price', 'franchise_price', 'selling_price', 'staff_price'];
let cache = null;
let cachedAt = 0;

function clearCache() { cache = null; }

async function getMatrix() {
  if (cache && Date.now() - cachedAt < 30000) return cache;
  const [rows] = await pool.query('SELECT role, price_field, is_visible FROM price_visibility');
  const m = {};
  for (const r of rows) {
    m[r.role] = m[r.role] || {};
    m[r.role][r.price_field] = r.is_visible === 1;
  }
  cache = m;
  cachedAt = Date.now();
  return m;
}

/** Returns a copy of `item` with price fields the role may not see removed. */
async function applyPriceVisibility(item, role) {
  if (!item || role === 'super_admin') return item;
  const matrix = await getMatrix();
  const allowed = matrix[role] || matrix.customer || {};
  const out = { ...item };
  for (const f of PRICE_FIELDS) {
    if (f in out && !allowed[f]) delete out[f];
  }
  // per product switch (Inventory → "Price visible to staff profiles"): off = no prices at all for staff
  if ((role === 'staff' || role === 'manager') && Number(item.price_visible_to_staff) === 0) {
    for (const f of PRICE_FIELDS) delete out[f];
    out.price_hidden = true;
  }
  if (!allowed.cost_price) { delete out.price_visible_to_staff; }
  return out;
}

async function visibleFields(role) {
  if (role === 'super_admin') return [...PRICE_FIELDS];
  const matrix = await getMatrix();
  const allowed = matrix[role] || {};
  return PRICE_FIELDS.filter(f => allowed[f]);
}

module.exports = { applyPriceVisibility, visibleFields, clearCache, PRICE_FIELDS };
