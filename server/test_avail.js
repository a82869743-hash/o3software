const pool = require('./src/config/db');
const userPkgCtrl = require('./src/controllers/userPackagesController');

async function test() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`INSERT INTO user_packages (user_id, package_id, package_status, start_date, end_date) VALUES (1, 1, 'active', NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR))`);
    const [up] = await conn.query('SELECT * FROM user_packages');
    await conn.query(`INSERT INTO package_usage (user_package_id, service_name, used_count, usage_status) VALUES (?, 'Foam Wash', 0, 'available')`, [up[0].id]);
    
    const result = await userPkgCtrl.checkServiceAvailability(conn, 1, 'Foam Wash'); 
    console.log('Result:', result);
    
    // clean up
    await conn.query('DELETE FROM package_usage');
    await conn.query('DELETE FROM user_packages');
  } catch (err) {
    console.error(err);
  } finally {
    conn.release();
    process.exit(0);
  }
}
test();
