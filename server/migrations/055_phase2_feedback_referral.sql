-- ═══════════════════════════════════════════════════
-- 055: Phase 2 — Feedback & Referral System
-- ═══════════════════════════════════════════════════

-- Feedback / Reviews table
CREATE TABLE IF NOT EXISTS feedback (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id     INT UNSIGNED NOT NULL,
  job_cart_id     INT UNSIGNED NULL,
  booking_id      INT UNSIGNED NULL,
  rating          TINYINT UNSIGNED NOT NULL DEFAULT 5,
  review_text     TEXT NULL,
  service_quality TINYINT UNSIGNED NULL,
  timeliness      TINYINT UNSIGNED NULL,
  value_for_money TINYINT UNSIGNED NULL,
  is_public       TINYINT(1) NOT NULL DEFAULT 1,
  admin_reply     TEXT NULL,
  replied_at      TIMESTAMP NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer (customer_id),
  INDEX idx_rating (rating),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Referral codes table
CREATE TABLE IF NOT EXISTS referral_codes (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id     INT UNSIGNED NOT NULL,
  code            VARCHAR(20) NOT NULL UNIQUE,
  reward_points   INT NOT NULL DEFAULT 100,
  max_uses        INT NOT NULL DEFAULT 10,
  current_uses    INT NOT NULL DEFAULT 0,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  expires_at      TIMESTAMP NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer (customer_id),
  INDEX idx_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Referral rewards / usage
CREATE TABLE IF NOT EXISTS referral_rewards (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  referrer_id     INT UNSIGNED NOT NULL,
  referred_id     INT UNSIGNED NOT NULL,
  referral_code   VARCHAR(20) NOT NULL,
  reward_type     ENUM('points','discount','free_wash') NOT NULL DEFAULT 'points',
  reward_value    DECIMAL(10,2) NOT NULL DEFAULT 0,
  status          ENUM('pending','credited','expired') NOT NULL DEFAULT 'pending',
  credited_at     TIMESTAMP NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_referrer (referrer_id),
  INDEX idx_referred (referred_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Wallet system
CREATE TABLE IF NOT EXISTS wallets (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id     INT UNSIGNED NOT NULL UNIQUE,
  balance         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_earned    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_spent     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Wallet transactions
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  wallet_id       INT UNSIGNED NOT NULL,
  customer_id     INT UNSIGNED NOT NULL,
  amount          DECIMAL(12,2) NOT NULL,
  type            ENUM('credit','debit') NOT NULL,
  source          ENUM('referral','reward','payment','refund','admin','new_customer_bonus') NOT NULL,
  reference_id    INT UNSIGNED NULL,
  description     VARCHAR(255) NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wallet (wallet_id),
  INDEX idx_customer (customer_id),
  INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
