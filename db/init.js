import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const conn = await mysql.createConnection({
  host:     process.env.DB_HOST || 'localhost',
  port:     Number(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  multipleStatements: true,
  charset:  'utf8mb4',
});

console.log('Running schema…');
const schema = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
await conn.query(schema);
console.log('✓ Schema applied');

// Default pipeline stages
const [existing] = await conn.query('SELECT COUNT(*) AS n FROM pipeline_stages');
if (existing[0].n === 0) {
  await conn.query(`
    INSERT INTO pipeline_stages (name, display_order, probability, color, is_won, is_lost) VALUES
    ('Prospect',    1, 15,  '#64748B', 0, 0),
    ('Qualified',   2, 35,  '#3B82F6', 0, 0),
    ('Proposal',    3, 55,  '#8B5CF6', 0, 0),
    ('Negotiation', 4, 75,  '#F59E0B', 0, 0),
    ('Closed Won',  5, 100, '#22C55E', 1, 0),
    ('Closed Lost', 6, 0,   '#EF4444', 0, 1)
  `);
  console.log('✓ Default pipeline stages created');
}

// Default admin user
const [admins] = await conn.query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");
if (admins[0].n === 0) {
  const hash = await bcrypt.hash('Admin@BeneFi2026!', 12);
  await conn.query(
    `INSERT INTO users (name, email, password_hash, role, avatar_color) VALUES (?, ?, ?, 'admin', '#0F766E')`,
    ['Admin', 'admin@benefi.ph', hash]
  );
  console.log('✓ Admin user created: admin@benefi.ph / Admin@BeneFi2026!');
}

// Sample users
const [users] = await conn.query("SELECT COUNT(*) AS n FROM users");
if (users[0].n === 1) {
  const h1 = await bcrypt.hash('Sharad@123', 12);
  const h2 = await bcrypt.hash('Prafull@123', 12);
  await conn.query(
    `INSERT INTO users (name, email, password_hash, role, avatar_color) VALUES
     (?, ?, ?, 'manager', '#0369A1'),
     (?, ?, ?, 'rep',     '#7C3AED')`,
    ['Sharad Ingule', 'sharad@benefi.ph', h1, 'Prafull Babar', 'prafull@benefi.ph', h2]
  );
  console.log('✓ Sample users created');
}

// Sample data
const [dealCount] = await conn.query('SELECT COUNT(*) AS n FROM deals');
if (dealCount[0].n === 0) {
  // Get user/stage ids
  const [[sharad]]  = await conn.query("SELECT id FROM users WHERE email = 'sharad@benefi.ph'");
  const [[prafull]] = await conn.query("SELECT id FROM users WHERE email = 'prafull@benefi.ph'");
  const [stages]    = await conn.query('SELECT id, name FROM pipeline_stages ORDER BY display_order');
  const stageMap    = Object.fromEntries(stages.map(s => [s.name, s.id]));

  const [r_co1] = await conn.query("INSERT INTO companies (name, industry, city, owner_id, created_by) VALUES (?, ?, ?, ?, ?)", ['Jollibee Foods Corp.', 'Food & Beverage', 'Pasig', sharad.id, sharad.id]);
  const [r_co2] = await conn.query("INSERT INTO companies (name, industry, city, owner_id, created_by) VALUES (?, ?, ?, ?, ?)", ['SM Retail Corp.', 'Retail', 'Mandaluyong', prafull.id, prafull.id]);
  const [r_co3] = await conn.query("INSERT INTO companies (name, industry, city, owner_id, created_by) VALUES (?, ?, ?, ?, ?)", ['BDO Unibank', 'Banking & Finance', 'Makati', sharad.id, sharad.id]);
  const [r_co4] = await conn.query("INSERT INTO companies (name, industry, city, owner_id, created_by) VALUES (?, ?, ?, ?, ?)", ['Ayala Land Inc.', 'Real Estate', 'Makati', prafull.id, prafull.id]);
  const [r_co5] = await conn.query("INSERT INTO companies (name, industry, city, owner_id, created_by) VALUES (?, ?, ?, ?, ?)", ['Robinsons Retail', 'Retail', 'Quezon City', prafull.id, prafull.id]);

  const [r_ct1] = await conn.query("INSERT INTO contacts (first_name, last_name, job_title, email, company_id, owner_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)", ['Carlo', 'Reyes', 'VP Operations', 'carlo@jollibee.com', r_co1.insertId, sharad.id, sharad.id]);
  const [r_ct2] = await conn.query("INSERT INTO contacts (first_name, last_name, job_title, email, company_id, owner_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)", ['Ana', 'Cruz', 'HR Director', 'ana@smretail.com', r_co2.insertId, prafull.id, prafull.id]);
  const [r_ct3] = await conn.query("INSERT INTO contacts (first_name, last_name, job_title, email, company_id, owner_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)", ['Liza', 'Garcia', 'CHRO', 'liza@bdo.com', r_co3.insertId, sharad.id, sharad.id]);
  const [r_ct4] = await conn.query("INSERT INTO contacts (first_name, last_name, job_title, email, company_id, owner_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)", ['Robert', 'Tan', 'CFO', 'robert@ayalaland.com', r_co4.insertId, prafull.id, prafull.id]);
  const [r_ct5] = await conn.query("INSERT INTO contacts (first_name, last_name, job_title, email, company_id, owner_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)", ['Marc', 'Villanueva', 'CEO', 'marc@robinsons.com', r_co5.insertId, prafull.id, prafull.id]);

  await conn.query(`
    INSERT INTO deals (title, company_id, contact_id, owner_id, stage_id, value, probability, expected_close_date, source, created_by) VALUES
    ('Enterprise HR Suite',        ?, ?, ?, ?, 120000, 75, '2026-09-30', 'Referral',    ?),
    ('Payroll & Compliance Module',?, ?, ?, ?, 84000,  55, '2026-10-15', 'LinkedIn',    ?),
    ('Employee Benefits Platform', ?, ?, ?, ?, 56000,  100,'2026-08-15', 'Conference',  ?),
    ('Financial Wellness Suite',   ?, ?, ?, ?, 95000,  35, '2026-11-30', 'Website',     ?),
    ('Nationwide License',         ?, ?, ?, ?, 145000, 35, '2026-11-01', 'Cold Outreach',?)
  `, [
    r_co1.insertId, r_ct1.insertId, sharad.id,  stageMap['Negotiation'], sharad.id,
    r_co2.insertId, r_ct2.insertId, prafull.id, stageMap['Proposal'],    prafull.id,
    r_co3.insertId, r_ct3.insertId, sharad.id,  stageMap['Closed Won'],  sharad.id,
    r_co4.insertId, r_ct4.insertId, prafull.id, stageMap['Qualified'],   prafull.id,
    r_co5.insertId, r_ct5.insertId, prafull.id, stageMap['Qualified'],   prafull.id,
  ]);

  // Sample activities
  const [[d1]] = await conn.query("SELECT id FROM deals WHERE title LIKE 'Enterprise%'");
  await conn.query(`
    INSERT INTO activities (type, subject, body, outcome, user_id, deal_id, contact_id, activity_date) VALUES
    ('call',    'Intro call',             'Discussed requirements and roadmap.',     'Positive',   ?, ?, ?, '2026-09-01 10:00:00'),
    ('meeting', 'Product demo',           'Showed HR module live demo. Good feedback.','Follow up', ?, ?, ?, '2026-09-03 14:00:00'),
    ('note',    'Key stakeholders noted', 'CFO is the decision maker. Legal review pending.', NULL, ?, ?, ?, '2026-09-05 09:00:00')
  `, [sharad.id, d1.id, r_ct1.insertId, sharad.id, d1.id, r_ct1.insertId, sharad.id, d1.id, r_ct1.insertId]);

  // Sample tasks
  await conn.query(`
    INSERT INTO tasks (title, priority, status, due_date, assigned_to, deal_id, created_by) VALUES
    ('Follow up on legal review',      'high',   'open', '2026-09-06 09:00:00', ?, ?, ?),
    ('Send revised proposal to SM',    'high',   'open', '2026-09-08 12:00:00', ?, NULL, ?),
    ('Schedule CFO meeting — Ayala',   'medium', 'open', '2026-09-10 10:00:00', ?, NULL, ?)
  `, [sharad.id, d1.id, sharad.id, prafull.id, prafull.id, prafull.id, prafull.id]);

  console.log('✓ Sample data created');
}

await conn.end();
console.log('\n✅ Database initialized. Start the server with: npm run dev');
