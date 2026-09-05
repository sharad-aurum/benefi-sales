import express from 'express';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const { search, company } = req.query;
    let where = ['1=1']; const params = [];
    if (req.user.role === 'rep') { where.push('c.owner_id = ?'); params.push(req.user.id); }
    if (search) { where.push('(c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR co.name LIKE ?)'); params.push(...Array(4).fill(`%${search}%`)); }
    if (company) { where.push('c.company_id = ?'); params.push(company); }
    const [rows] = await pool.execute(
      `SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.mobile, c.job_title,
              c.contact_role, c.influence_level, c.linkedin_url, c.created_at,
              co.id AS company_id, co.name AS company_name,
              u.id AS owner_id, u.name AS owner_name, u.avatar_color AS owner_color
       FROM contacts c
       LEFT JOIN companies co ON c.company_id = co.id
       LEFT JOIN users u ON c.owner_id = u.id
       WHERE ${where.join(' AND ')} ORDER BY c.first_name, c.last_name LIMIT 200`,
      params
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const [[c]] = await pool.execute(
      `SELECT c.*, co.name AS company_name, u.name AS owner_name, u.avatar_color AS owner_color
       FROM contacts c LEFT JOIN companies co ON c.company_id = co.id LEFT JOIN users u ON c.owner_id = u.id
       WHERE c.id = ?`, [req.params.id]
    );
    if (!c) return res.status(404).json({ error: 'Not found.' });
    const [deals] = await pool.execute(
      `SELECT d.id, d.title, d.value, ps.name AS stage_name, ps.color AS stage_color
       FROM deals d LEFT JOIN pipeline_stages ps ON d.stage_id = ps.id WHERE d.contact_id = ? ORDER BY d.created_at DESC`,
      [c.id]
    );
    const [activities] = await pool.execute(
      `SELECT a.*, u.name AS user_name FROM activities a LEFT JOIN users u ON a.user_id = u.id
       WHERE a.contact_id = ? ORDER BY a.activity_date DESC LIMIT 20`,
      [c.id]
    );
    res.json({ ...c, deals, activities });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

router.post('/', async (req, res) => {
  const { first_name, last_name, email, phone, mobile, job_title, company_id, owner_id, linkedin_url, notes, contact_role, influence_level } = req.body;
  if (!first_name) return res.status(400).json({ error: 'First name required.' });
  try {
    const [r] = await pool.execute(
      `INSERT INTO contacts
         (first_name, last_name, email, phone, mobile, job_title, company_id, owner_id, created_by, linkedin_url, notes, contact_role, influence_level)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [first_name, last_name || null, email || null, phone || null, mobile || null, job_title || null,
       company_id || null, owner_id || req.user.id, req.user.id, linkedin_url || null, notes || null,
       contact_role || null, influence_level || null]
    );
    res.status(201).json({ id: r.insertId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

router.put('/:id', async (req, res) => {
  const { first_name, last_name, email, phone, mobile, job_title, company_id, owner_id, linkedin_url, notes, contact_role, influence_level } = req.body;
  try {
    await pool.execute(
      `UPDATE contacts SET
         first_name = COALESCE(?, first_name), last_name = ?, email = ?, phone = ?, mobile = ?,
         job_title = ?, company_id = ?, owner_id = COALESCE(?, owner_id),
         linkedin_url = ?, notes = ?, contact_role = ?, influence_level = ?
       WHERE id = ?`,
      [first_name || null, last_name ?? null, email ?? null, phone ?? null, mobile ?? null,
       job_title ?? null, company_id ?? null, owner_id || null,
       linkedin_url ?? null, notes ?? null, contact_role ?? null, influence_level ?? null,
       req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM contacts WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

export default router;
