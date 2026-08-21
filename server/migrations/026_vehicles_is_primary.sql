-- ═══════════════════════════════════════════════════════════
-- TASK 2: Add is_primary column to vehicles table
-- ═══════════════════════════════════════════════════════════

ALTER TABLE vehicles ADD COLUMN is_primary BOOLEAN DEFAULT 1;
