const cron = require('node-cron');
const pool = require('../config/db');
const messagingService = require('./messagingService');

/**
 * Initializes all cron jobs for the application.
 * In PM2 cluster mode, jobs run strictly under Worker #0 (Leader Election).
 */
exports.initCronJobs = () => {
  // PM2 Cluster Leader Election:
  const instanceId = process.env.NODE_APP_INSTANCE;
  if (instanceId !== undefined && instanceId !== '0') {
    console.log(`[CRON] Worker #${instanceId}: Standby worker — skipping cron scheduler (coordinated by Worker #0)`);
    return;
  }
  console.log(`[CRON] Leader coordinator active (Worker: ${instanceId || 'standalone'}). Registering scheduled jobs...`);

  // 1. Daily morning task: Send reminders for customers who haven't visited recently
  // Runs at 9:00 AM every day
  cron.schedule('0 9 * * *', async () => {
    const startTime = Date.now();
    console.log('[CRON] Running daily morning task: Service Reminders');
    try {
      // Find customers whose last service visit was exactly 90 days ago
      const [rows] = await pool.query(`
        SELECT v.id, v.brand, v.model, v.registration_no, u.mobile, u.name 
        FROM vehicles v
        JOIN users u ON v.customer_id = u.id
        JOIN job_carts jc ON jc.vehicle_id = v.id
        WHERE jc.status = 'complete'
          AND jc.completed_at = DATE_SUB(CURDATE(), INTERVAL 90 DAY)
          AND u.is_active = 1
          AND u.mobile IS NOT NULL
        GROUP BY v.id
      `);

      for (const vehicle of rows) {
        if (vehicle.mobile) {
          await messagingService.sendWhatsApp(
            `91${vehicle.mobile}`, 
            'service_reminder', 
            { body: `Hi ${vehicle.name}, your ${vehicle.brand} ${vehicle.model} (${vehicle.registration_no}) is due for service! Visit O3 Car Spaa.` }
          ).catch(() => {});
        }
      }
      console.log(`[CRON] Sent ${rows.length} service reminders`);
    } catch (err) {
      console.error('[CRON] Error in service reminder task:', err);
    }
  });

  // 2. Daily evening task: Mark absentees for staff who didn't clock in
  // Runs at 21:00 (9:00 PM) every day
  cron.schedule('0 21 * * *', async () => {
    console.log('[CRON] Running daily evening task: Marking absentees');
    try {
      await pool.query(`
        INSERT INTO staff_attendance (staff_id, att_date, status, franchise_id)
        SELECT id, CURDATE(), 'absent', COALESCE(franchise_id, 1)
        FROM users
        WHERE role IN ('staff', 'manager') AND is_active = 1 AND is_deleted = 0
        AND id NOT IN (
          SELECT staff_id FROM staff_attendance WHERE att_date = CURDATE()
        )
      `);
    } catch (err) {
      console.error('[CRON] Error in attendance task:', err);
    }
  });

  // 3. BOOKING EXPIRY — Expire pending_approval bookings after 5 min
  // Runs every minute
  cron.schedule('* * * * *', async () => {
    try {
      // Find expired pending bookings
      const [expiredBookings] = await pool.query(`
        SELECT id, slot_id, customer_id, is_free_wash
        FROM bookings
        WHERE status = 'pending_approval'
          AND expires_at IS NOT NULL
          AND expires_at < NOW()
      `);

      if (expiredBookings.length === 0) return;

      console.log(`[CRON] Expiring ${expiredBookings.length} pending bookings`);

      for (const booking of expiredBookings) {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          // Mark as expired
          await conn.query(
            "UPDATE bookings SET status = 'expired', expires_at = NULL WHERE id = ? AND status = 'pending_approval'",
            [booking.id]
          );

          // Restore slot count (including multi-hour consecutive slots)
          const { restoreBookingSlots } = require('../controllers/bookingsController');
          await restoreBookingSlots(conn, booking.id, booking.slot_id);

          // Restore free wash if applicable
          if (booking.is_free_wash) {
            await conn.query(
              'UPDATE loyalty SET free_washes = free_washes + 1 WHERE customer_id = ?',
              [booking.customer_id]
            );
          }

          await conn.commit();
          console.log(`[CRON] Booking #${booking.id} expired — slot ${booking.slot_id} freed`);
        } catch (e) {
          await conn.rollback();
          console.error(`[CRON] Failed to expire booking #${booking.id}:`, e.message);
        } finally {
          conn.release();
        }
      }
    } catch (err) {
      if (err.code !== 'ER_BAD_FIELD_ERROR' && err.code !== 'ER_NO_SUCH_TABLE' && err.code !== 'ECONNREFUSED') {
        console.error('[CRON] Error in booking expiry task:', err.message);
      }
    }
  });

  // 3b. BOOKING SLOTS — keep the next 30 days open for booking (copies each weekday's usual timings)
  const slotTopUp = () => require('./slotTopUp').topUpSlots().catch(err => console.error('[CRON] Slot top-up failed:', err.message));
  cron.schedule('30 0 * * *', slotTopUp);
  setTimeout(slotTopUp, 15000); // also once shortly after the server starts

  // 4. PACKAGE EXPIRY — Mark expired packages daily at midnight
  cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] Running package expiry check');
    try {
      const userPackagesCtrl = require('../controllers/userPackagesController');
      const expired = await userPackagesCtrl.expirePackages();
      if (expired > 0) {
        console.log(`[CRON] Expired ${expired} package subscription(s)`);
      }
    } catch (err) {
      if (err.code !== 'ER_BAD_FIELD_ERROR' && err.code !== 'ER_NO_SUCH_TABLE') {
        console.error('[CRON] Error in package expiry task:', err);
      }
    }
  });
  
  // 5. ADVANCE PAYMENT DUE REMINDERS — Send WhatsApp/SMS for advance payments due tomorrow
  // Runs at 10:00 AM every day
  cron.schedule('0 10 * * *', async () => {
    console.log('[CRON] Running advance payment due reminders');
    try {
      const [duePayments] = await pool.query(`
        SELECT ap.id, CASE WHEN jc.id IS NULL THEN ap.balance_due WHEN jc.status = 'cancelled' THEN 0 ELSE GREATEST(jc.balance_due, 0) END AS balance_due, ap.due_date, u.name, u.mobile
        FROM advance_payments ap
        JOIN users u ON ap.customer_id = u.id
        LEFT JOIN job_carts jc ON jc.id = ap.job_cart_id
        WHERE ap.status = 'advance_paid'
          AND (CASE WHEN jc.id IS NULL THEN ap.balance_due WHEN jc.status = 'cancelled' THEN 0 ELSE GREATEST(jc.balance_due, 0) END) > 0
          AND DATE(ap.due_date) = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
          AND u.mobile IS NOT NULL
      `);

      for (const payment of duePayments) {
        if (payment.mobile) {
          await messagingService.sendWhatsApp(
            `91${payment.mobile}`, 
            'payment_reminder', 
            { body: `Hi ${payment.name}, gentle reminder for your pending payment of Rs.${payment.balance_due} due tomorrow (${payment.due_date}). Thank you! - O3 Car Spaa` }
          ).catch(() => {});
        }
      }
      console.log(`[CRON] Sent ${duePayments.length} advance payment due reminders`);
    } catch (err) {
      if (err.code !== 'ER_BAD_FIELD_ERROR' && err.code !== 'ER_NO_SUCH_TABLE') {
        console.error('[CRON] Error in advance payment reminder task:', err);
      }
    }
  });
  
  // 6. PACKAGE RENEWAL REMINDERS — Send package renewal reminders via notify
  // Runs at 11:00 AM every day
  cron.schedule('0 11,18 * * *', async () => {
    console.log('[CRON] Running package renewal & service schedule reminders');
    try {
      // 1. Package renewal reminders (30 / 15 / 7 / 1 day before + on expiry, each once)
      const expiringPackages = { length: await require('../controllers/userPackagesController').runPackageReminders() };

      // 2. Service Schedule Reminders (30 days, 7 days, 1 day prior)
      const [schedItems] = await pool.query(`
        SELECT s.id, s.service_name, s.instance_number, s.scheduled_date, u.name, u.mobile,
               DATEDIFF(s.scheduled_date, CURDATE()) AS days_left
        FROM package_service_schedules s
        JOIN users u ON s.user_id = u.id
        WHERE s.status = 'pending'
          AND (DATE(s.scheduled_date) = DATE_ADD(CURDATE(), INTERVAL 30 DAY)
            OR DATE(s.scheduled_date) = DATE_ADD(CURDATE(), INTERVAL 7 DAY)
            OR DATE(s.scheduled_date) = DATE_ADD(CURDATE(), INTERVAL 1 DAY))
          AND u.mobile IS NOT NULL
      `);

      for (const item of schedItems) {
        if (item.mobile) {
          const timingText = item.days_left === 30 ? 'in 1 month' : item.days_left === 7 ? 'in 1 week' : 'tomorrow';
          const msg = `Hi ${item.name}, gentle reminder: your scheduled service "${item.service_name}" (Service #${item.instance_number}) is due ${timingText} (${new Date(item.scheduled_date).toLocaleDateString('en-IN')}). Kindly visit O3 Car Spaa!`;
          await messagingService.sendWhatsApp(`91${item.mobile}`, null, { body: msg }).catch(() => {});
        }
      }

      console.log(`[CRON] Sent ${expiringPackages.length} package expiry reminders & ${schedItems.length} service schedule reminders`);
    } catch (err) {
      if (err.code !== 'ER_BAD_FIELD_ERROR' && err.code !== 'ER_NO_SUCH_TABLE') {
        console.error('[CRON] Error in package reminder task:', err);
      }
    }
  });

  // 6b. VISIT DAY — draft job cards for package visits and repeat visits due today (7am)
  cron.schedule('0 7 * * *', async () => {
    try {
      const made = await require('../controllers/jobCartController').draftsForDueVisits(new Date().toLocaleDateString('en-CA'));
      if (made.length) console.log(`[CRON] ${made.length} visit job card(s) ready for today`);
    } catch (err) { console.error('[CRON] visit job cards failed:', err.message); }
  });

  // 7. (removed) SMS retry — non-OTP messages are WhatsApp-only and retried by the notification queue


  // 9. LEADS AGENT — first touch for new leads from every source + scheduled follow-ups (every 15 min, 9am–8pm)
  cron.schedule('*/15 9-20 * * *', async () => {
    try {
      const notificationService = require('./notificationService');
      const { getStudioProfile } = require('./studioProfile');
      // a) New leads not yet contacted (non-WhatsApp sources; WhatsApp ones are answered live by the AI agent)
      const [fresh] = await pool.query(
        `SELECT l.* FROM leads l
         WHERE l.stage = 'new' AND l.last_contacted_at IS NULL AND COALESCE(l.source,'') <> 'whatsapp_inbound'
           AND l.direction = 'inbound' AND l.created_at <= DATE_SUB(NOW(), INTERVAL 10 MINUTE)
           AND l.created_at >= DATE_SUB(NOW(), INTERVAL 3 DAY)
           AND NOT EXISTS (SELECT 1 FROM whatsapp_opt_outs o WHERE RIGHT(o.phone,10) = RIGHT(l.phone,10))
         LIMIT 50`
      );
      for (const l of fresh) {
        const studio = await getStudioProfile(l.franchise_id);
        const body = `Hi ${l.name ? l.name.split(' ')[0] : 'there'}! Thanks for your interest in ${studio.studio_name}` +
          `${l.service_interest ? ` (${l.service_interest})` : ''}. Which car do you drive and when would you like to bring it in? ` +
          `Reply here and we'll share prices and the next free slot.${studio.mobile ? ` Call us: ${studio.mobile}` : ''}`;
        await notificationService.notify({ mobile: l.phone, customMessageBody: body, channels: ['whatsapp'], franchiseId: l.franchise_id,
          referenceType: 'lead', referenceId: l.id, idempotencyKey: `lead_first_touch_${l.id}` });
        await pool.query(
          "UPDATE leads SET stage = 'contacted', last_contacted_at = NOW(), next_follow_up_at = DATE_ADD(NOW(), INTERVAL 2 DAY) WHERE id = ?",
          [l.id]
        );
      }
      // b) Follow-ups that are due
      const [due] = await pool.query(
        `SELECT l.* FROM leads l
         WHERE l.stage IN ('new','contacted','qualified') AND l.next_follow_up_at IS NOT NULL AND l.next_follow_up_at <= NOW()
           AND NOT EXISTS (SELECT 1 FROM whatsapp_opt_outs o WHERE RIGHT(o.phone,10) = RIGHT(l.phone,10))
         LIMIT 50`
      );
      for (const l of due) {
        const studio = await getStudioProfile(l.franchise_id);
        const body = `Hi ${l.name ? l.name.split(' ')[0] : 'there'}, just checking in from ${studio.studio_name}. ` +
          `Would you like us to reserve a slot for your ${l.vehicle_model || 'car'}${l.service_interest ? ` for ${l.service_interest}` : ''}? Reply YES and we'll confirm.`;
        await notificationService.notify({ mobile: l.phone, customMessageBody: body, channels: ['whatsapp'], franchiseId: l.franchise_id,
          referenceType: 'lead', referenceId: l.id, idempotencyKey: `lead_follow_${l.id}_${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}` });
        // After 3 automatic follow-ups with no reply the lead is parked as lost (staff can reopen)
        const nudges = ((l.notes || '').match(/\[auto-follow-up\]/g) || []).length + 1;
        await pool.query(
          `UPDATE leads SET last_contacted_at = NOW(), next_follow_up_at = ${nudges >= 3 ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL 3 DAY)'},
             stage = ${nudges >= 3 ? "'lost'" : 'stage'}, lost_reason = ${nudges >= 3 ? "'No response after 3 follow-ups'" : 'lost_reason'},
             notes = CONCAT_WS(CHAR(10), notes, '[auto-follow-up]') WHERE id = ?`,
          [l.id]
        );
      }
    } catch (err) {
      console.error('[CRON] Leads agent error:', err.message);
    }
  });

  // 8. BOOKING REMINDERS — 24h & 2h WhatsApp reminders (Phase 5)
  // Runs every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    try {
      const notificationService = require('./notificationService');
      await notificationService.checkBookingReminders();
    } catch (err) {
      console.error('[CRON] Error in booking reminders task:', err);
    }
  });
  
  console.log('[CRON] Jobs initialized successfully');
};
