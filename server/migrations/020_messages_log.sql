CREATE TABLE IF NOT EXISTS messages_log (
  id               INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  customer_id      INT UNSIGNED  NULL,
  mobile           VARCHAR(15)   NOT NULL,
  type             ENUM('job_complete','credits_awarded','wash_awarded','booking_confirm','delivery_started','monthly_reminder','bulk_free_wash','bulk_credits','bulk_reengagement') NOT NULL,
  channel          ENUM('whatsapp','sms') NOT NULL,
  status           ENUM('sent','failed','queued') NOT NULL DEFAULT 'queued',
  message_preview  TEXT          NULL,
  sent_at          TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer_id (customer_id),
  INDEX idx_status (status),
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
