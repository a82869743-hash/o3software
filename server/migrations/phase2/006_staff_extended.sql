-- ═══════════════════════════════════════════════════
-- Phase 2 v2: 006 — Staff Extended (Attendance, Leave, Payroll, Tasks)
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS v2_attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT UNSIGNED NOT NULL,
  date DATE NOT NULL,
  check_in TIME DEFAULT NULL,
  check_out TIME DEFAULT NULL,
  status ENUM('present','absent','half_day','leave','holiday') DEFAULT 'present',
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES users(id),
  UNIQUE KEY unique_staff_date (staff_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS v2_leaves (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT UNSIGNED NOT NULL,
  leave_type ENUM('casual','sick','earned','unpaid') NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  days_count INT NOT NULL DEFAULT 1,
  reason TEXT DEFAULT NULL,
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  approved_by INT DEFAULT NULL,
  approved_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_staff (staff_id),
  INDEX idx_status (status),
  FOREIGN KEY (staff_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS v2_payroll (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT UNSIGNED NOT NULL,
  month INT NOT NULL,
  year INT NOT NULL,
  base_salary DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  present_days INT DEFAULT 0,
  absent_days INT DEFAULT 0,
  leave_days INT DEFAULT 0,
  overtime_hours DECIMAL(5,2) DEFAULT 0.00,
  overtime_pay DECIMAL(10,2) DEFAULT 0.00,
  deductions DECIMAL(10,2) DEFAULT 0.00,
  bonuses DECIMAL(10,2) DEFAULT 0.00,
  net_salary DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  payment_status ENUM('pending','paid') DEFAULT 'pending',
  paid_at TIMESTAMP NULL DEFAULT NULL,
  payment_mode ENUM('cash','bank_transfer','upi') DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES users(id),
  UNIQUE KEY unique_staff_payroll (staff_id, month, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS v2_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,
  assigned_to INT UNSIGNED NOT NULL,
  assigned_by INT UNSIGNED NOT NULL,
  job_cart_id INT DEFAULT NULL,
  priority ENUM('low','medium','high','urgent') DEFAULT 'medium',
  status ENUM('pending','in_progress','completed','cancelled') DEFAULT 'pending',
  due_date DATE DEFAULT NULL,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_assigned (assigned_to),
  INDEX idx_status (status),
  FOREIGN KEY (assigned_to) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
