/**
 * incentiveEngine.js — per-vehicle slab incentives for the staff who worked on a car or bike.
 *
 *  - Each service is tagged washing / coating / ppf / bliss (services.incentive_type).
 *  - A vehicle earns once per tag it had (a wash + a coating on one car = one wash + one coating).
 *  - The slab position is the worker's count of vehicles of that tag this month (restarts on the 1st).
 *  - When several people worked on the vehicle the amount is split equally; each person's count still goes up by one.
 *  - Complaints: for a worker's first 3 complained vehicles in a month the incentive is withheld;
 *    from the 4th onwards it is withheld AND the same amount is deducted from salary.
 * Rates live in settings ('incentive_slabs', per studio) and default to the studio's rate card.
 */
const DEFAULT_SLABS = {
  washing: { car: [{ upto: null, amount: 50 }], bike: [{ upto: null, amount: 20 }] },
  coating: { car: [{ upto: 10, amount: 150 }, { upto: 20, amount: 200 }, { upto: null, amount: 500 }], bike: [{ upto: null, amount: 100 }] },
  ppf: { car: [{ upto: 2, amount: 400 }, { upto: 5, amount: 500 }, { upto: 10, amount: 800 }, { upto: null, amount: 1000 }] },
  bliss: { car: [{ upto: null, amount: 700 }] },
};
const TYPES = Object.keys(DEFAULT_SLABS);
const FREE_COMPLAINTS = 3;
const round2 = (n) => Math.round(Number(n) * 100) / 100;

async function getSlabs(db, franchiseId) {
  try {
    const [[row]] = await db.query("SELECT value FROM settings WHERE key_name = 'incentive_slabs' AND franchise_id = ? LIMIT 1", [franchiseId]);
    if (row?.value) return { ...DEFAULT_SLABS, ...JSON.parse(row.value) };
  } catch (_) { /* fall back to the rate card */ }
  return DEFAULT_SLABS;
}

/** Rate for the n-th vehicle (1-based); 0 if that tag has no rate for this vehicle class. */
function rateFor(slabs, type, vehicleClass, n) {
  const tiers = slabs[type]?.[vehicleClass];
  if (!tiers || !tiers.length) return 0;
  const tier = tiers.find(t => t.upto == null || n <= Number(t.upto)) || tiers[tiers.length - 1];
  return Number(tier.amount) || 0;
}

const vehicleClassOf = (category) => (/bike|two.?wheeler|motor.?cycle|scooter/i.test(String(category || '')) ? 'bike' : 'car');

/** Incentive tag from a service row (explicit tag first, then the name). */
function typeOfService(s) {
  const t = String(s.incentive_type || '').toLowerCase();
  if (TYPES.includes(t)) return t;
  if (t === 'none') return null;
  const n = String(s.name || s.service_name || '').toLowerCase();
  if (/bliss/.test(n)) return 'bliss';
  if (/ppf|paint protection/.test(n)) return 'ppf';
  if (/wash|shampoo/.test(n)) return 'washing';
  if (/coating|ceramic|graphene|shield|teflon|wax/.test(n)) return 'coating';
  return null;
}

/**
 * Work out and save incentives for one finished vehicle. Idempotent: earlier rows for the same
 * job card / quick wash are replaced (complaint state is kept).
 * source: { jobCartId } or { bookingId }
 */
