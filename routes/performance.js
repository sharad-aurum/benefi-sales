import express from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

function localDateStr(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth() + 1;
  return `${y}-${String(m).padStart(2,'0')}-01`;
}
function periodEnd(year, month) {
  const d = new Date(year, month, 0);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function defaultPeriod() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  return {
    ps: `${y}-${String(m).padStart(2,'0')}-01`,
    pe: periodEnd(y, m),
    type: 'monthly',
  };
}

async function userMetrics(uid, ps, pe) {
  const [
    [wonRows], [actRows], [pipeRows], [winRows], [avgRows],
    [trendRows], [stalledRows], [atRiskRows], [closingSoonRows], [taskRows],
  ] = await Promise.all([
    pool.execute(`
      SELECT COALESCE(SUM(d.value),0) AS revenue_closed, COUNT(*) AS deals_won
      FROM deals d JOIN pipeline_stages ps ON d.stage_id = ps.id
      WHERE ps.is_won=1 AND d.owner_id=? AND d.actual_close_date BETWEEN ? AND ?
    `, [uid, ps, pe]),

    pool.execute(`
      SELECT type, COUNT(*) AS cnt FROM activities
      WHERE user_id=? AND activity_date BETWEEN ? AND ?
      GROUP BY type
    `, [uid, `${ps} 00:00:00`, `${pe} 23:59:59`]),

    pool.execute(`
      SELECT ps.name, ps.color, ps.display_order,
             COUNT(d.id) AS deal_count,
             COALESCE(SUM(d.value),0) AS total_value,
             COALESCE(SUM(d.value*d.probability/100),0) AS weighted_value
      FROM pipeline_stages ps
      LEFT JOIN deals d ON d.stage_id=ps.id AND d.owner_id=?
      WHERE ps.is_won=0 AND ps.is_lost=0
      GROUP BY ps.id ORDER BY ps.display_order
    `, [uid]),

    pool.execute(`
      SELECT
        SUM(CASE WHEN ps.is_won THEN 1 ELSE 0 END) AS won_count,
        SUM(CASE WHEN ps.is_lost THEN 1 ELSE 0 END) AS lost_count
      FROM deals d JOIN pipeline_stages ps ON d.stage_id=ps.id
      WHERE (ps.is_won=1 OR ps.is_lost=1) AND d.owner_id=?
      AND d.actual_close_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
    `, [uid]),

    pool.execute(`
      SELECT AVG(d.value) AS avg_deal_size,
             AVG(DATEDIFF(d.actual_close_date, d.created_at)) AS avg_cycle_days
      FROM deals d JOIN pipeline_stages ps ON d.stage_id=ps.id
      WHERE ps.is_won=1 AND d.owner_id=?
      AND d.actual_close_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
    `, [uid]),

    pool.execute(`
      SELECT DATE_FORMAT(d.actual_close_date,'%Y-%m') AS month,
             COALESCE(SUM(d.value),0) AS revenue, COUNT(*) AS deals_count
      FROM deals d JOIN pipeline_stages ps ON d.stage_id=ps.id
      WHERE ps.is_won=1 AND d.owner_id=?
      AND d.actual_close_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      GROUP BY month ORDER BY month
    `, [uid]),

    pool.execute(`
      SELECT d.id, d.title, d.value, co.name AS company_name,
             ps.name AS stage_name, ps.color AS stage_color,
             (SELECT MAX(a.activity_date) FROM activities a WHERE a.deal_id=d.id) AS last_activity,
             DATEDIFF(NOW(), COALESCE(
               (SELECT MAX(a.activity_date) FROM activities a WHERE a.deal_id=d.id),
               d.created_at)) AS days_stalled
      FROM deals d
      JOIN pipeline_stages ps ON d.stage_id=ps.id
      LEFT JOIN companies co ON d.company_id=co.id
      WHERE ps.is_won=0 AND ps.is_lost=0 AND d.owner_id=?
      AND DATEDIFF(NOW(), COALESCE(
            (SELECT MAX(a.activity_date) FROM activities a WHERE a.deal_id=d.id),
            d.created_at)) >= 14
      ORDER BY days_stalled DESC LIMIT 8
    `, [uid]),

    pool.execute(`
      SELECT d.id, d.title, d.value, co.name AS company_name,
             ps.name AS stage_name, ps.color AS stage_color,
             d.expected_close_date,
             DATEDIFF(CURDATE(), d.expected_close_date) AS days_overdue
      FROM deals d
      JOIN pipeline_stages ps ON d.stage_id=ps.id
      LEFT JOIN companies co ON d.company_id=co.id
      WHERE ps.is_won=0 AND ps.is_lost=0 AND d.owner_id=?
      AND d.expected_close_date < CURDATE()
      ORDER BY d.expected_close_date ASC LIMIT 8
    `, [uid]),

    pool.execute(`
      SELECT d.id, d.title, d.value, co.name AS company_name,
             ps.name AS stage_name, ps.color AS stage_color,
             d.expected_close_date,
             DATEDIFF(d.expected_close_date, CURDATE()) AS days_to_close,
             (SELECT MAX(a.activity_date) FROM activities a WHERE a.deal_id=d.id) AS last_activity
      FROM deals d
      JOIN pipeline_stages ps ON d.stage_id=ps.id
      LEFT JOIN companies co ON d.company_id=co.id
      WHERE ps.is_won=0 AND ps.is_lost=0 AND d.owner_id=?
      AND d.expected_close_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 14 DAY)
      AND DATEDIFF(NOW(), COALESCE(
            (SELECT MAX(a.activity_date) FROM activities a WHERE a.deal_id=d.id),
            d.created_at)) >= 7
      ORDER BY d.expected_close_date ASC LIMIT 8
    `, [uid]),

    pool.execute(`
      SELECT t.id, t.title, t.due_date, t.priority, d.title AS deal_title, d.id AS deal_id
      FROM tasks t LEFT JOIN deals d ON t.deal_id=d.id
      WHERE t.assigned_to=? AND t.status='open' AND t.due_date < NOW()
      ORDER BY t.due_date ASC LIMIT 8
    `, [uid]),
  ]);

  const won = wonRows[0] || {};
  const actMap = Object.fromEntries(actRows.map(r => [r.type, Number(r.cnt)]));
  const pipeTotal    = pipeRows.reduce((s,r) => s + Number(r.total_value), 0);
  const pipeWeighted = pipeRows.reduce((s,r) => s + Number(r.weighted_value), 0);
  const winData = winRows[0] || {};
  const winTotal = (Number(winData.won_count)||0) + (Number(winData.lost_count)||0);
  const winRate = winTotal > 0 ? Math.round(Number(winData.won_count) / winTotal * 100) : null;
  const avgData = avgRows[0] || {};
  const avgDealSize  = Number(avgData.avg_deal_size)  || 0;
  const avgCycleDays = Number(avgData.avg_cycle_days) || 0;
  const dealVelocity = avgCycleDays > 0 ? Math.round((avgDealSize * (winRate||0) / 100) / avgCycleDays) : 0;

  return {
    revenue_closed: Number(won.revenue_closed) || 0,
    deals_won:      Number(won.deals_won) || 0,
    activities: {
      call:     actMap.call     || 0,
      proposal: actMap.proposal  || 0,
      meeting:  actMap.meeting  || 0,
      note:     actMap.note     || 0,
      whatsapp: actMap.whatsapp || 0,
    },
    pipeline: { total: pipeTotal, weighted: pipeWeighted, by_stage: pipeRows },
    win_rate:  { rate: winRate, won: Number(winData.won_count)||0, lost: Number(winData.lost_count)||0 },
    avg:       { deal_size: Math.round(avgDealSize), cycle_days: Math.round(avgCycleDays), velocity: dealVelocity },
    trend:         trendRows,
    stalled:       stalledRows,
    at_risk:       atRiskRows,
    closing_soon:  closingSoonRows,
    overdue_tasks: taskRows,
  };
}

