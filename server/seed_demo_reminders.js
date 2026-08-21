const pool = require('./src/config/db');

async function seedDemoReminders() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    console.log('--- Cleaning previous test user_packages ---');
    await conn.query('DELETE FROM package_usage');
    await conn.query('DELETE FROM user_packages');

    console.log('--- Seeding demo user vehicles if needed ---');
    // Ensure vehicles exist for test customers
    await conn.query(`
      INSERT INTO vehicles (customer_id, registration_no, brand, model, is_primary)
      VALUES 
        (2, 'GJ06AB1234', 'Hyundai', 'i20', 1),
        (11, 'GJ01CD5678', 'Tata', 'Nexon', 1),
        (12, 'GJ05EF9012', 'Kia', 'Seltos', 1),
        (5, 'GJ03GH3456', 'Maruti', 'Baleno', 1)
      ON DUPLICATE KEY UPDATE is_primary = VALUES(is_primary)
    `);

    const now = new Date();

    // 1 Month Before Reminder (11 Months mark) -> 30 days remaining
    const end1M = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const start1M = new Date(end1M.getTime() - 365 * 24 * 60 * 60 * 1000);

    // 1 Week Before Reminder -> 7 days remaining
    const end1W = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const start1W = new Date(end1W.getTime() - 365 * 24 * 60 * 60 * 1000);

    // 1 Day Before Reminder -> 1 day remaining
    const end1D = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
    const start1D = new Date(end1D.getTime() - 365 * 24 * 60 * 60 * 1000);

    // Expired / Service Due -> -5 days remaining (continuous notification mode)
    const endExp = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const startExp = new Date(endExp.getTime() - 365 * 24 * 60 * 60 * 1000);

    console.log('--- Seeding user_packages with 3-tier reminder stages ---');

    // Get vehicle IDs for test customers
    const [v2] = await conn.query("SELECT id FROM vehicles WHERE customer_id = 2 LIMIT 1");
    const [v11] = await conn.query("SELECT id FROM vehicles WHERE customer_id = 11 LIMIT 1");
    const [v12] = await conn.query("SELECT id FROM vehicles WHERE customer_id = 12 LIMIT 1");
    const [v5] = await conn.query("SELECT id FROM vehicles WHERE customer_id = 5 LIMIT 1");

    // Customer 2 (Bablu Kumar): 1 Month Reminder (30 days left, 11 months mark)
    const [res1] = await conn.query(
      `INSERT INTO user_packages (user_id, package_id, vehicle_id, start_date, end_date, price_paid, package_status, vehicle_segment)
       VALUES (2, 112, ?, ?, ?, 15000.00, 'active', 'sedan')`,
      [v2[0]?.id || null, start1M, end1M]
    );

    // Customer 11 (Suryaansh Patel): 1 Week Reminder (7 days left)
    const [res2] = await conn.query(
      `INSERT INTO user_packages (user_id, package_id, vehicle_id, start_date, end_date, price_paid, package_status, vehicle_segment)
       VALUES (11, 111, ?, ?, ?, 12000.00, 'active', 'hatchback')`,
      [v11[0]?.id || null, start1W, end1W]
    );

    // Customer 12 (Ananya Verma): 1 Day Reminder (1 day left)
    const [res3] = await conn.query(
      `INSERT INTO user_packages (user_id, package_id, vehicle_id, start_date, end_date, price_paid, package_status, vehicle_segment)
       VALUES (12, 114, ?, ?, ?, 18000.00, 'active', 'suv')`,
      [v12[0]?.id || null, start1D, end1D]
    );

    // Customer 5 (Test Customer): Expired / Service Due (Continuous Notification mode only)
    const [res4] = await conn.query(
      `INSERT INTO user_packages (user_id, package_id, vehicle_id, start_date, end_date, price_paid, package_status, vehicle_segment)
       VALUES (5, 113, ?, ?, ?, 14000.00, 'expired', 'medium_hatchback')`,
      [v5[0]?.id || null, startExp, endExp]
    );

    // Create package usage rows
    const usages = [
      { upId: res1.insertId, service: 'Ceramic Coating', count: 1 },
      { upId: res1.insertId, service: 'Interior Detailing', count: 2 },
      { upId: res2.insertId, service: 'Glass Coat', count: 1 },
      { upId: res3.insertId, service: '3M Protection Wash', count: 3 },
      { upId: res4.insertId, service: 'Acrylic Polish', count: 2 },
    ];

    for (const u of usages) {
      await conn.query(
        `INSERT INTO package_usage (user_package_id, service_name, used_count, usage_status)
         VALUES (?, ?, 0, 'available')`,
        [u.upId, u.service]
      );
    }

    await conn.commit();
    console.log('✓ Demo data seeded successfully!');
    console.log('  1. Bablu Kumar (User 2) -> 1 Month Reminder (30d remaining, 11 months mark)');
    console.log('  2. Suryaansh Patel (User 11) -> 1 Week Reminder (7d remaining)');
    console.log('  3. Ananya Verma (User 12) -> 1 Day Reminder (1d remaining)');
    console.log('  4. Test Customer (User 5) -> Expired / Service Due (Continuous Notification mode)');

    process.exit(0);
  } catch (err) {
    await conn.rollback();
    console.error('Seed demo reminders error:', err);
    process.exit(1);
  } finally {
    conn.release();
  }
}

seedDemoReminders();
