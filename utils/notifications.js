import pool from '../db/pool.js';
import { sendMail, ph, phNow, peso } from './mailer.js';

// ── Email shell ───────────────────────────────────────────────────────────────
function shell(title, body, color = '#0F766E') {
  return `
<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:auto;background:#fff;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden">
  <div style="background:${color};padding:18px 24px">
    <h2 style="color:#fff;margin:0;font-size:15px;font-weight:700">${title}</h2>
    <p style="color:rgba(255,255,255,.75);margin:4px 0 0;font-size:12px">BeneFi Sales CRM · ${phNow()} PH</p>
  </div>
  <div style="padding:20px 24px;font-size:13.5px;color:#1E293B;line-height:1.6">
    ${body}
  </div>
  <div style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:12px 24px;font-size:11px;color:#94A3B8;text-align:center">
    BeneFi CRM · <a href="https://sales-app.benefi.ph" style="color:#0F766E">sales-app.benefi.ph</a>
  </div>
</div>`;
}

function row(label, value) {
  return `<tr>
    <td style="color:#64748B;padding:5px 0;width:130px;vertical-align:top;font-size:12.5px">${label}</td>
    <td style="font-weight:600;padding:5px 0;font-size:13px">${value}</td>
  </tr>`;
}

function dealTable(d) {
  return `<table style="width:100%;border-collapse:collapse;margin:12px 0">
    ${row('Deal', d.title || '—')}
    ${row('Company', d.company_name || '—')}
    ${row('Value', peso(d.value))}
    ${row('Headcount', d.employees_covered ? Number(d.employees_covered).toLocaleString() + ' emp' : '—')}
    ${row('Close Date', ph(d.expected_close_date))}
    ${row('Stage', d.stage_name || '—')}
    ${row('Owner', d.owner_name || '—')}
  </table>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getManagers() {
  const [rows] = await pool.execute(
    "SELECT email FROM users WHERE role IN ('admin','manager') AND is_active = 1 AND email IS NOT NULL"
  );
  return rows.map(r => r.email).filter(Boolean);
}

async function getUserEmail(userId) {
  const [[u]] = await pool.execute('SELECT email FROM users WHERE id = ?', [userId]);
  return u?.email || null;
}

async function getDeal(dealId) {
  const [[d]] = await pool.execute(`
    SELECT d.id, d.title, d.value, d.employees_covered, d.expected_close_date,
           d.lost_reason, d.stage_changed_at, d.close_date_push_count,
           co.name AS company_name,
           u.id AS owner_id, u.name AS owner_name, u.email AS owner_email,
           ps.name AS stage_name, ps.is_won, ps.is_lost
    FROM deals d
    LEFT JOIN companies co ON d.company_id = co.id
    LEFT JOIN users u ON d.owner_id = u.id
    LEFT JOIN pipeline_stages ps ON d.stage_id = ps.id
    WHERE d.id = ?`, [dealId]);
  return d || null;
}

// ── A1 — New Deal Created ─────────────────────────────────────────────────────
export async function notifyDealCreated(dealId, createdByName) {
  const d = await getDeal(dealId);
  if (!d) return;
  const managers = await getManagers();
  const to = [...new Set([d.owner_email, ...managers].filter(Boolean))].join(', ');
  await sendMail({
    to,
    subject: `[New Deal] ${d.title} — ${d.company_name || 'No company'}`,
    html: shell(
      '🆕 New Deal Created',
      `<p><strong>${createdByName}</strong> created a new deal.</p>
       ${dealTable(d)}
       <a href="https://sales-app.benefi.ph" style="display:inline-block;margin-top:12px;background:#0F766E;color:#fff;padding:8px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Open in CRM →</a>`
    ),
  });
}

