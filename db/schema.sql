-- ============================================================
-- BeneFi Sales CRM — Complete Database Init
-- Run this in phpMyAdmin > SQL tab on database: u958637954_benefiSales
-- ============================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(200)  NOT NULL,
  email         VARCHAR(254)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  role          ENUM('admin','manager','rep') NOT NULL DEFAULT 'rep',
  avatar_color  VARCHAR(7)    NOT NULL DEFAULT '#0F766E',
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  must_reset_pw BOOLEAN       NOT NULL DEFAULT FALSE,
  last_login    DATETIME,
  created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Companies
CREATE TABLE IF NOT EXISTS companies (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name                    VARCHAR(300)  NOT NULL,
  industry                VARCHAR(150),
  website                 VARCHAR(255),
  phone                   VARCHAR(50),
  email                   VARCHAR(254),
  address                 TEXT,
  city                    VARCHAR(100),
  country                 VARCHAR(100)  DEFAULT 'Philippines',
  size_range              VARCHAR(20),
  headcount               INT UNSIGNED,
  hris_name               VARCHAR(200),
  hris_vendor             VARCHAR(200),
  hris_contract_end       DATE,
  hris_annual_cost        DECIMAL(15,2),
  hris_per_employee_monthly DECIMAL(10,2),
  owner_id                INT UNSIGNED,
  created_by              INT UNSIGNED,
  notes                   TEXT,
  created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id)   REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  first_name    VARCHAR(100)  NOT NULL,
  last_name     VARCHAR(100),
  email         VARCHAR(254),
  phone         VARCHAR(50),
  mobile        VARCHAR(50),
  job_title     VARCHAR(200),
  company_id    INT UNSIGNED,
  owner_id      INT UNSIGNED,
  created_by    INT UNSIGNED,
  linkedin_url  VARCHAR(500),
  notes         TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY (owner_id)   REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Pipeline stages
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100)  NOT NULL,
  display_order INT           NOT NULL DEFAULT 0,
  probability   INT           NOT NULL DEFAULT 0,
  color         VARCHAR(7)    NOT NULL DEFAULT '#64748B',
  is_won        BOOLEAN       NOT NULL DEFAULT FALSE,
  is_lost       BOOLEAN       NOT NULL DEFAULT FALSE
);

