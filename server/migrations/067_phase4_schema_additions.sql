-- Phase 4 Schema Additions

-- 1. Add share columns to v2_file_attachments
ALTER TABLE v2_file_attachments 
ADD COLUMN share_token VARCHAR(64) UNIQUE,
ADD COLUMN share_expires_at DATETIME,
ADD COLUMN share_created_by INT;

-- 2. Create return_bills table
CREATE TABLE IF NOT EXISTS return_bills (
  id INT AUTO_INCREMENT PRIMARY KEY,
  original_bill_id INT NOT NULL,
  return_type ENUM('sales_return', 'purchase_return') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Insert GST settings keys if not exists
INSERT IGNORE INTO settings (key_name, value) VALUES
('is_gst_applicable', '0'),
('gstin', '');
