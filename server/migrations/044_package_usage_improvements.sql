-- ═══════════════════════════════════════════════════════════
-- PHASE 2: Package Usage Improvements
-- Adds usage_status (reserved/consumed/cancelled),
-- booking_id, job_card_id for proper deduction tracking.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE package_usage
  ADD COLUMN usage_status ENUM('available','reserved','consumed','cancelled') NOT NULL DEFAULT 'available'
    COMMENT 'Tracks the lifecycle of each service usage slot',
  ADD COLUMN booking_id INT UNSIGNED NULL DEFAULT NULL
    COMMENT 'Booking that reserved/consumed this usage',
  ADD COLUMN job_card_id INT UNSIGNED NULL DEFAULT NULL
    COMMENT 'Job card that confirmed consumption',
  ADD COLUMN reserved_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN consumed_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN cancelled_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Index for fast booking lookups
ALTER TABLE package_usage
  ADD INDEX idx_booking_id (booking_id),
  ADD INDEX idx_job_card_id (job_card_id),
  ADD INDEX idx_usage_status (usage_status);
