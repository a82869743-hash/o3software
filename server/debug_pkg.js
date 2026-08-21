const pool = require('./src/config/db');

async function debug() {
  const conn = await pool.getConnection();
  try {
    const [userPackages] = await conn.query("SELECT * FROM user_packages ORDER BY id DESC LIMIT 5");
    console.log("Latest user packages:", userPackages);
    
    for (const up of userPackages) {
      const [usage] = await conn.query("SELECT * FROM package_usage WHERE user_package_id = ?", [up.id]);
      console.log(`Usage for user_package ${up.id}:`, usage);
      
      const [pkg] = await conn.query("SELECT * FROM packages WHERE id = ?", [up.package_id]);
      console.log(`Package ${up.package_id}:`, pkg[0].name);
    }
  } catch (err) {
    console.error(err);
  } finally {
    conn.release();
    process.exit(0);
  }
}
debug();
