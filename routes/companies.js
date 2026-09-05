import express from 'express';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    let where = ['1=1']; const params = [];
    if (search) { where.push('co.name LIKE ?'); params.push(`%${search}%`); }
    const [rows] = await pool.execute(
      `SELECT co.id, co.name, co.industry, co.city, co.country, co.website, co.phone, co.email,
              co.size_range, co.headcount, co.hris_name, co.created_at,
              u.name AS owner_name, u.avatar_color AS owner_color,
              (SELECT COUNT(*) FROM contacts c WHERE c.company_id = co.id) AS contact_count,
              (SELECT COUNT(*) FROM deals d WHERE d.company_id = co.id) AS deal_count,
              (SELECT SUM(d.value) FROM deals d WHERE d.company_id = co.id) AS deal_value
       FROM companies co LEFT JOIN users u ON co.owner_id = u.id
       WHERE ${where.join(' AND ')} ORDER BY co.name LIMIT 200`, params
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const [[co]] = await pool.execute(
      `SELECT co.*, u.name AS owner_name FROM companies co LEFT JOIN users u ON co.owner_id = u.id WHERE co.id = ?`,
      [req.params.id]
    );
    if (!co) return res.status(404).json({ error: 'Not found.' });
    const [contacts] = await pool.execute(
      'SELECT id, first_name, last_name, job_title, email, phone, contact_role, influence_level FROM contacts WHERE company_id = ?',
      [co.id]
    );
    const [deals] = await pool.execute(
      `SELECT d.id, d.title, d.value, d.offered_value, ps.name AS stage_name, ps.color AS stage_color, u.name AS owner_name
       FROM deals d LEFT JOIN pipeline_stages ps ON d.stage_id = ps.id LEFT JOIN users u ON d.owner_id = u.id
       WHERE d.company_id = ? ORDER BY d.created_at DESC`, [co.id]
    );
    res.json({ ...co, contacts, deals });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

router.post('/', async (req, res) => {
  const {
    name, industry, website, phone, email, address, city, country, size_range, owner_id, notes,
    headcount, hris_name, hris_vendor, hris_contract_end, hris_annual_cost, hris_per_employee_monthly,
    switch_reason, no_switch_reason, first_time_reason,
    has_fin_services, fin_services_name, fin_services_details,
  } = req.body;
  if (!name) return res.status(400).json({ error: 'Company name required.' });
  try {
    const [r] = await pool.execute(
      `INSERT INTO companies
         (name, industry, website, phone, email, address, city, country, size_range, owner_id, created_by, notes,
          headcount, hris_name, hris_vendor, hris_contract_end, hris_annual_cost, hris_per_employee_monthly,
          switch_reason, no_switch_reason, first_time_reason, has_fin_services, fin_services_name, fin_services_details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, industry || null, website || null, phone || null, email || null, address || null,
       city || null, country || 'Philippines', size_range || null, owner_id || req.user.id, req.user.id, notes || null,
       headcount || null, hris_name || null, hris_vendor || null, hris_contract_end || null,
       hris_annual_cost || null, hris_per_employee_monthly || null,
       switch_reason || null, no_switch_reason || null, first_time_reason || null,
       has_fin_services ? 1 : 0, fin_services_name || null, fin_services_details || null]
    );
    res.status(201).json({ id: r.insertId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

router.put('/:id', async (req, res) => {
  const {
    name, industry, website, phone, email, address, city, country, size_range, owner_id, notes,
    headcount, hris_name, hris_vendor, hris_contract_end, hris_annual_cost, hris_per_employee_monthly,
    switch_reason, no_switch_reason, first_time_reason,
    has_fin_services, fin_services_name, fin_services_details,
  } = req.body;
  try {
    await pool.execute(
      `UPDATE companies SET
         name = COALESCE(?, name), industry = ?, website = ?, phone = ?, email = ?,
         address = ?, city = ?, country = COALESCE(?, country), size_range = ?,
         owner_id = COALESCE(?, owner_id), notes = ?,
         headcount = ?, hris_name = ?, hris_vendor = ?, hris_contract_end = ?,
         hris_annual_cost = ?, hris_per_employee_monthly = ?,
         switch_reason = ?, no_switch_reason = ?, first_time_reason = ?,
         has_fin_services = ?, fin_services_name = ?, fin_services_details = ?
       WHERE id = ?`,
      [name || null, industry ?? null, website ?? null, phone ?? null, email ?? null,
       address ?? null, city ?? null, country || null, size_range ?? null,
       owner_id || null, notes ?? null,
       headcount ?? null, hris_name ?? null, hris_vendor ?? null, hris_contract_end ?? null,
       hris_annual_cost ?? null, hris_per_employee_monthly ?? null,
       switch_reason ?? null, no_switch_reason ?? null, first_time_reason ?? null,
       has_fin_services ? 1 : 0, fin_services_name ?? null, fin_services_details ?? null,
       req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM companies WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.get('/search/autocomplete', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id, name FROM companies WHERE name LIKE ? LIMIT 10', [`%${req.query.q || ''}%`]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

export default router;
