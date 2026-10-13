-- ═══════════════════════════════════════════════════════════════════
-- Migration 101: Comprehensive Access Model, Entitlements & Security
-- ═══════════════════════════════════════════════════════════════════

-- 1. Create franchise_entitlements table
CREATE TABLE IF NOT EXISTS franchise_entitlements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  franchise_id INT NOT NULL,
  feature_key VARCHAR(100) NOT NULL,
  actions_json JSON NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_franchise_feature (franchise_id, feature_key),
  INDEX idx_fe_lookup (franchise_id, is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Add plan_tier, is_deleted, deleted_at to franchises
SET @dbname = DATABASE();
SET @tablename = 'franchises';

SET @col = 'plan_tier';
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0, 'SELECT 1',
  'ALTER TABLE franchises ADD COLUMN plan_tier ENUM(\'basic\', \'pro\', \'enterprise\', \'custom\') NOT NULL DEFAULT \'pro\' AFTER is_active'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = 'is_deleted';
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0, 'SELECT 1',
  'ALTER TABLE franchises ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER plan_tier'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = 'deleted_at';
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0, 'SELECT 1',
  'ALTER TABLE franchises ADD COLUMN deleted_at TIMESTAMP NULL AFTER is_deleted'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Add token_version, must_change_password, failed_login_attempts, locked_until to users
SET @tablename = 'users';

SET @col = 'token_version';
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0, 'SELECT 1',
  'ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 1 AFTER is_active'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = 'must_change_password';
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0, 'SELECT 1',
  'ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER token_version'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = 'failed_login_attempts';
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0, 'SELECT 1',
  'ALTER TABLE users ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0 AFTER must_change_password'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = 'locked_until';
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0, 'SELECT 1',
  'ALTER TABLE users ADD COLUMN locked_until TIMESTAMP NULL AFTER failed_login_attempts'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = 'is_deleted';
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0, 'SELECT 1',
  'ALTER TABLE users ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER locked_until'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = 'deleted_at';
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0, 'SELECT 1',
  'ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP NULL AFTER is_deleted'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Scope v2_roles to franchise_id
SET @tablename = 'v2_roles';
SET @col = 'franchise_id';
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0, 'SELECT 1',
  'ALTER TABLE v2_roles ADD COLUMN franchise_id INT NULL DEFAULT NULL AFTER is_system_role, ADD INDEX idx_v2_roles_fid (franchise_id)'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. Add franchise_id to operational tables lacking it
-- payments table
SET @tablename = 'payments';
SET @col = 'franchise_id';
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0, 'SELECT 1',
  'ALTER TABLE payments ADD COLUMN franchise_id INT NOT NULL DEFAULT 1, ADD INDEX idx_pay_fid (franchise_id)'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- buy_sell table
SET @tablename = 'buy_sell';
SET @col = 'franchise_id';
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0, 'SELECT 1',
  'ALTER TABLE buy_sell ADD COLUMN franchise_id INT NOT NULL DEFAULT 1, ADD INDEX idx_buysell_fid (franchise_id)'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- shared_files table
SET @tablename = 'shared_files';
SET @col = 'franchise_id';
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0, 'SELECT 1',
  'ALTER TABLE shared_files ADD COLUMN franchise_id INT NOT NULL DEFAULT 1, ADD INDEX idx_sharedfiles_fid (franchise_id)'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- v2_audit_logs table
SET @tablename = 'v2_audit_logs';
SET @col = 'franchise_id';
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0, 'SELECT 1',
  'ALTER TABLE v2_audit_logs ADD COLUMN franchise_id INT NULL DEFAULT 1, ADD INDEX idx_audit_fid (franchise_id)'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
