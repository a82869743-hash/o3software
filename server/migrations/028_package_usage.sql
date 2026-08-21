-- ═══════════════════════════════════════════════════════════
-- TASK 1b: Create package_usage table
-- Tracks how many times each service has been used within
-- a customer's assigned package.
-- used_count starts at 0 and increments on each booking.
-- total_count is looked up from package_services at query time.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS package_usage (
  id               INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  user_package_id  INT UNSIGNED  NOT NULL,
  service_name     VARCHAR(150)  NOT NULL,
  used_count       INT UNSIGNED  NOT NULL DEFAULT 0,
  created_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_package_id) REFERENCES user_packages(id) ON DELETE CASCADE,
  INDEX idx_user_pkg (user_package_id),
  UNIQUE KEY uq_pkg_service (user_package_id, service_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
