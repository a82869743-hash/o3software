const pool = require('../src/config/db');

async function testVehiclesSearch() {
  try {
    const [cols] = await pool.query('DESCRIBE vehicles');
    console.log('vehicles columns:', cols.map(c => c.Field));

    const franchiseId = 1;
    const search = '%GJ%';
    const [rows] = await pool.query(`
      SELECT v.id, v.registration_no, v.brand, v.model,
             v.customer_id, u.name AS customer_name, u.mobile AS customer_mobile
      FROM vehicles v
      JOIN users u ON v.customer_id = u.id
      WHERE (v.registration_no LIKE ? OR v.brand LIKE ? OR v.model LIKE ? OR u.name LIKE ? OR u.mobile LIKE ?)
        AND (u.franchise_id = ? OR (u.franchise_id IS NULL AND ? = 1))
      ORDER BY
        CASE WHEN v.registration_no LIKE ? THEN 0 ELSE 1 END,
        v.registration_no ASC
      LIMIT 10
    `, [search, search, search, search, search, franchiseId, franchiseId, 'GJ%']);
    console.log('Vehicles search SUCCESS! Rows:', rows.length);
  } catch (err) {
    console.error('Vehicles search error:', err);
  }
  process.exit(0);
}

testVehiclesSearch();
