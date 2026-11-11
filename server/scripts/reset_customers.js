/**
 * Fresh start: removes every customer account and everything tied to customers
 * (cars, bookings, job cards, bills, payments, packages bought, chats, leads, referrals,
 * reviews, quotations, product orders). Keeps staff, admins, studios, services, packages,
 * products/stock, purchases, salaries and attendance.
 *
 * Take a database backup first. Dry run by default:
 *   node scripts/reset_customers.js          → shows what would be removed
 *   node scripts/reset_customers.js --yes    → removes it
 */
require('dotenv').config();
const pool = require('../src/config/db');

// Every row in these tables belongs to a customer or a customer's visit
const CLEAR = [
  'advance_payments', 'booking_services', 'booking_slots', 'bookings', 'customer_notes', 'customer_rewards',
  'deliveries', 'feedback', 'incentive_splits', 'inquiries', 'job_card_edit_logs', 'job_card_stage_history',
  'job_card_stages', 'job_cart_belongings', 'job_photos', 'job_products', 'job_services', 'job_carts',
  'lead_messages', 'leads', 'loyalty', 'loyalty_transactions', 'manual_bills', 'messages_log',
  'package_renewals', 'package_requests', 'package_service_schedules', 'package_usage', 'payments',
  'product_orders', 'quotation_items', 'quotations', 'referral_invites', 'referral_ledger', 'refunds',
  'user_package_usage', 'user_packages', 'v2_customer_addresses', 'v2_feedback', 'v2_notification_logs',
  'v2_package_renewals', 'v2_package_usage_logs', 'v2_payments', 'v2_pickup_requests', 'v2_review_requests',
  'v2_reward_logs', 'v2_tracking_history', 'v2_wallet_transactions', 'v2_wallets', 'vehicles',
  'wallet_transactions', 'wallets', 'warranty_certificates', 'whatsapp_conversations', 'whatsapp_messages',
  'whatsapp_opt_ins', 'whatsapp_opt_outs', 'otp_codes', 'notification_queue',
];
// Only the customer-related rows of these tables
const PARTIAL = [
  ['referral_codes', "customer_id IN (SELECT id FROM users WHERE role = 'customer')"],
  ['transactions', "type IN ('job_revenue', 'sale_b2c', 'referral_payout', 'loyalty_redeem', 'package_sale', 'booking_advance')"],
  ['buy_sell', "type = 'sell_b2c'"],
  ['v2_tasks', 'job_cart_id IS NOT NULL'],
];

(async () => {
  const apply = process.argv.includes('--yes');
  const [tables] = await pool.query('SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()');
  const exists = new Set(tables.map(r => r.t));
  const plan = [];
  for (const t of CLEAR) {
    if (!exists.has(t)) continue;
    const [[{ n }]] = await pool.query(`SELECT COUNT(*) n FROM \`${t}\``);
    if (n) plan.push([t, n, `DELETE FROM \`${t}\``]);
  }
  for (const [t, where] of PARTIAL) {
    if (!exists.has(t)) continue;
    const [[{ n }]] = await pool.query(`SELECT COUNT(*) n FROM \`${t}\` WHERE ${where}`);
    if (n) plan.push([t, n, `DELETE FROM \`${t}\` WHERE ${where}`]);
  }
  const [[{ n: customers }]] = await pool.query("SELECT COUNT(*) n FROM users WHERE role = 'customer'");
  plan.push(['users (customers)', customers, "DELETE FROM users WHERE role = 'customer'"]);

  plan.forEach(([t, n]) => console.log(`${String(n).padStart(6)}  ${t}`));
  if (!apply) { console.log('\nDry run. Nothing removed. Run again with --yes to remove.'); process.exit(0); }

  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.beginTransaction();
    for (const [, , sql] of plan) await conn.query(sql);
    await conn.query('UPDATE slots SET booked_count = 0');
    await conn.commit();
    // numbering (bookings, job cards, bills) starts again from 1
    for (const t of CLEAR) if (exists.has(t)) await conn.query(`ALTER TABLE \`${t}\` AUTO_INCREMENT = 1`).catch(() => {});
    console.log('\nDone. All customers and their data removed.');
  } catch (e) {
    await conn.rollback();
    console.error('Failed, nothing removed:', e.message);
    process.exitCode = 1;
  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    conn.release();
    process.exit();
  }
})();
