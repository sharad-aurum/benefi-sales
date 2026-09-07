// ── State ──────────────────────────────────────────────────────────────────
let state = { user: null, stages: [], users: [], view: 'dashboard' };
let dragId = null;
let dragEndTime = 0;

// ── API helper ──────────────────────────────────────────────────────────────
const api = {
  async req(method, path, body) {
    const r = await fetch(path, {
      method, credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) { location.href = '/login'; return null; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Request failed.');
    return d;
  },
  get:    (p)    => api.req('GET',    p),
  post:   (p, b) => api.req('POST',   p, b),
  put:    (p, b) => api.req('PUT',    p, b),
  patch:  (p, b) => api.req('PATCH',  p, b),
  delete: (p)    => api.req('DELETE', p),
};

// ── Utilities ────────────────────────────────────────────────────────────────
const fmt   = v => v >= 1e6 ? '₱'+(v/1e6).toFixed(1)+'M' : v >= 1e3 ? '₱'+(v/1e3).toFixed(0)+'K' : '₱'+Number(v).toLocaleString();
const fmtFull = v => '₱'+Number(v).toLocaleString('en-PH', {minimumFractionDigits:0});
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-PH',{month:'short',day:'numeric'}) : '—';
const fmtDateTime = d => d ? new Date(d).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
const daysTo  = d => d ? Math.ceil((new Date(d)-Date.now())/86400000) : null;
const esc     = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const initials = n => (n||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
const av  = (n,c,lg='') => `<div class="av ${lg}" style="background:${c||'#0F766E'}">${initials(n)}</div>`;
const closeCls = d => { const n=daysTo(d); return n===null?'':n<0?'over':n<=7?'near':''; };

function stageById(id) { return state.stages.find(s=>s.id==id)||{}; }

const ACT_ICONS = { call:'📞', email:'✉️', meeting:'🤝', note:'📝', whatsapp:'💬', proposal:'📄' };
const ACT_CLS   = { call:'act-call', email:'act-email', meeting:'act-meeting', note:'act-note', whatsapp:'act-whatsapp', proposal:'act-proposal' };

// ── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type='ok') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Modal ────────────────────────────────────────────────────────────────────
function showModal(title, bodyHtml, footer) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-ft').innerHTML = footer || `<div></div><div class="modal-ft-right"><button class="btn btn-g" onclick="closeModal()">Cancel</button></div>`;
  document.getElementById('modal-backdrop').classList.add('open');
}
function closeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('modal-backdrop').classList.remove('open');
}
window.closeModal = closeModal;

// ── Router ───────────────────────────────────────────────────────────────────
const VIEW_TITLES = { dashboard:'Dashboard', pipeline:'Pipeline', deals:'Deals', contacts:'Contacts', companies:'Companies', activities:'Activities', tasks:'Tasks', reports:'Reports', partners:'Partners', users:'Users', performance:'My Performance', team:'Team Performance' };

const ROLE_LABELS  = { influencer:'Influencer', decision_maker:'Decision Maker', champion:'Champion', end_user:'End User', other:'Other' };
const ROLE_COLORS  = { influencer:'#3B82F6', decision_maker:'#DC2626', champion:'#0F766E', end_user:'#9CA3AF', other:'#9CA3AF' };
const INF_COLORS   = { high:'#DC2626', medium:'#F59E0B', low:'#22C55E' };
const PARTNER_TYPE = { referral_partner:'Referral Partner', reseller:'Reseller', consultant:'Consultant', broker:'Broker', other:'Other' };
const PAYOUT_TYPE  = { percentage:'% of Deal', fixed_per_deal:'Fixed per Deal', milestone:'Milestone' };

async function navigate(view) {
  state.view = view;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  document.getElementById('tb-title').textContent = VIEW_TITLES[view] || view;
  document.getElementById('tb-actions').innerHTML = '';
  const container = document.getElementById('view');
  container.style.cssText = '';
  container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--t3)">Loading…</div>';
  try {
    await VIEWS[view]?.();
  } catch (err) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:#EF4444">${esc(err.message)}</div>`;
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
VIEWS = {};
VIEWS.dashboard = async () => {
  const data = await api.get('/api/reports/dashboard');
  if (!data) return;
  const v = document.getElementById('view');

  const tasksOverdue = data.openTasks.filter(t => t.due_date && daysTo(t.due_date) < 0);
  const hcRows = data.headcountRows || [];
  const hcBundled = hcRows.find(r=>r.product_type==='bundled')||{total_employees:0,deal_count:0,potential_mrr:0};
  const hcHris    = hcRows.find(r=>r.product_type==='hris_only')||{total_employees:0,deal_count:0,potential_mrr:0};
  const hcTotal   = Number(hcBundled.total_employees)+Number(hcHris.total_employees);
  const mrrTotal  = Number(hcBundled.potential_mrr)+Number(hcHris.potential_mrr);

  v.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-lbl">Pipeline Value</div>
        <div class="stat-val">${fmt(data.pipeline.total)}</div>
        <div class="stat-sub">${data.pipeline.count} open deals</div>
      </div>
      <div class="stat-card">
        <div class="stat-lbl">Won This Month</div>
        <div class="stat-val">${fmt(data.wonMonth.value)}</div>
        <div class="stat-sub"><b>${data.wonMonth.count}</b> deals closed</div>
      </div>
      <div class="stat-card">
        <div class="stat-lbl">Tasks Due</div>
        <div class="stat-val" style="color:${data.tasksDue.count>0?'#EF4444':'var(--t1)'}">${data.tasksDue.count}</div>
        <div class="stat-sub">${tasksOverdue.length} overdue</div>
      </div>
      <div class="stat-card">
        <div class="stat-lbl">Closing in 14 Days</div>
        <div class="stat-val">${data.closingSoon.length}</div>
        <div class="stat-sub">deals need attention</div>
      </div>
    </div>
    ${hcTotal>0?`<div class="hc-banner">
      <div class="hc-banner-item">
        <div class="hc-banner-lbl">👥 Total Employees in Pipeline</div>
        <div class="hc-banner-val">${hcTotal.toLocaleString()}</div>
        <div class="hc-banner-sub">across ${(Number(hcBundled.deal_count)+Number(hcHris.deal_count))} open deals</div>
      </div>
      <div class="hc-banner-item">
        <div class="hc-banner-lbl">Potential MRR</div>
        <div class="hc-banner-val">${fmt(mrrTotal)}<span style="font-size:13px;font-weight:500">/mo</span></div>
        <div class="hc-banner-sub">at proposed rates</div>
      </div>
      <div class="hc-banner-item">
        <div class="hc-banner-lbl">Bundled</div>
        <div class="hc-banner-val">${Number(hcBundled.total_employees).toLocaleString()}</div>
        <div class="hc-banner-sub">${hcBundled.deal_count} deals · ${fmt(hcBundled.potential_mrr)}/mo</div>
      </div>
      <div class="hc-banner-item hris-accent">
        <div class="hc-banner-lbl">HRIS Only</div>
        <div class="hc-banner-val">${Number(hcHris.total_employees).toLocaleString()}</div>
        <div class="hc-banner-sub">${hcHris.deal_count} deals · ${fmt(hcHris.potential_mrr)}/mo</div>
      </div>
    </div>`:''}

    <div class="two-col">
      <div>
        <div class="section">
          <div class="section-hd"><span class="section-title">Deals Closing Soon</span></div>
          <div>
            ${data.closingSoon.length === 0 ? '<div class="tbl-empty">No deals closing in next 14 days</div>' :
              data.closingSoon.map(d => `
                <div class="act-item" onclick="navigate('deals')" style="cursor:pointer">
                  <div style="flex:1;min-width:0">
                    <div class="fw-7">${esc(d.company_name||'')} <span class="text-muted" style="font-weight:400">· ${esc(d.title)}</span></div>
                    <div style="font-size:11.5px;color:var(--t3);margin-top:2px">${fmtDate(d.expected_close_date)} · ${esc(d.owner_name)}</div>
                  </div>
                  <div>
                    <span class="badge" style="background:${d.stage_color}22;color:${d.stage_color}">${esc(d.stage_name)}</span>
                  </div>
                  <div class="fw-7" style="color:var(--accent)">${fmt(d.value)}</div>
                </div>`).join('')}
          </div>
        </div>
        <div class="section">
          <div class="section-hd"><span class="section-title">Recent Activity</span></div>
          <div class="act-list">
            ${data.recentActivities.length === 0 ? '<div class="tbl-empty">No recent activity</div>' :
              data.recentActivities.map(a => `
                <div class="act-item">
                  <div class="act-ico ${ACT_CLS[a.type]||'act-note'}">${ACT_ICONS[a.type]||'📝'}</div>
                  <div class="act-content">
                    <div class="act-subj">${esc(a.subject||a.type)}</div>
                    ${a.deal_title ? `<div class="act-body">${esc(a.deal_title)}</div>` : ''}
                    <div class="act-meta">${esc(a.user_name)} · ${fmtDate(a.activity_date)}</div>
                  </div>
                </div>`).join('')}
          </div>
        </div>
      </div>
      <div>
        <div class="section">
          <div class="section-hd"><span class="section-title">Open Tasks</span><button class="btn btn-sm btn-g" onclick="navigate('tasks')">View all</button></div>
          <div>
            ${data.openTasks.length === 0 ? '<div class="tbl-empty">No open tasks</div>' :
              data.openTasks.map(t => {
                const n = daysTo(t.due_date);
                const cls = n!==null&&n<0?'overdue':'';
                return `<div class="task-item">
                  <div class="task-check${t.status==='completed'?' done':''}" onclick="completeTask(${t.id},this)">${t.status==='completed'?'✓':''}</div>
                  <div class="task-content">
                    <div class="task-title${t.status==='completed'?' done':''}">${esc(t.title)}</div>
                    <div class="task-meta">
                      <span class="${cls}">${t.due_date?fmtDate(t.due_date):'No due date'}</span>
                      ${t.deal_title?` · ${esc(t.deal_title)}`:''}
                    </div>
                  </div>
                  <span class="badge badge-${t.priority}">${t.priority}</span>
                </div>`;}).join('')}
          </div>
        </div>
      </div>
    </div>`;
};

// ── Pipeline ──────────────────────────────────────────────────────────────────
// ── Pipeline state ────────────────────────────────────────────────────────────
let pipeFilterState = { horizon: 'all', rep: 'all', product: 'all', mode: 'kanban' };
let _pipeDeals = null;
let _pipeStages = null;
let _forecastChart = null;

VIEWS.pipeline = async () => {
  const [deals, stages] = await Promise.all([api.get('/api/deals'), api.get('/api/pipeline/stages')]);
  if (!deals || !stages) return;
  _pipeDeals = deals; _pipeStages = stages;

  document.getElementById('tb-actions').innerHTML = `<button class="btn btn-p" onclick="openDealModal()">+ New Deal</button>`;
  const v = document.getElementById('view');
  v.style.overflow = 'hidden';
  v.style.padding = '0';
  v.style.display = 'flex';
  v.style.flexDirection = 'column';

  const isManager = ['admin','manager'].includes(state.user?.role);
  const repOptions = isManager
    ? `<option value="all">All Reps</option>${[...new Map(deals.map(d=>[d.owner_id,d])).values()].map(d=>`<option value="${d.owner_id}">${esc(d.owner_name)}</option>`).join('')}`
    : '';

  v.innerHTML = `
    <div class="pipe-toolbar">
      <div class="pipe-filters">
        <select class="pipe-sel" id="pipe-horizon" onchange="applyPipeFilters()">
          <option value="all">All Deals</option>
          <option value="month">Closing This Month</option>
          <option value="quarter">Closing This Quarter</option>
          <option value="n30">Closing Next 30 Days</option>
          <option value="n60">Closing Next 60 Days</option>
          <option value="n90">Closing Next 90 Days</option>
          <option value="overdue">Overdue (Past Close Date)</option>
        </select>
        ${isManager?`<select class="pipe-sel" id="pipe-rep" onchange="applyPipeFilters()">${repOptions}</select>`:''}
        <select class="pipe-sel" id="pipe-product" onchange="applyPipeFilters()">
          <option value="all">All Products</option>
          <option value="bundled">Bundled (HRIS + FS)</option>
          <option value="hris_only">HRIS Only</option>
        </select>
      </div>
      <div class="pipe-mode-tabs">
        <button class="ppt-tab ${pipeFilterState.mode==='kanban'?'active':''}" onclick="setPipeMode('kanban')">Kanban</button>
        <button class="ppt-tab ${pipeFilterState.mode==='forecast'?'active':''}" onclick="setPipeMode('forecast')">Forecast</button>
        <button class="ppt-tab ${pipeFilterState.mode==='list'?'active':''}" onclick="setPipeMode('list')">List</button>
      </div>
    </div>
    <div id="pipe-content"></div>`;

  // Restore filter selectors
  const hs = document.getElementById('pipe-horizon');
  if(hs) hs.value = pipeFilterState.horizon;
  const rs = document.getElementById('pipe-rep');
  if(rs) rs.value = pipeFilterState.rep;
  const ps2 = document.getElementById('pipe-product');
  if(ps2) ps2.value = pipeFilterState.product;

  renderPipeContent();
};

function isWon(s){ return Number(s.is_won)===1; }
function isLost(s){ return Number(s.is_lost)===1; }
function isOpen(s){ return !isWon(s)&&!isLost(s); }

function filterDeals(deals, openOnly=false){
  const f = pipeFilterState;
  const now = new Date(); now.setHours(0,0,0,0);
  let out = [...deals];
  if(openOnly) out = out.filter(d=>{ const s=_pipeStages.find(s=>s.id==d.stage_id)||{}; return isOpen(s); });
  if(f.rep !== 'all') out = out.filter(d=>String(d.owner_id)===String(f.rep));
  if(f.product !== 'all') out = out.filter(d=>(d.product_type||'bundled')===f.product);
  if(f.horizon !== 'all'){
    // When a date horizon is set, only open deals make sense to show
    out = out.filter(d=>{ const s=_pipeStages.find(s=>s.id==d.stage_id)||{}; return isOpen(s); });
    out = out.filter(d=>{
      if(!d.expected_close_date) return false;
      const cd = new Date(d.expected_close_date); cd.setHours(0,0,0,0);
      const diff = Math.ceil((cd-now)/86400000);
      if(f.horizon==='month') return cd.getFullYear()===now.getFullYear()&&cd.getMonth()===now.getMonth();
      if(f.horizon==='quarter'){ const q=Math.floor(now.getMonth()/3); return cd.getFullYear()===now.getFullYear()&&Math.floor(cd.getMonth()/3)===q; }
      if(f.horizon==='n30') return diff>=0&&diff<=30;
      if(f.horizon==='n60') return diff>=0&&diff<=60;
      if(f.horizon==='n90') return diff>=0&&diff<=90;
      if(f.horizon==='overdue') return diff<0;
      return true;
    });
  }
  return out;
}

function renderPipeContent(){
  const c = document.getElementById('pipe-content');
  if(!c) return;
  const stages = _pipeStages||[];
  const mode = pipeFilterState.mode;

  if(mode==='kanban'){
    // Kanban: show ALL stages (including won/lost), filter deals by rep+horizon
    const deals = filterDeals(_pipeDeals||[], false);
    c.style.cssText='overflow:auto;flex:1';
    c.innerHTML = `<div class="pipe-wrap"><div class="pipe">
      ${stages.map(s=>{
        const sd = deals.filter(d=>d.stage_id==s.id);
        const tot = sd.reduce((a,d)=>a+Number(d.value),0);
        const emps = sd.reduce((a,d)=>a+Number(d.employees_covered||0),0);
        const wonLostCls = isWon(s)?'scol-won':isLost(s)?'scol-lost':'';
        return `<div class="scol ${wonLostCls}">
          <div class="scol-hd">
            <div class="sdot" style="background:${s.color}"></div>
            <div class="sname">${esc(s.name)}</div>
            <div class="scnt">${sd.length}</div>
            ${tot>0?`<div class="sval">${fmt(tot)}</div>`:''}
          </div>
          ${emps>0?`<div class="scol-emp">👥 ${emps.toLocaleString()} employees</div>`:''}
          <div class="scards" data-stage="${s.id}"
            ondragover="pDov(event)" ondragleave="pDlv(event)" ondrop="pDrp(event,${s.id})">
            ${sd.length===0?'<div class="empty-col">Drop deals here</div>':sd.map(d=>dealCard(d,s)).join('')}
          </div>
        </div>`;
      }).join('')}
    </div></div>`;
  } else if(mode==='list'){
    // List: only open pipeline deals, filterable
    const deals = filterDeals(_pipeDeals||[], true);
    renderPipeList(c, deals, stages);
  } else if(mode==='forecast'){
    // Forecast: only open pipeline deals
    const deals = filterDeals(_pipeDeals||[], true);
    renderForecast(c, deals, stages);
  }
}

function renderPipeList(c, deals, stages){
  c.style.cssText='overflow:auto;padding:16px';
  const tot = deals.reduce((s,d)=>s+Number(d.value),0);
  const wtd = deals.reduce((s,d)=>s+Number(d.value)*Number(d.probability)/100,0);
  const totalEmps = deals.reduce((s,d)=>s+Number(d.employees_covered||0),0);
  if(!deals.length){c.innerHTML='<div class="empty-state">No deals match the current filters.</div>'; return;}
  c.innerHTML=`
    <div style="display:flex;gap:20px;margin-bottom:14px;font-size:13px;flex-wrap:wrap;align-items:center">
      <span>${deals.length} deals</span>
      <span>Total: <b>${fmt(tot)}</b></span>
      <span>Weighted: <b>${fmt(wtd)}</b></span>
      ${totalEmps>0?`<span>👥 <b>${totalEmps.toLocaleString()} employees</b> covered</span>`:''}
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr>
        <th>Deal</th><th>Company</th><th>Stage</th><th>Product</th>
        <th>Headcount</th><th>PEPM → MRR</th>
        <th>Value</th><th>Prob</th><th>Close Date</th>
      </tr></thead>
      <tbody>${deals.sort((a,b)=>Number(b.value)-Number(a.value)).map(d=>{
        const s=stages.find(s=>s.id==d.stage_id)||{};
        const cc=closeCls(d.expected_close_date);
        const mrr=d.employees_covered&&d.proposed_per_employee?Math.round(Number(d.employees_covered)*Number(d.proposed_per_employee)):null;
        return '<tr class="tr-link" onclick="openDealDetail('+d.id+')"><td class="fw-6">'+esc(d.title)+'</td><td>'+esc(d.company_name||'—')+'</td><td><span class="stag" style="background:'+s.color+'20;color:'+s.color+'">'+esc(s.name||'')+'</span></td><td>'+(prodBadge(d)||'<span style="font-size:11px;color:var(--t3)">Bundled</span>')+'</td><td>'+(d.employees_covered?Number(d.employees_covered).toLocaleString():'—')+'</td><td style="font-size:12px">'+(d.proposed_per_employee?'₱'+Number(d.proposed_per_employee).toFixed(0)+'/mo':'')+' '+(mrr?'<span style="color:var(--t3);font-size:11px">→ ₱'+Number(mrr).toLocaleString()+'/mo</span>':'')+'</td><td class="fw-7">'+fmt(d.value)+'</td><td>'+d.probability+'%</td><td class="'+cc+'">'+fmtDate(d.expected_close_date)+'</td></tr>';
      }).join('')}</tbody>
    </table></div>`;
}

function renderForecast(c, deals, stages){
  c.style.cssText='overflow:auto;padding:16px';
  if(_forecastChart){_forecastChart.destroy();_forecastChart=null;}

  // Build 6 months forward starting this month
  const now = new Date();
  const months = Array.from({length:6},(_,i)=>{
    const d=new Date(now.getFullYear(),now.getMonth()+i,1);
    return {
      key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
      label:d.toLocaleDateString('en-US',{month:'short',year:'numeric'}),
      y:d.getFullYear(), m:d.getMonth()
    };
  });

  const byMonth = {};
  months.forEach(m=>{byMonth[m.key]={deals:[],total:0,weighted:0};});
  const beyond = {deals:[],total:0,weighted:0};
  const noDates = {deals:[],total:0,weighted:0};

  deals.forEach(d=>{
    const v=Number(d.value)||0, prob=Number(d.probability)||0;
    if(!d.expected_close_date){noDates.deals.push(d);noDates.total+=v;noDates.weighted+=v*prob/100;return;}
    const cd=new Date(d.expected_close_date);
    const key=`${cd.getFullYear()}-${String(cd.getMonth()+1).padStart(2,'0')}`;
    if(byMonth[key]){byMonth[key].deals.push(d);byMonth[key].total+=v;byMonth[key].weighted+=v*prob/100;}
    else{beyond.deals.push(d);beyond.total+=v;beyond.weighted+=v*prob/100;}
  });

  // Summary row
  const openTotal = deals.reduce((s,d)=>s+Number(d.value),0);
  const openWtd   = deals.reduce((s,d)=>s+Number(d.value)*Number(d.probability)/100,0);

  // Stage breakdown for hover/expand
  const stageColors = Object.fromEntries(stages.map(s=>[s.id,s.color]));

  const monthCards = months.map(m=>{
    const mb=byMonth[m.key];
    const isNow=m.y===now.getFullYear()&&m.m===now.getMonth();
    if(!mb.deals.length) return `<div class="fc-month ${isNow?'fc-now':''}">
      <div class="fc-month-lbl">${m.label}${isNow?' <span class="fc-cur">current</span>':''}</div>
      <div class="fc-month-empty">No deals closing</div>
    </div>`;
    return `<div class="fc-month ${isNow?'fc-now':''}">
      <div class="fc-month-lbl">${m.label}${isNow?' <span class="fc-cur">current</span>':''}</div>
      <div class="fc-month-vals">
        <div><div class="fc-val-lbl">Full Value</div><div class="fc-val">${fmt(mb.total)}</div></div>
        <div><div class="fc-val-lbl">Weighted</div><div class="fc-val-wtd">${fmt(mb.weighted)}</div></div>
        <div><div class="fc-val-lbl">Deals</div><div class="fc-val-cnt">${mb.deals.length}</div></div>
      </div>
      <div class="fc-deals">
        ${mb.deals.sort((a,b)=>Number(b.value)-Number(a.value)).map(d=>{
          const s=stages.find(s=>s.id==d.stage_id)||{};
          const cc=closeCls(d.expected_close_date);
          return `<div class="fc-deal" onclick="openDealDetail(${d.id})">
            <div class="fc-deal-bar" style="background:${s.color||'var(--accent)'}"></div>
            <div class="fc-deal-body">
              <div class="fc-deal-title">${esc(d.title)}</div>
              <div class="fc-deal-meta">${esc(d.company_name||'')} · ${esc(s.name||'')} · ${d.probability}%</div>
            </div>
            <div>
              <div class="fc-deal-val">${fmt(d.value)}</div>
              <div class="fc-deal-date ${cc}">${fmtDate(d.expected_close_date)}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  const beyondCard = beyond.deals.length ? `<div class="fc-month">
    <div class="fc-month-lbl">Beyond 6 Months</div>
    <div class="fc-month-vals">
      <div><div class="fc-val-lbl">Full Value</div><div class="fc-val">${fmt(beyond.total)}</div></div>
      <div><div class="fc-val-lbl">Weighted</div><div class="fc-val-wtd">${fmt(beyond.weighted)}</div></div>
      <div><div class="fc-val-lbl">Deals</div><div class="fc-val-cnt">${beyond.deals.length}</div></div>
    </div>
  </div>` : '';

  c.innerHTML=`
    <div class="fc-summary">
      <div class="fc-sum-item"><div class="fc-val-lbl">Open Pipeline</div><div class="fc-val">${fmt(openTotal)}</div></div>
      <div class="fc-sum-item"><div class="fc-val-lbl">Weighted Pipeline</div><div class="fc-val-wtd">${fmt(openWtd)}</div></div>
      <div class="fc-sum-item"><div class="fc-val-lbl">Open Deals</div><div class="fc-val-cnt">${deals.length}</div></div>
      ${noDates.deals.length?`<div class="fc-sum-item"><div class="fc-val-lbl">No Close Date</div><div style="font-size:16px;font-weight:700;color:var(--t3)">${noDates.deals.length}</div></div>`:''}
    </div>
    <div style="margin-bottom:16px;position:relative;height:160px"><canvas id="fc-chart"></canvas></div>
    <div class="fc-grid">${monthCards}${beyondCard}</div>`;

  // Chart
  const ctx=document.getElementById('fc-chart');
  if(ctx){
    _forecastChart = new Chart(ctx,{
      type:'bar',
      data:{
        labels:months.map(m=>m.label),
        datasets:[
          {label:'Full Value',data:months.map(m=>byMonth[m.key].total),backgroundColor:'rgba(15,118,110,.15)',borderColor:'#0F766E',borderWidth:2,borderRadius:4},
          {label:'Weighted',data:months.map(m=>byMonth[m.key].weighted),backgroundColor:'rgba(15,118,110,.4)',borderColor:'#0F766E',borderWidth:0,borderRadius:4},
        ]
      },
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{legend:{position:'bottom',labels:{boxWidth:12,font:{size:11}}}},
        scales:{
          y:{ticks:{callback:v=>'₱'+pfmt(v)},grid:{color:'rgba(0,0,0,.05)'}},
          x:{grid:{display:false}}
        }
      }
    });
  }
}

function applyPipeFilters(){
  const hs=document.getElementById('pipe-horizon');
  const rs=document.getElementById('pipe-rep');
  const pp=document.getElementById('pipe-product');
  if(hs) pipeFilterState.horizon=hs.value;
  if(rs) pipeFilterState.rep=rs.value;
  if(pp) pipeFilterState.product=pp.value;
  renderPipeContent();
}
function setPipeMode(mode){
  pipeFilterState.mode=mode;
  // Re-render toolbar active state
  document.querySelectorAll('.pipe-mode-tabs .ppt-tab').forEach((b,i)=>{
    const modes=['kanban','forecast','list'];
    b.classList.toggle('active',modes[i]===mode);
  });
  renderPipeContent();
}
window.applyPipeFilters = applyPipeFilters;
window.setPipeMode = setPipeMode;

function prodBadge(d){ return d.product_type==='hris_only'?'<span class="pt-badge hris-only">HRIS Only</span>':''; }
function dealCard(d, s) {
  const cc = closeCls(d.expected_close_date);
  const pc = isWon(s)?'#22C55E':isLost(s)?'#EF4444':s.color;
  const hc = d.employees_covered ? `<span class="dc-hc">👥 ${Number(d.employees_covered).toLocaleString()} emp</span>` : '';
  const pepm = d.proposed_per_employee ? `<span class="dc-pepm">₱${Number(d.proposed_per_employee).toFixed(0)}/emp/mo</span>` : '';
  return `<div class="dcard" draggable="true" data-id="${d.id}"
    ondragstart="pDs(event,${d.id})" ondragend="pDe(event)" onclick="if(Date.now()-dragEndTime>250) openDealDetail(${d.id})">
    <div class="dcard-bar" style="background:${s.color}"></div>
    <div class="dc-co">${esc(d.company_name||'No company')} ${prodBadge(d)}</div>
    <div class="dc-tt">${esc(d.title)}</div>
    <div class="dc-val">${fmt(d.value)}</div>
    ${(hc||pepm)?`<div class="dc-hc-row">${hc}${pepm}</div>`:''}
    <div class="dc-ft">
      ${av(d.owner_name, d.owner_color)}
      <div class="dc-own">${esc(d.owner_name)}</div>
      <div class="dc-date ${cc}">${fmtDate(d.expected_close_date)}</div>
    </div>
    <div class="pbar"><div class="pfill" style="width:${d.probability}%;background:${pc}"></div></div>
  </div>`;
}

function pDs(e,id){ dragId=id; e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain', String(id)); setTimeout(()=>{ const el=document.querySelector(`[data-id="${id}"]`); if(el) el.classList.add('dragging'); },0); }
function pDe(){ dragEndTime=Date.now(); dragId=null; document.querySelectorAll('.dcard.dragging').forEach(el=>el.classList.remove('dragging')); }
function pDov(e){ e.preventDefault(); e.dataTransfer.dropEffect='move'; e.currentTarget.classList.add('dov'); }
function pDlv(e){ if(!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('dov'); }
async function pDrp(e,sid){
  e.preventDefault(); e.currentTarget.classList.remove('dov');
  const id = dragId ?? Number(e.dataTransfer.getData('text/plain'));
  if(!id) return;
  try {
    await api.put(`/api/deals/${id}`, { stage_id: sid });
    toast('Deal moved'); navigate('pipeline');
  } catch(err){ toast(err.message,'err'); }
}

// ── Deal Detail / Forms ────────────────────────────────────────────────────────
async function openDealDetail(id) {
  const deal = await api.get(`/api/deals/${id}`);
  if (!deal) return;
  const s = stageById(deal.stage_id);
  const v = document.getElementById('view');
  v.innerHTML = `
    <div style="margin-bottom:14px">
      <button class="btn btn-g btn-sm" onclick="navigate('pipeline')">← Pipeline</button>
    </div>
    <div class="detail-wrap">
      <div class="detail-main">
        <div class="detail-hd">
          <div class="detail-hd-title">${esc(deal.title)} ${prodBadge(deal)}</div>
          <div class="detail-hd-sub">${esc(deal.company_name||'')}${deal.contact_name?` · ${esc(deal.contact_name)}`:''}</div>
        </div>
        <div class="detail-body">
          <div class="meta-grid">
            <div><div class="mk">Proposed Value</div><div class="mv lg">${fmtFull(deal.value)}</div></div>
            <div><div class="mk">Offered Value</div><div class="mv lg" style="color:var(--accent)">${deal.offered_value?fmtFull(deal.offered_value):'—'}</div></div>
            <div><div class="mk">Stage</div><div class="mv"><span class="badge" style="background:${s.color||'#64748B'}22;color:${s.color||'#64748B'}">${esc(s.name||deal.stage_name)}</span></div></div>
            <div><div class="mk">Probability</div><div class="mv">${deal.probability}%</div></div>
            <div><div class="mk">Close Date</div><div class="mv" style="color:${closeCls(deal.expected_close_date)==='over'?'#EF4444':closeCls(deal.expected_close_date)==='near'?'#F59E0B':'inherit'}">${fmtDate(deal.expected_close_date)}</div></div>
            <div><div class="mk">Go-Live Date</div><div class="mv">${fmtDate(deal.go_live_date)}</div></div>
            <div><div class="mk">Owner</div><div class="mv" style="display:flex;align-items:center;gap:6px">${av(deal.owner_name,deal.owner_color)} ${esc(deal.owner_name)}</div></div>
            <div><div class="mk">Source</div><div class="mv">${esc(deal.source||'—')}${deal.source_details?`<div style="font-size:11px;color:var(--t3);margin-top:2px">${esc(deal.source_details)}</div>`:''}</div></div>
          </div>

          ${(deal.employees_covered||deal.proposed_per_employee||deal.offered_per_employee||deal.discount_percent||deal.implementation_fee||deal.contract_months||deal.commercial_notes)?`
          <div class="detail-sub-hd">Commercials</div>
          <div class="meta-grid">
            ${deal.employees_covered?`<div><div class="mk">Employees Covered</div><div class="mv">👥 ${Number(deal.employees_covered).toLocaleString()}</div></div>`:''}
            ${deal.proposed_per_employee?`<div><div class="mk">Proposed / Emp / Month</div><div class="mv">₱${Number(deal.proposed_per_employee).toFixed(2)}</div></div>`:''}
            ${(deal.employees_covered&&deal.proposed_per_employee)?`<div><div class="mk">Proposed MRR</div><div class="mv fw-7" style="color:var(--accent)">₱${Math.round(Number(deal.employees_covered)*Number(deal.proposed_per_employee)).toLocaleString()}/mo</div></div>`:''}
            ${deal.offered_per_employee?`<div><div class="mk">Offered / Emp / Month</div><div class="mv" style="color:var(--accent)">₱${Number(deal.offered_per_employee).toFixed(2)}</div></div>`:''}
            ${(deal.employees_covered&&deal.offered_per_employee)?`<div><div class="mk">Offered MRR</div><div class="mv fw-7">₱${Math.round(Number(deal.employees_covered)*Number(deal.offered_per_employee)).toLocaleString()}/mo</div></div>`:''}
            ${deal.discount_percent?`<div><div class="mk">Discount</div><div class="mv">${deal.discount_percent}%</div></div>`:''}
            ${deal.implementation_fee?`<div><div class="mk">Implementation Fee</div><div class="mv">${fmtFull(deal.implementation_fee)}</div></div>`:''}
            ${deal.contract_months?`<div><div class="mk">Contract Duration</div><div class="mv">${deal.contract_months} months</div></div>`:''}
          </div>
          ${deal.commercial_notes?`<div class="mk" style="margin-bottom:4px">Commercial Notes</div><div style="font-size:13px;color:var(--t2);white-space:pre-wrap;margin-bottom:16px">${esc(deal.commercial_notes)}</div>`:''}`:''}

          ${deal.partner_name?`<div class="detail-sub-hd">Partner</div><div style="font-size:13px;font-weight:600;margin-bottom:4px">${esc(deal.partner_name)}</div><div style="font-size:12px;color:var(--t3);margin-bottom:16px">${PAYOUT_TYPE[deal.payout_type]||''} ${deal.payout_value?(deal.payout_type==='percentage'?deal.payout_value+'%':'₱'+Number(deal.payout_value).toLocaleString()):''}</div>`:''}

          ${deal.description?`<div class="mk" style="margin-bottom:4px">Description</div><div style="font-size:13px;color:var(--t2);white-space:pre-wrap;margin-bottom:20px">${esc(deal.description)}</div>`:''}

          <div class="section-hd" style="padding:0;border-bottom:1px solid var(--bd);margin-bottom:12px">
            <span class="section-title">Activity</span>
            <button class="btn btn-p btn-sm" onclick="openActivityModal(${id})">+ Log Activity</button>
          </div>
          <div class="act-list" id="deal-activities">
            ${deal.activities.length===0?'<div class="tbl-empty">No activities yet. Log a call, email or meeting.</div>':
              deal.activities.map(a=>`
                <div class="act-item">
                  <div class="act-ico ${ACT_CLS[a.type]||'act-note'}">${ACT_ICONS[a.type]||'📝'}</div>
                  <div class="act-content">
                    <div class="act-subj">${esc(a.subject||a.type)}</div>
                    ${a.body?`<div class="act-body">${esc(a.body)}</div>`:''}
                    ${a.outcome?`<div class="act-meta"><b>Outcome:</b> ${esc(a.outcome)}</div>`:''}
                    <div class="act-meta">${esc(a.user_name)} · ${fmtDateTime(a.activity_date)}</div>
                  </div>
                </div>`).join('')}
          </div>

          <div class="section-hd" style="padding:0;border-bottom:1px solid var(--bd);margin:20px 0 12px">
            <span class="section-title">Tasks</span>
            <button class="btn btn-g btn-sm" onclick="openTaskModal(${id})">+ Add Task</button>
          </div>
          <div id="deal-tasks">
            ${deal.tasks.length===0?'<div class="tbl-empty">No tasks linked to this deal.</div>':
              deal.tasks.map(t=>`
                <div class="task-item">
                  <div class="task-check${t.status==='completed'?' done':''}" onclick="completeTask(${t.id},this)">${t.status==='completed'?'✓':''}</div>
                  <div class="task-content">
                    <div class="task-title${t.status==='completed'?' done':''}">${esc(t.title)}</div>
                    <div class="task-meta">${fmtDate(t.due_date)} · <span class="badge badge-${t.priority}">${t.priority}</span></div>
                  </div>
                </div>`).join('')}
          </div>
        </div>
      </div>
      <div class="detail-side">
        <div class="section">
          <div class="section-hd"><span class="section-title">Actions</span></div>
          <div style="padding:12px;display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-g" style="width:100%;justify-content:center" onclick="openDealModal(${id})">✏ Edit Deal</button>
            <button class="btn btn-d" style="width:100%;justify-content:center" onclick="deleteDeal(${id})">Delete Deal</button>
          </div>
        </div>
        ${deal.company_name?`<div class="section"><div class="section-hd"><span class="section-title">Company</span></div><div style="padding:12px"><div class="fw-7">${esc(deal.company_name)}</div></div></div>`:''}
        ${deal.contact_name?`<div class="section"><div class="section-hd"><span class="section-title">Contact</span></div><div style="padding:12px"><div class="fw-7">${esc(deal.contact_name)}</div><div class="text-muted" style="font-size:12px">${esc(deal.contact_email||'')}</div></div></div>`:''}
      </div>
    </div>`;
}

async function openDealModal(id = null) {
  const [companies, contacts, users, partners] = await Promise.all([
    api.get('/api/companies'), api.get('/api/contacts'),
    api.get('/api/users').catch(()=>[state.user]),
    api.get('/api/partners').catch(()=>[]),
  ]);
  let deal = {};
  if (id) { deal = await api.get(`/api/deals/${id}`); if (!deal) return; }
  const stageOpts   = state.stages.map(s => `<option value="${s.id}" ${deal.stage_id==s.id?'selected':''}>${esc(s.name)}</option>`).join('');
  const coOpts      = (companies||[]).map(c => `<option value="${c.id}" ${deal.company_id==c.id?'selected':''}>${esc(c.name)}</option>`).join('');
  const ctOpts      = (contacts||[]).map(c => `<option value="${c.id}" ${deal.contact_id==c.id?'selected':''}>${esc(c.first_name+' '+(c.last_name||''))}</option>`).join('');
  const uOpts       = (users||[state.user]).map(u => `<option value="${u.id}" ${(deal.owner_id||state.user.id)==u.id?'selected':''}>${esc(u.name)}</option>`).join('');
  const srcOpts     = ['Referral','Website','LinkedIn','Cold Outreach','Conference','Partner','Other'].map(s=>`<option ${deal.source===s?'selected':''}>${s}</option>`).join('');
  const partnerOpts = (partners||[]).map(p=>`<option value="${p.id}" ${deal.partner_id==p.id?'selected':''}>${esc(p.name)}</option>`).join('');

  showModal(id ? 'Edit Deal' : 'New Deal', `
    <div class="fgrid">
      <div class="fg span2"><label class="flbl">Deal Title *</label><input class="finp" id="f-title" value="${esc(deal.title||'')}" placeholder="e.g. Enterprise HR Suite"></div>
      <div class="fg"><label class="flbl">Company</label><select class="fsel" id="f-co"><option value="">— None —</option>${coOpts}</select></div>
      <div class="fg"><label class="flbl">Contact</label><select class="fsel" id="f-ct"><option value="">— None —</option>${ctOpts}</select></div>
      <div class="fg"><label class="flbl">Stage</label><select class="fsel" id="f-stage">${stageOpts}</select></div>
      <div class="fg"><label class="flbl">Product Type</label><select class="fsel" id="f-product-type"><option value="bundled" ${(deal.product_type||'bundled')==='bundled'?'selected':''}>Bundled (HRIS + Financial Services)</option><option value="hris_only" ${deal.product_type==='hris_only'?'selected':''}>HRIS Only</option></select></div>
      <div class="fg"><label class="flbl">Proposed Value (₱)</label><input class="finp" id="f-val" type="number" value="${deal.value||''}" placeholder="0"></div>
      <div class="fg"><label class="flbl">Owner</label><select class="fsel" id="f-owner">${uOpts}</select></div>
      <div class="fg"><label class="flbl">Expected Close Date</label><input class="finp" id="f-date" type="date" value="${deal.expected_close_date?.slice(0,10)||''}"></div>
      <div class="fg"><label class="flbl">Source</label><select class="fsel" id="f-src"><option value="">— None —</option>${srcOpts}</select></div>
      <div class="fg"><label class="flbl">Probability (%)</label><input class="finp" id="f-prob" type="number" min="0" max="100" value="${deal.probability??''}" placeholder="Auto"></div>
      <div class="fg span2"><label class="flbl">Description</label><textarea class="ftxt" id="f-desc" placeholder="Deal notes, context…">${esc(deal.description||'')}</textarea></div>
    </div>

    <div class="form-section-hd">Partner &amp; Source Details</div>
    <div class="fgrid">
      <div class="fg"><label class="flbl">Partner</label><select class="fsel" id="f-partner"><option value="">— None —</option>${partnerOpts}</select></div>
      <div class="fg"><label class="flbl">Source Details</label><input class="finp" id="f-src-det" value="${esc(deal.source_details||'')}" placeholder="Event name, referrer, campaign…"></div>
    </div>

    <div class="form-section-hd">Commercials</div>
    <div class="fgrid">
      <div class="fg"><label class="flbl">Employees Covered</label><input class="finp" id="f-emp" type="number" min="0" value="${deal.employees_covered||''}" placeholder="No. of employees"></div>
      <div class="fg"><label class="flbl">Proposed / Employee / Month (₱)</label><input class="finp" id="f-prop-pepm" type="number" min="0" step="0.01" value="${deal.proposed_per_employee||''}" placeholder="0.00"></div>
      <div class="fg"><label class="flbl">Offered Value (₱)</label><input class="finp" id="f-off-val" type="number" min="0" value="${deal.offered_value||''}" placeholder="Final offer"></div>
      <div class="fg"><label class="flbl">Offered / Employee / Month (₱)</label><input class="finp" id="f-off-pepm" type="number" min="0" step="0.01" value="${deal.offered_per_employee||''}" placeholder="0.00"></div>
      <div class="fg"><label class="flbl">Discount (%)</label><input class="finp" id="f-disc" type="number" min="0" max="100" step="0.01" value="${deal.discount_percent||''}" placeholder="0"></div>
      <div class="fg"><label class="flbl">Implementation Fee (₱)</label><input class="finp" id="f-impl" type="number" min="0" value="${deal.implementation_fee||''}" placeholder="One-time fee"></div>
      <div class="fg"><label class="flbl">Contract Duration (months)</label><input class="finp" id="f-months" type="number" min="1" value="${deal.contract_months||''}" placeholder="e.g. 12, 24"></div>
      <div class="fg"><label class="flbl">Target Go-Live Date</label><input class="finp" id="f-golive" type="date" value="${deal.go_live_date?.slice(0,10)||''}"></div>
      <div class="fg span2"><label class="flbl">Commercial Notes</label><textarea class="ftxt" id="f-comnotes" placeholder="Pricing rationale, negotiation notes, approval conditions…">${esc(deal.commercial_notes||'')}</textarea></div>
    </div>`,
    `${id?`<button class="btn btn-d" onclick="deleteDeal(${id})">Delete</button>`:'<div></div>'}
     <div class="modal-ft-right">
       <button class="btn btn-g" onclick="closeModal()">Cancel</button>
       <button class="btn btn-p" onclick="saveDeal(${id||'null'})">Save Deal</button>
     </div>`
  );
}

async function saveDeal(id) {
  const title = document.getElementById('f-title').value.trim();
  if (!title) { toast('Deal title is required','err'); return; }
  const body = {
    title,
    company_id:          document.getElementById('f-co').value || null,
    contact_id:          document.getElementById('f-ct').value || null,
    stage_id:            document.getElementById('f-stage').value,
    value:               parseFloat(document.getElementById('f-val').value)||0,
    owner_id:            document.getElementById('f-owner').value,
    expected_close_date: document.getElementById('f-date').value || null,
    source:              document.getElementById('f-src').value || null,
    probability:         document.getElementById('f-prob').value !== '' ? parseInt(document.getElementById('f-prob').value) : undefined,
    description:         document.getElementById('f-desc').value.trim() || null,
    partner_id:          document.getElementById('f-partner').value || null,
    source_details:      document.getElementById('f-src-det').value.trim() || null,
    employees_covered:   parseInt(document.getElementById('f-emp').value)||null,
    proposed_per_employee: parseFloat(document.getElementById('f-prop-pepm').value)||null,
    offered_value:       parseFloat(document.getElementById('f-off-val').value)||null,
    offered_per_employee: parseFloat(document.getElementById('f-off-pepm').value)||null,
    discount_percent:    parseFloat(document.getElementById('f-disc').value)||null,
    implementation_fee:  parseFloat(document.getElementById('f-impl').value)||null,
    contract_months:     parseInt(document.getElementById('f-months').value)||null,
    go_live_date:        document.getElementById('f-golive').value || null,
    commercial_notes:    document.getElementById('f-comnotes').value.trim() || null,
    product_type:        document.getElementById('f-product-type').value || 'bundled',
  };
  try {
    if (id) { await api.put(`/api/deals/${id}`, body); toast('Deal updated'); }
    else    { await api.post('/api/deals', body);       toast('Deal created'); }
    closeModal(); navigate(state.view);
  } catch(err) { toast(err.message,'err'); }
}

async function deleteDeal(id) {
  if (!confirm('Delete this deal? This cannot be undone.')) return;
  try { await api.delete(`/api/deals/${id}`); toast('Deal deleted'); closeModal(); navigate('pipeline'); }
  catch(err) { toast(err.message,'err'); }
}

// ── Deals list ────────────────────────────────────────────────────────────────
VIEWS.deals = async () => {
  const deals = await api.get('/api/deals');
  if (!deals) return;
  document.getElementById('tb-actions').innerHTML = `<button class="btn btn-p" onclick="openDealModal()">+ New Deal</button>`;
  document.getElementById('view').innerHTML = `
    <div class="filter-bar">
      <div class="srch"><i class="srch-ic">⌕</i><input type="text" placeholder="Search deals…" oninput="filterDealsTable(this.value)"></div>
      <select class="flt" id="flt-stage" onchange="filterDealsTable(document.querySelector('.srch input').value)">
        <option value="">All stages</option>
        ${state.stages.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}
      </select>
      <select class="flt" id="flt-product" onchange="filterDealsTable(document.querySelector('.srch input').value)">
        <option value="">All products</option>
        <option value="bundled">Bundled</option>
        <option value="hris_only">HRIS Only</option>
      </select>
    </div>
    <div class="section">
      <div style="overflow-x:auto">
        <table class="tbl" id="deals-tbl">
          <thead><tr>
            <th>Company</th><th>Deal</th><th>Product</th><th>Stage</th><th>Headcount</th><th>Value</th><th>Owner</th><th>Close Date</th><th>Prob</th>
          </tr></thead>
          <tbody id="deals-tbody">
            ${deals.length===0?'<tr><td colspan="9" class="tbl-empty">No deals yet. Create your first deal.</td></tr>':
              deals.map(d => dealRow(d)).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  window._deals = deals;
};

function dealRow(d) {
  const s = stageById(d.stage_id);
  const cc = closeCls(d.expected_close_date);
  const mrr = d.employees_covered && d.proposed_per_employee ? Math.round(Number(d.employees_covered)*Number(d.proposed_per_employee)) : null;
  return `<tr onclick="openDealDetail(${d.id})">
    <td><div class="fw-7">${esc(d.company_name||'—')}</div></td>
    <td>${esc(d.title)}</td>
    <td>${prodBadge(d)||'<span style="font-size:11px;color:var(--t3)">Bundled</span>'}</td>
    <td><span class="badge" style="background:${(s.color||'#64748B')}22;color:${s.color||'#64748B'}">${esc(s.name||d.stage_name||'—')}</span></td>
    <td style="font-size:12px;color:var(--t2)">${d.employees_covered?Number(d.employees_covered).toLocaleString()+'<span style="color:var(--t3)"> emp</span>'+(mrr?'<br><span style="color:var(--t3)">₱'+Number(mrr).toLocaleString()+'/mo</span>':''):'—'}</td>
    <td class="fw-7">${fmt(d.value)}</td>
    <td style="display:flex;align-items:center;gap:6px;padding:10px 14px">${av(d.owner_name,d.owner_color)} ${esc(d.owner_name)}</td>
    <td class="${cc?'dc-date '+cc:''}">${fmtDate(d.expected_close_date)}</td>
    <td>${d.probability}%</td>
  </tr>`;
}

function filterDealsTable(q) {
  const stageFilter = (document.getElementById('flt-stage')||{}).value || '';
  const productFilter = (document.getElementById('flt-product')||{}).value || '';
  const deals = (window._deals||[]).filter(d => {
    const mq = !q || [d.title,d.company_name,d.contact_name].some(x=>(x||'').toLowerCase().includes(q.toLowerCase()));
    const ms = !stageFilter || d.stage_id == stageFilter;
    const mp = !productFilter || (d.product_type||'bundled') === productFilter;
    return mq && ms && mp;
  });
  document.getElementById('deals-tbody').innerHTML = deals.length===0
    ? '<tr><td colspan="9" class="tbl-empty">No matching deals.</td></tr>'
    : deals.map(d=>dealRow(d)).join('');
}

// ── Contacts ──────────────────────────────────────────────────────────────────
VIEWS.contacts = async () => {
  const contacts = await api.get('/api/contacts');
  if (!contacts) return;
  document.getElementById('tb-actions').innerHTML = `<button class="btn btn-p" onclick="openContactModal()">+ New Contact</button>`;
  document.getElementById('view').innerHTML = `
    <div class="filter-bar">
      <div class="srch"><i class="srch-ic">⌕</i><input type="text" placeholder="Search contacts…" oninput="filterContacts(this.value)"></div>
    </div>
    <div class="section">
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>Name</th><th>Role</th><th>Title</th><th>Company</th><th>Email</th><th>Phone</th><th></th></tr></thead>
          <tbody id="contacts-tbody">
            ${contacts.length===0?'<tr><td colspan="7" class="tbl-empty">No contacts yet.</td></tr>':contacts.map(c=>contactRow(c)).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  window._contacts = contacts;
};

function contactRow(c) {
  const roleBadge = c.contact_role
    ? `<span class="badge" style="background:${ROLE_COLORS[c.contact_role]}22;color:${ROLE_COLORS[c.contact_role]}">${ROLE_LABELS[c.contact_role]}</span>`
    : '—';
  const infBadge = c.influence_level
    ? `<span class="badge" style="background:${INF_COLORS[c.influence_level]}22;color:${INF_COLORS[c.influence_level]};margin-left:4px">${c.influence_level}</span>`
    : '';
  return `<tr>
    <td style="display:flex;align-items:center;gap:8px;padding:10px 14px">
      ${av(c.first_name+' '+c.last_name, c.owner_color)}
      <div><div class="fw-7">${esc(c.first_name)} ${esc(c.last_name||'')}</div></div>
    </td>
    <td>${roleBadge}${infBadge}</td>
    <td>${esc(c.job_title||'—')}</td>
    <td>${esc(c.company_name||'—')}</td>
    <td>${c.email?`<a href="mailto:${esc(c.email)}" style="color:var(--accent)">${esc(c.email)}</a>`:'—'}</td>
    <td>${esc(c.phone||c.mobile||'—')}</td>
    <td style="text-align:right"><button class="btn btn-g btn-sm" onclick="openContactModal(${c.id})">Edit</button></td>
  </tr>`;
}

function filterContacts(q) {
  const rows = (window._contacts||[]).filter(c =>
    !q||[c.first_name,c.last_name,c.email,c.company_name].some(x=>(x||'').toLowerCase().includes(q.toLowerCase()))
  );
  document.getElementById('contacts-tbody').innerHTML = rows.length===0
    ? '<tr><td colspan="7" class="tbl-empty">No matching contacts.</td></tr>'
    : rows.map(c=>contactRow(c)).join('');
}

async function openContactModal(id=null) {
  const companies = await api.get('/api/companies');
  const users = await api.get('/api/users').catch(()=>[state.user]);
  let c = {};
  if (id) { c = await api.get(`/api/contacts/${id}`); if (!c) return; }
  const coOpts = (companies||[]).map(co=>`<option value="${co.id}" ${c.company_id==co.id?'selected':''}>${esc(co.name)}</option>`).join('');
  const uOpts  = (users||[state.user]).map(u=>`<option value="${u.id}" ${(c.owner_id||state.user.id)==u.id?'selected':''}>${esc(u.name)}</option>`).join('');
  showModal(id?'Edit Contact':'New Contact', `
    <div class="fgrid">
      <div class="fg"><label class="flbl">First Name *</label><input class="finp" id="f-fn" value="${esc(c.first_name||'')}"></div>
      <div class="fg"><label class="flbl">Last Name</label><input class="finp" id="f-ln" value="${esc(c.last_name||'')}"></div>
      <div class="fg"><label class="flbl">Job Title</label><input class="finp" id="f-jt" value="${esc(c.job_title||'')}"></div>
      <div class="fg"><label class="flbl">Company</label><select class="fsel" id="f-co"><option value="">— None —</option>${coOpts}</select></div>
      <div class="fg"><label class="flbl">Contact Role</label>
        <select class="fsel" id="f-role">
          <option value="">— Not set —</option>
          <option value="influencer" ${c.contact_role==='influencer'?'selected':''}>Influencer (HR)</option>
          <option value="decision_maker" ${c.contact_role==='decision_maker'?'selected':''}>Decision Maker (Finance / CXO)</option>
          <option value="champion" ${c.contact_role==='champion'?'selected':''}>Champion</option>
          <option value="end_user" ${c.contact_role==='end_user'?'selected':''}>End User</option>
          <option value="other" ${c.contact_role==='other'?'selected':''}>Other</option>
        </select>
      </div>
      <div class="fg"><label class="flbl">Influence Level</label>
        <select class="fsel" id="f-inf">
          <option value="">— Not set —</option>
          <option value="high" ${c.influence_level==='high'?'selected':''}>High</option>
          <option value="medium" ${c.influence_level==='medium'?'selected':''}>Medium</option>
          <option value="low" ${c.influence_level==='low'?'selected':''}>Low</option>
        </select>
      </div>
      <div class="fg"><label class="flbl">Email</label><input class="finp" id="f-em" type="email" value="${esc(c.email||'')}"></div>
      <div class="fg"><label class="flbl">Phone</label><input class="finp" id="f-ph" value="${esc(c.phone||'')}"></div>
      <div class="fg"><label class="flbl">Mobile</label><input class="finp" id="f-mob" value="${esc(c.mobile||'')}"></div>
      <div class="fg"><label class="flbl">Owner</label><select class="fsel" id="f-ow">${uOpts}</select></div>
      <div class="fg span2"><label class="flbl">LinkedIn URL</label><input class="finp" id="f-li" value="${esc(c.linkedin_url||'')}"></div>
      <div class="fg span2"><label class="flbl">Notes</label><textarea class="ftxt" id="f-nt">${esc(c.notes||'')}</textarea></div>
    </div>`,
    `${id?`<button class="btn btn-d" onclick="deleteContact(${id})">Delete</button>`:'<div></div>'}
     <div class="modal-ft-right"><button class="btn btn-g" onclick="closeModal()">Cancel</button><button class="btn btn-p" onclick="saveContact(${id||'null'})">Save</button></div>`
  );
}

async function saveContact(id) {
  const fn = document.getElementById('f-fn').value.trim();
  if (!fn) { toast('First name required','err'); return; }
  const body = { first_name:fn, last_name:document.getElementById('f-ln').value.trim()||null, job_title:document.getElementById('f-jt').value.trim()||null, company_id:document.getElementById('f-co').value||null, email:document.getElementById('f-em').value.trim()||null, phone:document.getElementById('f-ph').value.trim()||null, mobile:document.getElementById('f-mob').value.trim()||null, owner_id:document.getElementById('f-ow').value, linkedin_url:document.getElementById('f-li').value.trim()||null, notes:document.getElementById('f-nt').value.trim()||null, contact_role:document.getElementById('f-role').value||null, influence_level:document.getElementById('f-inf').value||null };
  try {
    if (id) { await api.put(`/api/contacts/${id}`, body); toast('Contact updated'); }
    else    { await api.post('/api/contacts', body);       toast('Contact created'); }
    closeModal(); navigate('contacts');
  } catch(err){ toast(err.message,'err'); }
}

async function deleteContact(id) {
  if (!confirm('Delete this contact?')) return;
  try { await api.delete(`/api/contacts/${id}`); toast('Deleted'); closeModal(); navigate('contacts'); }
  catch(err){ toast(err.message,'err'); }
}

// ── Companies ─────────────────────────────────────────────────────────────────
VIEWS.companies = async () => {
  const companies = await api.get('/api/companies');
  if (!companies) return;
  document.getElementById('tb-actions').innerHTML = `<button class="btn btn-p" onclick="openCompanyModal()">+ New Company</button>`;
  document.getElementById('view').innerHTML = `
    <div class="filter-bar">
      <div class="srch"><i class="srch-ic">⌕</i><input type="text" placeholder="Search companies…" oninput="filterCompanies(this.value)"></div>
    </div>
    <div class="section">
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>Company</th><th>Industry</th><th>City</th><th>Contacts</th><th>Deals</th><th>Pipeline</th><th></th></tr></thead>
          <tbody id="co-tbody">
            ${companies.length===0?'<tr><td colspan="7" class="tbl-empty">No companies yet.</td></tr>':companies.map(c=>coRow(c)).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  window._companies = companies;
};

function coRow(c) {
  return `<tr>
    <td><div class="fw-7">${esc(c.name)}</div>${c.website?`<div style="font-size:11.5px;color:var(--t3)">${esc(c.website)}</div>`:''}</td>
    <td>${esc(c.industry||'—')}</td>
    <td>${esc(c.city||'—')}</td>
    <td>${c.contact_count||0}</td>
    <td>${c.deal_count||0}</td>
    <td class="fw-7">${c.deal_value?fmt(c.deal_value):'—'}</td>
    <td style="text-align:right"><button class="btn btn-g btn-sm" onclick="openCompanyModal(${c.id})">Edit</button></td>
  </tr>`;
}

function filterCompanies(q) {
  const rows = (window._companies||[]).filter(c => !q||c.name.toLowerCase().includes(q.toLowerCase()));
  document.getElementById('co-tbody').innerHTML = rows.length===0?'<tr><td colspan="7" class="tbl-empty">No matches.</td></tr>':rows.map(c=>coRow(c)).join('');
}

async function openCompanyModal(id=null) {
  const users = await api.get('/api/users').catch(()=>[state.user]);
  let c = {};
  if (id) { c = await api.get(`/api/companies/${id}`); if (!c) return; }
  const uOpts = (users||[state.user]).map(u=>`<option value="${u.id}" ${(c.owner_id||state.user.id)==u.id?'selected':''}>${esc(u.name)}</option>`).join('');
  const sizeOpts = ['1-10','11-50','51-200','201-500','501-1000','1000+'].map(s=>`<option ${c.size_range===s?'selected':''}>${s}</option>`).join('');
  showModal(id?'Edit Company':'New Company', `
    <div class="fgrid">
      <div class="fg span2"><label class="flbl">Company Name *</label><input class="finp" id="f-name" value="${esc(c.name||'')}"></div>
      <div class="fg"><label class="flbl">Industry</label><input class="finp" id="f-ind" value="${esc(c.industry||'')}"></div>
      <div class="fg"><label class="flbl">Company Size</label><select class="fsel" id="f-sz"><option value="">— Select —</option>${sizeOpts}</select></div>
      <div class="fg"><label class="flbl">Headcount (employees)</label><input class="finp" id="f-hc" type="number" min="1" value="${c.headcount||''}" placeholder="e.g. 500"></div>
      <div class="fg"><label class="flbl">Website</label><input class="finp" id="f-web" value="${esc(c.website||'')}"></div>
      <div class="fg"><label class="flbl">Phone</label><input class="finp" id="f-ph" value="${esc(c.phone||'')}"></div>
      <div class="fg"><label class="flbl">Email</label><input class="finp" id="f-em" type="email" value="${esc(c.email||'')}"></div>
      <div class="fg"><label class="flbl">City</label><input class="finp" id="f-city" value="${esc(c.city||'')}"></div>
      <div class="fg"><label class="flbl">Owner</label><select class="fsel" id="f-ow">${uOpts}</select></div>
      <div class="fg span2"><label class="flbl">Address</label><textarea class="ftxt" id="f-addr" style="min-height:54px">${esc(c.address||'')}</textarea></div>
    </div>

    <div class="form-section-hd">HRIS &amp; HR Stack</div>
    <div class="fgrid">
      <div class="fg"><label class="flbl">Existing HRIS Name</label><input class="finp" id="f-hris-name" value="${esc(c.hris_name||'')}" placeholder="e.g. SAP SuccessFactors"></div>
      <div class="fg"><label class="flbl">HRIS Vendor</label><input class="finp" id="f-hris-vendor" value="${esc(c.hris_vendor||'')}" placeholder="e.g. SAP, Sprout, Salarium"></div>
      <div class="fg"><label class="flbl">Contract End Date</label><input class="finp" id="f-hris-end" type="date" value="${c.hris_contract_end?.slice(0,10)||''}"></div>
      <div class="fg"><label class="flbl">Annual Cost (₱)</label><input class="finp" id="f-hris-annual" type="number" min="0" value="${c.hris_annual_cost||''}" placeholder="0"></div>
      <div class="fg"><label class="flbl">Per Employee / Month (₱)</label><input class="finp" id="f-hris-pepm" type="number" min="0" step="0.01" value="${c.hris_per_employee_monthly||''}" placeholder="0.00"></div>
      <div class="fg span2"><label class="flbl">Reason to Switch</label><textarea class="ftxt" id="f-switch" style="min-height:54px" placeholder="Why are they considering switching?">${esc(c.switch_reason||'')}</textarea></div>
      <div class="fg span2"><label class="flbl">Reason NOT to Switch / Risks</label><textarea class="ftxt" id="f-no-switch" style="min-height:54px" placeholder="Lock-in, satisfaction, budget constraints…">${esc(c.no_switch_reason||'')}</textarea></div>
      <div class="fg span2"><label class="flbl">First-time HRIS Reason</label><textarea class="ftxt" id="f-first-time" style="min-height:54px" placeholder="Why are they looking for an HRIS now? (for companies with no existing system)">${esc(c.first_time_reason||'')}</textarea></div>
    </div>

    <div class="form-section-hd">Financial Services for Employees</div>
    <div class="fgrid">
      <div class="fg"><label class="flbl">Using Financial Services?</label>
        <select class="fsel" id="f-has-fin">
          <option value="0" ${!c.has_fin_services?'selected':''}>No</option>
          <option value="1" ${c.has_fin_services?'selected':''}>Yes</option>
        </select>
      </div>
      <div class="fg"><label class="flbl">Solution Name</label><input class="finp" id="f-fin-name" value="${esc(c.fin_services_name||'')}" placeholder="e.g. GCash for Business, PayWatch"></div>
      <div class="fg span2"><label class="flbl">Details (provider, cost, coverage)</label><textarea class="ftxt" id="f-fin-det" style="min-height:54px">${esc(c.fin_services_details||'')}</textarea></div>
    </div>`,
    `${id?`<button class="btn btn-d" onclick="deleteCompany(${id})">Delete</button>`:'<div></div>'}
     <div class="modal-ft-right"><button class="btn btn-g" onclick="closeModal()">Cancel</button><button class="btn btn-p" onclick="saveCompany(${id||'null'})">Save</button></div>`
  );
}

async function saveCompany(id) {
  const name = document.getElementById('f-name').value.trim();
  if (!name) { toast('Company name required','err'); return; }
  const body = {
    name,
    industry:document.getElementById('f-ind').value.trim()||null,
    website:document.getElementById('f-web').value.trim()||null,
    phone:document.getElementById('f-ph').value.trim()||null,
    email:document.getElementById('f-em').value.trim()||null,
    city:document.getElementById('f-city').value.trim()||null,
    address:document.getElementById('f-addr').value.trim()||null,
    size_range:document.getElementById('f-sz').value||null,
    owner_id:document.getElementById('f-ow').value,
    headcount:document.getElementById('f-hc').value||null,
    hris_name:document.getElementById('f-hris-name').value.trim()||null,
    hris_vendor:document.getElementById('f-hris-vendor').value.trim()||null,
    hris_contract_end:document.getElementById('f-hris-end').value||null,
    hris_annual_cost:document.getElementById('f-hris-annual').value||null,
    hris_per_employee_monthly:document.getElementById('f-hris-pepm').value||null,
    switch_reason:document.getElementById('f-switch').value.trim()||null,
    no_switch_reason:document.getElementById('f-no-switch').value.trim()||null,
    first_time_reason:document.getElementById('f-first-time').value.trim()||null,
    has_fin_services:document.getElementById('f-has-fin').value==='1',
    fin_services_name:document.getElementById('f-fin-name').value.trim()||null,
    fin_services_details:document.getElementById('f-fin-det').value.trim()||null,
  };
  try {
    if (id) { await api.put(`/api/companies/${id}`, body); toast('Company updated'); }
    else    { await api.post('/api/companies', body);       toast('Company created'); }
    closeModal(); navigate('companies');
  } catch(err){ toast(err.message,'err'); }
}

async function deleteCompany(id) {
  if (!confirm('Delete this company?')) return;
  try { await api.delete(`/api/companies/${id}`); toast('Deleted'); closeModal(); navigate('companies'); }
  catch(err){ toast(err.message,'err'); }
}

// ── Activities ────────────────────────────────────────────────────────────────
VIEWS.activities = async () => {
  const acts = await api.get('/api/activities');
  if (!acts) return;
  document.getElementById('tb-actions').innerHTML = `<button class="btn btn-p" onclick="openActivityModal()">+ Log Activity</button>`;
  document.getElementById('view').innerHTML = `
    <div class="filter-bar">
      <select class="flt" onchange="filterActivities(this.value)">
        <option value="">All types</option>
        <option value="call">📞 Calls</option><option value="meeting">🤝 Meetings</option>
        <option value="proposal">📄 Proposals</option><option value="note">📝 Notes</option>
        <option value="whatsapp">💬 WhatsApp</option><option value="email">✉️ Emails</option>
      </select>
    </div>
    <div class="section">
      <div class="act-list" id="act-list">
        ${acts.length===0?'<div class="tbl-empty">No activities yet.</div>':acts.map(actRow).join('')}
      </div>
    </div>`;
  window._activities = acts;
};

function actRow(a) {
  return `<div class="act-item">
    <div class="act-ico ${ACT_CLS[a.type]||'act-note'}">${ACT_ICONS[a.type]||'📝'}</div>
    <div class="act-content">
      <div class="act-subj">${esc(a.subject||a.type)}</div>
      ${a.body?`<div class="act-body">${esc(a.body)}</div>`:''}
      ${a.outcome?`<div class="act-meta"><b>Outcome:</b> ${esc(a.outcome)}</div>`:''}
      <div class="act-meta">
        ${esc(a.user_name)} · ${fmtDateTime(a.activity_date)}
        ${a.deal_title?` · <span class="act-link" onclick="openDealDetail(${a.deal_id})">${esc(a.deal_title)}</span>`:''}
        ${a.contact_first?` · ${esc(a.contact_first)} ${esc(a.contact_last||'')}` :''}
      </div>
    </div>
  </div>`;
}

function filterActivities(type) {
  const rows = (window._activities||[]).filter(a => !type||a.type===type);
  document.getElementById('act-list').innerHTML = rows.length===0?'<div class="tbl-empty">No matching activities.</div>':rows.map(actRow).join('');
}

async function openActivityModal(dealId=null) {
  const [deals, contacts] = await Promise.all([api.get('/api/deals'), api.get('/api/contacts')]);
  const dealOpts    = (deals||[]).map(d=>`<option value="${d.id}" ${d.id==dealId?'selected':''}>${esc(d.title)} — ${esc(d.company_name||'')}</option>`).join('');
  const contactOpts = (contacts||[]).map(c=>`<option value="${c.id}">${esc(c.first_name+' '+(c.last_name||''))}</option>`).join('');
  showModal('Log Activity', `
    <div class="fgrid">
      <div class="fg"><label class="flbl">Type *</label>
        <select class="fsel" id="f-type">
          <option value="call">📞 Call</option>
          <option value="meeting">🤝 Meeting</option>
          <option value="proposal">📄 Proposal Sent</option>
          <option value="note">📝 Note</option>
          <option value="whatsapp">💬 WhatsApp</option>
          <option value="email">✉️ Email</option>
        </select>
      </div>
      <div class="fg"><label class="flbl">Date & Time</label><input class="finp" id="f-date" type="datetime-local" value="${new Date(new Date()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)}"></div>
      <div class="fg span2"><label class="flbl">Subject</label><input class="finp" id="f-subj" placeholder="e.g. Discovery call with Carlo"></div>
      <div class="fg span2"><label class="flbl">Notes / Body</label><textarea class="ftxt" id="f-body" placeholder="What was discussed…"></textarea></div>
      <div class="fg"><label class="flbl">Outcome</label><input class="finp" id="f-out" placeholder="e.g. Positive, Follow up"></div>
      <div class="fg"><label class="flbl">Duration (min)</label><input class="finp" id="f-dur" type="number" placeholder="30"></div>
      <div class="fg"><label class="flbl">Linked Deal</label><select class="fsel" id="f-deal"><option value="">— None —</option>${dealOpts}</select></div>
      <div class="fg"><label class="flbl">Linked Contact</label><select class="fsel" id="f-ct"><option value="">— None —</option>${contactOpts}</select></div>
    </div>`,
    `<div></div><div class="modal-ft-right"><button class="btn btn-g" onclick="closeModal()">Cancel</button><button class="btn btn-p" onclick="saveActivity()">Log Activity</button></div>`
  );
}

async function saveActivity() {
  const type = document.getElementById('f-type').value;
  if (!type) { toast('Type required','err'); return; }
  const body = { type, subject:document.getElementById('f-subj').value.trim()||null, body:document.getElementById('f-body').value.trim()||null, outcome:document.getElementById('f-out').value.trim()||null, duration_min:parseInt(document.getElementById('f-dur').value)||null, deal_id:document.getElementById('f-deal').value||null, contact_id:document.getElementById('f-ct').value||null, activity_date:document.getElementById('f-date').value };
  try {
    await api.post('/api/activities', body);
    toast('Activity logged'); closeModal();
    if (state.view === 'activities') navigate('activities');
    else navigate(state.view);
  } catch(err){ toast(err.message,'err'); }
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
VIEWS.tasks = async () => {
  const [open, done] = await Promise.all([
    api.get('/api/tasks?status=open'),
    api.get('/api/tasks?status=completed'),
  ]);
  if (!open || !done) return;
  document.getElementById('tb-actions').innerHTML = `<button class="btn btn-p" onclick="openTaskModal()">+ New Task</button>`;
  document.getElementById('view').innerHTML = `
    <div class="two-col mb-16">
      <div class="section">
        <div class="section-hd"><span class="section-title">Open (${open.length})</span></div>
        <div id="open-tasks">
          ${open.length===0?'<div class="tbl-empty">No open tasks 🎉</div>':open.map(t=>taskRow(t)).join('')}
        </div>
      </div>
      <div class="section">
        <div class="section-hd"><span class="section-title">Completed (${done.length})</span></div>
        <div>
          ${done.length===0?'<div class="tbl-empty">No completed tasks.</div>':done.slice(0,20).map(t=>taskRow(t)).join('')}
        </div>
      </div>
    </div>`;
};

function taskRow(t) {
  const n = daysTo(t.due_date);
  const over = n!==null && n<0 && t.status!=='completed';
  return `<div class="task-item">
    <div class="task-check${t.status==='completed'?' done':''}" onclick="completeTask(${t.id},this)">${t.status==='completed'?'✓':''}</div>
    <div class="task-content">
      <div class="task-title${t.status==='completed'?' done':''}">${esc(t.title)}</div>
      <div class="task-meta">
        <span class="${over?'overdue':''}">${t.due_date?fmtDate(t.due_date):'No due date'}</span>
        ${t.assigned_name?` · ${esc(t.assigned_name)}`:''}
        ${t.deal_title?` · ${esc(t.deal_title)}`:''}
      </div>
    </div>
    <div style="display:flex;gap:6px;align-items:center">
      <span class="badge badge-${t.priority==='high'?'high':t.priority==='medium'?'med':'low'}">${t.priority}</span>
      <button class="btn btn-g btn-sm" onclick="openTaskModal(null,${t.id})">Edit</button>
    </div>
  </div>`;
}

async function completeTask(id, el) {
  el.classList.add('done'); el.textContent = '✓';
  try { await api.patch(`/api/tasks/${id}/complete`); toast('Task completed'); }
  catch(err){ toast(err.message,'err'); }
}

async function openTaskModal(dealId=null, taskId=null) {
  const [deals, users] = await Promise.all([api.get('/api/deals'), api.get('/api/users').catch(()=>[state.user])]);
  let t = {};
  if (taskId) { const tasks = await api.get(`/api/tasks?status=open`); t = tasks?.find(x=>x.id==taskId)||{}; }
  const dealOpts = (deals||[]).map(d=>`<option value="${d.id}" ${(t.deal_id||dealId)==d.id?'selected':''}>${esc(d.title)} — ${esc(d.company_name||'')}</option>`).join('');
  const uOpts    = (users||[state.user]).map(u=>`<option value="${u.id}" ${(t.assigned_to||state.user.id)==u.id?'selected':''}>${esc(u.name)}</option>`).join('');
  showModal(taskId?'Edit Task':'New Task', `
    <div class="fg"><label class="flbl">Task Title *</label><input class="finp" id="f-ttl" value="${esc(t.title||'')}"></div>
    <div class="fg"><label class="flbl">Description</label><textarea class="ftxt" id="f-desc">${esc(t.description||'')}</textarea></div>
    <div class="fgrid">
      <div class="fg"><label class="flbl">Due Date</label><input class="finp" id="f-due" type="datetime-local" value="${t.due_date?new Date(new Date(t.due_date)-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):''}"></div>
      <div class="fg"><label class="flbl">Priority</label>
        <select class="fsel" id="f-pri">
          <option value="high" ${t.priority==='high'?'selected':''}>High</option>
          <option value="medium" ${!t.priority||t.priority==='medium'?'selected':''}>Medium</option>
          <option value="low" ${t.priority==='low'?'selected':''}>Low</option>
        </select>
      </div>
      <div class="fg"><label class="flbl">Assigned To</label><select class="fsel" id="f-assign">${uOpts}</select></div>
      <div class="fg"><label class="flbl">Linked Deal</label><select class="fsel" id="f-deal"><option value="">— None —</option>${dealOpts}</select></div>
    </div>`,
    `${taskId?`<button class="btn btn-d" onclick="deleteTask(${taskId})">Delete</button>`:'<div></div>'}
     <div class="modal-ft-right"><button class="btn btn-g" onclick="closeModal()">Cancel</button><button class="btn btn-p" onclick="saveTask(${taskId||'null'})">Save Task</button></div>`
  );
}

async function saveTask(id) {
  const title = document.getElementById('f-ttl').value.trim();
  if (!title) { toast('Title required','err'); return; }
  const body = { title, description:document.getElementById('f-desc').value.trim()||null, due_date:document.getElementById('f-due').value||null, priority:document.getElementById('f-pri').value, assigned_to:document.getElementById('f-assign').value, deal_id:document.getElementById('f-deal').value||null };
  try {
    if (id) { await api.put(`/api/tasks/${id}`, body); toast('Task updated'); }
    else    { await api.post('/api/tasks', body);       toast('Task created'); }
    closeModal(); navigate('tasks');
  } catch(err){ toast(err.message,'err'); }
}

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  try { await api.delete(`/api/tasks/${id}`); toast('Deleted'); closeModal(); navigate('tasks'); }
  catch(err){ toast(err.message,'err'); }
}

// ── Reports ───────────────────────────────────────────────────────────────────
VIEWS.reports = async () => {
  const [pipeline, monthly, owners] = await Promise.all([
    api.get('/api/reports/pipeline'),
    api.get('/api/reports/monthly'),
    api.get('/api/reports/owners').catch(()=>[]),
  ]);
  if (!pipeline) return;
  const v = document.getElementById('view');
  v.innerHTML = `
    <div class="two-col mb-16">
      <div class="section">
        <div class="section-hd"><span class="section-title">Pipeline by Stage</span></div>
        <div style="padding:16px"><canvas id="chart-pipe" height="220"></canvas></div>
      </div>
      <div class="section">
        <div class="section-hd"><span class="section-title">Revenue Won vs Lost</span></div>
        <div style="padding:16px"><canvas id="chart-wl" height="220"></canvas></div>
      </div>
    </div>
    <div class="section mb-16">
      <div class="section-hd"><span class="section-title">Monthly Revenue Trend (last 6 months)</span></div>
      <div style="padding:16px"><canvas id="chart-monthly" height="140"></canvas></div>
    </div>
    ${owners?.length ? `
    <div class="section">
      <div class="section-hd"><span class="section-title">Owner Performance</span></div>
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>Rep</th><th>Total Deals</th><th>Won</th><th>Revenue Won</th><th>Pipeline</th><th>Win Rate</th></tr></thead>
          <tbody>
            ${owners.map(o=>`<tr>
              <td style="display:flex;align-items:center;gap:8px;padding:10px 14px">${av(o.name,o.color)} <span class="fw-7">${esc(o.name)}</span></td>
              <td>${o.total_deals}</td>
              <td>${o.won_deals}</td>
              <td class="fw-7">${fmt(o.won_value)}</td>
              <td>${fmt(o.pipeline_value)}</td>
              <td>${o.total_deals?Math.round(o.won_deals/o.total_deals*100):0}%</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}
  `;

  const active = pipeline.filter(s=>!s.is_won&&!s.is_lost);
  new Chart(document.getElementById('chart-pipe'), {
    type:'bar',
    data:{ labels:active.map(s=>s.name), datasets:[{ label:'Pipeline Value (₱)', data:active.map(s=>s.total_value), backgroundColor:active.map(s=>s.color+'99'), borderColor:active.map(s=>s.color), borderWidth:2 }] },
    options:{ plugins:{legend:{display:false}}, scales:{ y:{ ticks:{ callback:v=>'₱'+(v/1000).toFixed(0)+'K' } } } }
  });

  const won  = pipeline.find(s=>s.is_won);
  const lost = pipeline.find(s=>s.is_lost);
  new Chart(document.getElementById('chart-wl'), {
    type:'doughnut',
    data:{ labels:['Won','Lost'], datasets:[{ data:[won?.total_value||0, lost?.total_value||0], backgroundColor:['#22C55E99','#EF444499'], borderColor:['#22C55E','#EF4444'], borderWidth:2 }] },
    options:{ plugins:{ legend:{ position:'bottom' } } }
  });

  if (monthly?.length) {
    new Chart(document.getElementById('chart-monthly'), {
      type:'line',
      data:{ labels:monthly.map(m=>m.month), datasets:[
        { label:'Won', data:monthly.map(m=>m.won), borderColor:'#22C55E', backgroundColor:'rgba(34,197,94,.1)', fill:true, tension:.4 },
        { label:'Lost', data:monthly.map(m=>m.lost), borderColor:'#EF4444', backgroundColor:'rgba(239,68,68,.07)', fill:true, tension:.4 }
      ]},
      options:{ plugins:{legend:{position:'bottom'}}, scales:{ y:{ ticks:{ callback:v=>'₱'+(v/1000).toFixed(0)+'K' } } } }
    });
  }
};

// ── Users (admin) ──────────────────────────────────────────────────────────────
VIEWS.users = async () => {
  if (!['admin','manager'].includes(state.user?.role)) { navigate('dashboard'); return; }
  const [users, audit] = await Promise.all([
    api.get('/api/users'),
    state.user.role==='admin' ? api.get('/api/auth/audit').catch(()=>[]) : Promise.resolve([]),
  ]);
  if (!users) return;
  document.getElementById('tb-actions').innerHTML = `${state.user.role==='admin'?'<button class="btn btn-p" onclick="openUserModal()">+ New User</button>':''}`;
  document.getElementById('view').innerHTML = `
    <div class="section">
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th><th></th></tr></thead>
          <tbody>
            ${users.map(u=>`<tr>
              <td style="display:flex;align-items:center;gap:8px;padding:10px 14px">${av(u.name,u.color)} <span class="fw-7">${esc(u.name)}</span>${u.locked_until&&new Date(u.locked_until)>new Date()?'<span class="badge badge-cancelled" style="margin-left:6px">Locked</span>':''}</td>
              <td>${esc(u.email)}</td>
              <td><span class="badge role-${u.role}">${u.role}</span></td>
              <td><span class="badge badge-${u.is_active?'done':'cancelled'}">${u.is_active?'Active':'Inactive'}</span></td>
              <td>${fmtDateTime(u.last_login)}</td>
              <td style="text-align:right;display:flex;gap:6px;justify-content:flex-end;padding:8px 14px">
                ${state.user.role==='admin'&&u.locked_until&&new Date(u.locked_until)>new Date()?`<button class="btn btn-d btn-sm" onclick="unlockUser(${u.id})">Unlock</button>`:''}
                ${state.user.role==='admin'?`<button class="btn btn-g btn-sm" onclick="openUserModal(${u.id})">Edit</button>`:''}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ${state.user.role==='admin'&&audit?.length?`
    <div class="section" style="margin-top:20px">
      <div class="section-hd"><span class="section-title">Login Audit Log</span><span style="font-size:12px;color:var(--t3)">Last 200 attempts</span></div>
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>Time</th><th>Email</th><th>User</th><th>IP Address</th><th>Result</th></tr></thead>
          <tbody>
            ${audit.map(a=>`<tr>
              <td style="font-size:12px;white-space:nowrap">${fmtDateTime(a.created_at)}</td>
              <td>${esc(a.email)}</td>
              <td>${esc(a.user_name||'—')}</td>
              <td style="font-family:monospace;font-size:12px">${esc(a.ip_address)}</td>
              <td><span class="badge badge-${a.success?'done':'cancelled'}">${a.success?'Success':'Failed'}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`:''}`;
};

async function unlockUser(id) {
  try { await api.post(`/api/auth/unlock/${id}`, {}); toast('Account unlocked'); navigate('users'); }
  catch(e) { toast(e.message,'err'); }
}

async function openUserModal(id=null) {
  let u = {};
  if (id) { const users = await api.get('/api/users'); u = users?.find(x=>x.id==id)||{}; }
  const colors = ['#0F766E','#0369A1','#7C3AED','#B45309','#DC2626','#059669','#0891B2'];
  showModal(id?'Edit User':'New User', `
    <div class="fgrid">
      <div class="fg"><label class="flbl">Full Name *</label><input class="finp" id="f-name" value="${esc(u.name||'')}"></div>
      <div class="fg"><label class="flbl">Email *</label><input class="finp" id="f-email" type="email" value="${esc(u.email||'')}"></div>
      ${!id?`<div class="fg"><label class="flbl">Password *</label><input class="finp" id="f-pw" type="password" placeholder="Min 8 characters"></div>`:''}
      ${id?`<div class="fg"><label class="flbl">New Password</label><input class="finp" id="f-pw-new" type="password" placeholder="Leave blank to keep current"></div>`:''}
      <div class="fg"><label class="flbl">Role</label>
        <select class="fsel" id="f-role">
          <option value="rep" ${u.role==='rep'||!u.role?'selected':''}>Rep</option>
          <option value="manager" ${u.role==='manager'?'selected':''}>Manager</option>
          <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
        </select>
      </div>
      <div class="fg"><label class="flbl">Avatar Color</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:4px">
          ${colors.map(c=>`<div onclick="selectColor('${c}')" style="width:24px;height:24px;border-radius:50%;background:${c};cursor:pointer;outline:${(u.color||'#0F766E')===c?'3px solid '+c:'none'};outline-offset:2px" data-color="${c}"></div>`).join('')}
        </div>
        <input type="hidden" id="f-color" value="${u.color||'#0F766E'}">
      </div>
      ${id?`<div class="fg"><label class="flbl">Status</label>
        <select class="fsel" id="f-active">
          <option value="1" ${u.is_active?'selected':''}>Active</option>
          <option value="0" ${!u.is_active?'selected':''}>Inactive</option>
        </select>
      </div>`:''}
    </div>`,
    `<div></div><div class="modal-ft-right"><button class="btn btn-g" onclick="closeModal()">Cancel</button><button class="btn btn-p" onclick="saveUser(${id||'null'})">Save User</button></div>`
  );
}

function selectColor(c) {
  document.getElementById('f-color').value = c;
  document.querySelectorAll('[data-color]').forEach(el => {
    el.style.outline = el.dataset.color===c ? `3px solid ${c}` : 'none';
  });
}

async function saveUser(id) {
  const name  = document.getElementById('f-name').value.trim();
  const email = document.getElementById('f-email').value.trim();
  const role  = document.getElementById('f-role').value;
  const color = document.getElementById('f-color').value;
  if (!name||!email) { toast('Name and email required','err'); return; }
  try {
    if (id) {
      const pw = document.getElementById('f-pw-new')?.value;
      const is_active = document.getElementById('f-active')?.value;
      await api.put(`/api/users/${id}`, { name, email, role, avatar_color:color, is_active:is_active==='1' });
      if (pw) await api.put(`/api/users/${id}/reset-password`, { newPassword: pw });
      toast('User updated');
    } else {
      const pw = document.getElementById('f-pw').value;
      if (!pw || pw.length < 8) { toast('Password must be at least 8 characters','err'); return; }
      await api.post('/api/users', { name, email, password:pw, role, avatar_color:color });
      toast('User created — they must change password on first login');
    }
    closeModal(); navigate('users');
  } catch(err){ toast(err.message,'err'); }
}

// ── Partners ──────────────────────────────────────────────────────────────────
VIEWS.partners = async () => {
  if (!['admin','manager'].includes(state.user?.role)) { navigate('dashboard'); return; }
  const partners = await api.get('/api/partners');
  if (!partners) return;
  document.getElementById('tb-actions').innerHTML = `<button class="btn btn-p" onclick="openPartnerModal()">+ New Partner</button>`;
  document.getElementById('view').innerHTML = `
    <div class="section">
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>Partner</th><th>Type</th><th>Contact</th><th>Payout</th><th>Deals</th><th>Pipeline</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${partners.length===0?'<tr><td colspan="8" class="tbl-empty">No partners yet. Add your first referral partner.</td></tr>':
              partners.map(p=>`<tr>
                <td><div class="fw-7">${esc(p.name)}</div></td>
                <td><span class="badge" style="background:var(--am);color:var(--accent)">${PARTNER_TYPE[p.type]||p.type}</span></td>
                <td>
                  <div>${esc(p.contact_person||'—')}</div>
                  ${p.contact_email?`<div style="font-size:11px;color:var(--t3)">${esc(p.contact_email)}</div>`:''}
                </td>
                <td>${p.payout_value?(p.payout_type==='percentage'?p.payout_value+'%':'₱'+Number(p.payout_value).toLocaleString()):''} <span style="font-size:11px;color:var(--t3)">${PAYOUT_TYPE[p.payout_type]||''}</span></td>
                <td>${p.deal_count||0}</td>
                <td class="fw-7">${p.deal_value?fmt(p.deal_value):'—'}</td>
                <td><span class="badge badge-${p.is_active?'done':'cancelled'}">${p.is_active?'Active':'Inactive'}</span></td>
                <td style="text-align:right"><button class="btn btn-g btn-sm" onclick="openPartnerModal(${p.id})">Edit</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
};

async function openPartnerModal(id=null) {
  let p = {};
  if (id) { const list = await api.get('/api/partners'); p = list?.find(x=>x.id==id)||{}; }
  showModal(id?'Edit Partner':'New Partner', `
    <div class="fgrid">
      <div class="fg span2"><label class="flbl">Partner Name *</label><input class="finp" id="f-pname" value="${esc(p.name||'')}" placeholder="Company or individual name"></div>
      <div class="fg"><label class="flbl">Type</label>
        <select class="fsel" id="f-ptype">
          <option value="referral_partner" ${p.type==='referral_partner'||!p.type?'selected':''}>Referral Partner</option>
          <option value="reseller" ${p.type==='reseller'?'selected':''}>Reseller</option>
          <option value="consultant" ${p.type==='consultant'?'selected':''}>Consultant</option>
          <option value="broker" ${p.type==='broker'?'selected':''}>Broker</option>
          <option value="other" ${p.type==='other'?'selected':''}>Other</option>
        </select>
      </div>
      <div class="fg"><label class="flbl">Status</label>
        <select class="fsel" id="f-pactive">
          <option value="1" ${p.is_active!==0?'selected':''}>Active</option>
          <option value="0" ${p.is_active===0?'selected':''}>Inactive</option>
        </select>
      </div>
    </div>
    <div class="form-section-hd">Contact</div>
    <div class="fgrid">
      <div class="fg"><label class="flbl">Contact Person</label><input class="finp" id="f-pcp" value="${esc(p.contact_person||'')}"></div>
      <div class="fg"><label class="flbl">Contact Email</label><input class="finp" id="f-pce" type="email" value="${esc(p.contact_email||'')}"></div>
      <div class="fg span2"><label class="flbl">Contact Phone</label><input class="finp" id="f-pph" value="${esc(p.contact_phone||'')}"></div>
    </div>
    <div class="form-section-hd">Payout</div>
    <div class="fgrid">
      <div class="fg"><label class="flbl">Payout Type</label>
        <select class="fsel" id="f-pptype">
          <option value="percentage" ${p.payout_type==='percentage'||!p.payout_type?'selected':''}>% of Deal Value</option>
          <option value="fixed_per_deal" ${p.payout_type==='fixed_per_deal'?'selected':''}>Fixed per Deal (₱)</option>
          <option value="milestone" ${p.payout_type==='milestone'?'selected':''}>Milestone</option>
        </select>
      </div>
      <div class="fg"><label class="flbl">Payout Value (% or ₱)</label><input class="finp" id="f-ppval" type="number" min="0" step="0.01" value="${p.payout_value||''}" placeholder="e.g. 10 for 10%"></div>
      <div class="fg"><label class="flbl">Bank Name</label><input class="finp" id="f-pbank" value="${esc(p.bank_name||'')}"></div>
      <div class="fg"><label class="flbl">Bank Account No.</label><input class="finp" id="f-pacct" value="${esc(p.bank_account||'')}"></div>
    </div>
    <div class="fg" style="margin-top:4px"><label class="flbl">Notes</label><textarea class="ftxt" id="f-pnotes">${esc(p.notes||'')}</textarea></div>`,
    `${id?`<button class="btn btn-d" onclick="deletePartner(${id})">Delete</button>`:'<div></div>'}
     <div class="modal-ft-right"><button class="btn btn-g" onclick="closeModal()">Cancel</button><button class="btn btn-p" onclick="savePartner(${id||'null'})">Save Partner</button></div>`
  );
}

async function savePartner(id) {
  const name = document.getElementById('f-pname').value.trim();
  if (!name) { toast('Partner name required','err'); return; }
  const body = {
    name, type:document.getElementById('f-ptype').value,
    contact_person:document.getElementById('f-pcp').value.trim()||null,
    contact_email:document.getElementById('f-pce').value.trim()||null,
    contact_phone:document.getElementById('f-pph').value.trim()||null,
    payout_type:document.getElementById('f-pptype').value,
    payout_value:parseFloat(document.getElementById('f-ppval').value)||null,
    bank_name:document.getElementById('f-pbank').value.trim()||null,
    bank_account:document.getElementById('f-pacct').value.trim()||null,
    is_active:document.getElementById('f-pactive').value==='1',
    notes:document.getElementById('f-pnotes').value.trim()||null,
  };
  try {
    if (id) { await api.put(`/api/partners/${id}`, body); toast('Partner updated'); }
    else    { await api.post('/api/partners', body);       toast('Partner created'); }
    closeModal(); navigate('partners');
  } catch(err){ toast(err.message,'err'); }
}

async function deletePartner(id) {
  if (!confirm('Delete this partner? Linked deals will have the partner cleared.')) return;
  try { await api.delete(`/api/partners/${id}`); toast('Partner deleted'); closeModal(); navigate('partners'); }
  catch(err){ toast(err.message,'err'); }
}

// ── Update task due badge ──────────────────────────────────────────────────────
async function updateTaskBadge() {
  try {
    const tasks = await api.get('/api/tasks?status=open');
    const overdue = (tasks||[]).filter(t => t.due_date && daysTo(t.due_date) < 0);
    const nb = document.getElementById('nb-tasks');
    if (nb) { nb.textContent = overdue.length; nb.classList.toggle('show', overdue.length > 0); }
  } catch {}
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const user = await api.get('/api/auth/me');
    if (!user) { location.href = '/login'; return; }
    state.user = user;

    // Load stages
    state.stages = await api.get('/api/pipeline/stages') || [];

    // Show shell
    document.getElementById('app-shell').style.display = 'flex';

    // Sidebar user
    document.getElementById('sb-user').innerHTML = `
      <div class="sb-user-av" style="background:${user.color}">${initials(user.name)}</div>
      <div style="flex:1;min-width:0"><div class="sb-user-name">${esc(user.name)}</div><div class="sb-user-role">${user.role}</div></div>
      <button title="Sign out" onclick="logout()" style="background:none;border:none;cursor:pointer;color:#3D5A80;font-size:14px;padding:2px 4px">⏻</button>`;

    // Show admin-only items
    if (user.role === 'admin') {
      document.querySelectorAll('.admin-only').forEach(el=>el.classList.add('visible'));
    }
    if (['admin','manager'].includes(user.role)) {
      document.querySelectorAll('.manager-up').forEach(el=>el.classList.add('visible'));
    }

    // Nav click
    document.getElementById('sb-nav').addEventListener('click', e => {
      const item = e.target.closest('.nav-item');
      if (item?.dataset.view) navigate(item.dataset.view);
    });

    await updateTaskBadge();
    navigate('dashboard');
  } catch (err) {
    document.body.innerHTML = `<div style="padding:40px;color:red">Failed to start: ${err.message}</div>`;
  }
}

async function logout() {
  await api.post('/api/auth/logout');
  location.href = '/login';
}

// Expose globals for inline handlers
window.navigate = navigate;
window.openDealDetail = openDealDetail;
window.openDealModal = openDealModal;
window.saveDeal = saveDeal;
window.deleteDeal = deleteDeal;
window.openContactModal = openContactModal;
window.saveContact = saveContact;
window.deleteContact = deleteContact;
window.openCompanyModal = openCompanyModal;
window.saveCompany = saveCompany;
window.deleteCompany = deleteCompany;
window.openActivityModal = openActivityModal;
window.saveActivity = saveActivity;
window.openTaskModal = openTaskModal;
window.saveTask = saveTask;
window.deleteTask = deleteTask;
window.completeTask = completeTask;
window.openUserModal = openUserModal;
window.saveUser = saveUser;
window.unlockUser = unlockUser;
window.selectColor = selectColor;
window.logout = logout;
window.openPartnerModal = openPartnerModal;
window.savePartner = savePartner;
window.deletePartner = deletePartner;
window.filterDealsTable = filterDealsTable;
window.filterContacts = filterContacts;
window.filterCompanies = filterCompanies;
window.filterActivities = filterActivities;
window.pDs = pDs; window.pDe = pDe; window.pDov = pDov; window.pDlv = pDlv; window.pDrp = pDrp;
Object.defineProperty(window, 'dragEndTime', { get: () => dragEndTime });

// ── Performance helpers ───────────────────────────────────────────────────────
const el = id => document.getElementById(id);
const gv = id => (document.getElementById(id)||{}).value;
function pfmt(n){ return n>=1000000 ? (n/1000000).toFixed(1)+'M' : n>=1000 ? (n/1000).toFixed(0)+'k' : String(Math.round(n)); }
function attainClass(pct){ return pct==null?'none':pct>=100?'high':pct>=70?'mid':'low'; }
function attainLabel(pct){ return pct==null?'No target':pct+'% attainment'; }
function progFill(pct, color){ return `background:${color||'var(--accent)'};width:${Math.min(pct||0,100)}%`; }

function currentMonthPeriod(){
  const n=new Date(), y=n.getFullYear(), m=n.getMonth()+1;
  const ms=`${y}-${String(m).padStart(2,'0')}-01`;
  const d=new Date(y,m,0); const me=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return {ps:ms,pe:me,type:'monthly',label:'This Month'};
}
function lastMonthPeriod(){
  const n=new Date(); let y=n.getFullYear(), m=n.getMonth();
  if(m===0){m=12;y--;}
  const ms=`${y}-${String(m).padStart(2,'0')}-01`;
  const d=new Date(y,m,0); const me=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return {ps:ms,pe:me,type:'monthly',label:'Last Month'};
}
function currentQtrPeriod(){
  const n=new Date(), y=n.getFullYear(), q=Math.floor(n.getMonth()/3);
  const sm=q*3+1; const em=sm+2;
  const ms=`${y}-${String(sm).padStart(2,'0')}-01`;
  const d=new Date(y,em,0); const me=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return {ps:ms,pe:me,type:'quarterly',label:'This Quarter'};
}
function lastQtrPeriod(){
  const n=new Date(); let y=n.getFullYear(), q=Math.floor(n.getMonth()/3)-1;
  if(q<0){q=3;y--;}
  const sm=q*3+1; const em=sm+2;
  const ms=`${y}-${String(sm).padStart(2,'0')}-01`;
  const d=new Date(y,em,0); const me=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return {ps:ms,pe:me,type:'quarterly',label:'Last Quarter'};
}

let perfState = null;
let teamPerfState = null;
let perfTrendChart = null;

// ── My Performance ────────────────────────────────────────────────────────────
VIEWS.performance = async () => {
  const p = perfState || currentMonthPeriod();
  let data;
  try { data = await api.get(`/api/performance/me?period_start=${p.ps}&period_end=${p.pe}&period_type=${p.type}`); }
  catch(e){ el('view').innerHTML=`<div class="empty-state">Failed to load performance data.</div>`; return; }

  const att = data.attainment;
  const q = data.quota || {};
  const tabs = [currentMonthPeriod(),lastMonthPeriod(),currentQtrPeriod(),lastQtrPeriod()];

  function tabHtml(){ return tabs.map(t=>`<button class="ppt-tab ${t.ps===p.ps&&t.type===p.type?'active':''}" onclick="setPerfPeriod('${t.ps}','${t.pe}','${t.type}','${t.label}')">${t.label}</button>`).join(''); }

  function kpiCard(label, actual, target, prefix='', suffix=''){
    const pct = target>0?Math.round(actual/target*100):null;
    const gap = target>0?Math.max(0,target-actual):null;
    const cls = attainClass(pct);
    return `<div class="kpi-card">
      <div class="kpi-label">${label}</div>
      <div class="kpi-actual">${prefix}${pfmt(actual)}${suffix}</div>
      <div class="kpi-target">${target?`Target: ${prefix}${pfmt(target)}${suffix}`:'No target set'}</div>
      <div class="kpi-prog-track"><div class="kpi-prog-fill" style="${progFill(pct,pct>=100?'#22C55E':pct>=70?'#F59E0B':'#EF4444')}"></div></div>
      <div class="kpi-attain ${cls}">${attainLabel(pct)}</div>
      ${gap?`<div class="kpi-gap">Gap: ${prefix}${pfmt(gap)}${suffix}</div>`:''}
    </div>`;
  }

  function actBar(label, actual, target, color){
    const pct = target>0?Math.round(actual/target*100):null;
    const over = pct!=null&&pct>=100;
    return `<div class="at-item">
      <span class="at-label">${label}</span>
      <div class="at-bar-track"><div class="at-bar-fill ${over?'over':''}" style="width:${Math.min(pct||0,100)}%;${color?'background:'+color:''}"></div></div>
      <span class="at-nums"><span>${actual}</span>${target?` / ${target}`:''}</span>
    </div>`;
  }

  function actionItems(arr, color, badge){
    if(!arr||!arr.length) return `<div class="action-empty">None — great work!</div>`;
    return arr.map(d=>`<div class="action-item" onclick="openDealDetail(${d.id})">
      <div class="action-dot" style="background:${color}"></div>
      <div class="action-content">
        <div class="action-title">${d.title}</div>
        <div class="action-meta">${d.company_name||''} · ${d.stage_name} · ${badge(d)}</div>
      </div>
      <div class="action-value">${fmtFull(d.value)}</div>
    </div>`).join('');
  }

  function overdueTaskItems(arr){
    if(!arr||!arr.length) return `<div class="action-empty">No overdue tasks!</div>`;
    return arr.map(t=>`<div class="action-item">
      <div class="action-dot" style="background:#EF4444"></div>
      <div class="action-content">
        <div class="action-title">${t.title}</div>
        <div class="action-meta">${t.deal_title?`${t.deal_title} · `:''}<span style="color:#EF4444">Due ${new Date(t.due_date).toLocaleDateString()}</span></div>
      </div>
    </div>`).join('');
  }

  const pipeTotal = data.pipeline.total||0;
  const funnelHtml = data.pipeline.by_stage.map(s=>{
    const pct = pipeTotal>0?Math.round(Number(s.total_value)/pipeTotal*100):0;
    return `<div class="funnel-bar-row">
      <span class="funnel-stage-lbl" title="${s.name}">${s.name}</span>
      <div class="funnel-bar-track"><div class="funnel-bar-fill" style="width:${pct}%;background:${s.color||'var(--accent)'}"></div></div>
      <span class="funnel-stage-val">${fmtFull(s.total_value)} (${s.deal_count})</span>
    </div>`;
  }).join('');

  const act = data.activities||{};
  const wr = data.win_rate||{};
  const avg = data.avg||{};

  el('view').innerHTML = `
    <div class="view-body">
      <div class="perf-header">
        <div>
          <div style="font-size:13px;color:var(--t3);margin-bottom:2px">Period: ${p.ps} → ${p.pe}</div>
          ${att.pipeline_coverage!=null?`<div style="font-size:12px;color:var(--t3)">Pipeline coverage (gap): <b>${att.pipeline_coverage}x</b></div>`:''}
        </div>
        <div class="perf-period-tabs">${tabHtml()}</div>
      </div>

      <div class="kpi-grid">
        ${kpiCard('Revenue Closed', att.revenue.closed, att.revenue.target, '₱', '')}
        ${kpiCard('Deals Won', att.deals.won, att.deals.target||0, '', '')}
        ${kpiCard('Win Rate (90d)', wr.rate||0, 100, '', '%')}
        ${kpiCard('Avg Deal Size', avg.deal_size||0, 0, '₱', '')}
      </div>

      <div class="perf-row">
        <div class="perf-card">
          <div class="perf-card-title">Activity vs Target</div>
          <div class="act-track-grid">
            ${actBar('Calls', act.call||0, q.calls_target||0)}
            ${actBar('Proposals', act.proposal||0, q.emails_target||0)}
            ${actBar('Meetings', act.meeting||0, q.meetings_target||0)}
            ${actBar('WhatsApp', act.whatsapp||0, 0, '#22C55E')}
            ${actBar('Notes', act.note||0, 0, '#6366F1')}
          </div>
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--bd);display:flex;gap:20px;font-size:12px;color:var(--t3)">
            <span>Avg cycle: <b style="color:var(--t1)">${avg.cycle_days||0}d</b></span>
            <span>Deal velocity: <b style="color:var(--t1)">₱${pfmt(avg.velocity)}/d</b></span>
            <span>Won/Lost (90d): <b style="color:#22C55E">${wr.won}</b> / <b style="color:#EF4444">${wr.lost}</b></span>
          </div>
        </div>
        <div class="perf-card">
          <div class="perf-card-title">Pipeline by Stage</div>
          <div class="funnel-rows">${funnelHtml||'<div class="action-empty">No open pipeline.</div>'}</div>
          <div style="margin-top:10px;font-size:12px;color:var(--t3)">
            Total: <b style="color:var(--t1)">${fmtFull(pipeTotal)}</b> &nbsp;·&nbsp;
            Weighted: <b style="color:var(--t1)">${fmtFull(data.pipeline.weighted)}</b>
          </div>
        </div>
      </div>

      <div class="perf-row">
        <div class="perf-card">
          <div class="perf-card-title">Stalled Deals <span style="color:var(--t3);font-weight:400;font-size:10px">(no activity 14+ days)</span></div>
          <div class="action-list">${actionItems(data.stalled,'#F59E0B',d=>`Stalled ${d.days_stalled}d`)}</div>
        </div>
        <div class="perf-card">
          <div class="perf-card-title">At-Risk <span style="color:var(--t3);font-weight:400;font-size:10px">(past expected close)</span></div>
          <div class="action-list">${actionItems(data.at_risk,'#EF4444',d=>`${d.days_overdue}d overdue`)}</div>
        </div>
      </div>

      <div class="perf-row">
        <div class="perf-card">
          <div class="perf-card-title">Closing Soon — Needs Attention <span style="color:var(--t3);font-weight:400;font-size:10px">(≤14d, idle 7d+)</span></div>
          <div class="action-list">${actionItems(data.closing_soon,'#0F766E',d=>`Closes in ${d.days_to_close}d`)}</div>
        </div>
        <div class="perf-card">
          <div class="perf-card-title">Overdue Tasks</div>
          <div class="action-list">${overdueTaskItems(data.overdue_tasks)}</div>
        </div>
      </div>

      <div class="perf-card" style="margin-bottom:20px">
        <div class="perf-card-title">Revenue Trend — Last 6 Months</div>
        <div class="perf-chart-wrap"><canvas id="perf-trend-chart"></canvas></div>
      </div>
    </div>`;

  // Trend chart
  if(perfTrendChart){ perfTrendChart.destroy(); perfTrendChart=null; }
  const trendData = data.trend||[];
  const labels = trendData.map(r=>r.month);
  const vals   = trendData.map(r=>Number(r.revenue));
  const ctx = document.getElementById('perf-trend-chart');
  if(ctx){
    perfTrendChart = new Chart(ctx, {
      type:'bar',
      data:{
        labels,
        datasets:[{
          label:'Revenue Closed',
          data:vals,
          backgroundColor:'rgba(15,118,110,.25)',
          borderColor:'#0F766E',
          borderWidth:2,
          borderRadius:5,
        }]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false}},
        scales:{
          y:{ticks:{callback:v=>'₱'+pfmt(v)},grid:{color:'rgba(0,0,0,.05)'}},
          x:{grid:{display:false}}
        }
      }
    });
  }
};

function setPerfPeriod(ps, pe, type, label){
  perfState = {ps, pe, type, label};
  navigate('performance');
}
window.setPerfPeriod = setPerfPeriod;

// ── Team Performance ──────────────────────────────────────────────────────────
VIEWS.team = async () => {
  if(!['admin','manager'].includes(state.user?.role)){ el('view').innerHTML='<div class="empty-state">Access denied.</div>'; return; }
  const p = teamPerfState || currentMonthPeriod();
  let data;
  try { data = await api.get(`/api/performance/team?period_start=${p.ps}&period_end=${p.pe}&period_type=${p.type}`); }
  catch(e){ el('view').innerHTML=`<div class="empty-state">Failed to load team data.</div>`; return; }

  const tabs = [currentMonthPeriod(),lastMonthPeriod(),currentQtrPeriod(),lastQtrPeriod()];
  function tabHtml(){ return tabs.map(t=>`<button class="ppt-tab ${t.ps===p.ps&&t.type===p.type?'active':''}" onclick="setTeamPeriod('${t.ps}','${t.pe}','${t.type}','${t.label}')">${t.label}</button>`).join(''); }

  const sorted = [...data.team].sort((a,b)=>(b.attainment_pct||0)-(a.attainment_pct||0));

  const rows = sorted.map((u,i)=>{
    const pct = u.attainment_pct;
    const cls = pct==null?'attain-none-cell':pct>=100?'attain-high-cell':pct>=70?'attain-mid-cell':'attain-low-cell';
    const initials = u.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    const quotaBtn = state.user?.role==='admin'||state.user?.role==='manager'
      ? `<button class="quota-btn" onclick="openQuotaModal(${u.id},'${p.ps}','${p.pe}','${p.type}')">Set Target</button>` : '';
    return `<tr>
      <td style="width:32px;font-weight:700;color:var(--t3)">${i+1}</td>
      <td><div class="rep-cell"><div class="team-avatar" style="background:${u.color||'#0F766E'}">${initials}</div>${u.name}</div></td>
      <td class="${cls}"><span class="attain-chip ${cls}">${pct!=null?pct+'%':'—'}</span></td>
      <td>₱${Number(u.revenue_closed).toLocaleString()}<br><span style="font-size:11px;color:var(--t3)">of ₱${Number(u.revenue_target).toLocaleString()}</span></td>
      <td style="color:${u.revenue_gap>0?'#EF4444':'#22C55E'}">₱${Number(u.revenue_gap).toLocaleString()}</td>
      <td>${u.deals_won}${u.deals_target?` / ${u.deals_target}`:''}</td>
      <td>${u.win_rate!=null?u.win_rate+'%':'—'}</td>
      <td>₱${pfmt(u.pipeline_total)}<br><span style="font-size:11px;color:var(--t3)">₱${pfmt(u.pipeline_wtd)} wtd</span></td>
      <td>${u.calls}<span style="color:var(--t3)">/${u.calls_target}</span></td>
      <td>${u.meetings}<span style="color:var(--t3)">/${u.meetings_target}</span></td>
      <td>${u.proposals}<span style="color:var(--t3)">/${u.emails_target}</span></td>
      <td>${quotaBtn}</td>
    </tr>`;
  }).join('');

  const teamTotRev = data.team.reduce((s,u)=>s+u.revenue_closed,0);
  const teamPipe   = data.team.reduce((s,u)=>s+u.pipeline_total,0);

  el('view').innerHTML = `
    <div class="view-body">
      <div class="perf-header">
        <div style="display:flex;gap:16px;font-size:13px">
          <span>Team Revenue: <b>₱${Number(teamTotRev).toLocaleString()}</b></span>
          <span>Pipeline: <b>₱${pfmt(teamPipe)}</b></span>
          <span>Reps: <b>${data.team.length}</b></span>
        </div>
        <div class="perf-period-tabs">${tabHtml()}</div>
      </div>
      <div class="perf-card">
        <div style="overflow-x:auto">
          <table class="team-table">
            <thead><tr>
              <th>#</th><th>Rep</th><th>Attainment</th><th>Revenue</th><th>Gap</th>
              <th>Deals</th><th>Win Rate</th><th>Pipeline</th>
              <th>Calls</th><th>Meetings</th><th>Proposals</th><th></th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
};

function setTeamPeriod(ps, pe, type, label){
  teamPerfState = {ps, pe, type, label};
  navigate('team');
}
window.setTeamPeriod = setTeamPeriod;

// ── Quota Modal ───────────────────────────────────────────────────────────────
function dateStr(v){ if(!v) return ''; if(v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`; return String(v).slice(0,10); }

async function openQuotaModal(userId, periodStart, periodEnd, periodType='monthly'){
  userId = Number(userId);
  let users=[], existing=null;
  try{
    users = await api.get('/api/users');
    const quotas = await api.get('/api/performance/quotas');
    existing = quotas.find(q=>Number(q.user_id)===userId && dateStr(q.period_start)===periodStart && q.period_type===periodType);
  }catch(e){}
  const user = users.find(u=>u.id===userId)||{};
  showModal(`Set Target — ${user.name||'User'}`, `
    <input type="hidden" id="qm-uid" value="${userId}">
    <input type="hidden" id="qm-ps" value="${periodStart}">
    <input type="hidden" id="qm-pe" value="${periodEnd}">
    <input type="hidden" id="qm-type" value="${periodType}">
    <div class="fg"><label class="flbl">Period</label>
      <input class="finp" value="${periodStart} → ${periodEnd} (${periodType})" disabled></div>
    <div class="two-col">
      <div class="fg"><label class="flbl">Revenue Target (₱)</label>
        <input class="finp" id="qm-rev" type="number" placeholder="0" value="${existing?.revenue_target||''}"></div>
      <div class="fg"><label class="flbl">Deals Target</label>
        <input class="finp" id="qm-deals" type="number" placeholder="0" value="${existing?.deals_target||''}"></div>
    </div>
    <div class="two-col">
      <div class="fg"><label class="flbl">Calls Target</label>
        <input class="finp" id="qm-calls" type="number" placeholder="0" value="${existing?.calls_target||''}"></div>
      <div class="fg"><label class="flbl">Meetings Target</label>
        <input class="finp" id="qm-meetings" type="number" placeholder="0" value="${existing?.meetings_target||''}"></div>
    </div>
    <div class="fg"><label class="flbl">Proposals Target</label>
      <input class="finp" id="qm-emails" type="number" placeholder="0" value="${existing?.emails_target||''}"></div>
  `, `<div class="modal-ft-right">
    <button class="btn btn-g" onclick="closeModal()">Cancel</button>
    <button class="btn btn-p" onclick="saveQuota()">Save Target</button>
  </div>`);
}
window.openQuotaModal = openQuotaModal;

async function saveQuota(){
  const body = {
    user_id:         Number(gv('qm-uid')),
    period_start:    gv('qm-ps'),
    period_end:      gv('qm-pe'),
    period_type:     gv('qm-type'),
    revenue_target:  Number(gv('qm-rev'))||0,
    deals_target:    Number(gv('qm-deals'))||0,
    calls_target:    Number(gv('qm-calls'))||0,
    meetings_target: Number(gv('qm-meetings'))||0,
    emails_target:   Number(gv('qm-emails'))||0,
  };
  try{
    await api.post('/api/performance/quotas', body);
    toast('Target saved');
    closeModal();
    navigate('team');
  }catch(e){ toast(e.message,'err'); }
}
window.saveQuota = saveQuota;

// ── Target Dashboard ──────────────────────────────────────────────────────────
VIEW_TITLES.targets = 'Target Dashboard';

let _tgtYear = new Date().getFullYear();
let _tgtData  = null;

VIEWS.targets = async () => {
  if (!['admin','manager'].includes(state.user?.role)) { navigate('dashboard'); return; }
  const v = document.getElementById('view');

  // Year selector in topbar
  const yearOpts = [-1,0,1].map(d => {
    const y = new Date().getFullYear() + d;
    return `<option value="${y}" ${y===_tgtYear?'selected':''}>${y}</option>`;
  }).join('');
  document.getElementById('tb-actions').innerHTML =
    `<select class="flt" onchange="tgtSetYear(this.value)">${yearOpts}</select>`;

  v.innerHTML = `<div style="text-align:center;padding:40px;color:var(--t3)">Loading…</div>`;
  const data = await api.get(`/api/reports/targets?year=${_tgtYear}`);
  if (!data) return;
  _tgtData = data;

  const { team, reps, months } = data;
  const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mLabel = m => MONTH_LABELS[parseInt(m.split('-')[1])-1] + ' ' + m.split('-')[0].slice(2);

  // Totals for KPI cards
  const tot = {
    calls_a:   team.reduce((s,m)=>s+m.calls,0),
    calls_t:   team.reduce((s,m)=>s+m.calls,0) , // will recalc below
    meet_a:    team.reduce((s,m)=>s+m.meetings,0),
    meet_t:    0,
    email_a:   team.reduce((s,m)=>s+m.emails,0),
    email_t:   0,
    conv_a:    team.reduce((s,m)=>s+m.conversions,0),
    conv_t:    0,
    emp_a:     team.reduce((s,m)=>s+m.employees,0),
  };
  // sum targets from reps (quotas)
  reps.forEach(rep => rep.months.forEach(m => {
    tot.calls_t += m.calls_t;
    tot.meet_t  += m.meetings_t;
    tot.email_t += m.emails_t;
    tot.conv_t  += m.conversions_t;
  }));
  // recalc calls_a properly
  tot.calls_a = team.reduce((s,m)=>s+m.calls,0);

  const ach = (a,t) => t>0 ? Math.round(a/t*100) : null;
  const achColor = p => p==null?'var(--t3)':p>=100?'#16A34A':p>=70?'#D97706':'#DC2626';
  const achBg    = p => p==null?'var(--s2)':p>=100?'rgba(22,163,74,.1)':p>=70?'rgba(217,119,6,.1)':'rgba(220,38,38,.08)';

  // Heatmap cell color for activity counts (0=grey, low=yellow, mid=blue, high=green)
  function heatCell(val, target) {
    if (!target) return val > 0 ? 'rgba(59,130,246,.15)' : 'transparent';
    const pct = val / target;
    if (pct === 0) return 'transparent';
    if (pct < 0.5)  return 'rgba(239,68,68,.15)';
    if (pct < 0.8)  return 'rgba(245,158,11,.15)';
    if (pct < 1.0)  return 'rgba(59,130,246,.18)';
    return 'rgba(22,163,74,.18)';
  }
  function heatText(val, target) {
    if (!target) return val > 0 ? '#3B82F6' : 'var(--t3)';
    const pct = val / target;
    if (pct === 0) return 'var(--t3)';
    if (pct < 0.5)  return '#DC2626';
    if (pct < 0.8)  return '#D97706';
    if (pct < 1.0)  return '#2563EB';
    return '#16A34A';
  }

  // KPI cards
  const kpiCard = (label, actual, target, icon) => {
    const p = ach(actual, target);
    return `<div class="tgt-kpi">
      <div class="tgt-kpi-icon">${icon}</div>
      <div class="tgt-kpi-body">
        <div class="tgt-kpi-lbl">${label}</div>
        <div class="tgt-kpi-val">${actual.toLocaleString()}<span class="tgt-kpi-of"> / ${target>0?target.toLocaleString():'—'}</span></div>
        ${target>0?`<div class="tgt-prog-track"><div class="tgt-prog-fill" style="width:${Math.min(p,100)}%;background:${achColor(p)}"></div></div>
        <div class="tgt-kpi-pct" style="color:${achColor(p)}">${p}% of target</div>`:'<div class="tgt-kpi-pct" style="color:var(--t3)">No target set</div>'}
      </div>
    </div>`;
  };

  // Team monthly table
  const teamTable = `
    <div class="section" style="margin-top:20px">
      <div class="section-hd"><span class="section-title">Team Monthly Tracker</span>
        <span style="font-size:11.5px;color:var(--t3)">Actual vs Target · color = achievement</span>
      </div>
      <div style="overflow-x:auto">
        <table class="tgt-table">
          <thead>
            <tr>
              <th class="tgt-th-sticky">Month</th>
              <th colspan="2">Calls</th>
              <th colspan="2">Meetings</th>
              <th colspan="2">Proposals</th>
              <th colspan="2">Deals Won</th>
              <th>Employees</th>
              <th>Attainment</th>
            </tr>
            <tr class="tgt-sub-hd">
              <th class="tgt-th-sticky"></th>
              <th>Act</th><th>Tgt</th>
              <th>Act</th><th>Tgt</th>
              <th>Act</th><th>Tgt</th>
              <th>Act</th><th>Tgt</th>
              <th>Emp</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            ${team.map(m => {
              // targets from rep quotas summed
              const tCalls = reps.reduce((s,r)=>{ const rm=r.months.find(x=>x.month===m.month); return s+(rm?.calls_t||0); },0);
              const tMeet  = reps.reduce((s,r)=>{ const rm=r.months.find(x=>x.month===m.month); return s+(rm?.meetings_t||0); },0);
              const tEmail = reps.reduce((s,r)=>{ const rm=r.months.find(x=>x.month===m.month); return s+(rm?.emails_t||0); },0);
              const tConv  = reps.reduce((s,r)=>{ const rm=r.months.find(x=>x.month===m.month); return s+(rm?.conversions_t||0); },0);
              const overallPct = ach(m.calls+m.meetings, tCalls+tMeet);
              const isFuture = m.month > new Date().toISOString().slice(0,7);
              return `<tr class="${isFuture?'tgt-future':''}">
                <td class="tgt-th-sticky tgt-month">${mLabel(m.month)}</td>
                <td style="background:${heatCell(m.calls,tCalls)};color:${heatText(m.calls,tCalls)}" class="tgt-num">${m.calls||'—'}</td>
                <td class="tgt-num tgt-t">${tCalls||'—'}</td>
                <td style="background:${heatCell(m.meetings,tMeet)};color:${heatText(m.meetings,tMeet)}" class="tgt-num">${m.meetings||'—'}</td>
                <td class="tgt-num tgt-t">${tMeet||'—'}</td>
                <td style="background:${heatCell(m.emails,tEmail)};color:${heatText(m.emails,tEmail)}" class="tgt-num">${m.emails||'—'}</td>
                <td class="tgt-num tgt-t">${tEmail||'—'}</td>
                <td style="background:${heatCell(m.conversions,tConv)};color:${heatText(m.conversions,tConv)}" class="tgt-num">${m.conversions||'—'}</td>
                <td class="tgt-num tgt-t">${tConv||'—'}</td>
                <td class="tgt-num">${m.employees>0?m.employees.toLocaleString():'—'}</td>
                <td class="tgt-num" style="font-weight:700;color:${achColor(overallPct)}">${overallPct!=null?overallPct+'%':'—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr class="tgt-total-row">
              <td class="tgt-th-sticky">YTD Total</td>
              <td class="tgt-num">${tot.calls_a.toLocaleString()}</td><td class="tgt-num tgt-t">${tot.calls_t.toLocaleString()}</td>
              <td class="tgt-num">${tot.meet_a.toLocaleString()}</td><td class="tgt-num tgt-t">${tot.meet_t.toLocaleString()}</td>
              <td class="tgt-num">${tot.email_a.toLocaleString()}</td><td class="tgt-num tgt-t">${tot.email_t.toLocaleString()}</td>
              <td class="tgt-num">${tot.conv_a.toLocaleString()}</td><td class="tgt-num tgt-t">${tot.conv_t.toLocaleString()}</td>
              <td class="tgt-num">${tot.emp_a.toLocaleString()}</td>
              <td class="tgt-num" style="font-weight:800;color:${achColor(ach(tot.calls_a+tot.meet_a,tot.calls_t+tot.meet_t))}">${ach(tot.calls_a+tot.meet_a,tot.calls_t+tot.meet_t)??'—'}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;

  // Per-rep scorecard grid
  const repCards = reps.map(rep => {
    const totCalls = rep.months.reduce((s,m)=>s+m.calls,0);
    const totMeet  = rep.months.reduce((s,m)=>s+m.meetings,0);
    const totEmail = rep.months.reduce((s,m)=>s+m.emails,0);
    const totConv  = rep.months.reduce((s,m)=>s+m.conversions,0);
    const totEmp   = rep.months.reduce((s,m)=>s+m.employees,0);
    const tCalls   = rep.months.reduce((s,m)=>s+m.calls_t,0);
    const tMeet    = rep.months.reduce((s,m)=>s+m.meetings_t,0);
    const tEmail   = rep.months.reduce((s,m)=>s+m.emails_t,0);
    const tConv    = rep.months.reduce((s,m)=>s+m.conversions_t,0);
    const pCalls   = ach(totCalls,tCalls);
    const pMeet    = ach(totMeet,tMeet);
    const pConv    = ach(totConv,tConv);
    const overall  = ach(totCalls+totMeet+totEmail, tCalls+tMeet+tEmail);

    // Monthly heatmap strip for calls
    const heatStrip = rep.months.map(m => {
      const p = m.calls_t>0 ? m.calls/m.calls_t : (m.calls>0?1:0);
      const bg = p===0?'var(--s3)':p<0.5?'#FCA5A5':p<0.8?'#FCD34D':p<1?'#93C5FD':'#86EFAC';
      const isFut = m.month > new Date().toISOString().slice(0,7);
      return `<div class="tgt-heat-cell" style="background:${isFut?'var(--s2)':bg}" title="${mLabel(m.month)}: ${m.calls} calls"></div>`;
    }).join('');

    return `<div class="tgt-rep-card">
      <div class="tgt-rep-hd">
        ${av(rep.name, rep.color)}
        <div>
          <div class="tgt-rep-name">${esc(rep.name)}</div>
          <div class="tgt-rep-ach" style="color:${achColor(overall)}">${overall!=null?overall+'% overall attainment':'No targets set'}</div>
        </div>
      </div>
      <div class="tgt-heat-strip">${heatStrip}</div>
      <div class="tgt-rep-metrics">
        <div class="tgt-rm">
          <div class="tgt-rm-lbl">Calls</div>
          <div class="tgt-rm-val" style="color:${achColor(pCalls)}">${totCalls.toLocaleString()}</div>
          <div class="tgt-rm-tgt">${tCalls>0?'/ '+tCalls.toLocaleString():''}</div>
        </div>
        <div class="tgt-rm">
          <div class="tgt-rm-lbl">Meetings</div>
          <div class="tgt-rm-val" style="color:${achColor(pMeet)}">${totMeet.toLocaleString()}</div>
          <div class="tgt-rm-tgt">${tMeet>0?'/ '+tMeet.toLocaleString():''}</div>
        </div>
        <div class="tgt-rm">
          <div class="tgt-rm-lbl">Proposals</div>
          <div class="tgt-rm-val">${totEmail.toLocaleString()}</div>
          <div class="tgt-rm-tgt">${tEmail>0?'/ '+tEmail.toLocaleString():''}</div>
        </div>
        <div class="tgt-rm">
          <div class="tgt-rm-lbl">Deals Won</div>
          <div class="tgt-rm-val" style="color:${achColor(pConv)}">${totConv.toLocaleString()}</div>
          <div class="tgt-rm-tgt">${tConv>0?'/ '+tConv.toLocaleString():''}</div>
        </div>
        <div class="tgt-rm">
          <div class="tgt-rm-lbl">Employees</div>
          <div class="tgt-rm-val">${totEmp>0?totEmp.toLocaleString():'—'}</div>
          <div class="tgt-rm-tgt"></div>
        </div>
      </div>
    </div>`;
  }).join('');

  v.innerHTML = `
    <div class="tgt-kpi-grid">
      ${kpiCard('Calls Made',    tot.calls_a, tot.calls_t, '📞')}
      ${kpiCard('Meetings Held', tot.meet_a,  tot.meet_t,  '🤝')}
      ${kpiCard('Proposals Sent', tot.email_a, tot.email_t, '📄')}
      ${kpiCard('Deals Won',     tot.conv_a,  tot.conv_t,  '🏆')}
    </div>
    ${teamTable}
    <div class="section" style="margin-top:20px">
      <div class="section-hd">
        <span class="section-title">Rep Scorecards</span>
        <span style="font-size:11.5px;color:var(--t3)">YTD · heat strip = monthly calls</span>
      </div>
      <div class="tgt-rep-grid">${repCards}</div>
    </div>`;
};

window.tgtSetYear = function(y) { _tgtYear = parseInt(y); navigate('targets'); };
window.tgtSetYear = window.tgtSetYear;

init();