// ── A2 — Stage Changed ────────────────────────────────────────────────────────
export async function notifyStageChanged(dealId, oldStageName, newStageName) {
  const d = await getDeal(dealId);
  if (!d) return;
  const managers = await getManagers();
  const to = [...new Set([d.owner_email, ...managers].filter(Boolean))].join(', ');
  const isWin  = d.is_won;
  const isLoss = d.is_lost;
  const color  = isWin ? '#16A34A' : isLoss ? '#DC2626' : '#0F766E';
  const icon   = isWin ? '🏆' : isLoss ? '❌' : '⬆️';
  await sendMail({
    to,
    subject: `[${icon} Stage Change] ${d.title} → ${newStageName}`,
    html: shell(
      `${icon} Deal Stage Changed`,
      `<p>Deal moved from <strong>${oldStageName}</strong> → <strong>${newStageName}</strong></p>
       ${dealTable(d)}
       ${d.lost_reason && isLoss ? `<div style="margin-top:10px;padding:10px 14px;background:#FEF2F2;border-radius:6px;color:#991B1B;font-size:13px"><strong>Lost reason:</strong> ${d.lost_reason}</div>` : ''}
       <a href="https://sales-app.benefi.ph" style="display:inline-block;margin-top:12px;background:${color};color:#fff;padding:8px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">View Deal →</a>`,
      color
    ),
  });
}

// ── A3 — Deal Won ─────────────────────────────────────────────────────────────
export async function notifyDealWon(dealId) {
  const d = await getDeal(dealId);
  if (!d) return;
  const managers = await getManagers();
  const salesGroup = process.env.SALES_GROUP_EMAIL || 'sales@benefi.ph';
  const to = [...new Set([d.owner_email, ...managers, salesGroup].filter(Boolean))].join(', ');
  await sendMail({
    to,
    subject: `🏆 DEAL WON — ${d.company_name || d.title} (${peso(d.value)}/mo)`,
    html: shell(
      '🏆 Deal Won!',
      `<p style="font-size:16px;font-weight:700;color:#16A34A">Congratulations, ${d.owner_name}!</p>
       <p>A new client has been closed.</p>
       ${dealTable(d)}
       <a href="https://sales-app.benefi.ph" style="display:inline-block;margin-top:12px;background:#16A34A;color:#fff;padding:8px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">View in CRM →</a>`,
      '#16A34A'
    ),
  });
}

// ── A4 — Deal Lost ────────────────────────────────────────────────────────────
export async function notifyDealLost(dealId) {
  const d = await getDeal(dealId);
  if (!d) return;
  const managers = await getManagers();
  const to = [...new Set([d.owner_email, ...managers].filter(Boolean))].join(', ');
  await sendMail({
    to,
    subject: `[Deal Lost] ${d.company_name || d.title}`,
    html: shell(
      '❌ Deal Marked as Lost',
      `${dealTable(d)}
       ${d.lost_reason ? `<div style="margin-top:10px;padding:10px 14px;background:#FEF2F2;border-radius:6px;color:#991B1B;font-size:13px"><strong>Lost reason:</strong> ${d.lost_reason}</div>` : '<p style="color:#DC2626;font-size:12px;margin-top:8px">⚠ No lost reason recorded. Please update the deal.</p>'}`,
      '#DC2626'
    ),
  });
}

// ── A5 — Close Date Pushed ────────────────────────────────────────────────────
export async function notifyCloseDatePushed(dealId, oldDate, newDate) {
  const d = await getDeal(dealId);
  if (!d) return;
  const managers = await getManagers();
  const to = [...new Set([d.owner_email, ...managers].filter(Boolean))].join(', ');
  const pushCount = d.close_date_push_count;
  const warning = pushCount >= 3
    ? `<div style="padding:10px 14px;background:#FEF9C3;border-radius:6px;color:#854D0E;font-size:13px;margin-top:10px">⚠ This deal's close date has been pushed <strong>${pushCount} time${pushCount > 1 ? 's' : ''}</strong>. Review deal health.</div>`
    : '';
  await sendMail({
    to,
    subject: `[Close Date Pushed #${pushCount}] ${d.title} — ${d.company_name || ''}`,
    html: shell(
      `📅 Close Date Updated (Push #${pushCount})`,
      `<p>The expected close date for <strong>${d.title}</strong> has been moved.</p>
       <table style="width:100%;border-collapse:collapse;margin:12px 0">
         ${row('Deal', d.title)}
         ${row('Company', d.company_name || '—')}
         ${row('Old Close Date', ph(oldDate))}
         ${row('New Close Date', ph(newDate))}
         ${row('Times Pushed', `${pushCount}`)}
         ${row('Owner', d.owner_name || '—')}
       </table>
       ${warning}`,
      '#D97706'
    ),
  });
}

