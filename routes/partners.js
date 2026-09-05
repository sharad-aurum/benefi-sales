import express from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT p.*,
        (SELECT COUNT(*) FROM deals d WHERE d.partner_id = p.id) AS deal_count,
        (SELECT SUM(d.value) FROM deals d WHERE d.partner_id = p.id) AS deal_value
       FROM partners p ORDER BY p.name LIMIT 200`
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const [[p]] = await pool.execute('SELECT * FROM partners WHERE id = ?', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Not found.' });
    const [deals] = await pool.execute(
      `SELECT d.id, d.title, d.value, d.offered_value, ps.name AS stage_name, ps.color AS stage_color, u.name AS owner_name
       FROM deals d LEFT JOIN pipeline_stages ps ON d.stage_id = ps.id LEFT JOIN users u ON d.owner_id = u.id
       WHERE d.partner_id = ? ORDER BY d.created_at DESC`, [p.id]
    );
    res.json({ ...p, deals });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.post('/', requireRole('admin', 'manager'), async (req, res) => {
  const { name, type, contact_person, contact_email, contact_phone, payout_type, payout_value, bank_name, bank_account, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Partner name required.' });
  try {
    const [r] = await pool.execute(
      `INSERT INTO partners (name, type, contact_person, contact_email, contact_phone, payout_type, payout_value, bank_name, bank_account, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, type || 'referral_partner', contact_person || null, contact_email || null, contact_phone || null,
       payout_type || 'percentage', payout_value || null, bank_name || null, bank_account || null, notes || null]
    );
    res.status(201).json({ id: r.insertId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

router.put('/:id', requireRole('admin', 'manager'), async (req, res) => {
  const { name, type, contact_person, contact_email, contact_phone, payout_type, payout_value, bank_name, bank_account, is_active, notes } = req.body;
  try {
    await pool.execute(
      `UPDATE partners SET name = COALESCE(?, name), type = COALESCE(?, type),
       contact_person = ?, contact_email = ?, contact_phone = ?,
       payout_type = COALESCE(?, payout_type), payout_value = ?,
       bank_name = ?, bank_account = ?, is_active = COALESCE(?, is_active), notes = ?
       WHERE id = ?`,
      [name || null, type || null, contact_person ?? null, contact_email ?? null, contact_phone ?? null,
       payout_type || null, payout_value ?? null, bank_name ?? null, bank_account ?? null,
       is_active ?? null, notes ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await pool.execute('UPDATE deals SET partner_id = NULL WHERE partner_id = ?', [req.params.id]);
    await pool.execute('DELETE FROM partners WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

export default router;
