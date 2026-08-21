const pool = require('../config/db');

// ─── GET ALL ARCHIVED / SOFT-DELETED DATA ──────────
exports.listArchived = async (req, res) => {
  try {
    // 1. Archived Customers (is_active = 0)
    const [customers] = await pool.query(`
      SELECT id, name, mobile, email, created_at
      FROM users
      WHERE role = 'customer' AND is_active = 0
      ORDER BY created_at DESC
    `);

    // 2. Cancelled Job Carts
    const [jobCarts] = await pool.query(`
      SELECT jc.id, jc.visit_date, jc.status, jc.created_at,
             v.registration_no, v.brand, v.model,
             u.name AS customer_name
      FROM job_carts jc
      JOIN vehicles v ON jc.vehicle_id = v.id
      JOIN users u ON v.customer_id = u.id
      WHERE jc.status = 'cancelled'
      ORDER BY jc.created_at DESC
    `);

    // 3. Voided Bills
    const [bills] = await pool.query(`
      SELECT id, customer_name, customer_mobile, amount, description, created_at
      FROM manual_bills
      WHERE status = 'voided'
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      data: {
        customers,
        jobCarts,
        bills,
      }
    });
  } catch (err) {
    console.error('Archive list error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
