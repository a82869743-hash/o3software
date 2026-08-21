const pool = require('../src/config/db');

async function testQuery() {
  try {
    const franchiseId = 1;
    const [rows] = await pool.query(`
      SELECT 
        jc.id AS job_cart_id,
        jc.balance_due,
        jc.total_amount,
        jc.advance_paid,
        jc.payment_status,
        jc.visit_date,
        jc.status AS job_status,
        jc.completed_at,
        COALESCE(v.registration_no, 'N/A') AS registration_no,
        COALESCE(v.brand, '') AS brand,
        COALESCE(v.model, '') AS model,
        v.customer_id AS customer_id,
        COALESCE(u.name, 'Customer') AS customer_name,
        COALESCE(u.mobile, '') AS customer_mobile
      FROM job_carts jc
      LEFT JOIN vehicles v ON jc.vehicle_id = v.id
      LEFT JOIN users u ON v.customer_id = u.id
      WHERE jc.balance_due > 0 AND (jc.status != 'cancelled' OR jc.status IS NULL)
        AND (jc.franchise_id = ? OR (jc.franchise_id IS NULL AND ? = 1))
      ORDER BY jc.balance_due DESC, jc.visit_date DESC
    `, [franchiseId, franchiseId]);
    console.log('Query SUCCESS! Returned rows:', rows.length);
  } catch (err) {
    console.error('Query error:', err);
  }
  process.exit(0);
}

testQuery();
