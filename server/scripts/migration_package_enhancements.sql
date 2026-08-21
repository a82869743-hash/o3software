-- ═══════════════════════════════════════════════════════════
-- MIGRATION: Package Approval & Booking Enhancements
-- Date: 2026-05-23
-- ═══════════════════════════════════════════════════════════

-- 1. Add rejection_reason to package_requests
ALTER TABLE package_requests
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL AFTER status;

-- 2. Ensure status column supports 'rejected' (safe ALTER)
-- If your status column is already ENUM, update it:
ALTER TABLE package_requests
  MODIFY COLUMN status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending';

-- 3. Add booking_type and user_package_id to bookings (for deferred deduction tracking)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS booking_type ENUM('direct', 'package') DEFAULT 'direct' AFTER notes;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS user_package_id INT DEFAULT NULL AFTER booking_type;

-- 4. Index for faster package booking lookups
CREATE INDEX IF NOT EXISTS idx_bookings_user_package ON bookings (user_package_id);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_type ON bookings (booking_type);
