-- ============================================================
-- BeneFi CRM — Production Migration
-- Run in phpMyAdmin > database u958637954_benefiSales > SQL tab
-- Safe to run: uses IF NOT EXISTS / INSERT IGNORE throughout
-- ============================================================

-- ------------------------------------------------------------
-- 0. Create enquiries table (website Early Access form leads)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enquiries (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(200)  NOT NULL,
  email        VARCHAR(254)  NOT NULL,
  company      VARCHAR(300)  NOT NULL,
  phone        VARCHAR(50),
  message      TEXT,
  ip_address   VARCHAR(45),
  source       VARCHAR(100)  DEFAULT 'website',
  status       ENUM('new','contacted','converted','closed') NOT NULL DEFAULT 'new',
  notes        TEXT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- 1. Create pricing_config table (skip if already exists)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pricing_config (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  config_key   VARCHAR(100) NOT NULL UNIQUE,
  config_value TEXT         NOT NULL,
  label        VARCHAR(200),
  updated_by   INT UNSIGNED NULL,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- 2. Seed all pricing config rows (skip duplicates)
-- ------------------------------------------------------------
INSERT IGNORE INTO pricing_config (config_key, config_value, label) VALUES
  ('list_price',                '299', 'List Price (₱/user/month)'),
  ('fin_tool_fee',              '99',  'Financial Tool Fee (₱/user/month)'),
  ('max_discount_pct',          '80',  'Maximum Discount Ceiling — Bundled (%)'),
  ('max_discount_hris_pct',     '50',  'Maximum Discount Ceiling — HRIS Only (%)'),
  ('vol_slab_100',              '25',  'Volume Discount: 100+ HC (%)'),
  ('vol_slab_250',              '30',  'Volume Discount: 250+ HC (%)'),
  ('vol_slab_500',              '35',  'Volume Discount: 500+ HC (%)'),
  ('vol_slab_1000',             '40',  'Volume Discount: 1000+ HC (%)'),
  ('early_rank_1_25',           '20',  'Early Access Rank 1–25 (%)'),
  ('early_rank_26_100',         '10',  'Early Access Rank 26–100 (%)'),
  ('qualifier_discount_each',   '5',   'Per-Qualifier Discount (%)'),
  ('fast_decision_discount',    '10',  'Fast-Decision Bonus (%)'),
  ('fin_tool_waiver_clients',   '100', 'Fin Tool Waiver: First N Clients'),
  ('fast_decision_days',        '30',  'Fast-Decision Window (days)'),
  ('payment_quarterly_discount','3',   'Payment Discount: Quarterly (%)'),
  ('payment_biyearly_discount', '5',   'Payment Discount: Semi-Annual (%)'),
  ('payment_yearly_discount',   '8',   'Payment Discount: Annual (%)');

-- ------------------------------------------------------------
-- 3. Add new columns to deals (run each line separately if any
--    fail with "Duplicate column" — that just means it exists)
-- ------------------------------------------------------------
ALTER TABLE deals ADD COLUMN pricing_per_user   DECIMAL(10,2)  NULL;
ALTER TABLE deals ADD COLUMN trial_start_date   DATE           NULL;
ALTER TABLE deals ADD COLUMN trial_end_date     DATE           NULL;
ALTER TABLE deals ADD COLUMN lost_reason        VARCHAR(300)   NULL;
ALTER TABLE deals ADD COLUMN commercial_notes   TEXT           NULL;
ALTER TABLE deals ADD COLUMN go_live_date       DATE           NULL;
ALTER TABLE deals ADD COLUMN payment_terms      ENUM('monthly','quarterly','biyearly','yearly') NULL;
ALTER TABLE deals ADD COLUMN product_plan       VARCHAR(300)   NULL;

-- ------------------------------------------------------------
-- 4. Add Trial pipeline stage if it doesn't already exist
-- ------------------------------------------------------------
INSERT INTO pipeline_stages (name, display_order, probability, color, is_won, is_lost)
SELECT 'Trial', 5, 85, '#8B5CF6', 0, 0
WHERE NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE name = 'Trial');