// ── A6 — Task Assigned ────────────────────────────────────────────────────────
export async function notifyTaskAssigned(taskId, assignedToId, assignedByName) {
  const [[task]] = await pool.execute(
    `SELECT t.*, d.title AS deal_title, co.name AS company_name, u.name AS assignee_name, u.email AS assignee_email
     FROM tasks t
     LEFT JOIN deals d ON t.deal_id = d.id
     LEFT JOIN companies co ON d.company_id = co.id
     LEFT JOIN users u ON t.assigned_to = u.id
     WHERE t.id = ?`, [taskId]
  );
  if (!task?.assignee_email) return;
  await sendMail({
    to: task.assignee_email,
    subject: `[Task Assigned] ${task.title}`,
    html: shell(
      '📋 New Task Assigned to You',
      `<p><strong>${assignedByName}</strong> assigned you a task.</p>
       <table style="width:100%;border-collapse:collapse;margin:12px 0">
         ${row('Task', task.title)}
         ${row('Priority', task.priority?.toUpperCase() || 'MEDIUM')}
         ${row('Due Date', ph(task.due_date))}
         ${row('Deal', task.deal_title || '—')}
         ${row('Company', task.company_name || '—')}
         ${task.description ? row('Notes', task.description) : ''}
       </table>
       <a href="https://sales-app.benefi.ph" style="display:inline-block;margin-top:12px;background:#0F766E;color:#fff;padding:8px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Open Tasks →</a>`
    ),
  });
}

// ── B1 — Morning Task Digest (per user) ──────────────────────────────────────
export async function sendMorningTaskDigests() {
  const [users] = await pool.execute(
    "SELECT id, name, email FROM users WHERE is_active = 1 AND email IS NOT NULL"
  );
  const today = new Date().toISOString().slice(0, 10);

  for (const u of users) {
    const [tasks] = await pool.execute(
      `SELECT t.title, t.priority, t.due_date, t.status, d.title AS deal_title
       FROM tasks t LEFT JOIN deals d ON t.deal_id = d.id
       WHERE t.assigned_to = ? AND t.status = 'open'
       ORDER BY FIELD(t.priority,'high','medium','low'), t.due_date`,
      [u.id]
    );
    const dueToday  = tasks.filter(t => t.due_date?.toString().slice(0, 10) === today);
    const overdue   = tasks.filter(t => t.due_date && t.due_date.toString().slice(0, 10) < today);
    if (!dueToday.length && !overdue.length) continue;

    const taskRows = (arr, label, color) => arr.length
      ? `<p style="font-weight:700;color:${color};margin:14px 0 6px">${label} (${arr.length})</p>
         <table style="width:100%;border-collapse:collapse">
           ${arr.map(t => `<tr>
             <td style="padding:5px 0;border-bottom:1px solid #F1F5F9;font-size:13px">${t.title}</td>
             <td style="padding:5px 0;border-bottom:1px solid #F1F5F9;font-size:11px;color:#64748B;white-space:nowrap">${t.deal_title || ''}</td>
             <td style="padding:5px 0;border-bottom:1px solid #F1F5F9;font-size:11px;color:${color};white-space:nowrap;text-align:right">${t.priority?.toUpperCase()}</td>
           </tr>`).join('')}
         </table>` : '';

    await sendMail({
      to: u.email,
      subject: `Good morning ${u.name.split(' ')[0]} — ${overdue.length ? overdue.length + ' overdue, ' : ''}${dueToday.length} due today`,
      html: shell(
        `☀️ Your Task Digest — ${new Date().toLocaleDateString('en-PH', { weekday:'long', month:'short', day:'numeric', timeZone:'Asia/Manila' })}`,
        `<p>Hi <strong>${u.name.split(' ')[0]}</strong>, here's your task rundown for today.</p>
         ${taskRows(overdue, '🔴 Overdue', '#DC2626')}
         ${taskRows(dueToday, '📋 Due Today', '#D97706')}
         <a href="https://sales-app.benefi.ph" style="display:inline-block;margin-top:16px;background:#0F766E;color:#fff;padding:8px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Open Tasks →</a>`
      ),
    });
  }
}

