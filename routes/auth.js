import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

const COOKIE = {
  httpOnly: true,
  sameSite: 'lax',
  secure:   process.env.COOKIE_SECURE === 'true',
  maxAge:   7 * 24 * 60 * 60 * 1000,
};

const MAX_ATTEMPTS = 5;
const LOCKOUT_MIN  = 15;

// Rate limiter: max 20 login attempts per IP per 15 minutes
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

router.post('/login', loginRateLimit, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
  const ip = clientIp(req);
  try {
    const [[user]] = await pool.execute(
      `SELECT id, name, email, password_hash, role, avatar_color, is_active, must_reset_pw,
              failed_attempts, locked_until
       FROM users WHERE email = ?`,
      [email.trim().toLowerCase()]
    );

    // Log every attempt regardless of outcome
    const logAttempt = async (userId, success) => {
      await pool.execute(
        `INSERT INTO login_audit (user_id, email, ip_address, success) VALUES (?, ?, ?, ?)`,
        [userId || null, email.trim().toLowerCase(), ip, success ? 1 : 0]
      ).catch(() => {}); // never let audit failure break login
    };

    if (!user) {
      await logAttempt(null, false);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!user.is_active) {
      await logAttempt(user.id, false);
      return res.status(403).json({ error: 'Account disabled. Contact your administrator.' });
    }

    // Check lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const mins = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      await logAttempt(user.id, false);
      return res.status(429).json({ error: `Account locked. Try again in ${mins} minute${mins===1?'':'s'}.` });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      const attempts = (user.failed_attempts || 0) + 1;
      const lock = attempts >= MAX_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_MIN * 60 * 1000)
        : null;
      await pool.execute(
        'UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?',
        [attempts, lock, user.id]
      );
      await logAttempt(user.id, false);
      const remaining = MAX_ATTEMPTS - attempts;
      if (lock) return res.status(429).json({ error: `Too many failed attempts. Account locked for ${LOCKOUT_MIN} minutes.` });
      return res.status(401).json({ error: `Invalid email or password. ${remaining} attempt${remaining===1?'':'s'} remaining.` });
    }

    // Success — reset lockout counters
    await pool.execute(
      'UPDATE users SET last_login = NOW(), failed_attempts = 0, locked_until = NULL WHERE id = ?',
      [user.id]
    );
    await logAttempt(user.id, true);

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
    await pool.execute('UPDATE users SET password_hash = ?, must_reset_pw = 0, failed_attempts = 0, locked_until = NULL WHERE id = ?', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Admin: view login audit log
router.get('/audit', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT la.id, la.email, la.ip_address, la.success, la.created_at,
              u.name AS user_name
       FROM login_audit la LEFT JOIN users u ON la.user_id = u.id
       ORDER BY la.created_at DESC LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Admin: unlock a locked account
router.post('/unlock/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await pool.execute(
      'UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?',
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

export default router;
