-- ═══════════════════════════════════════════════════════════
-- MIGRATION 091: Job Card Pre-Inspection Inspector & Personal Items
-- ═══════════════════════════════════════════════════════════

ALTER TABLE job_carts ADD COLUMN pre_inspector_name VARCHAR(150) NULL AFTER notes;
ALTER TABLE job_carts ADD COLUMN personal_items_notes TEXT NULL AFTER pre_inspector_name;
