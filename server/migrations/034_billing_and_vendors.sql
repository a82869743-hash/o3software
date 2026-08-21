-- ═══════════════════════════════════════════════════════════
-- Migration 034: Manual Billing & Vendor Management
--
-- 1. Creates manual_bills table (billing without job card)
-- 2. Creates vendors table
--
-- ⚠️  ADDITIVE ONLY
-- ═══════════════════════════════════════════════════════════

-- Step 1: Manual Bills
CREATE TABLE IF NOT EXISTS manual_bills (
  id             INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
  customer_id    INT UNSIGNED   NULL,
  customer_name  VARCHAR(100)   NULL,
  customer_mobile VARCHAR(15)   NULL,
  amount         DECIMAL(10,2)  NOT NULL,
  description    TEXT           NULL,
  services_json  JSON           NULL,
  payment_method ENUM('cash','upi','card','bank_transfer','other') NOT NULL DEFAULT 'cash',
  created_by     INT UNSIGNED   NOT NULL,
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer_id (customer_id),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 2: Vendors
CREATE TABLE IF NOT EXISTS vendors (
  id           INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100)   NOT NULL,
  phone        VARCHAR(15)    NULL,
  email        VARCHAR(150)   NULL,
  service_type VARCHAR(100)   NULL,
  address      TEXT           NULL,
  is_active    TINYINT(1)     NOT NULL DEFAULT 1,
  created_at   TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
