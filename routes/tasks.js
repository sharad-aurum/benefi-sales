import express from 'express';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const { status, assigned_to, deal } = req.query;
    let where = ['1=1']; const params = [];
    if (req.user.role === 'rep') { where.push('(t.assigned_to = ? OR t.created_by = ?)'); params.push(req.user.id, req.user.id); }
    if (status)      { where.push('t.status = ?');      params.push(status); }
    if (assigned_to) { where.push('t.assigned_to = ?'); params.push(assigned_to); }
    if (deal)        { where.push('t.deal_id = ?');     params.push(deal); }
    const [rows] = await pool.execute(
      `SELECT t.*, u.name AS assigned_name, u.avatar_color AS assigned_color,
              d.title AS deal_title, ct.first_name AS contact_first, ct.last_name AS contact_last
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN deals d ON t.deal_id = d.id
       LEFT JOIN contacts ct ON t.contact_id = ct.id
       WHERE ${where.join(' AND ')} ORDER BY FIELD(t.priority,'high','medium','low'), t.due_date LIMIT 200`,
      params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.post('/', async (req, res) => {
  const { title, description, due_date, priority, assigned_to, deal_id, contact_id, company_id } = req.body;
  if (!title) return res.status(400).json({ error: 'Task title required.' });
  try {
    const [r] = await pool.execute(
      'INSERT INTO tasks (title, description, due_date, priority, assigned_to, deal_id, contact_id, company_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [title, description || null, due_date || null, priority || 'medium', assigned_to || req.user.id, deal_id || null, contact_id || null, company_id || null, req.user.id]
    );
    res.status(201).json({ id: r.insertId });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.put('/:id', async (req, res) => {
  const { title, description, due_date, priority, status, assigned_to } = req.body;
  try {
    const completed_at = status === 'completed' ? new Date() : null;
    await pool.execute(
      `UPDATE tasks SET title = COALESCE(?, title), description = COALESCE(?, description),
       due_date = COALESCE(?, due_date), priority = COALESCE(?, priority),
       status = COALESCE(?, status), assigned_to = COALESCE(?, assigned_to),
       completed_at = IF(? = 'completed', NOW(), completed_at) WHERE id = ?`,
      [title || null, description || null, due_date || null, priority || null, status || null, assigned_to || null, status || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.patch('/:id/complete', async (req, res) => {
  try {
    await pool.execute("UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

export default router;
