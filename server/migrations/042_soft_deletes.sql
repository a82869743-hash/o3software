-- ═══════════════════════════════════════════════════════════
-- Migration 042: Soft Deletes & Archive Support
--
-- 1. Add status to manual_bills
-- 2. Add 'cancelled' to job_carts status enum
-- ═══════════════════════════════════════════════════════════

ALTER TABLE manual_bills
ADD COLUMN status ENUM('paid', 'voided', 'cancelled') NOT NULL DEFAULT 'paid' AFTER payment_method;

ALTER TABLE job_carts
MODIFY COLUMN status ENUM('draft','open','complete','cancelled') NOT NULL DEFAULT 'draft';
