import express from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// GET /api/pricing/config — all pricing config values
router.get('/config', async (_req, res) => {
  try {
    const [rows] = await pool.execute('SELECT config_key, config_value, label FROM pricing_config ORDER BY id');
    const cfg = {};
    rows.forEach(r => { cfg[r.config_key] = { value: r.config_value, label: r.label }; });
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/pricing/config — admin updates existing config values
router.put('/config', requireRole('admin'), async (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'Body must be a JSON object.' });
  try {
    const entries = Object.entries(updates).filter(([k, v]) => k && v !== undefined);
    if (!entries.length) return res.status(400).json({ error: 'No keys provided.' });
    for (const [key, value] of entries) {
      await pool.execute(
        'UPDATE pricing_config SET config_value = ?, updated_by = ? WHERE config_key = ?',
        [String(value), req.user.id, key]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/pricing/qualifiers — admin adds a custom qualifier discount
router.post('/qualifiers', requireRole('admin'), async (req, res) => {
  const { label, value } = req.body;
  if (!label || value === undefined) return res.status(400).json({ error: 'label and value required.' });
  const pct = parseFloat(value);
  if (isNaN(pct) || pct < 0 || pct > 50) return res.status(400).json({ error: 'value must be 0–50.' });
  try {
    const slug = 'custom_qual_' + Date.now();
    await pool.execute(
      'INSERT INTO pricing_config (config_key, config_value, label, updated_by) VALUES (?, ?, ?, ?)',
      [slug, String(pct), label.trim(), req.user.id]
    );
    res.status(201).json({ config_key: slug, ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/pricing/qualifiers/:key — admin removes a custom qualifier
router.delete('/qualifiers/:key', requireRole('admin'), async (req, res) => {
  const key = req.params.key;
  if (!key.startsWith('custom_qual_')) return res.status(400).json({ error: 'Only custom qualifiers can be deleted.' });
  try {
    await pool.execute('DELETE FROM pricing_config WHERE config_key = ?', [key]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/pricing/forecast — pipeline MRR forecast from open deals
router.get('/forecast', async (_req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        d.id, d.title, d.employees_covered,
        d.offered_per_employee, d.proposed_per_employee, d.pricing_per_user,
        d.value, d.probability, d.product_type, d.payment_terms, d.product_plan,
        d.expected_close_date, d.stage_id,
        ps.name  AS stage_name,
        ps.color AS stage_color,
        u.name   AS owner_name,
        c.name   AS company_name
      FROM deals d
      LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
      LEFT JOIN users u ON u.id = d.owner_id
      LEFT JOIN companies c ON c.id = d.company_id
      WHERE (ps.is_won = 0 AND ps.is_lost = 0) OR ps.id IS NULL
      ORDER BY d.probability DESC, d.value DESC
    `);

    const deals = rows.map(d => {
      const hc   = Number(d.employees_covered) || 0;
      const ppu  = Number(d.pricing_per_user || d.offered_per_employee || d.proposed_per_employee) || 0;
      const mrr  = hc && ppu ? hc * ppu : 0;
      const wmrr = mrr * (Number(d.probability) / 100);
      return { ...d, mrr, weighted_mrr: wmrr };
    });

    const totalMrr       = deals.reduce((s, d) => s + d.mrr,          0);
    const weightedMrr    = deals.reduce((s, d) => s + d.weighted_mrr, 0);
    const totalHeadcount = deals.reduce((s, d) => s + (Number(d.employees_covered) || 0), 0);

    res.json({ deals, totalMrr, weightedMrr, totalHeadcount });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/pricing/clients-won
router.get('/clients-won', async (_req, res) => {
  try {
    const [[row]] = await pool.execute(
      `SELECT COUNT(*) AS won_count FROM deals d
       JOIN pipeline_stages ps ON ps.id = d.stage_id WHERE ps.is_won = 1`
    );
    res.json({ won_count: Number(row.won_count) });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

export default router;
