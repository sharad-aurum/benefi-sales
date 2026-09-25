import express from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// GET /api/enquiries — list all (admin/manager only)
router.get('/', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { status, limit = 100, offset = 0 } = req.query;
    let where = ['1=1'];
    const params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    params.push(Number(limit), Number(offset));
    const [rows] = await pool.execute(
      `SELECT * FROM enquiries WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      params
    );
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) as total FROM enquiries${status ? ' WHERE status = ?' : ''}`,
      status ? [status] : []
    );
    res.json({ rows, total: Number(total) });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// PUT /api/enquiries/:id — update status / notes
router.put('/:id', requireRole('admin', 'manager'), async (req, res) => {
  const { status, notes } = req.body;
  try {
    await pool.execute(
      'UPDATE enquiries SET status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE id = ?',
      [status || null, notes ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// DELETE /api/enquiries/:id — admin only
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await pool.execute('DELETE FROM enquiries WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

export default router;
