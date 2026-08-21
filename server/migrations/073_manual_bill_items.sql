-- Migration: 073_manual_bill_items.sql
-- Create manual_bill_items table for line-item tracking in manual POS bills

CREATE TABLE IF NOT EXISTS manual_bill_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  manual_bill_id INT UNSIGNED NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  rate DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_manual_bill_id (manual_bill_id),
  CONSTRAINT fk_mbi_manual_bill FOREIGN KEY (manual_bill_id) REFERENCES manual_bills(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
