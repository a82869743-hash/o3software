-- Migration 082: First Wash Discount columns & Manual Bills vehicle_category

-- 1. Add vehicle_category to manual_bills if not exists
SET @dbname = DATABASE();
SET @tablename = 'manual_bills';
SET @columnname = 'vehicle_category';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE manual_bills ADD COLUMN vehicle_category VARCHAR(50) NULL AFTER vehicle_reg_no'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 2. Add discount_percent and discount_amount to bookings if not exists
SET @tablename = 'bookings';
SET @columnname = 'discount_percent';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE bookings ADD COLUMN discount_percent DECIMAL(5,2) DEFAULT 0.00 AFTER is_free_wash'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'discount_amount';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE bookings ADD COLUMN discount_amount DECIMAL(10,2) DEFAULT 0.00 AFTER discount_percent'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 3. Add has_used_first_wash_discount to users if not exists
SET @tablename = 'users';
SET @columnname = 'has_used_first_wash_discount';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN has_used_first_wash_discount TINYINT(1) DEFAULT 0 AFTER opt_out_promotional'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
