const pool = require('../config/db');
const jwt = require('jsonwebtoken');

const tryParseUser = (req) => {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }
  if (!token && req.query.token) {
    token = req.query.token;
  }
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
};

function normalizeDateStr(str) {
  if (!str) return str;
  str = String(str).trim();
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      // DD-MM-YYYY -> YYYY-MM-DD
      const [d, m, y] = parts;
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    } else if (parts[0].length === 4) {
      // YYYY-MM-DD
      const [y, m, d] = parts;
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return str;
}

// ─── LIST SLOTS ─────────────────────────────
// ─── LIST SLOTS ─────────────────────────────
exports.list = async (req, res) => {
  try {
    let { date, from_date, to_date, hide_blocked } = req.query;
    if (date) date = normalizeDateStr(date);
    if (from_date) from_date = normalizeDateStr(from_date);
    if (to_date) to_date = normalizeDateStr(to_date);
    let where = '1=1';
    const params = [];

    const user = tryParseUser(req);
    const franchiseId = req.headers['x-franchise-id']
      ? parseInt(req.headers['x-franchise-id'], 10)
      : (req.franchiseId || user?.franchise_id || 1);

    where += ' AND (s.franchise_id = ? OR s.franchise_id IS NULL)';
    params.push(franchiseId);

    if (date) {
      where += ' AND s.slot_date = ?';
      params.push(date);
    } else if (from_date && to_date) {
      where += ' AND s.slot_date BETWEEN ? AND ?';
      params.push(from_date, to_date);
    }

    where += " AND NOT (s.start_time = '00:00:00' AND s.end_time = '23:59:59')";

    // Filter out deleted slots unless admin specifically requests include_deleted
    const includeDeleted = req.query.include_deleted === 'true' || req.query.include_deleted === '1';
    if (!user || user.role !== 'admin' || !includeDeleted) {
      where += ' AND (s.is_deleted = 0 OR s.is_deleted IS NULL)';
    }

    // Fetch active closures and holidays for this franchise (or global)
    const [closures] = await pool.query(
      `SELECT id, franchise_id, DATE_FORMAT(start_date, '%Y-%m-%d') as start_date, 
              DATE_FORMAT(end_date, '%Y-%m-%d') as end_date, 
              slot_time, reason, closure_type, is_recurring, recurrence_type, recurrence_day, title
       FROM slot_closures 
       WHERE (franchise_id = ? OR franchise_id IS NULL OR franchise_id = 0)`,
      [franchiseId]
    );

    const sql = `
      SELECT s.*, DATE_FORMAT(s.slot_date, '%Y-%m-%d') as slot_date, 
             bs.id AS v2_blocked_id, bs.reason AS v2_blocked_reason
      FROM slots s
      LEFT JOIN v2_blocked_slots bs ON bs.blocked_date = s.slot_date AND bs.slot_time = s.start_time
      WHERE ${where}
      ORDER BY s.slot_date ASC, s.start_time ASC
    `;

    const [rows] = await pool.query(sql, params);

    // Enrich slots with closure matching, reasons, and availability
    const enriched = rows.map(r => {
      const slotDateStr = r.slot_date;
      const slotTimeStr = r.start_time;

      let matchingClosure = null;
      if (closures && closures.length > 0) {
        // Parse slot date parts
        const [sy, sm, sd] = slotDateStr.split('-').map(Number);
        const slotDayOfWeek = new Date(sy, sm - 1, sd).getDay(); // 0 = Sun, 1 = Mon ...

        matchingClosure = closures.find(c => {
          // Check slot_time condition
          if (c.slot_time && c.slot_time !== slotTimeStr) return false;

          if (c.is_recurring) {
            if (c.recurrence_type === 'weekly') {
              return slotDayOfWeek === parseInt(c.recurrence_day, 10);
            }
            if (c.recurrence_type === 'yearly' && c.start_date) {
              const [cy, cm, cd] = c.start_date.split('-').map(Number);
              return sm === cm && sd === cd;
            }
          } else {
            // One-time closure
            return slotDateStr >= c.start_date && slotDateStr <= c.end_date;
          }
          return false;
        });
      }

      const isBlocked = !!(r.is_blocked || r.v2_blocked_id || matchingClosure);
      const blockedReason = matchingClosure
        ? (matchingClosure.title ? `${matchingClosure.title}: ${matchingClosure.reason || 'Closed'}` : (matchingClosure.reason || 'Studio Closed'))
        : (r.v2_blocked_reason || (r.is_blocked ? 'Walk-in Reserved / Blocked' : null));

      const isAvailable = !isBlocked && (r.booked_count < r.max_capacity) && (!r.is_deleted);

      return {
        ...r,
        is_blocked: isBlocked,
        blocked_reason: blockedReason,
        is_available: isAvailable,
        closure_type: matchingClosure ? matchingClosure.closure_type : null,
        is_holiday: !!(matchingClosure && (matchingClosure.is_recurring || matchingClosure.closure_type === 'full_day')),
        holiday_title: matchingClosure?.title || null,
      };
    });

    const finalData = (hide_blocked === 'true' && (!user || user.role !== 'admin'))
      ? enriched.filter(s => !s.is_blocked)
      : enriched;

    res.json({
      success: true,
      data: finalData,
      closures: closures || [],
    });
  } catch (err) {
    console.error('Slots list error:', err.message);
    res.json({ success: true, data: [], closures: [] });
  }
};

