-- ═══════════════════════════════════════════════════
-- Phase 2 v2: 010 — Feedback & Reviews
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS v2_feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  booking_id INT DEFAULT NULL,
  job_cart_id INT DEFAULT NULL,
  overall_rating INT NOT NULL,
  service_rating INT DEFAULT NULL,
  staff_rating INT DEFAULT NULL,
  cleanliness_rating INT DEFAULT NULL,
  comments TEXT DEFAULT NULL,
  is_public BOOLEAN DEFAULT FALSE,
  admin_reply TEXT DEFAULT NULL,
  admin_replied_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customer (customer_id),
  INDEX idx_rating (overall_rating),
  FOREIGN KEY (customer_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS v2_review_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  booking_id INT DEFAULT NULL,
  job_cart_id INT DEFAULT NULL,
  sent_via ENUM('whatsapp','sms','email') NOT NULL DEFAULT 'whatsapp',
  status ENUM('sent','responded','failed') DEFAULT 'sent',
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customer (customer_id),
  FOREIGN KEY (customer_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
