-- ═══════════════════════════════════════════════════
-- 054: Phase 2 — Payment System & Advance Payments
-- ═══════════════════════════════════════════════════

-- Payment methods table
CREATE TABLE IF NOT EXISTS payment_methods (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(50) NOT NULL,
  type         ENUM('upi','card','net_banking','qr','cash','wallet','other') NOT NULL DEFAULT 'cash',
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default payment methods
INSERT IGNORE INTO payment_methods (name, type) VALUES
  ('Cash', 'cash'),
  ('UPI (GPay/PhonePe)', 'upi'),
  ('Credit/Debit Card', 'card'),
  ('Net Banking', 'net_banking'),
  ('QR Code', 'qr'),
  ('Wallet Balance', 'wallet');

-- Payments table — tracks all payments
CREATE TABLE IF NOT EXISTS payments (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id     INT UNSIGNED NULL,
  job_cart_id     INT UNSIGNED NULL,
  booking_id      INT UNSIGNED NULL,
  invoice_id      INT UNSIGNED NULL,
  amount          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  payment_type    ENUM('full','partial','advance','refund') NOT NULL DEFAULT 'full',
  payment_method  ENUM('cash','upi','card','net_banking','qr','wallet','other') NOT NULL DEFAULT 'cash',
  payment_status  ENUM('pending','completed','failed','refunded') NOT NULL DEFAULT 'pending',
  transaction_ref VARCHAR(100) NULL,
  notes           TEXT NULL,
  paid_at         TIMESTAMP NULL,
  created_by      INT UNSIGNED NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customer (customer_id),
  INDEX idx_job_cart (job_cart_id),
  INDEX idx_booking (booking_id),
  INDEX idx_status (payment_status),
  INDEX idx_paid_at (paid_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Advance payments table
CREATE TABLE IF NOT EXISTS advance_payments (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id     INT UNSIGNED NOT NULL,
  booking_id      INT UNSIGNED NULL,
  job_cart_id     INT UNSIGNED NULL,
  advance_amount  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_amount    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  balance_due     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  payment_method  ENUM('cash','upi','card','net_banking','qr','wallet','other') NOT NULL DEFAULT 'cash',
  status          ENUM('advance_paid','balance_paid','cancelled') NOT NULL DEFAULT 'advance_paid',
  due_date        DATE NULL,
  notes           TEXT NULL,
  created_by      INT UNSIGNED NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customer (customer_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Refunds table
CREATE TABLE IF NOT EXISTS refunds (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id      INT UNSIGNED NOT NULL,
  customer_id     INT UNSIGNED NOT NULL,
  amount          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  reason          TEXT NULL,
  status          ENUM('pending','approved','processed','rejected') NOT NULL DEFAULT 'pending',
  processed_by    INT UNSIGNED NULL,
  processed_at    TIMESTAMP NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_payment (payment_id),
  INDEX idx_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
