import express from 'express';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const { type, deal, contact, limit = 50, offset = 0 } = req.query;
    let where = ['1=1']; const params = [];
    if (req.user.role === 'rep') { where.push('a.user_id = ?'); params.push(req.user.id); }
    if (type)    { where.push('a.type = ?');       params.push(type); }
    if (deal)    { where.push('a.deal_id = ?');    params.push(deal); }
    if (contact) { where.push('a.contact_id = ?'); params.push(contact); }
    params.push(Number(limit), Number(offset));
    const [rows] = await pool.execute(
      `SELECT a.*, u.name AS user_name, u.avatar_color AS user_color,
              d.title AS deal_title, ct.first_name AS contact_first, ct.last_name AS contact_last,
              co.name AS company_name
       FROM activities a
       LEFT JOIN users u ON a.user_id = u.id
       LEFT JOIN deals d ON a.deal_id = d.id
       LEFT JOIN contacts ct ON a.contact_id = ct.id
       LEFT JOIN companies co ON a.company_id = co.id
       WHERE ${where.join(' AND ')} ORDER BY a.activity_date DESC LIMIT ? OFFSET ?`,
      params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.post('/', async (req, res) => {
  const { type, subject, body, outcome, duration_min, deal_id, contact_id, company_id, activity_date } = req.body;
  if (!type) return res.status(400).json({ error: 'Activity type required.' });
  try {
    const [r] = await pool.execute(
      'INSERT INTO activities (type, subject, body, outcome, duration_min, deal_id, contact_id, company_id, user_id, activity_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [type, subject || null, body || null, outcome || null, duration_min || null, deal_id || null, contact_id || null, company_id || null, req.user.id, activity_date || new Date()]
    );
    res.status(201).json({ id: r.insertId });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const [[a]] = await pool.execute('SELECT user_id FROM activities WHERE id = ?', [req.params.id]);
    if (!a) return res.status(404).json({ error: 'Not found.' });
    if (req.user.role === 'rep' && a.user_id !== req.user.id) return res.status(403).json({ error: 'Access denied.' });
    await pool.execute('DELETE FROM activities WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

export default router;
