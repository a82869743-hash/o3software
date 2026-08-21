CREATE TABLE IF NOT EXISTS slots (
  id           INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  slot_date    DATE          NOT NULL,
  start_time   TIME          NOT NULL,
  end_time     TIME          NOT NULL,
  max_capacity INT UNSIGNED  NOT NULL DEFAULT 1,
  booked_count INT UNSIGNED  NOT NULL DEFAULT 0,
  is_blocked   TINYINT(1)    NOT NULL DEFAULT 0,
  created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_slot_date (slot_date),
  UNIQUE KEY uq_date_time (slot_date, start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
