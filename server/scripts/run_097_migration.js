const pool = require('../src/config/db');

async function run() {
  console.log('Running Migration 097...');

  async function addColumnIfNotExists(table, column, def) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (rows[0].count === 0) {
      console.log(`Adding column ${column} to ${table}...`);
      await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${def}`);
    } else {
      console.log(`Column ${column} already exists in ${table}.`);
    }
  }

  // 1. job_carts columns
  await addColumnIfNotExists('job_carts', 'referral_person', 'VARCHAR(150) NULL');
  await addColumnIfNotExists('job_carts', 'handler_id', 'INT NULL');
  await addColumnIfNotExists('job_carts', 'technician_id', 'INT NULL');
  await addColumnIfNotExists('job_carts', 'team_incentive_users', 'TEXT NULL');
  await addColumnIfNotExists('job_carts', 'incentive_amount', 'DECIMAL(10,2) DEFAULT 0.00');
  await addColumnIfNotExists('job_carts', 'incentive_split_type', "ENUM('individual', 'team_split', 'custom') DEFAULT 'team_split'");
  await addColumnIfNotExists('job_carts', 'loyalty_points_earned', 'INT DEFAULT 0');

  // 2. users columns
  await addColumnIfNotExists('users', 'custom_discount_type', "ENUM('percentage', 'fixed', 'none') DEFAULT 'none'");
  await addColumnIfNotExists('users', 'custom_discount_value', 'DECIMAL(10,2) DEFAULT 0.00');
  await addColumnIfNotExists('users', 'crm_notes', 'TEXT NULL');

  // 3. services columns
  await addColumnIfNotExists('services', 'loyalty_points', 'INT DEFAULT 0');
  await addColumnIfNotExists('services', 'is_partial_ppf', 'TINYINT(1) DEFAULT 0');

  // 4. job_card_edit_logs table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_card_edit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      job_cart_id INT NOT NULL,
      franchise_id INT NOT NULL DEFAULT 1,
      user_id INT NULL,
      user_name VARCHAR(150) NULL,
      user_role VARCHAR(50) NULL,
      change_summary TEXT NOT NULL,
      changes_json JSON NULL,
      edited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_jcel_jc (job_cart_id),
      INDEX idx_jcel_f (franchise_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('Verified job_card_edit_logs table.');

  // 5. incentive_rules table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS incentive_rules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      franchise_id INT NOT NULL DEFAULT 1,
      rule_name VARCHAR(150) NOT NULL,
      service_id INT NULL,
      rule_type ENUM('percentage', 'flat') DEFAULT 'percentage',
      rule_value DECIMAL(10,2) NOT NULL DEFAULT 5.00,
      min_job_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      lead_technician_share_pct DECIMAL(5,2) DEFAULT 50.00,
      team_share_pct DECIMAL(5,2) DEFAULT 40.00,
      manager_share_pct DECIMAL(5,2) DEFAULT 10.00,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ir_f (franchise_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('Verified incentive_rules table.');

  // 6. incentive_splits table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS incentive_splits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      job_cart_id INT NOT NULL,
      franchise_id INT NOT NULL DEFAULT 1,
      user_id INT NOT NULL,
      user_name VARCHAR(150) NULL,
      role_in_job ENUM('lead_technician', 'team_member', 'handling_manager') NOT NULL,
      amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      status ENUM('pending', 'approved', 'paid') DEFAULT 'approved',
      period_month INT NOT NULL,
      period_year INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_inc_user_period (user_id, period_year, period_month),
      INDEX idx_inc_jc (job_cart_id),
      INDEX idx_inc_fid (franchise_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('Verified incentive_splits table.');

  // 7. loyalty_rules table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS loyalty_rules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      franchise_id INT NOT NULL DEFAULT 1,
      rule_name VARCHAR(150) NOT NULL,
      service_id INT NULL,
      points_type ENUM('percentage_of_bill', 'fixed_points') DEFAULT 'percentage_of_bill',
      points_value DECIMAL(10,2) DEFAULT 5.00,
      multiplier DECIMAL(3,2) DEFAULT 1.00,
      expiry_days INT DEFAULT 365,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_lr_f (franchise_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('Verified loyalty_rules table.');

  // 8. Seed default incentive rules
  const [existingIncRules] = await pool.query('SELECT COUNT(*) as cnt FROM incentive_rules');
  if (existingIncRules[0].cnt === 0) {
    await pool.query(`
      INSERT INTO incentive_rules (franchise_id, rule_name, rule_type, rule_value, min_job_amount, lead_technician_share_pct, team_share_pct, manager_share_pct, is_active)
      VALUES 
        (1, 'Standard Studio Incentive (5%)', 'percentage', 5.00, 500.00, 50.00, 40.00, 10.00, 1),
        (2, 'Vijay Nagar Branch Incentive (5%)', 'percentage', 5.00, 500.00, 50.00, 40.00, 10.00, 1)
    `);
    console.log('Seeded default incentive rules.');
  }

  // 9. Seed default loyalty rules
  const [existingLoyRules] = await pool.query('SELECT COUNT(*) as cnt FROM loyalty_rules');
  if (existingLoyRules[0].cnt === 0) {
    await pool.query(`
      INSERT INTO loyalty_rules (franchise_id, rule_name, points_type, points_value, multiplier, expiry_days, is_active)
      VALUES 
        (1, 'Standard 5% Cashback Points', 'percentage_of_bill', 5.00, 1.00, 365, 1),
        (2, 'Vijay Nagar 5% Cashback Points', 'percentage_of_bill', 5.00, 1.00, 365, 1)
    `);
    console.log('Seeded default loyalty rules.');
  }

  // 10. Mark PPF services as is_partial_ppf = 1
  await pool.query(`
    UPDATE services SET is_partial_ppf = 1 WHERE LOWER(name) LIKE '%ppf%' OR LOWER(name) LIKE '%film%'
  `);
  console.log('Marked PPF services.');

  console.log('Migration 097 finished successfully!');
  process.exit(0);
}

run().catch(err => {
  console.error('Migration 097 failed:', err);
  process.exit(1);
});
