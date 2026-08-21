-- Migration 077: Drop legacy v2_vendors foreign key constraint on v2_purchases
-- Enables recording purchase bills for all vendors registered in the vendors table

SET FOREIGN_KEY_CHECKS = 0;

-- Safely drop foreign key pointing to v2_vendors if it exists
SET @fk_name = (
  SELECT CONSTRAINT_NAME 
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'v2_purchases' 
    AND COLUMN_NAME = 'vendor_id' 
    AND REFERENCED_TABLE_NAME IS NOT NULL 
  LIMIT 1
);

SET @stmt = IF(@fk_name IS NOT NULL, CONCAT('ALTER TABLE v2_purchases DROP FOREIGN KEY ', @fk_name), 'SELECT 1');
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Also safely drop v2_expenses vendor foreign key if pointing to v2_vendors
SET @fk_exp = (
  SELECT CONSTRAINT_NAME 
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'v2_expenses' 
    AND COLUMN_NAME = 'vendor_id' 
    AND REFERENCED_TABLE_NAME IS NOT NULL 
  LIMIT 1
);

SET @stmt2 = IF(@fk_exp IS NOT NULL, CONCAT('ALTER TABLE v2_expenses DROP FOREIGN KEY ', @fk_exp), 'SELECT 1');
PREPARE stmt2 FROM @stmt2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SET FOREIGN_KEY_CHECKS = 1;
