-- Migration 061: Add Advance Payment Columns and Settings
-- Update 4: Advance Payment

-- 1. Alter bookings to add missing columns
ALTER TABLE bookings
ADD COLUMN advance_payment_id INT NULL,
ADD COLUMN advance_collected_by INT NULL;

-- 2. Alter job_carts to add advance_amount
ALTER TABLE job_carts
ADD COLUMN advance_amount DECIMAL(10,2) DEFAULT 0.00;

-- 3. Insert settings keys for advance settings
INSERT INTO settings (key_name, value)
VALUES 
  ('advance_type', 'none'),
  ('advance_value', '0')
ON DUPLICATE KEY UPDATE key_name = key_name;
