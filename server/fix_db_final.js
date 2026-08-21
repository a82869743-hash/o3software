const pool = require('./src/config/db');

async function fixDatabase() {
  const conn = await pool.getConnection();
  try {
    console.log('Starting final database fix...');

    // 1. Fix deliveries table
    console.log('Checking deliveries table...');
    const [delCols] = await conn.query('DESCRIBE deliveries');
    const delFields = delCols.map(c => c.Field);

    if (!delFields.includes('last_lat')) {
      await conn.query('ALTER TABLE deliveries ADD COLUMN last_lat DECIMAL(10,8) DEFAULT NULL AFTER delivered_at');
      console.log('  Added last_lat to deliveries');
    }
    if (!delFields.includes('last_lng')) {
      await conn.query('ALTER TABLE deliveries ADD COLUMN last_lng DECIMAL(11,8) DEFAULT NULL AFTER last_lat');
      console.log('  Added last_lng to deliveries');
    }
    if (!delFields.includes('location_updated_at')) {
      await conn.query('ALTER TABLE deliveries ADD COLUMN location_updated_at TIMESTAMP NULL DEFAULT NULL AFTER last_lng');
      console.log('  Added location_updated_at to deliveries');
    }
    if (!delFields.includes('address_from')) {
      await conn.query('ALTER TABLE deliveries ADD COLUMN address_from VARCHAR(255) DEFAULT NULL AFTER location_updated_at');
      console.log('  Added address_from to deliveries');
    }
    if (!delFields.includes('address_to')) {
      await conn.query('ALTER TABLE deliveries ADD COLUMN address_to VARCHAR(255) DEFAULT NULL AFTER address_from');
      console.log('  Added address_to to deliveries');
    }
    if (!delFields.includes('notes')) {
      await conn.query('ALTER TABLE deliveries ADD COLUMN notes TEXT DEFAULT NULL AFTER address_to');
      console.log('  Added notes to deliveries');
    }

    // 2. Fix bookings table
    console.log('Checking bookings table...');
    const [bookCols] = await conn.query('DESCRIBE bookings');
    const bookFields = bookCols.map(c => c.Field);

    // Fix job_type enum if needed
    const jobTypeCol = bookCols.find(c => c.Field === 'job_type');
    if (jobTypeCol && !jobTypeCol.Type.includes('standard')) {
        // Migration 050 tried to use 'booking', but code uses 'standard' or 'quick_wash'
        await conn.query("ALTER TABLE bookings MODIFY COLUMN job_type ENUM('standard', 'quick_wash') NOT NULL DEFAULT 'standard'");
        console.log('  Updated job_type enum in bookings');
    }

    if (!bookFields.includes('started_at')) {
      await conn.query('ALTER TABLE bookings ADD COLUMN started_at TIMESTAMP NULL DEFAULT NULL AFTER queue_position');
      console.log('  Added started_at to bookings');
    }
    // Note: completed_at might conflict with approved_at or similar, but 048 wants it.
    // However, DESCRIBE showed approved_at and created_at.
    if (!bookFields.includes('delivered_at')) {
      await conn.query('ALTER TABLE bookings ADD COLUMN delivered_at TIMESTAMP NULL DEFAULT NULL AFTER started_at');
      console.log('  Added delivered_at to bookings');
    }

    // 3. Fix settings table
    console.log('Checking settings table...');
    // 050 used setting_key/setting_value incorrectly.
    // Table has key_name/value.
    const loyaltySettings = [
      ['loyalty_points_ratio', '100'],
      ['loyalty_min_redeem', '50'],
      ['loyalty_point_value', '1'],
      ['loyalty_enabled', '1']
    ];

    for (const [key, val] of loyaltySettings) {
      await conn.query('INSERT IGNORE INTO settings (key_name, value) VALUES (?, ?)', [key, val]);
    }
    console.log('  Ensured loyalty settings exist');

    // 4. Fix missing indexes
    console.log('Checking indexes...');
    const [indexes] = await conn.query('SHOW INDEX FROM bookings');
    const indexNames = indexes.map(i => i.Key_name);

    if (!indexNames.includes('idx_bookings_job_type')) {
      await conn.query('CREATE INDEX idx_bookings_job_type ON bookings (job_type)');
      console.log('  Created idx_bookings_job_type');
    }
    if (!indexNames.includes('idx_bookings_wash_status')) {
      await conn.query('CREATE INDEX idx_bookings_wash_status ON bookings (wash_status)');
      console.log('  Created idx_bookings_wash_status');
    }

    console.log('\n✓ Database fix completed successfully.');
  } catch (err) {
    console.error('Database fix failed:', err);
  } finally {
    conn.release();
    process.exit(0);
  }
}

fixDatabase();
