-- ═══════════════════════════════════════════════════
-- Phase 2 v2: 001 — Payment System Tables
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS v2_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  booking_id INT DEFAULT NULL,
  invoice_id INT DEFAULT NULL,
  package_id INT DEFAULT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  payment_method ENUM('razorpay','upi','qr','netbanking','card','cash','wallet') NOT NULL DEFAULT 'cash',
  status ENUM('pending','captured','failed','refunded','partial_refund') DEFAULT 'pending',
  razorpay_order_id VARCHAR(100) DEFAULT NULL,
  razorpay_payment_id VARCHAR(100) DEFAULT NULL,
  razorpay_signature VARCHAR(255) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customer (customer_id),
  INDEX idx_status (status),
  INDEX idx_created (created_at),
  FOREIGN KEY (customer_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS v2_payment_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payment_id INT NOT NULL,
  transaction_type ENUM('debit','credit','refund') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('success','failed','pending') NOT NULL DEFAULT 'pending',
  gateway_response JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_payment (payment_id),
  FOREIGN KEY (payment_id) REFERENCES v2_payments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS v2_refunds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payment_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  reason TEXT DEFAULT NULL,
  status ENUM('pending','processed','failed') DEFAULT 'pending',
  razorpay_refund_id VARCHAR(100) DEFAULT NULL,
  processed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_payment (payment_id),
  FOREIGN KEY (payment_id) REFERENCES v2_payments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
