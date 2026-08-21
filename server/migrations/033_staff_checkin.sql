-- ═══════════════════════════════════════════════════════════
-- Migration 033: Staff Check-in/Check-out
--
-- Adds time-based tracking to existing staff_attendance table
-- ⚠️  ADDITIVE ONLY — existing data unaffected
-- ═══════════════════════════════════════════════════════════

ALTER TABLE staff_attendance
  ADD COLUMN check_in_time TIMESTAMP NULL,
  ADD COLUMN check_out_time TIMESTAMP NULL;
