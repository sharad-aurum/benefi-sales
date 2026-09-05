import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const COOKIE = {
  httpOnly: true,
  sameSite: 'lax',
  secure:   process.env.COOKIE_SECURE === 'true',
  maxAge:   7 * 24 * 60 * 60 * 1000,
};

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
  try {
    const [[user]] = await pool.execute(
      'SELECT id, name, email, password_hash, role, avatar_color, is_active, must_reset_pw FROM users WHERE email = ?',
      [email.trim().toLowerCase()]
    );
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    if (!user.is_active) return res.status(403).json({ error: 'Account disabled. Contact your administrator.' });
    if (!await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ error: 'Invalid email or password.' });

    await pool.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role, color: user.avatar_color },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES || '7d' }
    );
    res.cookie('benefi_crm_token', token, COOKIE);
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, color: user.avatar_color, mustReset: user.must_reset_pw } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('benefi_crm_token');
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const [[user]] = await pool.execute(
      'SELECT id, name, email, role, avatar_color AS color, last_login FROM users WHERE id = ? AND is_active = 1',
      [req.user.id]
    );
    if (!user) return res.status(401).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.put('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both fields required.' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  try {
    const [[user]] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!await bcrypt.compare(currentPassword, user.password_hash)) return res.status(401).json({ error: 'Current password incorrect.' });
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.execute('UPDATE users SET password_hash = ?, must_reset_pw = 0 WHERE id = ?', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

export default router;