async function awardForVehicle(db, { franchiseId = 1, jobCartId = null, bookingId = null, workerIds = [], types = [], vehicleClass = 'car', when = new Date() }) {
  const col = jobCartId ? 'job_cart_id' : 'booking_id';
  const srcId = jobCartId || bookingId;
  const workers = [...new Set(workerIds.map(Number).filter(Boolean))];
  const tags = [...new Set(types.filter(t => TYPES.includes(t)))];
  const [old] = await db.query(`SELECT user_id, incentive_type, complaint_id, status, salary_id FROM incentive_splits WHERE ${col} = ?`, [srcId]);
  if (old.some(o => o.salary_id || o.status === 'paid')) return { skipped: 'already paid in a salary' };
  const keepComplaint = old.find(o => o.complaint_id)?.complaint_id || null;
  await db.query(`DELETE FROM incentive_splits WHERE ${col} = ?`, [srcId]);
  if (!workers.length || !tags.length) return { rows: 0 };

  const d = new Date(when);
  const m = d.getMonth() + 1, y = d.getFullYear();
  const slabs = await getSlabs(db, franchiseId);
  const [names] = await db.query('SELECT id, name FROM users WHERE id IN (?)', [workers]);
  const nameOf = Object.fromEntries(names.map(u => [u.id, u.name]));
  let rows = 0, total = 0;

  for (const type of tags) {
    for (const uid of workers) {
      // vehicles of this tag this person already did this month (one per job card / quick wash)
      const [[c]] = await db.query(
        `SELECT COUNT(DISTINCT COALESCE(CONCAT('j', job_cart_id), CONCAT('b', booking_id))) AS n FROM incentive_splits
         WHERE user_id = ? AND incentive_type = ? AND vehicle_class = ? AND period_month = ? AND period_year = ?`,
        [uid, type, vehicleClass, m, y]);
      const position = Number(c.n) + 1;
      const base = round2(rateFor(slabs, type, vehicleClass, position) / workers.length);
      if (base <= 0) continue;
      await db.query(
        `INSERT INTO incentive_splits (job_cart_id, booking_id, franchise_id, user_id, user_name, role_in_job, amount, base_amount,
           status, period_month, period_year, incentive_type, vehicle_class, slab_position)
         VALUES (?, ?, ?, ?, ?, 'worker', ?, ?, 'approved', ?, ?, ?, ?, ?)`,
        [jobCartId, bookingId, franchiseId, uid, nameOf[uid] || 'Staff', base, base, m, y, type, vehicleClass, position]);
      rows++; total += base;
    }
  }
  if (keepComplaint) await applyComplaint(db, { complaintId: keepComplaint, jobCartId, bookingId });
  return { rows, total: round2(total) };
}

/** Withhold this vehicle's incentive for everyone who worked on it; deduct salary from a worker's 4th complaint in the month. */
async function applyComplaint(db, { complaintId, jobCartId = null, bookingId = null }) {
  const col = jobCartId ? 'job_cart_id' : 'booking_id';
  const srcId = jobCartId || bookingId;
  const [rows] = await db.query(`SELECT * FROM incentive_splits WHERE ${col} = ? AND salary_id IS NULL`, [srcId]);
  const out = [];
  for (const uid of [...new Set(rows.map(r => r.user_id))]) {
    const mine = rows.filter(r => r.user_id === uid);
    const { period_month: m, period_year: y } = mine[0];
    // complained vehicles this worker already had this month (other job cards / quick washes)
    const [[c]] = await db.query(
      `SELECT COUNT(DISTINCT COALESCE(CONCAT('j', job_cart_id), CONCAT('b', booking_id))) AS n FROM incentive_splits
       WHERE user_id = ? AND complaint_id IS NOT NULL AND period_month = ? AND period_year = ? AND NOT (${col} <=> ?)`,
      [uid, m, y, srcId]);
    const nth = Number(c.n) + 1;
    const deduct = nth > FREE_COMPLAINTS;
    for (const r of mine) {
      const base = Number(r.base_amount ?? r.amount);
      await db.query("UPDATE incentive_splits SET status = 'withheld', amount = 0, complaint_id = ?, penalty_amount = ? WHERE id = ?",
        [complaintId, deduct ? base : 0, r.id]);
    }
    out.push({ user_id: uid, name: mine[0].user_name, complaint_number: nth, withheld: round2(mine.reduce((s, r) => s + Number(r.base_amount ?? r.amount), 0)), salary_deducted: deduct });
  }
  return out;
}

/** Owed incentive (not yet paid in any salary) and pending complaint deductions up to the end of a month. */
async function owedFor(db, userId, y, m) {
  const upTo = '(period_year < ? OR (period_year = ? AND period_month <= ?))';
  const [[inc]] = await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS total, GROUP_CONCAT(id) AS ids FROM incentive_splits
     WHERE user_id = ? AND status IN ('approved','pending') AND salary_id IS NULL AND ${upTo}`, [userId, y, y, m]);
  const [[pen]] = await db.query(
    `SELECT COALESCE(SUM(penalty_amount), 0) AS total, GROUP_CONCAT(id) AS ids FROM incentive_splits
     WHERE user_id = ? AND penalty_amount > 0 AND penalty_salary_id IS NULL AND ${upTo}`, [userId, y, y, m]);
  const ids = (s) => (s ? String(s).split(',').map(Number) : []);
  return { incentive: round2(inc.total), incentiveIds: ids(inc.ids), penalty: round2(pen.total), penaltyIds: ids(pen.ids) };
}

module.exports = { DEFAULT_SLABS, TYPES, FREE_COMPLAINTS, getSlabs, rateFor, vehicleClassOf, typeOfService, awardForVehicle, applyComplaint, owedFor };
