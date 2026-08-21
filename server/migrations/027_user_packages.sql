-- ═══════════════════════════════════════════════════════════
-- TASK 1a: Create user_packages table
-- Tracks which package is assigned to which customer.
-- end_date is nullable — NULL means "no expiry" (active indefinitely).
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_packages (
  id          INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED  NOT NULL,
  package_id  INT UNSIGNED  NOT NULL,
  start_date  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  end_date    TIMESTAMP     NULL DEFAULT NULL,
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_package_id (package_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
