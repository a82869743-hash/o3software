-- ═══════════════════════════════════════════════════════════
-- Migration 038: Inventory Images
--
-- Adds images_json to inventory table
-- ═══════════════════════════════════════════════════════════

ALTER TABLE inventory
  ADD COLUMN images_json JSON NULL AFTER is_deleted;