// ── B2 — Close Date Warning (≤3 days) ────────────────────────────────────────
export async function sendCloseDateWarnings() {
  const threeDays = new Date(); threeDays.setDate(threeDays.getDate() + 3);
  const [deals] = await pool.execute(
    `SELECT d.id, d.title, d.value, d.expected_close_date, d.employees_covered,
            co.name AS company_name,
            u.name AS owner_name, u.email AS owner_email,
            ps.name AS stage_name
     FROM deals d
     LEFT JOIN companies co ON d.company_id = co.id
     LEFT JOIN users u ON d.owner_id = u.id
     LEFT JOIN pipeline_stages ps ON d.stage_id = ps.id
     WHERE ps.is_won = 0 AND ps.is_lost = 0
       AND d.expected_close_date BETWEEN CURDATE() AND ?`,
    [threeDays.toISOString().slice(0, 10)]
  );

  // Group by owner
  const byOwner = {};
  for (const d of deals) {
    if (!d.owner_email) continue;
    (byOwner[d.owner_email] = byOwner[d.owner_email] || { name: d.owner_name, deals: [] }).deals.push(d);
  }

  for (const [email, { name, deals: ownerDeals }] of Object.entries(byOwner)) {
    const daysUntil = d => {
      const diff = new Date(d.expected_close_date) - new Date();
      return Math.ceil(diff / 86400000);
    };
    const rows = ownerDeals.map(d => {
      const days = daysUntil(d);
      const urgency = days <= 0 ? '🔴 TODAY' : days === 1 ? '🟠 Tomorrow' : `🟡 ${days} days`;
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:13px;font-weight:600">${d.title}</td>
        <td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:12px;color:#64748B">${d.company_name || '—'}</td>
        <td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:12px;text-align:right">${peso(d.value)}/mo</td>
        <td style="padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:12px;text-align:right;white-space:nowrap">${urgency}</td>
      </tr>`;
    }).join('');

    await sendMail({
      to: email,
      subject: `⏰ ${ownerDeals.length} deal${ownerDeals.length > 1 ? 's' : ''} closing within 3 days`,
      html: shell(
        '⏰ Deals Closing Soon',
        `<p>Hi <strong>${name?.split(' ')[0]}</strong>, these deals need your attention today.</p>
         <table style="width:100%;border-collapse:collapse;margin-top:12px">
           <thead><tr>
             <th style="text-align:left;font-size:11px;color:#94A3B8;padding:4px 0">Deal</th>
             <th style="text-align:left;font-size:11px;color:#94A3B8;padding:4px 0">Company</th>
             <th style="text-align:right;font-size:11px;color:#94A3B8;padding:4px 0">Value</th>
             <th style="text-align:right;font-size:11px;color:#94A3B8;padding:4px 0">Closes</th>
           </tr></thead>
           <tbody>${rows}</tbody>
         </table>
         <a href="https://sales-app.benefi.ph" style="display:inline-block;margin-top:16px;background:#0F766E;color:#fff;padding:8px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Open Pipeline →</a>`,
        '#D97706'
      ),
    });
  }
}

