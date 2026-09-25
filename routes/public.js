import express from 'express';
import nodemailer from 'nodemailer';
import pool from '../db/pool.js';

const router = express.Router();

// ── Rate limiter: max 5 submissions per IP per 10 min ────────────────────────
const recentHits = new Map();
function rateLimit(ip) {
  const now = Date.now();
  const window = 10 * 60 * 1000;
  const hits = (recentHits.get(ip) || []).filter(t => now - t < window);
  if (hits.length >= 5) return false;
  recentHits.set(ip, [...hits, now]);
  return true;
}

// ── Nodemailer — active only when SMTP_USER + SMTP_PASS are set in .env ──────
const smtpReady = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
const mailer = smtpReady
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

// ── POST /api/public/enquiry — no auth required ──────────────────────────────
router.post('/enquiry', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
           || req.socket?.remoteAddress
           || null;

  if (!rateLimit(ip)) {
    return res.status(429).json({ status: 'error', message: 'Too many requests. Please try again later.' });
  }

  const { name, email, company, phone, message } = req.body;

  if (!name || !email || !company) {
    return res.status(400).json({ status: 'error', message: 'Name, email and company are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ status: 'error', message: 'Invalid email address.' });
  }

  try {
    await pool.execute(
      `INSERT INTO enquiries (name, email, company, phone, message, ip_address, source)
       VALUES (?, ?, ?, ?, ?, ?, 'website')`,
      [name.trim(), email.trim(), company.trim(), (phone||'').trim(), (message||'').trim(), ip]
    );
  } catch (err) {
    console.error('[enquiry] DB error:', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to save enquiry.' });
  }

  // Send notification email (non-fatal)
  if (mailer) {
    const notifyTo = process.env.ENQUIRY_NOTIFY_TO || process.env.SMTP_NOTIFY_TO || process.env.SMTP_USER;
    try {
      await mailer.sendMail({
        from:    `"BeneFi Website" <${process.env.SMTP_USER}>`,
        to:      notifyTo,
        replyTo: email,
        subject: `[BeneFi Enquiry] ${name} — ${company}`,
        html: `<div style="font-family:sans-serif;max-width:580px;margin:auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
  <div style="background:#0A1628;padding:18px 24px">
    <h2 style="color:#fff;margin:0;font-size:16px">New Early Access Enquiry — BeneFi</h2>
  </div>
  <div style="padding:20px 24px">
    <table style="width:100%;font-size:14px;border-collapse:collapse">
      <tr><td style="color:#6b7280;padding:7px 0;width:80px;vertical-align:top">Name</td><td style="font-weight:700">${name}</td></tr>
      <tr><td style="color:#6b7280;padding:7px 0;vertical-align:top">Email</td><td><a href="mailto:${email}" style="color:#0F766E">${email}</a></td></tr>
      <tr><td style="color:#6b7280;padding:7px 0;vertical-align:top">Company</td><td style="font-weight:700">${company}</td></tr>
      <tr><td style="color:#6b7280;padding:7px 0;vertical-align:top">Phone</td><td>${phone || '—'}</td></tr>
    </table>
    ${message ? `<div style="margin-top:14px;padding:14px;background:#f9fafb;border-radius:6px;font-size:13px">
      <div style="color:#6b7280;font-size:11px;margin-bottom:6px">MESSAGE</div>
      <div style="white-space:pre-wrap">${message}</div>
    </div>` : ''}
    <p style="margin-top:16px;color:#9ca3af;font-size:11px">
      Submitted ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} PH time · IP: ${ip || 'unknown'}
    </p>
  </div>
</div>`,
      });
    } catch (mailErr) {
      console.error('[enquiry] SMTP error (non-fatal):', mailErr.message);
    }
  }

  res.json({ status: 'success' });
});

// ── POST /api/public/test-email — SMTP connectivity test ─────────────────────
router.post('/test-email', async (req, res) => {
  if (!smtpReady) {
    return res.json({ status: 'parked', message: 'SMTP_USER and SMTP_PASS are not set in .env — email is disabled.' });
  }
  const to = req.body?.to || process.env.SMTP_NOTIFY_TO || process.env.SMTP_USER;
  try {
    await mailer.sendMail({
      from:    `"BeneFi CRM" <${process.env.SMTP_USER}>`,
      to,
      subject: 'BeneFi CRM — SMTP test',
      text:    `SMTP is working. Sent at ${new Date().toISOString()}.`,
    });
    res.json({ status: 'ok', message: `Test email sent to ${to}` });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
