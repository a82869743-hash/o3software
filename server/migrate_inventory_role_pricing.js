const pool = require('./src/config/db');

async function migrate() {
  console.log('--- 1. Ensuring inventory table has role pricing columns ---');
  const conn = await pool.getConnection();
  try {
    const [cols] = await conn.query('DESCRIBE inventory');
    const colNames = cols.map(c => c.Field);

    if (!colNames.includes('franchise_price')) {
      await conn.query('ALTER TABLE inventory ADD COLUMN franchise_price DECIMAL(10,2) DEFAULT 0 AFTER cost_price');
      console.log('Added franchise_price column to inventory');
    }
    if (!colNames.includes('staff_price')) {
      await conn.query('ALTER TABLE inventory ADD COLUMN staff_price DECIMAL(10,2) DEFAULT 0 AFTER selling_price');
      console.log('Added staff_price column to inventory');
    }
    if (!colNames.includes('price_visible_to_staff')) {
      await conn.query('ALTER TABLE inventory ADD COLUMN price_visible_to_staff TINYINT(1) DEFAULT 1 AFTER staff_price');
      console.log('Added price_visible_to_staff column to inventory');
    }

    console.log('--- 2. Creating franchise_inventory_pricing table for franchise-wise pricing ---');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS franchise_inventory_pricing (
        id INT AUTO_INCREMENT PRIMARY KEY,
        inventory_id INT NOT NULL,
        franchise_id INT NOT NULL,
        franchise_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY idx_inv_franchise (inventory_id, franchise_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✓ franchise_inventory_pricing table ready!');

    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    conn.release();
  }
}

migrate();