-- Partners
CREATE TABLE IF NOT EXISTS partners (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(300)  NOT NULL,
  type            VARCHAR(100),
  contact_person  VARCHAR(200),
  contact_email   VARCHAR(254),
  contact_phone   VARCHAR(50),
  payout_type     ENUM('percentage','fixed') NOT NULL DEFAULT 'percentage',
  payout_value    DECIMAL(10,2),
  bank_name       VARCHAR(200),
  bank_account    VARCHAR(100),
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Deals
CREATE TABLE IF NOT EXISTS deals (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title                 VARCHAR(300)   NOT NULL,
  company_id            INT UNSIGNED,
  contact_id            INT UNSIGNED,
  owner_id              INT UNSIGNED,
  stage_id              INT UNSIGNED,
  partner_id            INT UNSIGNED,
  value                 DECIMAL(15,2)  NOT NULL DEFAULT 0,
  offered_value         DECIMAL(15,2),
  discount_percent      DECIMAL(5,2),
  proposed_per_employee DECIMAL(10,2),
  offered_per_employee  DECIMAL(10,2),
  employees_covered     INT UNSIGNED,
  implementation_fee    DECIMAL(15,2),
  contract_months       INT UNSIGNED,
  go_live_date          DATE,
  commercial_notes      TEXT,
  product_type          ENUM('bundled','hris_only') NOT NULL DEFAULT 'bundled',
  currency              CHAR(3)        NOT NULL DEFAULT 'PHP',
  probability           INT            NOT NULL DEFAULT 0,
  expected_close_date   DATE,
  actual_close_date     DATE,
  source                VARCHAR(100),
  source_details        VARCHAR(300),
  description           TEXT,
  created_by            INT UNSIGNED,
  stage_changed_at      DATETIME       DEFAULT CURRENT_TIMESTAMP,
  created_at            DATETIME       DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id)  REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY (contact_id)  REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (owner_id)    REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (stage_id)    REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  FOREIGN KEY (partner_id)  REFERENCES partners(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL
);

-- Activities
CREATE TABLE IF NOT EXISTS activities (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type          ENUM('call','email','meeting','note','whatsapp') NOT NULL,
  subject       VARCHAR(300),
  body          TEXT,
  outcome       VARCHAR(200),
  duration_min  INT,
  deal_id       INT UNSIGNED,
  contact_id    INT UNSIGNED,
  company_id    INT UNSIGNED,
  user_id       INT UNSIGNED NOT NULL,
  activity_date DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deal_id)    REFERENCES deals(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(300) NOT NULL,
  description   TEXT,
  due_date      DATETIME,
  priority      ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  status        ENUM('open','completed','cancelled') NOT NULL DEFAULT 'open',
  assigned_to   INT UNSIGNED,
  deal_id       INT UNSIGNED,
  contact_id    INT UNSIGNED,
  company_id    INT UNSIGNED,
  created_by    INT UNSIGNED,
  completed_at  DATETIME,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (deal_id)     REFERENCES deals(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id)  REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (company_id)  REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL
);

-- Sales quotas
CREATE TABLE IF NOT EXISTS quotas (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  period_type       ENUM('monthly','quarterly') NOT NULL DEFAULT 'monthly',
  period_start      DATE NOT NULL,
  period_end        DATE,
  revenue_target    DECIMAL(15,2) NOT NULL DEFAULT 0,
  deals_target      INT NOT NULL DEFAULT 0,
  calls_target      INT NOT NULL DEFAULT 0,
  meetings_target   INT NOT NULL DEFAULT 0,
  emails_target     INT NOT NULL DEFAULT 0,
  created_by        INT UNSIGNED,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_period (user_id, period_start, period_type),
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================
-- Seed: Pipeline stages
-- ============================================================
INSERT INTO pipeline_stages (name, display_order, probability, color, is_won, is_lost) VALUES
  ('Prospect',    1, 15,  '#64748B', 0, 0),
  ('Qualified',   2, 35,  '#3B82F6', 0, 0),
  ('Proposal',    3, 55,  '#8B5CF6', 0, 0),
  ('Negotiation', 4, 75,  '#F59E0B', 0, 0),
  ('Closed Won',  5, 100, '#22C55E', 1, 0),
  ('Closed Lost', 6, 0,   '#EF4444', 0, 1);

-- ============================================================
-- Seed: Users  (passwords pre-hashed with bcrypt rounds=12)
-- Change all passwords immediately after first login.
-- ============================================================
INSERT INTO users (name, email, password_hash, role, avatar_color) VALUES
  ('Admin',         'admin@benefi.ph',   '$2a$12$zHaLEpuch1vtfGFsgCXAreJy6Pg3FAPxeILYg7969vnrwwPJt7Jc6', 'admin',   '#0F766E'),
  ('Sharad Ingule', 'sharad@benefi.ph',  '$2a$12$muwAqIrDTc12JJosq/U7U.dokxMEEiHOwt8P1Uj34.KEJzEDV5.mO', 'manager', '#0369A1'),
  ('Prafull Babar', 'prafull@benefi.ph', '$2a$12$bU4O/O2HuzMtY3FNuyk16elQ3W.eHsatkaUxP4ZLlA6fvoUqMhBDO', 'rep',     '#7C3AED');

-- ============================================================
-- Seed: Sample companies
-- ============================================================
INSERT INTO companies (name, industry, city, headcount, owner_id, created_by) VALUES
  ('Jollibee Foods Corp.', 'Food & Beverage', 'Pasig',        4500, 2, 2),
  ('SM Retail Corp.',      'Retail',          'Mandaluyong',  8200, 3, 3),
  ('BDO Unibank',          'Banking & Finance','Makati',       3100, 2, 2),
  ('Ayala Land Inc.',      'Real Estate',     'Makati',        900, 3, 3),
  ('Robinsons Retail',     'Retail',          'Quezon City',  1200, 3, 3);

-- ============================================================
-- Seed: Sample contacts
-- ============================================================
INSERT INTO contacts (first_name, last_name, job_title, email, company_id, owner_id, created_by) VALUES
  ('Carlo',  'Reyes',     'VP Operations', 'carlo@jollibee.com',   1, 2, 2),
  ('Ana',    'Cruz',      'HR Director',   'ana@smretail.com',     2, 3, 3),
  ('Liza',   'Garcia',    'CHRO',          'liza@bdo.com',         3, 2, 2),
  ('Robert', 'Tan',       'CFO',           'robert@ayalaland.com', 4, 3, 3),
  ('Marc',   'Villanueva','CEO',           'marc@robinsons.com',   5, 3, 3);

-- ============================================================
-- Seed: Sample deals
-- ============================================================
INSERT INTO deals (title, company_id, contact_id, owner_id, stage_id, value, probability, employees_covered, proposed_per_employee, product_type, expected_close_date, source, created_by) VALUES
  ('Enterprise HR Suite',         1, 1, 2, 4, 120000, 75,  4500, 25, 'bundled',  '2026-09-30', 'Referral',     2),
  ('Payroll & Compliance Module', 2, 2, 3, 3,  84000, 55,  8200, 10, 'hris_only','2026-10-15', 'LinkedIn',     3),
  ('Employee Benefits Platform',  3, 3, 2, 5,  56000, 100, 3100, 18, 'bundled',  '2026-08-15', 'Conference',   2),
  ('Financial Wellness Suite',    4, 4, 3, 2,  95000, 35,   900, 30, 'bundled',  '2026-11-30', 'Website',      3),
  ('Nationwide License',          5, 5, 3, 2, 145000, 35,  1200, 22, 'bundled',  '2026-11-01', 'Cold Outreach',3);

-- ============================================================
-- Seed: Sample activities
-- ============================================================
INSERT INTO activities (type, subject, body, outcome, user_id, deal_id, contact_id, activity_date) VALUES
  ('call',    'Intro call',             'Discussed requirements and roadmap.',          'Positive',  2, 1, 1, '2026-09-01 10:00:00'),
  ('meeting', 'Product demo',           'Showed HR module live demo. Good feedback.',   'Follow up', 2, 1, 1, '2026-09-03 14:00:00'),
  ('note',    'Key stakeholders noted', 'CFO is the decision maker. Legal review pending.', NULL,   2, 1, 1, '2026-09-05 09:00:00');

-- ============================================================
-- Seed: Sample tasks
-- ============================================================
INSERT INTO tasks (title, priority, status, due_date, assigned_to, deal_id, created_by) VALUES
  ('Follow up on legal review',    'high',   'open', '2026-09-10 09:00:00', 2, 1, 2),
  ('Send revised proposal to SM',  'high',   'open', '2026-09-12 12:00:00', 3, 2, 3),
  ('Schedule CFO meeting — Ayala', 'medium', 'open', '2026-09-15 10:00:00', 3, 4, 3);
