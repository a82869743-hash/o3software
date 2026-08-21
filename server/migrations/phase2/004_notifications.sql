-- ═══════════════════════════════════════════════════
-- Phase 2 v2: 004 — Notification System
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS v2_whatsapp_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  template_name VARCHAR(100) NOT NULL UNIQUE,
  event_trigger VARCHAR(100) NOT NULL,
  message_body TEXT NOT NULL,
  variables JSON DEFAULT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_trigger (event_trigger)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS v2_notification_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT DEFAULT NULL,
  mobile VARCHAR(15) NOT NULL,
  channel ENUM('whatsapp','sms','both') NOT NULL DEFAULT 'whatsapp',
  template_name VARCHAR(100) DEFAULT NULL,
  message_body TEXT NOT NULL,
  status ENUM('sent','failed','pending','retry') DEFAULT 'pending',
  attempts INT DEFAULT 0,
  last_attempt_at TIMESTAMP NULL DEFAULT NULL,
  response_data JSON DEFAULT NULL,
  reference_type VARCHAR(50) DEFAULT NULL,
  reference_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_customer (customer_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default templates
INSERT IGNORE INTO v2_whatsapp_templates (template_name, event_trigger, message_body, variables) VALUES
('Booking Confirmed', 'BOOKING_CONFIRMED', 'Dear {{customer_name}}, your booking on {{booking_date}} for {{service_name}} has been confirmed! Booking ID: {{booking_id}}. Thank you for choosing O3 Car Spa!', '["customer_name","booking_date","service_name","booking_id"]'),
('Service Started', 'SERVICE_STARTED', 'Dear {{customer_name}}, work on your vehicle {{vehicle_number}} has started! Estimated completion: {{estimated_time}}. We will notify you once done.', '["customer_name","vehicle_number","estimated_time"]'),
('Service Completed', 'SERVICE_COMPLETED', 'Dear {{customer_name}}, your vehicle {{vehicle_number}} service is complete! Job Card: {{job_cart_id}}. Visit O3 Car Spa to collect your vehicle.', '["customer_name","vehicle_number","job_cart_id"]'),
('Invoice Generated', 'INVOICE_GENERATED', 'Dear {{customer_name}}, your invoice {{invoice_number}} of Rs.{{amount}} has been generated. View: {{invoice_url}}. Thank you! - O3 Car Spa', '["customer_name","invoice_number","amount","invoice_url"]'),
('Delivery Ready', 'DELIVERY_READY', 'Dear {{customer_name}}, your vehicle {{vehicle_number}} is ready for pickup at {{location}}! Thank you for choosing O3 Car Spa.', '["customer_name","vehicle_number","location"]'),
('Payment Reminder', 'PAYMENT_REMINDER', 'Dear {{customer_name}}, a friendly reminder for your pending payment of Rs.{{amount_due}} (Invoice: {{invoice_number}}). Due: {{due_date}}. Thank you! - O3 Car Spa', '["customer_name","invoice_number","amount_due","due_date"]'),
('Package Expiry Reminder', 'PACKAGE_EXPIRY_REMINDER', 'Dear {{customer_name}}, your package {{package_name}} is expiring on {{expiry_date}}. Renew now: {{renewal_url}}. - O3 Car Spa', '["customer_name","package_name","expiry_date","renewal_url"]'),
('Package Approved', 'PACKAGE_APPROVED', 'Dear {{customer_name}}, your {{package_name}} package has been approved! Valid: {{valid_from}} to {{valid_till}}. Enjoy premium services! - O3 Car Spa', '["customer_name","package_name","valid_from","valid_till"]'),
('Package Rejected', 'PACKAGE_REJECTED', 'Dear {{customer_name}}, unfortunately your {{package_name}} request was not approved. Reason: {{rejection_reason}}. Contact us for help. - O3 Car Spa', '["customer_name","package_name","rejection_reason"]'),
('Welcome Message', 'WELCOME_MESSAGE', 'Welcome to O3 Car Spa, {{customer_name}}! Your referral code is {{referral_code}}. Share it with friends and earn rewards! - O3 Car Spa', '["customer_name","referral_code"]');
