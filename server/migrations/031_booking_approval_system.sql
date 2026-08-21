-- ═══════════════════════════════════════════════════════════
-- Migration 031: Booking Approval System
--
-- 1. Expands booking status ENUM to include pending_approval, expired
-- 2. Adds vehicle_id FK for proper vehicle linking
-- 3. Adds booking_notes for admin approval/rejection notes
-- 4. Adds expires_at for 5-min auto-expiry on pending bookings
-- 5. Adds approved_by / approved_at audit columns
--
-- ⚠️  ADDITIVE ONLY — no data deleted, existing rows unaffected
-- ═══════════════════════════════════════════════════════════

-- Step 1: Expand status ENUM
ALTER TABLE bookings
  MODIFY COLUMN status ENUM('pending_approval','confirmed','cancelled','completed','expired','rejected','pending_payment')
    NOT NULL DEFAULT 'pending_approval';

-- Step 2: Add vehicle_id FK (nullable — existing bookings don't have it)
ALTER TABLE bookings
  ADD COLUMN vehicle_id INT UNSIGNED NULL AFTER customer_id,
  ADD INDEX idx_vehicle_id (vehicle_id),
  ADD CONSTRAINT fk_bookings_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;

-- Step 3: Add approval workflow columns
ALTER TABLE bookings
  ADD COLUMN booking_notes TEXT NULL AFTER notes,
  ADD COLUMN expires_at TIMESTAMP NULL AFTER booking_notes,
  ADD COLUMN approved_by INT UNSIGNED NULL AFTER expires_at,
  ADD COLUMN approved_at TIMESTAMP NULL AFTER approved_by,
  ADD INDEX idx_expires_at (expires_at);
