-- ═══════════════════════════════════════════════════════════
-- MIGRATION 086: Package Service Schedules & Reminders
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS package_service_schedules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_package_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  service_name VARCHAR(150) NOT NULL,
  instance_number INT UNSIGNED NOT NULL DEFAULT 1,
  scheduled_date DATE NOT NULL,
  status ENUM('pending', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  completed_at DATETIME NULL,
  reminder_1m_sent TINYINT(1) NOT NULL DEFAULT 0,
  reminder_1w_sent TINYINT(1) NOT NULL DEFAULT 0,
  reminder_1d_sent TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_package_id) REFERENCES user_packages(id) ON DELETE CASCADE,
  INDEX idx_up_sched (user_package_id),
  INDEX idx_user_sched (user_id),
  INDEX idx_sched_date (scheduled_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
