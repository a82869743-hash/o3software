-- ═══════════════════════════════════════════════════════════
-- Migration 037: Invoice Improvements
--
-- 1. Adds discount and notes to job_carts
-- 2. Adds products tracking and discounts to manual_bills
-- ═══════════════════════════════════════════════════════════

ALTER TABLE job_carts
  ADD COLUMN discount_type ENUM('percentage', 'fixed') NULL AFTER status,
  ADD COLUMN discount_value DECIMAL(10,2) NULL AFTER discount_type,
  ADD COLUMN invoice_notes TEXT NULL AFTER discount_value;

ALTER TABLE manual_bills
  ADD COLUMN products_json JSON NULL AFTER services_json,
  ADD COLUMN discount_type ENUM('percentage', 'fixed') NULL AFTER amount,
  ADD COLUMN discount_value DECIMAL(10,2) NULL AFTER discount_type;
