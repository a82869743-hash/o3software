/**
 * referralService — single ledger for referral earnings.
 *
 * Lifecycle of a ledger row:
 *   pending   → job created with a referrer, bill not final yet
 *   unpaid    → bill finalised (job completed / bill created): amount is owed to the referrer
 *   paid      → paid out (cash / UPI / bank / wallet, or inside a staff salary)
 *   cancelled → source job cancelled
 * Paid rows are never changed by later edits to the source.
 */
const pool = require('../config/db');
const { getSettingsMap } = require('./studioProfile');
const { normalizeMobile } = require('../utils/validators');

const DEFAULTS = {
  staff: { type: 'fixed', value: 200 },
  customer: { type: 'fixed', value: 200 },
  external: { type: 'fixed', value: 200 },
};

async function getRewardConfig(franchiseId) {
  const s = await getSettingsMap(franchiseId);
  const out = {};
  for (const kind of ['staff', 'customer', 'external']) {
    const type = s[`referral_${kind}_reward_type`] === 'percent' ? 'percent' : (s[`referral_${kind}_reward_type`] === 'fixed' ? 'fixed' : DEFAULTS[kind].type);
    const raw = s[`referral_${kind}_reward_value`];
    const value = raw !== undefined && raw !== '' && !isNaN(Number(raw)) ? Number(raw) : DEFAULTS[kind].value;
    out[kind] = { type, value };
  }
  return out;
}

function computeAmount(cfg, billAmount) {
  if (!cfg) return 0;
  const amt = cfg.type === 'percent' ? (Number(billAmount || 0) * cfg.value) / 100 : cfg.value;
  return Math.max(0, Math.round(amt * 100) / 100);
}

/**
 * Validate / normalise a referrer coming from a form.
 * input: { referrer_type: 'staff'|'customer'|'external', referrer_user_id, referrer_name, referrer_mobile }
 * Returns null when no referrer was given.
 */
async function resolveReferrer(conn, input, franchiseId, referredCustomerId) {
  const type = input && input.referrer_type;
  if (!type || type === 'none') return null;
  const db = conn || pool;

  if (type === 'staff' || type === 'customer') {
    const uid = parseInt(input.referrer_user_id, 10);
    if (!uid) throw Object.assign(new Error(`Select the ${type} who referred this customer`), { status: 400 });
    const roles = type === 'staff' ? ['staff', 'manager', 'admin'] : ['customer'];
    const [rows] = await db.query(
      'SELECT id, name, mobile, franchise_id FROM users WHERE id = ? AND role IN (?) AND is_deleted = 0',
      [uid, roles]
    );
    if (!rows.length) throw Object.assign(new Error('Referrer not found'), { status: 400 });
    if (type === 'staff' && Number(rows[0].franchise_id) !== Number(franchiseId)) {
      throw Object.assign(new Error('Referring staff member belongs to another franchise'), { status: 400 });
    }
    if (referredCustomerId && Number(uid) === Number(referredCustomerId)) {
      throw Object.assign(new Error('A customer cannot refer themselves'), { status: 400 });
    }
    return { referrer_type: type, referrer_user_id: uid, referrer_name: rows[0].name, referrer_mobile: rows[0].mobile };
  }

  const name = String(input.referrer_name || '').trim();
  if (!name) throw Object.assign(new Error('Enter the referrer name'), { status: 400 });
  const mobile = input.referrer_mobile ? normalizeMobile(input.referrer_mobile) : null;
  if (mobile && !/^[6-9]\d{9}$/.test(mobile)) throw Object.assign(new Error('Referrer mobile is invalid'), { status: 400 });
  return { referrer_type: 'external', referrer_user_id: null, referrer_name: name.slice(0, 150), referrer_mobile: mobile };
}

/**
 * Create or refresh the ledger row for a source (job card, quick wash, ...).
 * Pass referrer = null to remove a not-yet-paid referral.
 */
async function syncForSource(conn, { sourceType, sourceId, franchiseId, referrer, referredCustomerId, referredCustomerName, billAmount, finalised, label, userId }) {
  const db = conn || pool;
  const [existing] = await db.query('SELECT * FROM referral_ledger WHERE source_type = ? AND source_id = ?', [sourceType, sourceId]);
  const row = existing[0];
  if (row && row.status === 'paid') return row; // never touch paid rows

  if (!referrer) {
    if (row) await db.query('DELETE FROM referral_ledger WHERE id = ?', [row.id]);
    return null;
  }

  const cfg = (await getRewardConfig(franchiseId))[referrer.referrer_type];
  const amount = computeAmount(cfg, billAmount);
  const status = finalised ? 'unpaid' : 'pending';

  if (row) {
    await db.query(
      `UPDATE referral_ledger SET referrer_type=?, referrer_user_id=?, referrer_name=?, referrer_mobile=?,
         referred_customer_id=?, referred_customer_name=?, bill_amount=?, reward_type=?, reward_rate=?, amount=?,
         status=?, source_label=COALESCE(?, source_label) WHERE id=?`,
      [referrer.referrer_type, referrer.referrer_user_id, referrer.referrer_name, referrer.referrer_mobile,
        referredCustomerId || null, referredCustomerName || null, billAmount || 0, cfg.type, cfg.value, amount,
        row.status === 'cancelled' && !finalised ? 'pending' : status, label || null, row.id]
    );
    return { ...row, amount, status };
  }

  const [ins] = await db.query(
    `INSERT INTO referral_ledger (franchise_id, referrer_type, referrer_user_id, referrer_name, referrer_mobile,
       referred_customer_id, referred_customer_name, source_type, source_id, source_label, bill_amount,
       reward_type, reward_rate, amount, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [franchiseId || 1, referrer.referrer_type, referrer.referrer_user_id, referrer.referrer_name, referrer.referrer_mobile,
      referredCustomerId || null, referredCustomerName || null, sourceType, sourceId, label || null, billAmount || 0,
      cfg.type, cfg.value, amount, status, userId || null]
  );
  return { id: ins.insertId, amount, status };
}

async function cancelForSource(conn, sourceType, sourceId) {
  const db = conn || pool;
  await db.query(
    "UPDATE referral_ledger SET status = 'cancelled' WHERE source_type = ? AND source_id = ? AND status IN ('pending','unpaid')",
    [sourceType, sourceId]
  );
}

/** Unpaid referral earnings of a staff member (optionally up to a date) — used by salary. */
async function unpaidForStaff(conn, staffId, uptoDate) {
  const db = conn || pool;
  const params = [staffId];
  let dateClause = '';
  if (uptoDate) { dateClause = ' AND DATE(created_at) <= ?'; params.push(uptoDate); }
  const [rows] = await db.query(
    `SELECT * FROM referral_ledger WHERE referrer_type = 'staff' AND referrer_user_id = ? AND status = 'unpaid'${dateClause} ORDER BY created_at`,
    params
  );
  return rows;
}

module.exports = { getRewardConfig, computeAmount, resolveReferrer, syncForSource, cancelForSource, unpaidForStaff };