// ── B3 — End-of-Day Summary ───────────────────────────────────────────────────
export async function sendEodSummary() {
  const salesEmail = process.env.SALES_GROUP_EMAIL || 'sales@benefi.ph';
  const today = new Date().toISOString().slice(0, 10);

  const [[{ dealsWon }]]     = await pool.execute(`SELECT COUNT(*) AS dealsWon FROM deals d JOIN pipeline_stages ps ON d.stage_id = ps.id WHERE ps.is_won=1 AND DATE(d.updated_at)=?`, [today]);
  const [[{ dealsLost }]]    = await pool.execute(`SELECT COUNT(*) AS dealsLost FROM deals d JOIN pipeline_stages ps ON d.stage_id = ps.id WHERE ps.is_lost=1 AND DATE(d.updated_at)=?`, [today]);
  const [[{ newDeals }]]     = await pool.execute(`SELECT COUNT(*) AS newDeals FROM deals WHERE DATE(created_at)=?`, [today]);
  const [[{ stageChanges }]] = await pool.execute(`SELECT COUNT(*) AS stageChanges FROM deals WHERE DATE(stage_changed_at)=?`, [today]);
  const [[{ tasksDone }]]    = await pool.execute(`SELECT COUNT(*) AS tasksDone FROM tasks WHERE DATE(completed_at)=?`, [today]);
  const [[{ tasksOverdue }]] = await pool.execute(`SELECT COUNT(*) AS tasksOverdue FROM tasks WHERE status='open' AND due_date < CURDATE()`, []);
  const [[{ tasksDueToday }]]= await pool.execute(`SELECT COUNT(*) AS tasksDueToday FROM tasks WHERE status='open' AND due_date=?`, [today]);
  const [[{ activities }]]   = await pool.execute(`SELECT COUNT(*) AS activities FROM activities WHERE DATE(created_at)=?`, [today]);
  const [[{ enquiries }]]    = await pool.execute(`SELECT COUNT(*) AS enquiries FROM enquiries WHERE DATE(created_at)=?`, [today]);

  // Won deals detail
  const [wonDeals] = await pool.execute(
    `SELECT d.title, d.value, co.name AS company_name, u.name AS owner_name
     FROM deals d JOIN pipeline_stages ps ON d.stage_id=ps.id
     LEFT JOIN companies co ON d.company_id=co.id LEFT JOIN users u ON d.owner_id=u.id
     WHERE ps.is_won=1 AND DATE(d.updated_at)=?`, [today]
  );

  // Reps with zero activity
  const [allReps] = await pool.execute(
    "SELECT u.id, u.name FROM users u WHERE u.role='rep' AND u.is_active=1"
  );
  const [activeReps] = await pool.execute(
    `SELECT DISTINCT a.user_id FROM activities a WHERE DATE(a.created_at)=?`, [today]
  );
  const activeIds = new Set(activeReps.map(r => r.user_id));
  const inactiveReps = allReps.filter(r => !activeIds.has(r.id)).map(r => r.name);

  // Pipeline total
  const [[{ openTotal, openValue }]] = await pool.execute(
    `SELECT COUNT(*) AS openTotal, COALESCE(SUM(d.value),0) AS openValue
     FROM deals d JOIN pipeline_stages ps ON d.stage_id=ps.id WHERE ps.is_won=0 AND ps.is_lost=0`
  );

  // Overdue task owners
  const [overdueOwners] = await pool.execute(
    `SELECT u.name, COUNT(*) AS cnt FROM tasks t JOIN users u ON t.assigned_to=u.id
     WHERE t.status='open' AND t.due_date < CURDATE()
     GROUP BY u.id, u.name ORDER BY cnt DESC LIMIT 5`
  );

  const wonBlock = wonDeals.length
    ? wonDeals.map(d => `<div style="padding:6px 10px;background:#F0FDF4;border-radius:6px;margin-bottom:4px;font-size:13px">
        🏆 <strong>${d.company_name || d.title}</strong> — ${peso(d.value)}/mo <span style="color:#6B7280">(${d.owner_name})</span>
      </div>`).join('')
    : `<div style="color:#94A3B8;font-size:12.5px">No deals won today</div>`;

  const overdueBlock = overdueOwners.length
    ? overdueOwners.map(r => `${r.name} ×${r.cnt}`).join(' · ')
    : 'None';

  const section = (title, content) =>
    `<div style="margin-bottom:18px">
       <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94A3B8;margin-bottom:8px">${title}</div>
       ${content}
     </div>`;

  const stat = (icon, label, value, color = '#1E293B') =>
    `<div style="display:inline-block;text-align:center;margin:0 16px 10px 0">
       <div style="font-size:22px;font-weight:800;color:${color}">${value}</div>
       <div style="font-size:11px;color:#64748B">${icon} ${label}</div>
     </div>`;

  const dateLabel = new Date().toLocaleDateString('en-PH', { weekday:'long', month:'long', day:'numeric', year:'numeric', timeZone:'Asia/Manila' });

  await sendMail({
    to: salesEmail,
    subject: `📊 BeneFi Sales Snapshot — ${new Date().toLocaleDateString('en-PH', { month:'short', day:'numeric', timeZone:'Asia/Manila' })}`,
    html: shell(
      `📊 Daily Sales Snapshot · ${dateLabel}`,
      `${section('Pipeline Movement',
        `${stat('🏆', 'Won', dealsWon, '#16A34A')}
         ${stat('❌', 'Lost', dealsLost, '#DC2626')}
         ${stat('🆕', 'New Deals', newDeals)}
         ${stat('⬆️', 'Stage Changes', stageChanges)}
         <div style="margin-top:10px">${wonBlock}</div>`)}
       ${section('Tasks',
        `${stat('✅', 'Completed', tasksDone, '#16A34A')}
         ${stat('⚠️', 'Overdue', tasksOverdue, '#DC2626')}
         ${stat('📋', 'Due Tomorrow', tasksDueToday)}
         ${tasksOverdue > 0 ? `<div style="font-size:12px;color:#DC2626;margin-top:4px">Overdue owners: ${overdueBlock}</div>` : ''}`)}
       ${section('Activity',
        `${stat('📞', 'Activities Logged', activities)}
         ${inactiveReps.length ? `<div style="font-size:12px;color:#F59E0B;margin-top:6px">⚠ Zero activity today: <strong>${inactiveReps.join(', ')}</strong></div>` : '<div style="font-size:12px;color:#16A34A">✓ All reps logged activity today</div>'}`)}
       ${section('Open Pipeline',
        `${stat('📂', 'Open Deals', openTotal)}
         ${stat('💰', 'Pipeline Value', peso(openValue) + '/mo')}
         ${enquiries ? `<div style="font-size:12px;color:#0F766E;margin-top:4px">📩 ${enquiries} new website enquir${enquiries > 1 ? 'ies' : 'y'} received</div>` : ''}`)}
       <a href="https://sales-app.benefi.ph" style="display:inline-block;margin-top:4px;background:#0F766E;color:#fff;padding:8px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Open CRM →</a>`
    ),
  });
}

