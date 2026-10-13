-- ═══════════════════════════════════════════════════════════════════
-- Migration 102: Production Composite Indexes & Performance Integrity
-- ═══════════════════════════════════════════════════════════════════
-- Rollback Instructions:
--   ALTER TABLE job_carts DROP INDEX idx_jc_franchise_status_created;
--   ALTER TABLE bookings DROP INDEX idx_bookings_franchise_status_created;
--   ALTER TABLE payments DROP INDEX idx_payments_franchise_paid_status;
--   ALTER TABLE v2_payments DROP INDEX idx_v2_pay_status_created;
--   ALTER TABLE audit_logs DROP INDEX idx_audit_logs_user_action_time;
--   ALTER TABLE v2_audit_logs DROP INDEX idx_v2_audit_franchise_created;
--   ALTER TABLE v2_audit_logs DROP INDEX idx_v2_audit_user_action;
-- ═══════════════════════════════════════════════════════════════════

SET @dbname = DATABASE();

-- 1. Index on job_carts (franchise_id, status, created_at)
SET @tablename = 'job_carts';
SET @idxname = 'idx_jc_franchise_status_created';
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND INDEX_NAME = @idxname) > 0,
  'SELECT 1',
  'CREATE INDEX idx_jc_franchise_status_created ON job_carts (franchise_id, status, created_at)'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Index on bookings (franchise_id, status, created_at)
SET @tablename = 'bookings';
SET @idxname = 'idx_bookings_franchise_status_created';
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND INDEX_NAME = @idxname) > 0,
  'SELECT 1',
  'CREATE INDEX idx_bookings_franchise_status_created ON bookings (franchise_id, status, created_at)'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Index on payments (franchise_id, payment_status, paid_at)
SET @tablename = 'payments';
SET @idxname = 'idx_payments_franchise_paid_status';
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND INDEX_NAME = @idxname) > 0,
  'SELECT 1',
  'CREATE INDEX idx_payments_franchise_paid_status ON payments (franchise_id, payment_status, paid_at)'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Index on v2_payments (status, created_at)
SET @tablename = 'v2_payments';
SET @idxname = 'idx_v2_pay_status_created';
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND INDEX_NAME = @idxname) > 0,
  'SELECT 1',
  'CREATE INDEX idx_v2_pay_status_created ON v2_payments (status, created_at)'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. Index on audit_logs (changed_by, action, created_at)
SET @tablename = 'audit_logs';
SET @idxname = 'idx_audit_logs_user_action_time';
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND INDEX_NAME = @idxname) > 0,
  'SELECT 1',
  'CREATE INDEX idx_audit_logs_user_action_time ON audit_logs (changed_by, action, created_at)'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6. Index on v2_audit_logs (franchise_id, created_at)
SET @tablename = 'v2_audit_logs';
SET @idxname = 'idx_v2_audit_franchise_created';
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND INDEX_NAME = @idxname) > 0,
  'SELECT 1',
  'CREATE INDEX idx_v2_audit_franchise_created ON v2_audit_logs (franchise_id, created_at)'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 7. Index on v2_audit_logs (user_id, action)
SET @tablename = 'v2_audit_logs';
SET @idxname = 'idx_v2_audit_user_action';
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND INDEX_NAME = @idxname) > 0,
  'SELECT 1',
  'CREATE INDEX idx_v2_audit_user_action ON v2_audit_logs (user_id, action)'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
