-- ═══════════════════════════════════════════════════════════
-- MIGRATION 087: Inventory Franchise & Staff Pricing
-- ═══════════════════════════════════════════════════════════

ALTER TABLE inventory ADD COLUMN franchise_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER cost_price;
ALTER TABLE inventory ADD COLUMN staff_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER selling_price;
