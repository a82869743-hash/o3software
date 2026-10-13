-- ============================================================================
-- Migration 104: Leads Agent, Unified WhatsApp Inbox, Knowledge Base & AI CRM
-- Applied strictly without modifying existing historical data
-- ============================================================================

-- 1. Create leads table
CREATE TABLE IF NOT EXISTS leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  franchise_id INT NOT NULL,
  customer_id INT NULL,
  phone VARCHAR(20) NOT NULL,
  name VARCHAR(100) NULL,
  vehicle_model VARCHAR(100) NULL,
  service_interest VARCHAR(100) NULL,
  timeline VARCHAR(50) NULL,
  stage ENUM('new', 'contacted', 'qualified', 'booked', 'converted', 'lost') DEFAULT 'new',
  source VARCHAR(50) DEFAULT 'whatsapp_inbound',
  last_contacted_at TIMESTAMP NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_leads_franchise_stage (franchise_id, stage),
  INDEX idx_leads_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Create lead_messages table (Unified inbox conversation trail)
CREATE TABLE IF NOT EXISTS lead_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  franchise_id INT NOT NULL,
  sender_type ENUM('customer', 'ai_agent', 'human_staff') NOT NULL,
  sender_name VARCHAR(100) NULL,
  message_text TEXT NOT NULL,
  confidence_score DECIMAL(4, 3) NULL,
  flagged_for_review TINYINT(1) DEFAULT 0,
  raw_payload JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lead_msgs_conv (conversation_id, created_at),
  INDEX idx_lead_msgs_review (franchise_id, flagged_for_review)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create franchise_knowledge_base table (Grounding source of truth for RAG)
CREATE TABLE IF NOT EXISTS franchise_knowledge_base (
  id INT AUTO_INCREMENT PRIMARY KEY,
  franchise_id INT NOT NULL,
  category ENUM('services', 'pricing', 'packages', 'faqs', 'operating_hours', 'policies', 'discounts') NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  keywords VARCHAR(255) NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_fkb_franchise_cat (franchise_id, category, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Create franchise_ai_settings table
CREATE TABLE IF NOT EXISTS franchise_ai_settings (
  franchise_id INT PRIMARY KEY,
  is_enabled TINYINT(1) DEFAULT 1,
  sandbox_mode TINYINT(1) DEFAULT 0,
  model_name VARCHAR(100) DEFAULT 'gpt-4o-mini',
  monthly_token_limit INT DEFAULT 500000,
  tokens_used_this_month INT DEFAULT 0,
  monthly_budget_cap_inr DECIMAL(10, 2) DEFAULT 2000.00,
  cost_spent_this_month_inr DECIMAL(10, 2) DEFAULT 0.00,
  human_handoff_threshold DECIMAL(3, 2) DEFAULT 0.60,
  custom_system_prompt TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Seed default AI settings and knowledge base for Franchise 1 (O3 Car Spaa)
INSERT INTO franchise_ai_settings (franchise_id, is_enabled, sandbox_mode, model_name, monthly_budget_cap_inr)
VALUES (1, 1, 0, 'gpt-4o-mini', 2000.00)
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Seed core Knowledge Base articles for O3 Car Spaa
INSERT IGNORE INTO franchise_knowledge_base (franchise_id, category, title, content, keywords) VALUES
(1, 'services', 'Paint Protection Film (PPF)', 'Garware and TPU self-healing PPF coating. 5-year and 7-year warranty options available. Protects against stone chips, scratches, and UV damage.', 'ppf, paint protection, garware, scratch protection'),
(1, 'services', 'Ceramic Coating', '9H and 10H Nano Ceramic Glass Coating with multi-layer application. Provides hydrophobic self-cleaning, mirror shine, and 3-year warranty with free annual maintenance.', 'ceramic, coating, 9h, 10h, shine, hydrophobic'),
(1, 'services', 'Deep Interior Spa & Detailing', 'Steam sanitization, leather conditioning, dashboard polish, roof upholstery dry-cleaning, and AC duct ozone deodorization. Takes approximately 3 to 4 hours.', 'interior, cleaning, wash, spa, steam, upholstery'),
(1, 'services', 'Full Exterior Spa & Polish', '3-stage compound rubbing, swirl mark removal, clay bar decontamination, and high-gloss polymer wax seal. Takes approximately 2.5 hours.', 'exterior, rubbing, polish, compound, wash, wax'),
(1, 'pricing', 'Standard Price List', 'Deep Interior Spa: Small ₹1,499 | Sedan ₹1,999 | SUV ₹2,499. Ceramic 9H (3-Year): Small ₹14,999 | Sedan ₹18,999 | SUV ₹22,999. PPF TPU Full Body: Small ₹65,000 | Sedan ₹80,000 | SUV ₹95,000.', 'price, cost, rate, charges, how much, kitna'),
(1, 'operating_hours', 'Studio Timings & Location', 'O3 Car Spaa is open Tuesday through Sunday from 9:30 AM to 8:30 PM. Closed on Mondays for routine equipment maintenance. Address: O3 Car Spaa Detailing Hub, Surat, Gujarat.', 'hours, timings, open, sunday, holiday, address, location, kahan'),
(1, 'policies', 'Discount & Negotiation Policy', 'Maximum authorized promotional discount is 10% on services above ₹2,000 with manager approval. We do not provide unauthorized custom price cuts or unverified warranty certificates.', 'discount, offer, bargain, sasta, kam karo'),
(1, 'faqs', 'Duration & Booking Policy', 'Advance slot booking is strongly recommended. Most ceramic and PPF jobs take 24 to 48 hours for proper curing. Free pickup and drop service is available within a 7 km radius.', 'time, duration, kitna time, slot, booking, pickup');
