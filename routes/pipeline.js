import express from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

router.get('/stages', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM pipeline_stages ORDER BY display_order');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.post('/stages', requireRole('admin', 'manager'), async (req, res) => {
  const { name, probability, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Stage name required.' });
  try {
    const [[{ maxOrder }]] = await pool.execute('SELECT MAX(display_order) AS maxOrder FROM pipeline_stages');
    const [r] = await pool.execute(
      'INSERT INTO pipeline_stages (name, display_order, probability, color) VALUES (?, ?, ?, ?)',
      [name, (maxOrder || 0) + 1, probability || 0, color || '#64748B']
    );
    res.status(201).json({ id: r.insertId });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.put('/stages/:id', requireRole('admin', 'manager'), async (req, res) => {
  const { name, probability, color, display_order } = req.body;
  try {
    await pool.execute(
      'UPDATE pipeline_stages SET name = COALESCE(?, name), probability = COALESCE(?, probability), color = COALESCE(?, color), display_order = COALESCE(?, display_order) WHERE id = ?',
      [name || null, probability ?? null, color || null, display_order ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

export default router;
