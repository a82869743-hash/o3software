-- ═══════════════════════════════════════════════════
-- Phase 2 v2: 003 — Package Extensions
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS v2_package_renewals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  package_id INT NOT NULL,
  customer_package_id INT NOT NULL,
  renewal_date DATE NOT NULL,
  amount_paid DECIMAL(10,2) DEFAULT NULL,
  payment_id INT DEFAULT NULL,
  renewed_by ENUM('customer','admin','auto') DEFAULT 'customer',
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customer (customer_id),
  FOREIGN KEY (customer_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS v2_package_usage_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_package_id INT NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  service_id INT DEFAULT NULL,
  booking_id INT DEFAULT NULL,
  services_used INT DEFAULT 1,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customer_package (customer_package_id),
  INDEX idx_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
