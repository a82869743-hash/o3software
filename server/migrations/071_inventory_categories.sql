-- Migration 071: Inventory Categories Master Table
-- Creates persistent inventory_categories table and seeds distinct categories from inventory

CREATE TABLE IF NOT EXISTS inventory_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed existing categories from inventory
INSERT IGNORE INTO inventory_categories (name)
SELECT DISTINCT category FROM inventory
WHERE category IS NOT NULL AND category != '' AND is_deleted = 0;
