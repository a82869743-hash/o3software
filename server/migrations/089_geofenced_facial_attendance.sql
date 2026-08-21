-- ═══════════════════════════════════════════════════════════
-- MIGRATION 089: Geofenced Facial Attendance Management
-- ═══════════════════════════════════════════════════════════

ALTER TABLE staff_attendance ADD COLUMN face_photo_url VARCHAR(255) NULL AFTER status;
ALTER TABLE staff_attendance ADD COLUMN latitude DECIMAL(10,8) NULL AFTER face_photo_url;
ALTER TABLE staff_attendance ADD COLUMN longitude DECIMAL(11,8) NULL AFTER latitude;
ALTER TABLE staff_attendance ADD COLUMN is_geofenced_valid TINYINT(1) NOT NULL DEFAULT 1 AFTER longitude;
