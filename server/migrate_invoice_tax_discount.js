const pool = require('./src/config/db');

async function migrate() {
  console.log('--- Migrating Database for GST & Discount Columns ---');
  const conn = await pool.getConnection();
  try {
    // 1. Migrate job_carts table
    const [jcCols] = await conn.query('DESCRIBE job_carts');
    const jcFields = jcCols.map(c => c.Field);

    if (!jcFields.includes('gst_type')) {
      await conn.query("ALTER TABLE job_carts ADD COLUMN gst_type ENUM('none', 'with_gst') DEFAULT 'with_gst' AFTER discount_value");
      console.log('Added gst_type column to job_carts');
    }
    if (!jcFields.includes('gst_pct')) {
      await conn.query('ALTER TABLE job_carts ADD COLUMN gst_pct DECIMAL(5,2) DEFAULT 18.00 AFTER gst_type');
      console.log('Added gst_pct column to job_carts');
    }
    if (!jcFields.includes('gst_amount')) {
      await conn.query('ALTER TABLE job_carts ADD COLUMN gst_amount DECIMAL(10,2) DEFAULT 0.00 AFTER gst_pct');
      console.log('Added gst_amount column to job_carts');
    }
    if (!jcFields.includes('subtotal')) {
      await conn.query('ALTER TABLE job_carts ADD COLUMN subtotal DECIMAL(10,2) DEFAULT 0.00 AFTER gst_amount');
      console.log('Added subtotal column to job_carts');
    }
    if (!jcFields.includes('discount_amount')) {
      await conn.query('ALTER TABLE job_carts ADD COLUMN discount_amount DECIMAL(10,2) DEFAULT 0.00 AFTER subtotal');
      console.log('Added discount_amount column to job_carts');
    }

    // 2. Migrate manual_bills table
    const [mbCols] = await conn.query('DESCRIBE manual_bills');
    const mbFields = mbCols.map(c => c.Field);

    if (!mbFields.includes('gst_type')) {
      await conn.query("ALTER TABLE manual_bills ADD COLUMN gst_type ENUM('none', 'with_gst') DEFAULT 'none' AFTER discount_value");
      console.log('Added gst_type column to manual_bills');
    }
    if (!mbFields.includes('gst_pct')) {
      await conn.query('ALTER TABLE manual_bills ADD COLUMN gst_pct DECIMAL(5,2) DEFAULT 18.00 AFTER gst_type');
      console.log('Added gst_pct column to manual_bills');
    }
    if (!mbFields.includes('gst_amount')) {
      await conn.query('ALTER TABLE manual_bills ADD COLUMN gst_amount DECIMAL(10,2) DEFAULT 0.00 AFTER gst_pct');
      console.log('Added gst_amount column to manual_bills');
    }
    if (!mbFields.includes('subtotal')) {
      await conn.query('ALTER TABLE manual_bills ADD COLUMN subtotal DECIMAL(10,2) DEFAULT 0.00 AFTER gst_amount');
      console.log('Added subtotal column to manual_bills');
    }
    if (!mbFields.includes('discount_amount')) {
      await conn.query('ALTER TABLE manual_bills ADD COLUMN discount_amount DECIMAL(10,2) DEFAULT 0.00 AFTER subtotal');
      console.log('Added discount_amount column to manual_bills');
    }
    if (!mbFields.includes('grand_total')) {
      await conn.query('ALTER TABLE manual_bills ADD COLUMN grand_total DECIMAL(10,2) DEFAULT 0.00 AFTER discount_amount');
      console.log('Added grand_total column to manual_bills');
    }

    console.log('✓ Database Migration Complete!');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    conn.release();
  }
}

migrate();
