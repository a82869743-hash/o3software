-- ═══════════════════════════════════════════════════
-- Phase 2 v2: 002 — Wallets & Rewards
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS v2_wallets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL UNIQUE,
  balance DECIMAL(10,2) DEFAULT 0.00,
  reward_points INT DEFAULT 0,
  total_earned DECIMAL(10,2) DEFAULT 0.00,
  total_spent DECIMAL(10,2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS v2_wallet_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  wallet_id INT NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  transaction_type ENUM('credit','debit','reward_earned','reward_redeemed','refund','referral_bonus','welcome_bonus') NOT NULL,
  amount DECIMAL(10,2) DEFAULT 0.00,
  points INT DEFAULT 0,
  description TEXT DEFAULT NULL,
  reference_type ENUM('booking','package','payment','manual','referral','system') DEFAULT NULL,
  reference_id INT DEFAULT NULL,
  balance_after DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wallet (wallet_id),
  INDEX idx_customer (customer_id),
  INDEX idx_type (transaction_type),
  FOREIGN KEY (wallet_id) REFERENCES v2_wallets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS v2_reward_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  points INT NOT NULL,
  action ENUM('earn','redeem','expire','adjust','welcome','referral') NOT NULL,
  description TEXT DEFAULT NULL,
  expiry_date DATE DEFAULT NULL,
  is_expired BOOLEAN DEFAULT FALSE,
  reference_type VARCHAR(50) DEFAULT NULL,
  reference_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customer (customer_id),
  INDEX idx_expiry (expiry_date, is_expired),
  FOREIGN KEY (customer_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS v2_referrals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  referrer_id INT UNSIGNED NOT NULL,
  referred_id INT UNSIGNED NOT NULL,
  referral_code VARCHAR(20) NOT NULL,
  status ENUM('pending','completed','rewarded') DEFAULT 'pending',
  reward_given BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_referrer (referrer_id),
  INDEX idx_code (referral_code),
  FOREIGN KEY (referrer_id) REFERENCES users(id),
  FOREIGN KEY (referred_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