// ── B4 — Stale Deal Alert (no activity in 7 days) ────────────────────────────
export async function sendStaleDealsAlert() {
  const [deals] = await pool.execute(
    `SELECT d.id, d.title, d.value, d.stage_changed_at, d.updated_at,
            co.name AS company_name,
            u.id AS owner_id, u.name AS owner_name,
            ps.name AS stage_name
     FROM deals d
     LEFT JOIN companies co ON d.company_id = co.id
     LEFT JOIN users u ON d.owner_id = u.id
     LEFT JOIN pipeline_stages ps ON d.stage_id = ps.id
     LEFT JOIN (
       SELECT deal_id, MAX(created_at) AS last_activity
       FROM activities GROUP BY deal_id
     ) la ON d.id = la.deal_id
     WHERE ps.is_won=0 AND ps.is_lost=0
       AND (la.last_activity IS NULL OR la.last_activity < DATE_SUB(NOW(), INTERVAL 7 DAY))
     ORDER BY u.name, d.updated_at`
  );
  if (!deals.length) return;

  const managers = await getManagers();
  if (!managers.length) return;

  const byOwner = {};
  for (const d of deals) {
    const key = d.owner_name || 'Unassigned';
    (byOwner[key] = byOwner[key] || []).push(d);
  }

  const blocks = Object.entries(byOwner).map(([owner, ownerDeals]) =>
    `<div style="margin-bottom:12px">
       <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:4px">${owner}</div>
       ${ownerDeals.map(d => `
         <div style="padding:6px 10px;background:#FFF7ED;border-radius:5px;margin-bottom:3px;font-size:12.5px">
           ${d.title} · ${d.company_name || '—'} · ${d.stage_name} · ${peso(d.value)}/mo
         </div>`).join('')}
     </div>`
  ).join('');

  await sendMail({
    to: managers.join(', '),
    subject: `[Stale Pipeline] ${deals.length} deal${deals.length > 1 ? 's' : ''} with no activity in 7+ days`,
    html: shell(
      '⚠️ Stale Pipeline Alert',
      `<p>These deals have had <strong>no activity logged in 7+ days</strong>. Follow up with your reps.</p>
       <div style="margin-top:14px">${blocks}</div>
       <a href="https://sales-app.benefi.ph" style="display:inline-block;margin-top:14px;background:#D97706;color:#fff;padding:8px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Review Pipeline →</a>`,
      '#D97706'
    ),
  });
}

