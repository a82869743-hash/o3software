-- Migration 060: Add Wash Phase Columns for Quick Wash Tracking
ALTER TABLE bookings ADD COLUMN current_phase VARCHAR(30) DEFAULT 'pre_wash';
ALTER TABLE bookings ADD COLUMN phase_updated_at TIMESTAMP NULL DEFAULT NULL;
