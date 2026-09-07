import express from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// Dashboard summary
router.get('/dashboard', async (req, res) => {
  try {
    const uid = req.user.role === 'rep' ? req.user.id : null;
    const ownerFilter = uid ? 'AND d.owner_id = ?' : '';
    const ownerParams = uid ? [uid] : [];

    const [[pipeline]] = await pool.execute(
      `SELECT COALESCE(SUM(d.value),0) AS total, COUNT(*) AS count FROM deals d
       LEFT JOIN pipeline_stages ps ON d.stage_id = ps.id WHERE ps.is_won = 0 AND ps.is_lost = 0 ${ownerFilter}`, ownerParams
    );
    const [[wonMonth]] = await pool.execute(
      `SELECT COALESCE(SUM(d.value),0) AS value, COUNT(*) AS count FROM deals d
       LEFT JOIN pipeline_stages ps ON d.stage_id = ps.id
       WHERE ps.is_won = 1 AND MONTH(d.updated_at) = MONTH(NOW()) AND YEAR(d.updated_at) = YEAR(NOW()) ${ownerFilter}`, ownerParams
    );
    const [[tasksDue]] = await pool.execute(
      `SELECT COUNT(*) AS count FROM tasks WHERE status = 'open' AND DATE(due_date) <= CURDATE() ${uid ? 'AND assigned_to = ?' : ''}`,
      uid ? [uid] : []
    );
    const [recentActivities] = await pool.execute(
      `SELECT a.id, a.type, a.subject, a.activity_date, u.name AS user_name,
              d.title AS deal_title, d.id AS deal_id
       FROM activities a LEFT JOIN users u ON a.user_id = u.id LEFT JOIN deals d ON a.deal_id = d.id
       ${uid ? 'WHERE a.user_id = ?' : ''} ORDER BY a.activity_date DESC LIMIT 8`,
      uid ? [uid] : []
    );
    const [closingSoon] = await pool.execute(
      `SELECT d.id, d.title, d.value, d.expected_close_date, ps.name AS stage_name, ps.color AS stage_color,
              u.name AS owner_name, co.name AS company_name
       FROM deals d LEFT JOIN pipeline_stages ps ON d.stage_id = ps.id LEFT JOIN users u ON d.owner_id = u.id LEFT JOIN companies co ON d.company_id = co.id
       WHERE ps.is_won = 0 AND ps.is_lost = 0 AND d.expected_close_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 14 DAY) ${ownerFilter}
       ORDER BY d.expected_close_date LIMIT 5`, ownerParams
    );
    const [openTasks] = await pool.execute(
      `SELECT t.id, t.title, t.priority, t.due_date, d.title AS deal_title
       FROM tasks t LEFT JOIN deals d ON t.deal_id = d.id
       WHERE t.status = 'open' ${uid ? 'AND t.assigned_to = ?' : ''} ORDER BY t.due_date LIMIT 5`,
      uid ? [uid] : []
    );

    // Headcount & product type breakdown for open pipeline
    const [headcountRows] = await pool.execute(
      `SELECT d.product_type,
              COUNT(*) AS deal_count,
              COALESCE(SUM(d.employees_covered),0) AS total_employees,
              COALESCE(SUM(d.value),0) AS total_value,
              COALESCE(SUM(d.employees_covered * d.proposed_per_employee),0) AS potential_mrr
       FROM deals d JOIN pipeline_stages ps ON d.stage_id=ps.id
       WHERE ps.is_won=0 AND ps.is_lost=0 ${ownerFilter}
       GROUP BY d.product_type`, ownerParams
    );

    res.json({ pipeline, wonMonth, tasksDue, recentActivities, closingSoon, openTasks, headcountRows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

// Pipeline by stage
router.get('/pipeline', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT ps.name, ps.color, ps.is_won, ps.is_lost,
              COUNT(d.id) AS deal_count, COALESCE(SUM(d.value),0) AS total_value,
              ROUND(AVG(d.probability),0) AS avg_prob
       FROM pipeline_stages ps LEFT JOIN deals d ON d.stage_id = ps.id
       GROUP BY ps.id ORDER BY ps.display_order`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// Monthly revenue trend (last 6 months)
router.get('/monthly', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT DATE_FORMAT(d.updated_at,'%Y-%m') AS month,
              COALESCE(SUM(CASE WHEN ps.is_won = 1 THEN d.value ELSE 0 END),0) AS won,
              COALESCE(SUM(CASE WHEN ps.is_lost = 1 THEN d.value ELSE 0 END),0) AS lost
       FROM deals d LEFT JOIN pipeline_stages ps ON d.stage_id = ps.id
       WHERE d.updated_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH) AND (ps.is_won = 1 OR ps.is_lost = 1)
       GROUP BY month ORDER BY month`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// Owner performance
router.get('/owners', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.name, u.avatar_color AS color,
              COUNT(d.id) AS total_deals,
              SUM(CASE WHEN ps.is_won = 1 THEN 1 ELSE 0 END) AS won_deals,
              COALESCE(SUM(CASE WHEN ps.is_won = 1 THEN d.value ELSE 0 END),0) AS won_value,
              COALESCE(SUM(CASE WHEN ps.is_won = 0 AND ps.is_lost = 0 THEN d.value ELSE 0 END),0) AS pipeline_value
       FROM users u LEFT JOIN deals d ON d.owner_id = u.id LEFT JOIN pipeline_stages ps ON d.stage_id = ps.id
       WHERE u.is_active = 1 GROUP BY u.id ORDER BY won_value DESC`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// Target dashboard — monthly actuals vs quotas per rep
router.get('/targets', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();

    // All active reps
    const [reps] = await pool.execute(
      `SELECT id, name, avatar_color AS color FROM users WHERE is_active=1 ORDER BY name`
    );

    // Monthly activity counts per user per type
    const [actRows] = await pool.execute(
      `SELECT user_id,
              DATE_FORMAT(activity_date,'%Y-%m') AS month,
              SUM(type='call')    AS calls,
              SUM(type='meeting') AS meetings,
              SUM(type='proposal') AS emails
       FROM activities
       WHERE YEAR(activity_date) = ?
       GROUP BY user_id, month`, [year]
    );

    // Monthly won deals (conversions) + employees covered per user
    const [wonRows] = await pool.execute(
      `SELECT d.owner_id AS user_id,
              DATE_FORMAT(d.updated_at,'%Y-%m') AS month,
              COUNT(*) AS conversions,
              COALESCE(SUM(d.employees_covered),0) AS employees
       FROM deals d JOIN pipeline_stages ps ON d.stage_id=ps.id
       WHERE ps.is_won=1 AND YEAR(d.updated_at)=?
       GROUP BY d.owner_id, month`, [year]
    );

    // Quotas for the year
    const [quotaRows] = await pool.execute(
      `SELECT user_id, DATE_FORMAT(period_start,'%Y-%m') AS month,
              calls_target, meetings_target, emails_target,
              deals_target AS conversions_target, revenue_target
       FROM quotas
       WHERE YEAR(period_start)=? AND period_type='monthly'`, [year]
    );

    // Build month list
    const months = Array.from({length:12},(_,i)=>{
      const m = String(i+1).padStart(2,'0');
      return `${year}-${m}`;
    });

    // Index lookups
    const actMap  = {};  actRows.forEach(r  => { actMap[`${r.user_id}|${r.month}`]   = r; });
    const wonMap  = {};  wonRows.forEach(r  => { wonMap[`${r.user_id}|${r.month}`]   = r; });
    const quotMap = {};  quotaRows.forEach(r => { quotMap[`${r.user_id}|${r.month}`] = r; });

    // Aggregate team-level quota targets (sum across all reps that have quotas)
    const teamTargets = {};
    months.forEach(m => {
      teamTargets[m] = { calls:0, meetings:0, emails:0, conversions:0 };
      reps.forEach(rep => {
        const q = quotMap[`${rep.id}|${m}`] || {};
        teamTargets[m].calls       += Number(q.calls_target||0);
        teamTargets[m].meetings    += Number(q.meetings_target||0);
        teamTargets[m].emails      += Number(q.emails_target||0);
        teamTargets[m].conversions += Number(q.conversions_target||0);
      });
    });

    // Build per-rep monthly grid
    const repData = reps.map(rep => ({
      ...rep,
      months: months.map(m => {
        const a = actMap[`${rep.id}|${m}`] || {};
        const w = wonMap[`${rep.id}|${m}`] || {};
        const q = quotMap[`${rep.id}|${m}`] || {};
        return {
          month:          m,
          calls:          Number(a.calls||0),
          meetings:       Number(a.meetings||0),
          emails:         Number(a.emails||0),
          conversions:    Number(w.conversions||0),
          employees:      Number(w.employees||0),
          calls_t:        Number(q.calls_target||0),
          meetings_t:     Number(q.meetings_target||0),
          emails_t:       Number(q.emails_target||0),
          conversions_t:  Number(q.conversions_target||0),
        };
      }),
    }));

    // Team totals per month
    const teamMonths = months.map(m => {
      const tgt = teamTargets[m];
      const actual = { calls:0, meetings:0, emails:0, conversions:0, employees:0 };
      reps.forEach(rep => {
        const a = actMap[`${rep.id}|${m}`] || {};
        const w = wonMap[`${rep.id}|${m}`] || {};
        actual.calls       += Number(a.calls||0);
        actual.meetings    += Number(a.meetings||0);
        actual.emails      += Number(a.emails||0);
        actual.conversions += Number(w.conversions||0);
        actual.employees   += Number(w.employees||0);
      });
      return { month: m, ...actual, ...tgt };
    });

    res.json({ year, months, reps: repData, team: teamMonths });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

export default router;
