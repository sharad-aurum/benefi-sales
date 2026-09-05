-- BeneFi CRM Schema
CREATE DATABASE IF NOT EXISTS benefi_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE benefi_crm;

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

CREATE TABLE IF NOT EXISTS companies (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(300)  NOT NULL,
  industry      VARCHAR(150),
  website       VARCHAR(255),
  phone         VARCHAR(50),
  email         VARCHAR(254),
  address       TEXT,
  city          VARCHAR(100),
  country       VARCHAR(100)  DEFAULT 'Philippines',
  size_range    VARCHAR(20),
  owner_id      INT UNSIGNED,
  created_by    INT UNSIGNED,
  notes         TEXT,
  created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id)   REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

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
  created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY (owner_id)   REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100)  NOT NULL,
  display_order INT           NOT NULL DEFAULT 0,
  probability   INT           NOT NULL DEFAULT 0,
  color         VARCHAR(7)    NOT NULL DEFAULT '#64748B',
  is_won        BOOLEAN       NOT NULL DEFAULT FALSE,
  is_lost       BOOLEAN       NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS deals (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title               VARCHAR(300)   NOT NULL,
  company_id          INT UNSIGNED,
  contact_id          INT UNSIGNED,
  owner_id            INT UNSIGNED,
  stage_id            INT UNSIGNED,
  value               DECIMAL(15,2)  NOT NULL DEFAULT 0,
  currency            CHAR(3)        NOT NULL DEFAULT 'PHP',
  probability         INT            NOT NULL DEFAULT 0,
  expected_close_date DATE,
  actual_close_date   DATE,
  source              VARCHAR(100),
  description         TEXT,
  created_by          INT UNSIGNED,
  stage_changed_at    DATETIME       DEFAULT CURRENT_TIMESTAMP,
  created_at          DATETIME       DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (owner_id)   REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (stage_id)   REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

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
