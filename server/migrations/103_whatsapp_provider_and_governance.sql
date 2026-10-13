-- ═══════════════════════════════════════════════════════════════════
-- Migration 103: WhatsApp Provider Architecture, Governance & Cost Logs
-- ═══════════════════════════════════════════════════════════════════
-- Rollback Instructions:
--   DROP TABLE IF EXISTS franchise_whatsapp_settings;
--   DROP TABLE IF EXISTS whatsapp_opt_outs;
--   DROP TABLE IF EXISTS whatsapp_opt_ins;
--   DROP TABLE IF EXISTS whatsapp_usage_logs;
--   DROP TABLE IF EXISTS whatsapp_conversations;
--   ALTER TABLE v2_whatsapp_templates 
--     DROP COLUMN category,
--     DROP COLUMN meta_status,
--     DROP COLUMN meta_template_id,
--     DROP COLUMN language_code,
--     DROP COLUMN components_json;
-- ═══════════════════════════════════════════════════════════════════

SET @dbname = DATABASE();

-- 1. Create franchise_whatsapp_settings table
CREATE TABLE IF NOT EXISTS franchise_whatsapp_settings (
  franchise_id INT PRIMARY KEY,
  provider ENUM('meta_cloud', 'aisensy', 'baileys_demo', 'mock') NOT NULL DEFAULT 'meta_cloud',
  phone_number VARCHAR(20) NULL,
  phone_number_id VARCHAR(50) NULL,
  business_account_id VARCHAR(50) NULL,
  access_token_encrypted TEXT NULL,
  aisensy_api_key_encrypted TEXT NULL,
  webhook_verify_token VARCHAR(100) NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  demo_whitelist TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_fws_provider (provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Create whatsapp_opt_outs table (compliance with STOP requests)
CREATE TABLE IF NOT EXISTS whatsapp_opt_outs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL UNIQUE,
  franchise_id INT DEFAULT 1,
  reason VARCHAR(100) DEFAULT 'STOP keyword',
  opt_out_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_optout_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create whatsapp_opt_ins table (consent capture)
CREATE TABLE IF NOT EXISTS whatsapp_opt_ins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  franchise_id INT DEFAULT 1,
  source VARCHAR(50) DEFAULT 'job_card_booking',
  ip_address VARCHAR(50) NULL,
  opt_in_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_optin_franchise_phone (franchise_id, phone),
  INDEX idx_optin_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Create whatsapp_usage_logs table (per-franchise usage and cost counters)
CREATE TABLE IF NOT EXISTS whatsapp_usage_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  franchise_id INT NOT NULL,
  message_id VARCHAR(100) NULL,
  recipient_phone VARCHAR(20) NOT NULL,
  provider VARCHAR(30) NOT NULL,
  category ENUM('marketing', 'utility', 'authentication', 'service') NOT NULL DEFAULT 'utility',
  direction ENUM('inbound', 'outbound') NOT NULL DEFAULT 'outbound',
  estimated_cost DECIMAL(10, 4) DEFAULT 0.0000,
  status ENUM('queued', 'sent', 'delivered', 'read', 'failed') DEFAULT 'sent',
  error_message TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wul_franchise_cat (franchise_id, category, created_at),
  INDEX idx_wul_msgid (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Create whatsapp_conversations table (24-hour service window & AI Leads Agent state)
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  franchise_id INT NOT NULL,
  customer_id INT NULL,
  phone VARCHAR(20) NOT NULL,
  customer_name VARCHAR(100) NULL,
  last_customer_message_at TIMESTAMP NULL,
  window_expires_at TIMESTAMP NULL,
  last_message_text TEXT NULL,
  status ENUM('active', 'expired', 'closed') DEFAULT 'active',
  agent_mode ENUM('ai', 'human') DEFAULT 'ai',
  unread_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_conv_franchise_phone (franchise_id, phone),
  INDEX idx_conv_window (window_expires_at),
  INDEX idx_conv_status (franchise_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Add template governance columns to v2_whatsapp_templates
SET @tablename = 'v2_whatsapp_templates';

SET @col = 'category';
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0, 'SELECT 1',
  'ALTER TABLE v2_whatsapp_templates ADD COLUMN category ENUM(\'MARKETING\', \'UTILITY\', \'AUTHENTICATION\') NOT NULL DEFAULT \'UTILITY\' AFTER event_trigger'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = 'meta_status';
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0, 'SELECT 1',
  'ALTER TABLE v2_whatsapp_templates ADD COLUMN meta_status ENUM(\'APPROVED\', \'PENDING\', \'REJECTED\', \'PAUSED\') NOT NULL DEFAULT \'APPROVED\' AFTER category'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = 'meta_template_id';
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0, 'SELECT 1',
  'ALTER TABLE v2_whatsapp_templates ADD COLUMN meta_template_id VARCHAR(100) NULL AFTER meta_status'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = 'language_code';
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0, 'SELECT 1',
  'ALTER TABLE v2_whatsapp_templates ADD COLUMN language_code VARCHAR(10) NOT NULL DEFAULT \'en\' AFTER meta_template_id'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = 'components_json';
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0, 'SELECT 1',
  'ALTER TABLE v2_whatsapp_templates ADD COLUMN components_json JSON NULL AFTER variables'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 7. Seed default franchise_whatsapp_settings for existing franchises
INSERT INTO franchise_whatsapp_settings (franchise_id, provider, is_enabled, demo_whitelist)
SELECT id, 'meta_cloud', 1, '919876543210' FROM franchises
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;
