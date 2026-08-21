-- ═══════════════════════════════════════════════════════════
-- Migration 035: Service Categories & Admin Customer Add
--
-- 1. Creates dynamic service_categories table
-- 2. Adds category_id FK to services
--
-- ⚠️  ADDITIVE ONLY
-- ═══════════════════════════════════════════════════════════

-- Step 1: Service Categories table
CREATE TABLE IF NOT EXISTS service_categories (
  id          INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100)   NOT NULL,
  description TEXT           NULL,
  sort_order  INT UNSIGNED   NOT NULL DEFAULT 0,
  is_active   TINYINT(1)     NOT NULL DEFAULT 1,
  created_at  TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 2: Seed default categories
INSERT IGNORE INTO service_categories (name, sort_order) VALUES
  ('Washing', 1),
  ('Detailing', 2),
  ('Coating', 3),
  ('Interior', 4),
  ('Mechanical', 5),
  ('Other', 99);

-- Step 3: Add category FK to services
ALTER TABLE services
  ADD COLUMN category_id INT UNSIGNED NULL,
  ADD INDEX idx_category_id (category_id),
  ADD CONSTRAINT fk_services_category FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE SET NULL;
