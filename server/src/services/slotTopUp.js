/**
 * Keeps booking slots available ahead of time, so customers can always book.
 *
 * For every active studio and every day from today up to `days` ahead that has NO slot rows at all,
 * copy the slots of the most recent same weekday (within the last 8 weeks) — same times, same capacity.
 *   • A weekday the studio keeps closed (no slots on it) stays closed.
 *   • A day the admin cleared on purpose keeps its (deleted) rows, so it is not refilled.
 *   • Holidays / closures are applied when slots are listed, so copied slots on those days show as closed.
 * Settings: `auto_slots_days` (default 30; 0 turns this off).
 */
const pool = require('../config/db');

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function topUpSlots({ days } = {}) {
  const [fr] = await pool.query('SELECT id FROM franchises WHERE is_active = 1 AND COALESCE(is_deleted, 0) = 0');
  let created = 0;
  for (const { id: fid } of fr) {
    const [[cfg]] = await pool.query(
      "SELECT value FROM settings WHERE key_name = 'auto_slots_days' AND franchise_id IN (1, ?) ORDER BY (franchise_id = ?) DESC LIMIT 1", [fid, fid]);
    const ahead = Math.min(90, Math.max(0, parseInt(days ?? cfg?.value ?? '30', 10) || 0));
    if (!ahead) continue;

    const [have] = await pool.query(
      "SELECT DISTINCT DATE_FORMAT(slot_date, '%Y-%m-%d') d FROM slots WHERE franchise_id = ? AND slot_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)",
      [fid, ahead]);
    const has = new Set(have.map(r => r.d));

    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i <= ahead; i++) {
      const day = new Date(today); day.setDate(today.getDate() + i);
      const ds = ymd(day);
      if (has.has(ds)) continue;
      // latest same-weekday date (before this one, last 8 weeks) that has live slots
      const [[tpl]] = await pool.query(
        `SELECT DATE_FORMAT(slot_date, '%Y-%m-%d') d FROM slots
         WHERE franchise_id = ? AND COALESCE(is_deleted, 0) = 0 AND DAYOFWEEK(slot_date) = DAYOFWEEK(?)
           AND slot_date < ? AND slot_date >= DATE_SUB(?, INTERVAL 56 DAY)
         ORDER BY slot_date DESC LIMIT 1`, [fid, ds, ds, ds]);
      if (!tpl) continue;
      const [r] = await pool.query(
        `INSERT IGNORE INTO slots (franchise_id, slot_date, start_time, end_time, max_capacity)
         SELECT franchise_id, ?, start_time, end_time, max_capacity FROM slots
         WHERE franchise_id = ? AND slot_date = ? AND COALESCE(is_deleted, 0) = 0`, [ds, fid, tpl.d]);
      created += r.affectedRows || 0;
      has.add(ds);
    }
  }
  if (created) console.log(`[SLOTS] Auto top-up created ${created} slot(s)`);
  return created;
}

module.exports = { topUpSlots };
