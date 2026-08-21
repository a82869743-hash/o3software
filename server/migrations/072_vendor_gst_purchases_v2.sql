-- ═══════════════════════════════════════════════════════════
-- Migration 072: Purchase Bills, Vendor Ledger & GST System v2
--
-- Creates standard migrations for all operational finance tables:
-- 1. v2_purchases & v2_purchase_items (with HSN/SAC, per-item GST & running balance)
-- 2. v2_gst_records & v2_expenses
-- 3. v2_package_renewals & v2_audit_logs
-- 4. package_pricing, package_requests, product_orders
--
-- ⚠️ SAFE & ADDITIVE ONLY: Uses CREATE TABLE IF NOT EXISTS & ALTER ADD COLUMN IF NOT EXISTS
-- ═══════════════════════════════════════════════════════════

-- 1. Purchases Header Table
CREATE TABLE IF NOT EXISTS v2_purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  purchase_date DATE NOT NULL,
  invoice_number VARCHAR(100) DEFAULT NULL,
  taxable_amount DECIMAL(12,2) DEFAULT 0.00,
  tax_amount DECIMAL(10,2) DEFAULT 0.00,
  total_amount DECIMAL(12,2) DEFAULT 0.00,
  previous_balance DECIMAL(12,2) DEFAULT 0.00,
  running_balance DECIMAL(12,2) DEFAULT 0.00,
  status ENUM('pending','received','partial','cancelled') DEFAULT 'received',
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vendor (vendor_id),
  INDEX idx_status (status),
  INDEX idx_date (purchase_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Purchase Line Items Table (with HSN/SAC & Tax Rate)
CREATE TABLE IF NOT EXISTS v2_purchase_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_id INT NOT NULL,
  item_id INT NOT NULL,
  hsn_sac VARCHAR(20) DEFAULT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  gst_rate DECIMAL(5,2) DEFAULT 0.00,
  cgst_amount DECIMAL(10,2) DEFAULT 0.00,
  sgst_amount DECIMAL(10,2) DEFAULT 0.00,
  igst_amount DECIMAL(10,2) DEFAULT 0.00,
  total_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  received_quantity INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_purchase (purchase_id),
  INDEX idx_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. GST Records Table
CREATE TABLE IF NOT EXISTS v2_gst_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  record_type ENUM('sales','purchase') NOT NULL DEFAULT 'sales',
  invoice_id INT DEFAULT NULL,
  purchase_id INT DEFAULT NULL,
  gstin VARCHAR(20) DEFAULT NULL,
  taxable_amount DECIMAL(12,2) DEFAULT 0.00,
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

-- 4. Expenses Table
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

-- 5. Package Renewals Table
CREATE TABLE IF NOT EXISTS v2_package_renewals (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NOT NULL,
  package_id INT UNSIGNED NOT NULL,
  customer_package_id INT UNSIGNED DEFAULT NULL,
  renewal_date DATE DEFAULT NULL,
  amount_paid DECIMAL(10,2) DEFAULT 0,
  payment_id INT UNSIGNED DEFAULT NULL,
  renewed_by VARCHAR(50) DEFAULT 'customer',
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Audit Logs Table
CREATE TABLE IF NOT EXISTS v2_audit_logs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED DEFAULT NULL,
  user_type VARCHAR(50) DEFAULT NULL,
  action VARCHAR(100) DEFAULT NULL,
  resource VARCHAR(100) DEFAULT NULL,
  resource_id INT UNSIGNED DEFAULT NULL,
  old_value JSON DEFAULT NULL,
  new_value JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Package Pricing Table
CREATE TABLE IF NOT EXISTS package_pricing (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  package_id INT UNSIGNED NOT NULL,
  car_type VARCHAR(50) DEFAULT NULL,
  pricing_type VARCHAR(50) DEFAULT 'basic',
  price DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Package Requests Table
CREATE TABLE IF NOT EXISTS package_requests (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NOT NULL,
  vehicle_id INT UNSIGNED DEFAULT NULL,
  package_id INT UNSIGNED NOT NULL,
  price DECIMAL(10,2) DEFAULT 0,
  pricing_type VARCHAR(50) DEFAULT 'basic',
  car_type VARCHAR(50) DEFAULT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  rejection_reason TEXT DEFAULT NULL,
  approved_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Product Orders Table
CREATE TABLE IF NOT EXISTS product_orders (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  quantity INT DEFAULT 1,
  unit_price DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) DEFAULT 0,
  payment_method VARCHAR(50) DEFAULT NULL,
  payment_status VARCHAR(50) DEFAULT 'pending',
  razorpay_order_id VARCHAR(100) DEFAULT NULL,
  razorpay_payment_id VARCHAR(100) DEFAULT NULL,
  razorpay_signature VARCHAR(255) DEFAULT NULL,
  qr_transaction_id VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
