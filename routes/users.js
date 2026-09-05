import express from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// All users (admin + manager can list)
router.get('/', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, email, role, avatar_color AS color, is_active, last_login, failed_attempts, locked_until, created_at FROM users ORDER BY name'
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// Create user (admin only)
router.post('/', requireRole('admin'), async (req, res) => {
  const { name, email, password, role, avatar_color } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
  if (!['admin','manager','rep'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password_hash, role, avatar_color, must_reset_pw) VALUES (?, ?, ?, ?, ?, 1)',
      [name.trim(), email.trim().toLowerCase(), hash, role || 'rep', avatar_color || '#0F766E']
    );
    res.status(201).json({ id: result.insertId, name, email, role });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already in use.' });
    res.status(500).json({ error: 'Server error.' });
  }
});

// Update user (admin only)
router.put('/:id', requireRole('admin'), async (req, res) => {
  const { name, email, role, avatar_color, is_active } = req.body;
  try {
    await pool.execute(
      'UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), role = COALESCE(?, role), avatar_color = COALESCE(?, avatar_color), is_active = COALESCE(?, is_active) WHERE id = ?',
      [name || null, email?.toLowerCase() || null, role || null, avatar_color || null, is_active ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already in use.' });
    res.status(500).json({ error: 'Server error.' });
  }
});

// Reset password (admin only)
router.put('/:id/reset-password', requireRole('admin'), async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  try {
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.execute('UPDATE users SET password_hash = ?, must_reset_pw = 1 WHERE id = ?', [hash, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

export default router;
