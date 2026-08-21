-- ═══════════════════════════════════════════════════════════
-- Migration 040: Add discount columns to manual_bills
-- ═══════════════════════════════════════════════════════════

ALTER TABLE manual_bills 
ADD COLUMN discount_type ENUM('fixed', 'percentage') NULL,
ADD COLUMN discount_value DECIMAL(10,2) NULL,
ADD COLUMN products_json JSON NULL;
