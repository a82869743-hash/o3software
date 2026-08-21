-- ============================================================
-- 057: Phase 3 — Service Update Window, Customer Rewards,
--      File Sharing, WhatsApp Logs, RBAC Expansion
-- ============================================================

-- ─── Service Update Window ──────────────────────────────────
-- Track when a service was last edited and who can override
ALTER TABLE `job_services` ADD COLUMN `last_edited_at` TIMESTAMP NULL;
ALTER TABLE `job_services` ADD COLUMN `edit_locked` TINYINT(1) DEFAULT 0;
ALTER TABLE `job_services` ADD COLUMN `lock_reason` VARCHAR(255) DEFAULT NULL;

-- Add registration_year to vehicles for car age tracking
ALTER TABLE `vehicles` ADD COLUMN `registration_year` INT DEFAULT NULL;

-- ─── Customer Rewards (Welcome + First-Service) ─────────────
CREATE TABLE IF NOT EXISTS customer_rewards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  reward_type ENUM('welcome', 'first_service', 'birthday', 'referral_bonus', 'loyalty_milestone') NOT NULL,
  points_awarded INT NOT NULL DEFAULT 0,
  discount_pct DECIMAL(5,2) DEFAULT NULL,
  description VARCHAR(255),
  redeemed TINYINT(1) DEFAULT 0,
  redeemed_at TIMESTAMP NULL,
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer (customer_id),
  INDEX idx_type (reward_type)
);

-- ─── File Sharing System ────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uploaded_by INT NOT NULL,
  entity_type ENUM('job_cart', 'invoice', 'delivery', 'general') DEFAULT 'general',
  entity_id INT DEFAULT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(512) NOT NULL,
  file_type VARCHAR(50),
  file_size INT,
  shared_with_customer TINYINT(1) DEFAULT 0,
  share_token VARCHAR(64) DEFAULT NULL,
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_token (share_token)
);

-- ─── WhatsApp Message Log ───────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT,
  phone VARCHAR(20) NOT NULL,
  template_name VARCHAR(100),
  message_type ENUM('manual', 'auto_booking', 'auto_payment', 'auto_expiry', 'auto_service_complete', 'auto_delivery') DEFAULT 'manual',
  message_body TEXT,
  status ENUM('pending', 'sent', 'delivered', 'read', 'failed') DEFAULT 'pending',
  provider_message_id VARCHAR(100),
  error_message TEXT,
  sent_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer (customer_id),
  INDEX idx_status (status),
  INDEX idx_type (message_type)
);

-- ─── RBAC Expansion ─────────────────────────────────────────
-- Add sub-role / permission field to users
ALTER TABLE `users` ADD COLUMN `sub_role` ENUM('super_admin','admin','manager','billing','inventory_clerk','staff','customer') DEFAULT NULL;
ALTER TABLE `users` ADD COLUMN `permissions` JSON DEFAULT NULL;
