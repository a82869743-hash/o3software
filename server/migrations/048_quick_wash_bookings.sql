-- ═══════════════════════════════════════════════════════════
-- PHASE 2: Quick Wash Bookings
-- Lightweight booking system for walk-in wash services
-- without requiring full job card workflow.
-- Uses job_type field on bookings rather than separate table.
-- ═══════════════════════════════════════════════════════════

-- Add quick wash fields to bookings
ALTER TABLE bookings
  ADD COLUMN job_type ENUM('standard','quick_wash') NOT NULL DEFAULT 'standard'
    COMMENT 'standard = normal booking, quick_wash = walk-in wash',
  ADD COLUMN wash_status ENUM('pending','washing','completed','delivered') NULL DEFAULT NULL
    COMMENT 'Quick wash specific status tracking',
  ADD COLUMN queue_position INT NULL DEFAULT NULL
    COMMENT 'Position in wash queue',
  ADD COLUMN started_at TIMESTAMP NULL DEFAULT NULL
    COMMENT 'When wash actually started',
  ADD COLUMN completed_at TIMESTAMP NULL DEFAULT NULL
    COMMENT 'When wash was completed',
  ADD COLUMN delivered_at TIMESTAMP NULL DEFAULT NULL
    COMMENT 'When vehicle was handed back';

-- Index for quick wash queue queries
ALTER TABLE bookings
  ADD INDEX idx_job_type (job_type),
  ADD INDEX idx_wash_status (wash_status);
