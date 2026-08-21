const mysql = require('mysql2/promise');
require('dotenv').config({ path: './.env' });

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
    
    console.log('Connected to database.');

    const sql = `
      CREATE TABLE IF NOT EXISTS product_orders (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        customer_id INT UNSIGNED NOT NULL,
        product_id INT UNSIGNED NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        unit_price DECIMAL(10,2) NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        payment_method ENUM('razorpay', 'qr') NOT NULL DEFAULT 'qr',
        payment_status ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'pending',
        razorpay_order_id VARCHAR(100) DEFAULT NULL,
        razorpay_payment_id VARCHAR(100) DEFAULT NULL,
        razorpay_signature VARCHAR(255) DEFAULT NULL,
        qr_transaction_id VARCHAR(100) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES inventory(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    
    await conn.query(sql);
    console.log('product_orders table created successfully.');
    
    // Add product_id to v2_payments if it doesn't exist
    try {
      await conn.query(`ALTER TABLE v2_payments ADD COLUMN product_id INT UNSIGNED DEFAULT NULL AFTER package_id`);
      console.log('Added product_id to v2_payments.');
    } catch (e) {
      console.log('product_id column might already exist in v2_payments, error skipped:', e.message);
    }
    
    process.exit(0);
  } catch (e) {
    console.error('Error creating product_orders table:', e);
    process.exit(1);
  }
})();
