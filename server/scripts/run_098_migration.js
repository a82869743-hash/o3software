const pool = require('../src/config/db');

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log('Running migration 098: Phase 4 Slot Management and Closures...');

    // 1. booking_slots table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS booking_slots (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        booking_id INT UNSIGNED NOT NULL,
        slot_id INT UNSIGNED NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_booking_id (booking_id),
        INDEX idx_slot_id (slot_id),
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✓ booking_slots table ready');

    // 2. slot_closures columns
    const [scCols] = await conn.query('SHOW COLUMNS FROM slot_closures');
    const scNames = scCols.map(c => c.Field);

    if (!scNames.includes('closure_type')) {
      await conn.query(`ALTER TABLE slot_closures ADD COLUMN closure_type ENUM('single_slot', 'full_day', 'custom_range') DEFAULT 'full_day' AFTER reason`);
      console.log('✓ Added closure_type to slot_closures');
    }
    if (!scNames.includes('is_recurring')) {
      await conn.query(`ALTER TABLE slot_closures ADD COLUMN is_recurring TINYINT DEFAULT 0 AFTER closure_type`);
      console.log('✓ Added is_recurring to slot_closures');
    }
    if (!scNames.includes('recurrence_type')) {
      await conn.query(`ALTER TABLE slot_closures ADD COLUMN recurrence_type ENUM('none', 'weekly', 'yearly') DEFAULT 'none' AFTER is_recurring`);
      console.log('✓ Added recurrence_type to slot_closures');
    }
    if (!scNames.includes('recurrence_day')) {
      await conn.query(`ALTER TABLE slot_closures ADD COLUMN recurrence_day INT NULL AFTER recurrence_type`);
      console.log('✓ Added recurrence_day to slot_closures');
    }
    if (!scNames.includes('title')) {
      await conn.query(`ALTER TABLE slot_closures ADD COLUMN title VARCHAR(100) NULL AFTER recurrence_day`);
      console.log('✓ Added title to slot_closures');
    }
    if (!scNames.includes('created_by')) {
      await conn.query(`ALTER TABLE slot_closures ADD COLUMN created_by INT NULL AFTER title`);
      console.log('✓ Added created_by to slot_closures');
    }

    // 3. bookings.status ENUM
    await conn.query(`
      ALTER TABLE bookings 
        MODIFY COLUMN status ENUM(
          'pending_approval',
          'confirmed',
          'in_progress',
          'completed',
          'delivered',
          'cancelled',
          'expired',
          'rejected',
          'pending_payment',
          'reschedule_required'
        ) NOT NULL DEFAULT 'pending_approval'
    `);
    console.log('✓ Expanded bookings.status ENUM with reschedule_required');

    console.log('Migration 098 complete!');
  } catch (err) {
    console.error('Migration 098 failed:', err);
    process.exit(1);
  } finally {
    conn.release();
    process.exit(0);
  }
}

run();