// ── My Performance ────────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const { period_start, period_end, period_type = 'monthly' } = req.query;
    const def = defaultPeriod();
    const ps = period_start || def.ps;
    const pe = period_end   || def.pe;
    const uid = req.user.id;

    const [[quotaRow]] = await pool.execute(
      'SELECT * FROM quotas WHERE user_id=? AND period_start=? AND period_type=?',
      [uid, ps, period_type]
    );
    const quota = quotaRow || {};
    const metrics = await userMetrics(uid, ps, pe);

    const revClosed = metrics.revenue_closed;
    const revTarget = Number(quota.revenue_target) || 0;
    const revGap    = Math.max(0, revTarget - revClosed);
    const revAttain = revTarget > 0 ? Math.round(revClosed / revTarget * 100) : null;
    const dealGap   = quota.deals_target ? Math.max(0, quota.deals_target - metrics.deals_won) : null;
    const pipeCov   = revGap > 0 ? Math.round(metrics.pipeline.total / revGap * 10) / 10 : null;

    res.json({
      period: { start: ps, end: pe, type: period_type },
      quota,
      ...metrics,
      attainment: {
        revenue: { closed: revClosed, target: revTarget, gap: revGap, pct: revAttain },
        deals:   { won: metrics.deals_won, target: quota.deals_target || null, gap: dealGap },
        pipeline_coverage: pipeCov,
      },
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

// ── Team Performance ──────────────────────────────────────────────────────────
router.get('/team', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { period_start, period_end, period_type = 'monthly' } = req.query;
    const def = defaultPeriod();
    const ps = period_start || def.ps;
    const pe = period_end   || def.pe;

    const [users] = await pool.execute(
      "SELECT id, name, avatar_color AS color FROM users WHERE is_active=1 ORDER BY name"
    );

    const teamData = await Promise.all(users.map(async u => {
      const [[quota]] = await pool.execute(
        'SELECT * FROM quotas WHERE user_id=? AND period_start=? AND period_type=?',
        [u.id, ps, period_type]
      );
      const [[won]] = await pool.execute(`
        SELECT COALESCE(SUM(d.value),0) AS rev, COUNT(*) AS dw
        FROM deals d JOIN pipeline_stages ps ON d.stage_id=ps.id
        WHERE ps.is_won=1 AND d.owner_id=? AND d.actual_close_date BETWEEN ? AND ?
      `, [u.id, ps, pe]);
      const [[pipe]] = await pool.execute(`
        SELECT COALESCE(SUM(d.value),0) AS tot, COALESCE(SUM(d.value*d.probability/100),0) AS wtd
        FROM deals d JOIN pipeline_stages ps ON d.stage_id=ps.id
        WHERE ps.is_won=0 AND ps.is_lost=0 AND d.owner_id=?
      `, [u.id]);
      const [[winR]] = await pool.execute(`
        SELECT SUM(CASE WHEN ps.is_won THEN 1 ELSE 0 END) AS w,
               SUM(CASE WHEN ps.is_lost THEN 1 ELSE 0 END) AS l
        FROM deals d JOIN pipeline_stages ps ON d.stage_id=ps.id
        WHERE (ps.is_won=1 OR ps.is_lost=1) AND d.owner_id=?
        AND d.actual_close_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
      `, [u.id]);
      const [acts] = await pool.execute(`
        SELECT type, COUNT(*) AS cnt FROM activities
        WHERE user_id=? AND activity_date BETWEEN ? AND ? GROUP BY type
      `, [u.id, `${ps} 00:00:00`, `${pe} 23:59:59`]);
      const actMap = Object.fromEntries(acts.map(a => [a.type, Number(a.cnt)]));

      const rev = Number(won?.rev) || 0;
      const revT = Number(quota?.revenue_target) || 0;
      const wtotal = (Number(winR?.w)||0) + (Number(winR?.l)||0);
      return {
        ...u,
        revenue_closed:  rev,
        revenue_target:  revT,
        attainment_pct:  revT > 0 ? Math.round(rev / revT * 100) : null,
        revenue_gap:     Math.max(0, revT - rev),
        deals_won:       Number(won?.dw) || 0,
        deals_target:    quota?.deals_target || null,
        win_rate:        wtotal > 0 ? Math.round(Number(winR.w) / wtotal * 100) : null,
        pipeline_total:  Number(pipe?.tot) || 0,
        pipeline_wtd:    Number(pipe?.wtd) || 0,
        calls:     actMap.call    || 0, calls_target:    quota?.calls_target    || 0,
        meetings:  actMap.meeting || 0, meetings_target: quota?.meetings_target || 0,
        proposals: actMap.proposal || 0, emails_target:   quota?.emails_target   || 0,
        quota: quota || null,
      };
    }));

    res.json({ period: { start: ps, end: pe, type: period_type }, team: teamData });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

// ── Quotas management ─────────────────────────────────────────────────────────
router.get('/quotas', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT q.*, u.name AS user_name FROM quotas q JOIN users u ON q.user_id=u.id ORDER BY q.period_start DESC, u.name`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.post('/quotas', requireRole('admin', 'manager'), async (req, res) => {
  const { user_id, period_type, period_start, period_end, revenue_target, deals_target, calls_target, meetings_target, emails_target } = req.body;
  if (!user_id || !period_start) return res.status(400).json({ error: 'user_id and period_start required.' });
  try {
    await pool.execute(`
      INSERT INTO quotas (user_id,period_type,period_start,period_end,revenue_target,deals_target,calls_target,meetings_target,emails_target,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        period_end=VALUES(period_end), revenue_target=VALUES(revenue_target),
        deals_target=VALUES(deals_target), calls_target=VALUES(calls_target),
        meetings_target=VALUES(meetings_target), emails_target=VALUES(emails_target)
    `, [user_id, period_type||'monthly', period_start, period_end||null,
        revenue_target||0, deals_target||0, calls_target||0, meetings_target||0, emails_target||0, req.user.id]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

export default router;
