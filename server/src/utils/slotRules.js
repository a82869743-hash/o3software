// Shared slot rules: studio time (IST), past slots, holidays / closures.

// Current date and time at the studio (India), as 'YYYY-MM-DD' and 'HH:MM:SS'
function studioNow() {
  const s = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 19) };
}

const toTime = (t) => String(t || '').slice(0, 8).padEnd(8, ':00').slice(0, 8);

// A slot is over when its day has passed, or it is today and the given time (start or end) has gone
function isSlotPast(slotDate, time) {
  const now = studioNow();
  if (slotDate < now.date) return true;
  return slotDate === now.date && toTime(time) <= now.time;
}

// The holiday / closure that covers this slot, or null
function matchClosure(closures, slotDateStr, slotTimeStr) {
  if (!closures || !closures.length) return null;
  const [sy, sm, sd] = slotDateStr.split('-').map(Number);
  const dayOfWeek = new Date(sy, sm - 1, sd).getDay(); // 0 = Sun
  return closures.find(c => {
    if (c.slot_time && c.slot_time !== slotTimeStr) return false;
    if (c.is_recurring) {
      if (c.recurrence_type === 'weekly') return dayOfWeek === parseInt(c.recurrence_day, 10);
      if (c.recurrence_type === 'yearly' && c.start_date) {
        const [, cm, cd] = c.start_date.split('-').map(Number);
        return sm === cm && sd === cd;
      }
      return false;
    }
    return slotDateStr >= c.start_date && slotDateStr <= c.end_date;
  }) || null;
}

async function loadClosures(conn, franchiseId) {
  const [rows] = await conn.query(
    `SELECT id, franchise_id, DATE_FORMAT(start_date, '%Y-%m-%d') as start_date,
            DATE_FORMAT(end_date, '%Y-%m-%d') as end_date,
            slot_time, reason, closure_type, is_recurring, recurrence_type, recurrence_day, title
     FROM slot_closures
     WHERE (franchise_id = ? OR franchise_id IS NULL OR franchise_id = 0)`,
    [franchiseId]
  );
  return rows;
}

module.exports = { studioNow, isSlotPast, matchClosure, loadClosures };
