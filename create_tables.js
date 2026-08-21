const mysql = require('mysql2/promise');
require('dotenv').config({ path: './server/.env' });

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      multipleStatements: true
    });
    
    const sql = `
      CREATE TABLE IF NOT EXISTS user_packages (
        id int unsigned NOT NULL AUTO_INCREMENT,
        user_id int unsigned NOT NULL,
        package_id int unsigned NOT NULL,
        vehicle_id int unsigned DEFAULT NULL,
        vehicle_segment varchar(50) DEFAULT NULL,
        start_date timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        end_date timestamp NULL DEFAULT NULL,
        payment_status varchar(50) DEFAULT 'paid',
        package_status varchar(50) DEFAULT 'active',
        price_paid decimal(10,2) DEFAULT NULL,
        renewed_from_id int unsigned DEFAULT NULL,
        renewed_at timestamp NULL DEFAULT NULL,
        created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE IF NOT EXISTS package_usage (
        id int unsigned NOT NULL AUTO_INCREMENT,
        user_package_id int unsigned NOT NULL,
        service_name varchar(150) NOT NULL,
        used_count int unsigned NOT NULL DEFAULT '0',
        usage_status varchar(50) DEFAULT 'consumed',
        booking_id int unsigned DEFAULT NULL,
        job_card_id int unsigned DEFAULT NULL,
        consumed_at timestamp NULL DEFAULT NULL,
        created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    
    await conn.query(sql);
    console.log('Tables created.');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
