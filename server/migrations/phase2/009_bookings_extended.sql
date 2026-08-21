-- ═══════════════════════════════════════════════════
-- Phase 2 v2: 009 — Bookings Extended
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS v2_pickup_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  address TEXT NOT NULL,
  scheduled_time DATETIME DEFAULT NULL,
  assigned_staff_id INT DEFAULT NULL,
  status ENUM('pending','assigned','picked_up','cancelled') DEFAULT 'pending',
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_booking (booking_id),
  INDEX idx_status (status),
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS v2_blocked_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  blocked_date DATE NOT NULL,
  slot_time TIME DEFAULT NULL,
  reason TEXT DEFAULT NULL,
  blocked_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_date (blocked_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
