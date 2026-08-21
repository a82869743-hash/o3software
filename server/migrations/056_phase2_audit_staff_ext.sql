-- ═══════════════════════════════════════════════════
-- 056: Phase 2 — Audit Logs, Staff Extensions, Balance Sheet
-- ═══════════════════════════════════════════════════

-- Audit logs for edit tracking
CREATE TABLE IF NOT EXISTS audit_logs (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entity_type     VARCHAR(50) NOT NULL,
  entity_id       INT UNSIGNED NOT NULL,
  action          ENUM('create','update','delete','override','status_change') NOT NULL,
  field_name      VARCHAR(100) NULL,
  old_value       TEXT NULL,
  new_value       TEXT NULL,
  changed_by      INT UNSIGNED NOT NULL,
  changed_by_name VARCHAR(100) NULL,
  ip_address      VARCHAR(45) NULL,
  user_agent      VARCHAR(255) NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_changed_by (changed_by),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Staff tasks
CREATE TABLE IF NOT EXISTS staff_tasks (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_id        INT UNSIGNED NOT NULL,
  title           VARCHAR(200) NOT NULL,
  description     TEXT NULL,
  priority        ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  status          ENUM('pending','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
  due_date        DATE NULL,
  completed_at    TIMESTAMP NULL,
  assigned_by     INT UNSIGNED NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_staff (staff_id),
  INDEX idx_status (status),
  INDEX idx_due (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Staff leave requests
CREATE TABLE IF NOT EXISTS staff_leaves (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_id        INT UNSIGNED NOT NULL,
  leave_type      ENUM('casual','sick','earned','unpaid') NOT NULL DEFAULT 'casual',
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  reason          TEXT NULL,
  status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  approved_by     INT UNSIGNED NULL,
  approved_at     TIMESTAMP NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_staff (staff_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Staff performance tracking
CREATE TABLE IF NOT EXISTS staff_performance (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_id        INT UNSIGNED NOT NULL,
  month           TINYINT UNSIGNED NOT NULL,
  year            SMALLINT UNSIGNED NOT NULL,
  jobs_completed  INT UNSIGNED NOT NULL DEFAULT 0,
  avg_rating      DECIMAL(3,2) NULL,
  attendance_pct  DECIMAL(5,2) NULL,
  bonus_amount    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  notes           TEXT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_staff_month (staff_id, month, year),
  INDEX idx_staff (staff_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Expense categories for balance sheet
CREATE TABLE IF NOT EXISTS expense_categories (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  type        ENUM('income','expense') NOT NULL DEFAULT 'expense',
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO expense_categories (name, type) VALUES
  ('Service Revenue', 'income'),
  ('Package Sales', 'income'),
  ('Product Sales', 'income'),
  ('Salary & Wages', 'expense'),
  ('Inventory Purchase', 'expense'),
  ('Rent', 'expense'),
  ('Utilities', 'expense'),
  ('Marketing', 'expense'),
  ('Maintenance', 'expense'),
  ('Miscellaneous', 'expense');

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id     INT UNSIGNED NOT NULL,
  amount          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  description     VARCHAR(255) NULL,
  expense_date    DATE NOT NULL,
  payment_method  ENUM('cash','upi','card','net_banking','other') NOT NULL DEFAULT 'cash',
  receipt_url     VARCHAR(500) NULL,
  gst_amount      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  gst_number      VARCHAR(20) NULL,
  created_by      INT UNSIGNED NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_category (category_id),
  INDEX idx_date (expense_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Package renewal history
CREATE TABLE IF NOT EXISTS package_renewals (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_package_id     INT UNSIGNED NOT NULL,
  old_end_date        DATE NULL,
  new_end_date        DATE NULL,
  renewal_type        ENUM('auto','manual','upgrade','downgrade') NOT NULL DEFAULT 'manual',
  amount_paid         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  payment_method      ENUM('cash','upi','card','net_banking','qr','wallet','other') NOT NULL DEFAULT 'cash',
  renewed_by          INT UNSIGNED NULL,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_package (user_package_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add missing columns
ALTER TABLE `vehicles` ADD COLUMN `car_year` SMALLINT UNSIGNED NULL AFTER `model`;
ALTER TABLE `vehicles` ADD COLUMN `color` VARCHAR(50) NULL AFTER `car_year`;
ALTER TABLE `vehicles` ADD COLUMN `fuel_type` ENUM('petrol','diesel','cng','electric','hybrid') NULL AFTER `color`;
ALTER TABLE `inventory` ADD COLUMN `sku` VARCHAR(50) NULL AFTER `product_name`;
ALTER TABLE `inventory` ADD COLUMN `barcode` VARCHAR(100) NULL AFTER `sku`;
ALTER TABLE `inventory` ADD COLUMN `vendor_id` INT UNSIGNED NULL AFTER `barcode`;
ALTER TABLE `inventory` ADD COLUMN `cost_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `quantity`;
ALTER TABLE `inventory` ADD COLUMN `selling_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `cost_price`;
ALTER TABLE `inventory` ADD COLUMN `category` VARCHAR(100) NULL AFTER `selling_price`;
ALTER TABLE `bookings` ADD COLUMN `advance_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE `bookings` ADD COLUMN `total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE `job_carts` ADD COLUMN `payment_status` ENUM('pending','partial','paid','refunded') NOT NULL DEFAULT 'pending';
ALTER TABLE `job_carts` ADD COLUMN `payment_method` ENUM('cash','upi','card','net_banking','qr','wallet','other') NULL;
ALTER TABLE `job_carts` ADD COLUMN `advance_paid` DECIMAL(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE `job_carts` ADD COLUMN `balance_due` DECIMAL(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE `users` ADD COLUMN `referral_code` VARCHAR(20) NULL;
ALTER TABLE `users` ADD COLUMN `referred_by` INT UNSIGNED NULL;
