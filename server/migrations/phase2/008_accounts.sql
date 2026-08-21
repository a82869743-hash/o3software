-- ═══════════════════════════════════════════════════
-- Phase 2 v2: 008 — Accounts (Expenses, GST)
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS v2_expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  expense_date DATE NOT NULL,
  payment_mode ENUM('cash','bank','upi','card') DEFAULT 'cash',
  vendor_id INT DEFAULT NULL,
  receipt_url VARCHAR(500) DEFAULT NULL,
  added_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_date (expense_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS v2_gst_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  record_type ENUM('sales','purchase') NOT NULL,
  invoice_id INT DEFAULT NULL,
  purchase_id INT DEFAULT NULL,
  gstin VARCHAR(20) DEFAULT NULL,
  taxable_amount DECIMAL(10,2) DEFAULT 0.00,
  cgst DECIMAL(10,2) DEFAULT 0.00,
  sgst DECIMAL(10,2) DEFAULT 0.00,
  igst DECIMAL(10,2) DEFAULT 0.00,
  total_gst DECIMAL(10,2) DEFAULT 0.00,
  period_month INT DEFAULT NULL,
  period_year INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_type (record_type),
  INDEX idx_period (period_month, period_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