// ─── CREATE SINGLE SLOT ────────────────────
exports.create = async (req, res) => {
  try {
    let { slot_date, start_time, end_time, max_capacity = 1 } = req.body;
    slot_date = normalizeDateStr(slot_date);
    if (!slot_date || !start_time || !end_time) {
      return res.status(400).json({ success: false, error: 'Date, start time, and end time are required' });
    }

    const [result] = await pool.query(
      'INSERT INTO slots (slot_date, start_time, end_time, max_capacity) VALUES (?, ?, ?, ?)',
      [slot_date, start_time, end_time, max_capacity]
    );
    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Slot created' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, error: 'Slot already exists for this date and time' });
    console.error('Slot create error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── BULK CREATE SLOTS (FIXED: timezone + dedup) ─────────
exports.bulkCreate = async (req, res) => {
  try {
    let { from_date, to_date, start_time, end_time, slot_duration_minutes = 60, max_capacity = 1 } = req.body;
    if (!from_date || !to_date || !start_time || !end_time) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }

    from_date = normalizeDateStr(from_date);
    to_date = normalizeDateStr(to_date);

    const duration = parseInt(slot_duration_minutes);
    if (duration <= 0 || duration > 480) {
      return res.status(400).json({ success: false, error: 'Slot duration must be between 1 and 480 minutes' });
    }

    // Safely clear existing unbooked slots that are NOT referenced in bookings table
    try {
      await pool.query(
        `DELETE FROM slots 
         WHERE slot_date BETWEEN ? AND ? 
           AND start_time >= ? AND start_time < ? 
           AND booked_count = 0 
           AND id NOT IN (SELECT DISTINCT slot_id FROM bookings WHERE slot_id IS NOT NULL)`,
        [from_date, to_date, start_time, end_time]
      );
    } catch (delErr) {
      console.warn('Notice: Skipped deleting referenced slots during bulk creation:', delErr.message);
    }

    let created = 0;
    let skipped = 0;

    // FIX: Use string-based date iteration to avoid UTC timezone shift.
    // Previously `new Date(from_date)` shifted to UTC midnight which could
    // produce wrong dates in IST (+05:30) timezone.
    const dates = getDateRange(from_date, to_date);

    // Parse start/end times
    const [startH, startM] = start_time.split(':').map(Number);
    const [endH, endM] = end_time.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // FIX: Pre-fetch existing slots in the date range to prevent duplication
    const [existingSlots] = await pool.query(
      'SELECT DATE_FORMAT(slot_date, \'%Y-%m-%d\') as slot_date, start_time FROM slots WHERE slot_date BETWEEN ? AND ?',
      [from_date, to_date]
    );
    const existingSet = new Set(
      existingSlots.map(s => {
        const d = typeof s.slot_date === 'string' ? s.slot_date : s.slot_date.toISOString().split('T')[0];
        return `${d}_${s.start_time}`;
      })
    );

    for (const dateStr of dates) {
      for (let t = startMinutes; t + duration <= endMinutes; t += duration) {
        const slotStart = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}:00`;
        const slotEnd = `${String(Math.floor((t + duration) / 60)).padStart(2, '0')}:${String((t + duration) % 60).padStart(2, '0')}:00`;

        // Skip if slot already exists (dedup guard)
        if (existingSet.has(`${dateStr}_${slotStart}`)) {
          skipped++;
          continue;
        }

        try {
          await pool.query(
            'INSERT INTO slots (slot_date, start_time, end_time, max_capacity) VALUES (?, ?, ?, ?)',
            [dateStr, slotStart, slotEnd, max_capacity]
          );
          created++;
          existingSet.add(`${dateStr}_${slotStart}`);
        } catch (e) {
          if (e.code === 'ER_DUP_ENTRY') skipped++;
          else throw e;
        }
      }
    }

    console.log(`[SLOTS] Bulk create: ${created} created, ${skipped} skipped (${from_date} → ${to_date})`);

    res.status(201).json({
      success: true,
      message: `${created} slots created, ${skipped} skipped (duplicates)`,
      data: { created, skipped },
    });
  } catch (err) {
    console.error('Bulk create error:', err.message);
    res.status(400).json({ success: false, error: err.message || 'Failed to generate slots' });
  }
};

// ─── UPDATE SLOT ────────────────────────────
exports.update = async (req, res) => {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const { id } = req.params;
    const { max_capacity, is_blocked, reason } = req.body;

    const [existing] = await conn.query('SELECT * FROM slots WHERE id = ?', [id]);
    if (!existing.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Slot not found' });
    }

    const updates = [];
    const params = [];
    if (max_capacity !== undefined) { updates.push('max_capacity = ?'); params.push(max_capacity); }
    if (is_blocked !== undefined) { updates.push('is_blocked = ?'); params.push(is_blocked ? 1 : 0); }

    if (!updates.length) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    params.push(id);
    await conn.query(`UPDATE slots SET ${updates.join(', ')} WHERE id = ?`, params);

    // Sync is_blocked to v2_blocked_slots
    if (is_blocked !== undefined) {
      const slot = existing[0];
      const d = slot.slot_date;
      const slotDate = typeof d === 'string' ? d : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      
      // Delete old block records
      await conn.query('DELETE FROM v2_blocked_slots WHERE blocked_date = ? AND slot_time = ?', [slotDate, slot.start_time]);

      if (is_blocked) {
        await conn.query(
          `INSERT INTO v2_blocked_slots (blocked_date, slot_time, reason, blocked_by)
           VALUES (?, ?, ?, ?)`,
          [slotDate, slot.start_time, reason || 'Walk-in Reserved', req.user ? req.user.id : null]
        );
      }
    }

    await conn.commit();
    res.json({ success: true, message: 'Slot updated successfully' });
  } catch (err) {
    await conn.rollback();
    console.error('Slot update error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

exports.toggleBlock = exports.update;

// ─── DELETE SLOT (Soft Delete + Socket Broadcast) ──────
exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const [slot] = await pool.query('SELECT booked_count, slot_date, start_time FROM slots WHERE id = ?', [id]);
    if (!slot.length) return res.status(404).json({ success: false, error: 'Slot not found' });
    if (slot[0].booked_count > 0) return res.status(422).json({ success: false, error: 'Cannot delete slot with existing bookings' });

    // Soft delete so admin can undo/restore at any time
    await pool.query('UPDATE slots SET is_deleted = 1 WHERE id = ?', [id]);

    // Real-time Socket.io broadcast to sync Admin and Customer views immediately
    const io = req.app.get('io');
    if (io) {
      io.emit('slots_updated', {
        action: 'delete',
        slot_id: parseInt(id, 10),
        slot_date: slot[0].slot_date,
        start_time: slot[0].start_time,
      });
    }

    res.json({ success: true, message: 'Slot deleted successfully. Undo/Restore available.' });
  } catch (err) {
    console.error('Slot delete error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── RESTORE / UNDO DELETE SLOT (Socket Broadcast) ───
exports.restore = async (req, res) => {
  try {
    const { id } = req.params;
    const [slot] = await pool.query('SELECT * FROM slots WHERE id = ?', [id]);
    if (!slot.length) return res.status(404).json({ success: false, error: 'Slot not found' });

    await pool.query('UPDATE slots SET is_deleted = 0, is_blocked = 0 WHERE id = ?', [id]);

    // Real-time Socket.io broadcast to sync Admin and Customer views immediately
    const io = req.app.get('io');
    if (io) {
      io.emit('slots_updated', {
        action: 'restore',
        slot_id: parseInt(id, 10),
        slot_date: slot[0].slot_date,
        start_time: slot[0].start_time,
      });
    }

    res.json({ success: true, message: 'Slot restored successfully' });
  } catch (err) {
    console.error('Slot restore error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── HELPER: Generate date range as string array (IST-safe) ─────
function getDateRange(fromStr, toStr) {
  const normFrom = normalizeDateStr(fromStr);
  const normTo = normalizeDateStr(toStr);
  const dates = [];
  // Parse YYYY-MM-DD parts directly to avoid timezone issues
  const [fy, fm, fd] = normFrom.split('-').map(Number);
  const [ty, tm, td] = normTo.split('-').map(Number);

  // Use UTC dates to avoid DST/timezone shifts, but only extract the date part
  let current = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));

  let maxDays = 366;
  while (current <= end && maxDays-- > 0) {
    const y = current.getUTCFullYear();
    const m = String(current.getUTCMonth() + 1).padStart(2, '0');
    const d = String(current.getUTCDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

// ─── SLOT CLOSURES / HOLIDAYS (Full Day, Custom Range, Specific Slot, Recurring) ─────
exports.getClosures = async (req, res) => {
  try {
    const user = tryParseUser(req);
    const franchiseId = req.headers['x-franchise-id']
      ? parseInt(req.headers['x-franchise-id'], 10)
      : (req.franchiseId || user?.franchise_id || 1);

    const [closures] = await pool.query(
      `SELECT *, DATE_FORMAT(start_date, "%Y-%m-%d") as start_date, 
              DATE_FORMAT(end_date, "%Y-%m-%d") as end_date 
       FROM slot_closures 
       WHERE (franchise_id = ? OR franchise_id IS NULL OR franchise_id = 0) 
       ORDER BY start_date DESC`,
      [franchiseId]
    );
    res.json({ success: true, data: closures });
  } catch (err) {
    console.error('Get closures error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CHECK CLOSURE CONFLICTS (Preview affected bookings) ─────
exports.checkClosureConflicts = async (req, res) => {
  try {
    const user = tryParseUser(req);
    const franchiseId = req.headers['x-franchise-id']
      ? parseInt(req.headers['x-franchise-id'], 10)
      : (req.franchiseId || user?.franchise_id || 1);

    let { start_date, end_date, slot_time } = req.body;
    if (start_date) start_date = normalizeDateStr(start_date);
    if (end_date) end_date = normalizeDateStr(end_date);
    if (!end_date) end_date = start_date;

    if (!start_date) {
      return res.status(400).json({ success: false, error: 'Start date is required' });
    }

    let sql = `
      SELECT b.id, b.status, b.customer_id, u.name AS customer_name, u.mobile AS customer_mobile,
             b.vehicle_brand, b.vehicle_model, b.vehicle_reg_no,
             DATE_FORMAT(s.slot_date, '%Y-%m-%d') AS slot_date, s.start_time, s.end_time,
             svc.name AS service_name
      FROM bookings b
      JOIN slots s ON b.slot_id = s.id
      JOIN users u ON b.customer_id = u.id
      LEFT JOIN services svc ON b.service_id = svc.id
      WHERE (s.franchise_id = ? OR s.franchise_id IS NULL)
        AND s.slot_date BETWEEN ? AND ?
    `;
    const params = [franchiseId, start_date, end_date];

    if (slot_time) {
      sql += ' AND s.start_time = ?';
      params.push(slot_time);
    }

    sql += " AND b.status IN ('confirmed', 'pending_approval', 'pending_payment', 'in_progress') ORDER BY s.slot_date ASC, s.start_time ASC";

    const [rows] = await pool.query(sql, params);
    res.json({
      success: true,
      count: rows.length,
      affected_bookings: rows,
    });
  } catch (err) {
    console.error('Check closure conflicts error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CREATE CLOSURE (With Conflict Detection & Non-Silent Reschedule Workflow) ─────
exports.createClosure = async (req, res) => {
  try {
    const user = tryParseUser(req);
    const franchiseId = req.headers['x-franchise-id']
      ? parseInt(req.headers['x-franchise-id'], 10)
      : (req.franchiseId || user?.franchise_id || 1);

    let {
      start_date,
      end_date,
      slot_time,
      reason,
      title,
      closure_type = 'full_day',
      is_recurring = false,
      recurrence_type = 'none',
      recurrence_day = null,
      confirm = false,
      action = 'reschedule_notify',
    } = req.body;

    if (is_recurring && recurrence_type === 'weekly' && !start_date) {
      start_date = '2000-01-01';
      end_date = '2099-12-31';
    }

    if (start_date) start_date = normalizeDateStr(start_date);
    if (end_date) end_date = normalizeDateStr(end_date);
    if (!end_date) end_date = start_date;

    if (!start_date) {
      return res.status(400).json({ success: false, error: 'Start date is required' });
    }

    // 1. Check for affected active bookings in range
    let checkSql = `
      SELECT b.id, b.status, b.customer_id, u.name AS customer_name, u.mobile AS customer_mobile,
             b.vehicle_brand, b.vehicle_model, b.vehicle_reg_no,
             DATE_FORMAT(s.slot_date, '%Y-%m-%d') AS slot_date, s.start_time, s.end_time,
             svc.name AS service_name
      FROM bookings b
      JOIN slots s ON b.slot_id = s.id
      JOIN users u ON b.customer_id = u.id
      LEFT JOIN services svc ON b.service_id = svc.id
      WHERE (s.franchise_id = ? OR s.franchise_id IS NULL)
    `;
    const checkParams = [franchiseId];

    if (is_recurring && recurrence_type === 'weekly') {
      checkSql += ' AND (DAYOFWEEK(s.slot_date) - 1) = ?';
      checkParams.push(parseInt(recurrence_day, 10));
    } else if (is_recurring && recurrence_type === 'yearly' && start_date) {
      checkSql += ' AND DATE_FORMAT(s.slot_date, "%m-%d") = DATE_FORMAT(?, "%m-%d")';
      checkParams.push(start_date);
    } else {
      checkSql += ' AND s.slot_date BETWEEN ? AND ?';
      checkParams.push(start_date, end_date);
    }

    if (slot_time) {
      checkSql += ' AND s.start_time = ?';
      checkParams.push(slot_time);
    }

    checkSql += " AND b.status IN ('confirmed', 'pending_approval', 'pending_payment', 'in_progress') ORDER BY s.slot_date ASC, s.start_time ASC";

    const [affectedBookings] = await pool.query(checkSql, checkParams);

    // If bookings exist and admin hasn't confirmed how to handle them, prompt for confirmation
    if (affectedBookings.length > 0 && !confirm) {
      return res.status(200).json({
        success: false,
        requires_confirmation: true,
        affected_bookings: affectedBookings,
        count: affectedBookings.length,
        message: `Found ${affectedBookings.length} existing booking(s) in this closure range. Please review and confirm reschedule/notify workflow.`,
      });
    }

    const closureReason = reason || title || 'Holiday / Studio Closure';
    const closureTitle = title || reason || 'Closure';

    // 2. Handle affected bookings: Never silently delete! Update status and notify
    if (affectedBookings.length > 0 && confirm) {
      const bookingIds = affectedBookings.map(b => b.id);
      const noteAppend = ` [Reschedule Required: ${closureReason}]`;

      await pool.query(
        `UPDATE bookings 
         SET status = 'reschedule_required', 
             booking_notes = CONCAT(COALESCE(booking_notes, ''), ?) 
         WHERE id IN (?)`,
        [noteAppend, bookingIds]
      );

      // Trigger notifications to affected customers
      const messagingService = require('../services/messagingService');
      for (const b of affectedBookings) {
        try {
          await messagingService.notify(
            b.customer_id,
            'BOOKING_UPDATE',
            {
              message: `Dear ${b.customer_name}, your appointment on ${b.slot_date} (${b.start_time}) needs to be rescheduled due to: ${closureReason}. Our studio will reach out or you can reschedule in the app.`
            },
            { type: 'booking', id: b.id }
          );
        } catch (mErr) {
          console.warn('[NOTIFY] Failed to notify customer about closure reschedule:', mErr.message);
        }
      }
    }

    // 3. Insert closure record
    const [result] = await pool.query(
      `INSERT INTO slot_closures 
       (franchise_id, start_date, end_date, slot_time, reason, closure_type, is_recurring, recurrence_type, recurrence_day, title, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        franchiseId,
        start_date,
        end_date,
        slot_time || null,
        closureReason,
        closure_type,
        is_recurring ? 1 : 0,
        recurrence_type || 'none',
        recurrence_day !== null && recurrence_day !== undefined ? parseInt(recurrence_day, 10) : null,
        closureTitle,
        user ? user.id : null,
      ]
    );

    // 4. Block slots matching range (for one-time closures)
    if (!is_recurring) {
      let blockSql = `UPDATE slots SET is_blocked = 1 WHERE slot_date BETWEEN ? AND ? AND (franchise_id = ? OR franchise_id IS NULL)`;
      const blockParams = [start_date, end_date, franchiseId];
      if (slot_time) {
        blockSql += ' AND start_time = ?';
        blockParams.push(slot_time);
      }
      await pool.query(blockSql, blockParams);
    }

    // 5. Emit real-time Socket.io broadcast to sync views immediately
    const io = req.app.get('io');
    if (io) {
      io.emit('slots_updated', {
        action: 'closure_created',
        closure_id: result.insertId,
        franchise_id: franchiseId,
        start_date,
        end_date,
        slot_time,
      });
    }

    res.status(201).json({
      success: true,
      message: affectedBookings.length > 0
        ? `Closure created successfully. ${affectedBookings.length} booking(s) marked for reschedule and customers notified.`
        : 'Closure / Holiday created successfully',
      data: {
        id: result.insertId,
        affected_count: affectedBookings.length,
      },
    });
  } catch (err) {
    console.error('Create closure error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── REOPEN CLOSURE / DELETE CLOSURE (Unblocks matching slots) ─────
exports.deleteClosure = async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query(
      `SELECT id, franchise_id, DATE_FORMAT(start_date, '%Y-%m-%d') as start_date, 
              DATE_FORMAT(end_date, '%Y-%m-%d') as end_date, slot_time 
       FROM slot_closures WHERE id = ?`,
      [id]
    );
    if (!existing.length) {
      return res.status(404).json({ success: false, error: 'Closure record not found' });
    }

    const closure = existing[0];
    const franchiseId = closure.franchise_id || 1;
    const sDate = closure.start_date;
    const eDate = closure.end_date || sDate;

    // Delete closure record
    await pool.query('DELETE FROM slot_closures WHERE id = ?', [id]);

    // Reopen/unblock matching slots
    let unblockSql = `UPDATE slots SET is_blocked = 0 WHERE slot_date BETWEEN ? AND ? AND (franchise_id = ? OR franchise_id IS NULL)`;
    const unblockParams = [sDate, eDate, franchiseId];
    if (closure.slot_time) {
      unblockSql += ' AND start_time = ?';
      unblockParams.push(closure.slot_time);
    }
    await pool.query(unblockSql, unblockParams);

    // Clean up corresponding v2_blocked_slots entries
    let cleanBlockedSql = `DELETE FROM v2_blocked_slots WHERE blocked_date BETWEEN ? AND ?`;
    const cleanParams = [sDate, eDate];
    if (closure.slot_time) {
      cleanBlockedSql += ' AND slot_time = ?';
      cleanParams.push(closure.slot_time);
    }
    await pool.query(cleanBlockedSql, cleanParams);

    // Emit Socket.io broadcast
    const io = req.app.get('io');
    if (io) {
      io.emit('slots_updated', {
        action: 'closure_reopened',
        closure_id: parseInt(id, 10),
        franchise_id: franchiseId,
        start_date: sDate,
        end_date: eDate,
      });
    }

    res.json({ success: true, message: 'Closure removed and slots reopened successfully' });
  } catch (err) {
    console.error('Delete closure error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET CLOSURES ─────────────────────────────────────────────────
exports.getClosures = async (req, res) => {
  try {
    const user = tryParseUser(req);
    const franchiseId = req.headers['x-franchise-id']
      ? parseInt(req.headers['x-franchise-id'], 10)
      : (req.franchiseId || user?.franchise_id || 1);

    const [rows] = await pool.query(
      `SELECT id, franchise_id, DATE_FORMAT(start_date, '%Y-%m-%d') as start_date, 
              DATE_FORMAT(end_date, '%Y-%m-%d') as end_date, 
              slot_time, reason, closure_type, is_recurring, recurrence_type, recurrence_day, title,
              created_at
       FROM slot_closures 
       WHERE (franchise_id = ? OR franchise_id IS NULL OR franchise_id = 0)
       ORDER BY start_date DESC`,
      [franchiseId]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getClosures error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};



