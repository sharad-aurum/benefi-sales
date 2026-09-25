import nodemailer from 'nodemailer';

export const smtpReady = !!(process.env.SMTP_USER && process.env.SMTP_PASS);

const transport = smtpReady
  ? nodemailer.createTransport({
      host:   process.env.SMTP_HOST || 'smtp.gmail.com',
      port:   Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

export async function sendMail({ to, subject, html, replyTo }) {
  if (!transport) return;
  try {
    await transport.sendMail({
      from:    `"BeneFi CRM" <${process.env.SMTP_USER}>`,
      to,
      replyTo: replyTo || process.env.SMTP_USER,
      subject,
      html,
    });
  } catch (err) {
    console.error(`[mailer] failed to "${to}" — ${err.message}`);
  }
}

// Helpers
export const ph = d =>
  d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }) : '—';

export const phNow = () =>
  new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });

export const peso = n => n ? '₱' + Number(n).toLocaleString() : '—';
