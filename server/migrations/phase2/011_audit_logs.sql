-- ═══════════════════════════════════════════════════
-- Phase 2 v2: 011 — Audit Logs
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS v2_audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT DEFAULT NULL,
  user_type ENUM('admin','staff','customer') DEFAULT NULL,
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(100) NOT NULL,
  resource_id INT DEFAULT NULL,
  old_value JSON DEFAULT NULL,
  new_value JSON DEFAULT NULL,
  ip_address VARCHAR(50) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_resource (resource),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
