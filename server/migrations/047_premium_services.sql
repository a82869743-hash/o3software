-- ═══════════════════════════════════════════════════════════
-- PHASE 2: Premium Wash Services & Add-ons
-- Extends services with premium flag, add-on support, images.
-- ═══════════════════════════════════════════════════════════

-- Add premium fields to services
ALTER TABLE services
  ADD COLUMN is_premium TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = premium/detailing service',
  ADD COLUMN image_url VARCHAR(500) NULL
    COMMENT 'Cloudinary or static image URL',
  ADD COLUMN image_public_id VARCHAR(200) NULL,
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0;

-- Service add-ons (e.g., engine bay cleaning with interior detail)
CREATE TABLE IF NOT EXISTS service_addons (
  id              INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  service_id      INT UNSIGNED  NOT NULL
    COMMENT 'The parent service',
  addon_name      VARCHAR(150)  NOT NULL,
  addon_price     DECIMAL(10,2) NOT NULL DEFAULT 0,
  duration_minutes INT NOT NULL DEFAULT 30,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  INDEX idx_service_id (service_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed premium services (only insert if they don't exist)
INSERT IGNORE INTO services (name, description, price_hatchback, price_medium_hatchback, price_sedan, price_premium_sedan, price_suv, price_luxury, duration_minutes, is_premium, is_active, sort_order)
VALUES
  ('Ceramic Wash', 'Professional ceramic coating wash with hydrophobic protection', 2500, 2800, 3200, 3500, 4000, 5000, 120, 1, 1, 100),
  ('Foam Wash Premium', 'Premium thick foam wash with pH-neutral shampoo', 800, 900, 1000, 1100, 1300, 1600, 60, 1, 1, 101),
  ('Interior Detailing', 'Deep interior cleaning, leather treatment, dashboard polish', 2000, 2200, 2500, 2800, 3200, 4000, 150, 1, 1, 102),
  ('Engine Bay Cleaning', 'Professional engine degreasing and detailing', 1500, 1500, 1800, 2000, 2200, 2800, 90, 1, 1, 103),
  ('Premium Spa Wash', 'Full exterior + interior spa treatment with wax finish', 3500, 3800, 4200, 4500, 5000, 6500, 180, 1, 1, 104);
