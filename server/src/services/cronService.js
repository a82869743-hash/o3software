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
        INSERT INTO staff_attendance (staff_id, att_date, status)
        SELECT id, CURDATE(), 'absent'
        FROM users
        WHERE role = 'staff' AND is_active = 1
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
        SELECT ap.id, ap.balance_due, ap.due_date, u.name, u.mobile
        FROM advance_payments ap
        JOIN users u ON ap.customer_id = u.id
        WHERE ap.status = 'advance_paid'
          AND ap.balance_due > 0
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
  cron.schedule('0 11 * * *', async () => {
    console.log('[CRON] Running package renewal & service schedule reminders');
    try {
      // 1. Package Expiry Reminders (30 days, 7 days, 1 day prior)
      const [expiringPackages] = await pool.query(`
        SELECT up.id, up.user_id, up.end_date, p.name AS package_name, u.name, u.mobile, v.brand, v.model, v.registration_no,
               DATEDIFF(up.end_date, CURDATE()) AS days_left
        FROM user_packages up
        JOIN packages p ON up.package_id = p.id
        JOIN users u ON up.user_id = u.id
        LEFT JOIN vehicles v ON up.vehicle_id = v.id
        WHERE up.package_status = 'active'
          AND (DATE(up.end_date) = DATE_ADD(CURDATE(), INTERVAL 30 DAY)
            OR DATE(up.end_date) = DATE_ADD(CURDATE(), INTERVAL 7 DAY)
            OR DATE(up.end_date) = DATE_ADD(CURDATE(), INTERVAL 1 DAY))
          AND u.mobile IS NOT NULL
      `);

      for (const pkg of expiringPackages) {
        if (pkg.mobile) {
          const timingText = pkg.days_left === 30 ? 'in 1 month' : pkg.days_left === 7 ? 'in 1 week' : 'tomorrow';
          const msg = `Hi ${pkg.name}, your package "${pkg.package_name}" is about to expire ${timingText} on ${new Date(pkg.end_date).toLocaleDateString('en-IN')}. Kindly visit O3 Car Spaa to enjoy your services or renew. Thank you!`;
          await messagingService.sendWhatsApp(`91${pkg.mobile}`, null, { body: msg }).catch(() => {});
        }
      }

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

  // 7. RETRY FAILED NOTIFICATIONS — Checks for failed SMS notifications to retry
  // Runs every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    console.log('[CRON] Running failed notifications retry check');
    try {
      const [failedLogs] = await pool.query(`
        SELECT * FROM v2_notification_logs 
        WHERE status = 'failed' AND attempts < 3 AND channel = 'sms'
      `);

      for (const log of failedLogs) {
        console.log(`[CRON] Retrying failed SMS notification #${log.id} (Attempt ${log.attempts + 1})`);
        
        // Mark as retry / pending during attempt
        await pool.query('UPDATE v2_notification_logs SET status = "retry", attempts = attempts + 1, last_attempt_at = NOW() WHERE id = ?', [log.id]);

        // Attempt SMS send
        const smsResult = await messagingService.sendSMS(log.mobile, process.env.MSG91_PROMO_TEMPLATE_ID || 'PROMO123', null, {
          content: log.message_body
        });

        if (smsResult.success) {
          await pool.query('UPDATE v2_notification_logs SET status = "sent", response_data = ? WHERE id = ?', [JSON.stringify(smsResult), log.id]);
        } else {
          await pool.query('UPDATE v2_notification_logs SET status = "failed", response_data = ? WHERE id = ?', [JSON.stringify(smsResult), log.id]);
        }
      }
    } catch (err) {
      console.error('[CRON] Error in failed notification retry task:', err);
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
