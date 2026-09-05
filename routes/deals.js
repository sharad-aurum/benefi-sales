import express from 'express';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

const BASE_SELECT = `
  SELECT d.id, d.title, d.value, d.offered_value, d.discount_percent,
         d.proposed_per_employee, d.offered_per_employee, d.employees_covered,
         d.implementation_fee, d.contract_months, d.go_live_date, d.commercial_notes,
         d.product_type,
         d.probability, d.expected_close_date, d.actual_close_date,
         d.source, d.source_details, d.description, d.stage_changed_at, d.created_at, d.updated_at,
         co.id AS company_id, co.name AS company_name,
         ct.id AS contact_id, CONCAT(ct.first_name,' ',IFNULL(ct.last_name,'')) AS contact_name, ct.email AS contact_email,
         u.id AS owner_id, u.name AS owner_name, u.avatar_color AS owner_color,
         ps.id AS stage_id, ps.name AS stage_name, ps.color AS stage_color, ps.is_won, ps.is_lost,
         p.id AS partner_id, p.name AS partner_name, p.payout_type, p.payout_value
  FROM deals d
  LEFT JOIN companies co ON d.company_id = co.id
  LEFT JOIN contacts ct ON d.contact_id = ct.id
  LEFT JOIN users u ON d.owner_id = u.id
  LEFT JOIN pipeline_stages ps ON d.stage_id = ps.id
  LEFT JOIN partners p ON d.partner_id = p.id
`;

function canAccess(req, ownerId) {
  return req.user.role !== 'rep' || req.user.id === ownerId;
}

router.get('/', async (req, res) => {
  try {
    const { stage, owner, search, limit = 100, offset = 0 } = req.query;
    let where = ['1=1'];
    const params = [];
    if (req.user.role === 'rep') { where.push('d.owner_id = ?'); params.push(req.user.id); }
    if (stage)  { where.push('d.stage_id = ?'); params.push(stage); }
    if (owner)  { where.push('d.owner_id = ?'); params.push(owner); }
    if (search) { where.push('(d.title LIKE ? OR co.name LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    params.push(Number(limit), Number(offset));
    const [rows] = await pool.execute(`${BASE_SELECT} WHERE ${where.join(' AND ')} ORDER BY d.updated_at DESC LIMIT ? OFFSET ?`, params);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const [[deal]] = await pool.execute(`${BASE_SELECT} WHERE d.id = ?`, [req.params.id]);
    if (!deal) return res.status(404).json({ error: 'Deal not found.' });
    if (!canAccess(req, deal.owner_id)) return res.status(403).json({ error: 'Access denied.' });
    const [activities] = await pool.execute(
      `SELECT a.*, u.name AS user_name, u.avatar_color AS user_color FROM activities a
       LEFT JOIN users u ON a.user_id = u.id WHERE a.deal_id = ? ORDER BY a.activity_date DESC`, [deal.id]
    );
    const [tasks] = await pool.execute(
      `SELECT t.*, u.name AS assigned_name FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id WHERE t.deal_id = ? ORDER BY t.due_date`, [deal.id]
    );
    res.json({ ...deal, activities, tasks });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

router.post('/', async (req, res) => {
  const {
    title, company_id, contact_id, stage_id, value, probability,
    expected_close_date, source, source_details, description,
    partner_id, offered_value, discount_percent, proposed_per_employee, offered_per_employee,
    employees_covered, implementation_fee, contract_months, go_live_date, commercial_notes,
    product_type,
  } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required.' });
  const owner_id = req.body.owner_id || req.user.id;
  if (req.user.role === 'rep' && owner_id !== req.user.id) return res.status(403).json({ error: 'Reps can only create deals for themselves.' });
  try {
    const [[stage]] = await pool.execute('SELECT probability FROM pipeline_stages WHERE id = ?', [stage_id]);
    const prob = probability ?? stage?.probability ?? 0;
    const [r] = await pool.execute(
      `INSERT INTO deals
         (title, company_id, contact_id, owner_id, stage_id, value, probability,
          expected_close_date, source, source_details, description, created_by,
          partner_id, offered_value, discount_percent, proposed_per_employee, offered_per_employee,
          employees_covered, implementation_fee, contract_months, go_live_date, commercial_notes,
          product_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, company_id || null, contact_id || null, owner_id, stage_id || null, value || 0, prob,
       expected_close_date || null, source || null, source_details || null, description || null, req.user.id,
       partner_id || null, offered_value || null, discount_percent || null,
       proposed_per_employee || null, offered_per_employee || null,
       employees_covered || null, implementation_fee || null,
       contract_months || null, go_live_date || null, commercial_notes || null,
       product_type || 'bundled']
    );
    res.status(201).json({ id: r.insertId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

router.put('/:id', async (req, res) => {
  const {
    title, company_id, contact_id, owner_id, stage_id, value, probability,
    expected_close_date, actual_close_date, source, source_details, description,
    partner_id, offered_value, discount_percent, proposed_per_employee, offered_per_employee,
    employees_covered, implementation_fee, contract_months, go_live_date, commercial_notes,
    product_type,
  } = req.body;
  try {
    const [[deal]] = await pool.execute(
      'SELECT owner_id, stage_id, company_id, contact_id FROM deals WHERE id = ?', [req.params.id]
    );
    if (!deal) return res.status(404).json({ error: 'Not found.' });
    if (!canAccess(req, deal.owner_id)) return res.status(403).json({ error: 'Access denied.' });
    const stageChanged = stage_id && stage_id !== deal.stage_id;
    let prob = probability;
    if (stageChanged && prob === undefined) {
      const [[s]] = await pool.execute('SELECT probability FROM pipeline_stages WHERE id = ?', [stage_id]);
      prob = s?.probability ?? 0;
    }
    await pool.execute(
      `UPDATE deals SET
         title = COALESCE(?, title),
         company_id = ?, contact_id = ?,
         owner_id = COALESCE(?, owner_id), stage_id = COALESCE(?, stage_id),
         value = COALESCE(?, value), probability = COALESCE(?, probability),
         expected_close_date = COALESCE(?, expected_close_date),
         actual_close_date = ?,
         source = COALESCE(?, source), source_details = ?,
         description = COALESCE(?, description),
         partner_id = ?,
         offered_value = ?, discount_percent = ?,
         proposed_per_employee = ?, offered_per_employee = ?,
         employees_covered = ?, implementation_fee = ?,
         contract_months = ?, go_live_date = ?,
         commercial_notes = ?,
         product_type = COALESCE(?, product_type),
         stage_changed_at = IF(? != stage_id, NOW(), stage_changed_at)
       WHERE id = ?`,
      [title || null,
       company_id ?? deal.company_id, contact_id ?? deal.contact_id,
       owner_id || null, stage_id || null,
       value ?? null, prob ?? null,
       expected_close_date || null,
       actual_close_date ?? null,
       source || null, source_details ?? null,
       description || null,
       partner_id ?? null,
       offered_value ?? null, discount_percent ?? null,
       proposed_per_employee ?? null, offered_per_employee ?? null,
       employees_covered ?? null, implementation_fee ?? null,
       contract_months ?? null, go_live_date ?? null,
       commercial_notes ?? null,
       product_type || null,
       stage_id || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const [[deal]] = await pool.execute('SELECT owner_id FROM deals WHERE id = ?', [req.params.id]);
    if (!deal) return res.status(404).json({ error: 'Not found.' });
    if (!canAccess(req, deal.owner_id)) return res.status(403).json({ error: 'Access denied.' });
    await pool.execute('DELETE FROM deals WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

export default router;
