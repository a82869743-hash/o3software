-- Migration 080: Drop legacy v2_inventory_items foreign key constraints on v2_purchase_items
-- Enables purchase line items to reference items in the main inventory table

SET FOREIGN_KEY_CHECKS = 0;

-- Safely drop foreign key pointing to v2_inventory_items if present
SET @fk_item = (
  SELECT CONSTRAINT_NAME 
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'v2_purchase_items' 
    AND COLUMN_NAME = 'item_id' 
    AND REFERENCED_TABLE_NAME IS NOT NULL 
  LIMIT 1
);

SET @stmt1 = IF(@fk_item IS NOT NULL, CONCAT('ALTER TABLE v2_purchase_items DROP FOREIGN KEY ', @fk_item), 'SELECT 1');
PREPARE stmt1 FROM @stmt1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

SET FOREIGN_KEY_CHECKS = 1;
