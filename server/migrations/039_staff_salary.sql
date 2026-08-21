-- ═══════════════════════════════════════════════════════════
-- Migration 039: Staff Salary
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS staff_salary (
  id             INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
  staff_id       INT UNSIGNED   NOT NULL,
  month_year     VARCHAR(10)    NOT NULL, -- e.g., '2023-10'
  base_salary    DECIMAL(10,2)  NOT NULL DEFAULT 0,
  bonus          DECIMAL(10,2)  NOT NULL DEFAULT 0,
  deductions     DECIMAL(10,2)  NOT NULL DEFAULT 0,
  final_salary   DECIMAL(10,2)  NOT NULL DEFAULT 0,
  status         ENUM('pending', 'paid') NOT NULL DEFAULT 'pending',
  notes          TEXT           NULL,
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_staff_month (staff_id, month_year),
  FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