// ── B5 — Overdue Task Nudge ───────────────────────────────────────────────────
export async function sendOverdueTaskNudges() {
  const [tasks] = await pool.execute(
    `SELECT t.id, t.title, t.due_date, t.priority, t.created_at,
            d.title AS deal_title, co.name AS company_name,
            u.id AS owner_id, u.name AS owner_name, u.email AS owner_email
     FROM tasks t
     LEFT JOIN deals d ON t.deal_id = d.id
     LEFT JOIN companies co ON d.company_id = co.id
     LEFT JOIN users u ON t.assigned_to = u.id
     WHERE t.status = 'open' AND t.due_date < CURDATE()
     ORDER BY t.due_date`
  );
  if (!tasks.length) return;

  const managers = await getManagers();

  // Group by owner
  const byOwner = {};
  for (const t of tasks) {
    if (!t.owner_email) continue;
    (byOwner[t.owner_email] = byOwner[t.owner_email] || { name: t.owner_name, tasks: [] }).tasks.push(t);
  }

  for (const [email, { name, tasks: ownerTasks }] of Object.entries(byOwner)) {
    const daysPast = t => Math.floor((new Date() - new Date(t.due_date)) / 86400000);

    const taskRows = ownerTasks.map(t => {
      const past = daysPast(t);
      return `<tr>
        <td style="padding:7px 0;border-bottom:1px solid #F1F5F9;font-size:13px">${t.title}</td>
        <td style="padding:7px 0;border-bottom:1px solid #F1F5F9;font-size:11.5px;color:#64748B">${t.deal_title || '—'}</td>
        <td style="padding:7px 0;border-bottom:1px solid #F1F5F9;font-size:11.5px;color:#DC2626;text-align:right;white-space:nowrap">${past}d overdue</td>
      </tr>`;
    }).join('');

    await sendMail({
      to: email,
      subject: `⚠️ ${ownerTasks.length} overdue task${ownerTasks.length > 1 ? 's' : ''} need your attention`,
      html: shell(
        `⚠️ Overdue Tasks — ${name?.split(' ')[0]}`,
        `<p>Hi <strong>${name?.split(' ')[0]}</strong>, you have <strong style="color:#DC2626">${ownerTasks.length} overdue task${ownerTasks.length > 1 ? 's' : ''}</strong> that need immediate action.</p>
         <table style="width:100%;border-collapse:collapse;margin:12px 0">
           <thead><tr>
             <th style="text-align:left;font-size:11px;color:#94A3B8;padding:4px 0">Task</th>
             <th style="text-align:left;font-size:11px;color:#94A3B8;padding:4px 0">Deal</th>
             <th style="text-align:right;font-size:11px;color:#94A3B8;padding:4px 0">Overdue By</th>
           </tr></thead>
           <tbody>${taskRows}</tbody>
         </table>
         <a href="https://sales-app.benefi.ph" style="display:inline-block;margin-top:12px;background:#DC2626;color:#fff;padding:8px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Complete Tasks →</a>`,
        '#DC2626'
      ),
    });

    // Tasks overdue 2+ days — also CC manager
    const longOverdue = ownerTasks.filter(t => daysPast(t) >= 2);
    if (longOverdue.length && managers.length) {
      await sendMail({
        to: managers.join(', '),
        subject: `[Manager Alert] ${name} has ${longOverdue.length} task${longOverdue.length > 1 ? 's' : ''} overdue 2+ days`,
        html: shell(
          `⚠️ Manager Alert — Overdue Tasks`,
          `<p><strong>${name}</strong> has tasks overdue by 2 or more days with no action taken.</p>
           <table style="width:100%;border-collapse:collapse;margin:12px 0">
             ${longOverdue.map(t => `<tr>
               <td style="padding:6px 0;border-bottom:1px solid #F1F5F9;font-size:13px">${t.title}</td>
               <td style="padding:6px 0;border-bottom:1px solid #F1F5F9;font-size:11.5px;color:#DC2626;text-align:right">${Math.floor((new Date()-new Date(t.due_date))/86400000)}d overdue</td>
             </tr>`).join('')}
           </table>`,
          '#DC2626'
        ),
      });
    }
  }
}
