/* ============================================================
   Morning Shift Report — app.js
   Infozillion Teletech Bd Ltd · Service Assurance
   ============================================================ */

'use strict';

const OPERATORS = ['GP', 'RB', 'TT', 'BL'];
const HTTP_CODES = ['500', '501', '502', '503', '504'];
const DLR_CODES = [
  { code: '1000', label: '1000 Success' },
  { code: '1020', label: '1020 Internal Server Error' },
  { code: '1052', label: '1052 Submission record not found' }
];
const LS_DRAFT   = 'msr_draft_v2';
const LS_HISTORY = 'msr_history_v2';
const LS_THEME   = 'msr_theme';

const togState = {};
let autoSaveTimer = null;

/* ── DOM Ready ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initDate();
  initToggles();
  buildHttp5xxSources();
  initDlr();
  initTraffic();
  renderHistory();
  loadDraft();
  initCollapse();
  document.body.addEventListener('input', scheduleAutoSave);
  document.body.addEventListener('change', scheduleAutoSave);
});

/* ── Theme ──────────────────────────────────────────────── */
function initTheme() {
  applyTheme(localStorage.getItem(LS_THEME) || 'light');
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(LS_THEME, theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? 'Light' : 'Dark';
}
function toggleTheme() {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

/* ── Date ───────────────────────────────────────────────── */
function initDate() {
  const el = document.getElementById('rep-date');
  if (el && !el.value) el.value = new Date().toISOString().slice(0, 10);
}

/* ── Collapse ───────────────────────────────────────────── */
function initCollapse() {
  document.querySelectorAll('.card-header[data-collapse]').forEach(header => {
    header.addEventListener('click', () => header.closest('.card').classList.toggle('collapsed'));
  });
}

/* ── Toggles ────────────────────────────────────────────── */
function initToggles() {
  setTog('mno',   'ok');
  setTog('iptsp', 'ok');
  setTog('issue', 'ok');
}

function setTog(key, val) {
  togState[key] = val;
  const okBtn    = document.getElementById(`tog-${key}-ok`);
  const issueBtn = document.getElementById(`tog-${key}-issue`);
  if (okBtn)    okBtn.className    = 'tog' + (val === 'ok'    ? ' ok'    : '');
  if (issueBtn) issueBtn.className = 'tog' + (val === 'issue' ? ' issue' : '');

  if (key === 'mno' || key === 'iptsp') {
    const okDet    = document.getElementById(`det-${key}-ok`);
    const issueDet = document.getElementById(`det-${key}-issue`);
    if (okDet)    okDet.style.display    = val === 'ok'    ? 'block' : 'none';
    if (issueDet) issueDet.style.display = val === 'issue' ? 'block' : 'none';
  }
  if (key === 'issue') {
    const det = document.getElementById('det-issue');
    if (det) det.style.display = val === 'issue' ? 'block' : 'none';
  }
  scheduleAutoSave();
}

/* ── 4xx/5xx HTTP Source Grid (500-504, per operator) ──── */
function buildHttp5xxSources() {
  const sl = document.getElementById('http5xx-source-list');
  if (!sl) return;
  OPERATORS.forEach(op => {
    const block = document.createElement('div');
    block.className = 'src-block';
    block.id = `src5xx-${op}`;
    const codesHtml = HTTP_CODES.map(c => `
      <div class="code-item">
        <label>${c}</label>
        <input type="number" class="h5xx-code" data-op="${op}" data-code="${c}" id="hc5xx-${op}-${c}"
          placeholder="0" min="0" oninput="updateHttp5xxTotal('${op}');scheduleAutoSave()">
      </div>`).join('');
    block.innerHTML = `
      <div class="src-header" onclick="toggleHttp5xxSrc('${op}')">
        <span class="src-name">${op}</span>
        <span class="src-total">
          <span id="htotal5xx-${op}">—</span>
          <span class="src-arrow">▼</span>
        </span>
      </div>
      <div class="src-codes"><div class="codes-grid">${codesHtml}</div></div>`;
    sl.appendChild(block);
  });
}

function toggleHttp5xxSrc(op) {
  document.getElementById(`src5xx-${op}`)?.classList.toggle('open');
}

function getHttp5xxVal(op, code) {
  const v = parseInt(document.getElementById(`hc5xx-${op}-${code}`)?.value);
  return isNaN(v) ? 0 : v;
}

function updateHttp5xxTotal(op) {
  const total = HTTP_CODES.reduce((sum, c) => sum + getHttp5xxVal(op, c), 0);
  const el = document.getElementById(`htotal5xx-${op}`);
  const block = document.getElementById(`src5xx-${op}`);
  if (!el || !block) return;
  if (total > 0) {
    el.textContent = `${total.toLocaleString()} hits`;
    block.classList.add('has-data');
  } else {
    el.textContent = '—';
    block.classList.remove('has-data');
  }
}

function updateAllHttp5xxTotals() { OPERATORS.forEach(updateHttp5xxTotal); }

/* CSV → operator matching (reuses MNO_TO_OP defined later, fallback below) */
function matchOpFromAnsType(ansType) {
  const val = (ansType || '').toLowerCase();
  if (!val) return null;
  const tokens = val.split(/[-/_ ]/);
  const map = { gp: 'GP', grameenphone: 'GP', grameen: 'GP', rb: 'RB', robi: 'RB', tt: 'TT', teletalk: 'TT', bl: 'BL', banglalink: 'BL' };
  for (const t of tokens) {
    if (map[t]) return map[t];
  }
  // fallback: substring match, longest key first
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (val.includes(k)) return map[k];
  }
  return null;
}

function parseHttp5xxCsv(input) {
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('csv-http5xx-status');
  const zoneEl = document.getElementById('zone-http5xx');
  statusEl.textContent = `Reading ${file.name}…`;
  statusEl.className = 'upload-status';

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const lines = e.target.result.split('\n');
      const headers = splitCsvRow(lines[0]);
      const ansIdx = headers.findIndex(h => h.replace(/"/g,'').trim() === 'ans_type' || h.replace(/"/g,'').trim() === 'ansType');
      const evtIdx = headers.findIndex(h => h.toLowerCase().includes('event'));

      if (ansIdx < 0 || evtIdx < 0) {
        statusEl.textContent = `⚠ Columns not found (need ans_type, event.original). Headers: ${headers.slice(0,5).map(h=>h.replace(/"/g,'')).join(', ')}`;
        statusEl.className = 'upload-status error';
        return;
      }

      const counts = {};
      OPERATORS.forEach(op => { counts[op] = {}; });
      let matched = 0;

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols = splitCsvRow(lines[i]);
        const op = matchOpFromAnsType(cols[ansIdx]);
        if (!op) continue;
        const evt = (cols[evtIdx] || '').replace(/"/g,'');
        const parts = evt.split(' ');
        let code = null;
        for (let j = 0; j < parts.length; j++) {
          if (parts[j].startsWith('HTTP/') && j + 1 < parts.length) {
            const c = parts[j + 1];
            if (c && c.length === 3 && !isNaN(c)) { code = c; break; }
          }
        }
        if (!code || !HTTP_CODES.includes(code)) continue;
        counts[op][code] = (counts[op][code] || 0) + 1;
        matched++;
      }

      OPERATORS.forEach(op => {
        HTTP_CODES.forEach(c => {
          const el = document.getElementById(`hc5xx-${op}-${c}`);
          if (el) { const v = counts[op][c] || 0; el.value = v > 0 ? v : ''; }
        });
        updateHttp5xxTotal(op);
      });

      statusEl.textContent = `✓ ${matched.toLocaleString()} matching rows — operators auto-filled`;
      statusEl.className = 'upload-status';
      zoneEl.classList.add('loaded');
      showToast('HTTP 5xx CSV loaded & filled');
      scheduleAutoSave();
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.className = 'upload-status error';
    }
  };
  reader.onerror = () => { statusEl.textContent = 'File read error'; statusEl.className = 'upload-status error'; };
  reader.readAsText(file);
}


/* ── DLR ────────────────────────────────────────────────── */
function initDlr() {
  const dn = new Date();
  const d1 = new Date(dn); d1.setDate(dn.getDate() - 2);
  const d2 = new Date(dn); d2.setDate(dn.getDate() - 1);
  addDlrDate(d1.toISOString().slice(0, 10));
  addDlrDate(d2.toISOString().slice(0, 10));
}

function addDlrDate(dateVal = '', vals = {}) {
  const container = document.getElementById('dlr-dates');
  const id = 'dlr_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  const block = document.createElement('div');
  block.className = 'dlr-date-block';
  block.id = id;
  const rowsHtml = DLR_CODES.map(c => `
    <div class="dlr-row">
      <div class="dlr-code">${c.label}</div>
      <input type="number" class="dlr-val" data-code="${c.code}"
        placeholder="0" min="0" value="${vals[c.code] || ''}" oninput="scheduleAutoSave()">
    </div>`).join('');
  block.innerHTML = `
    <div class="dlr-block-header">
      <input type="date" class="dlr-date" value="${dateVal}" style="width:160px;" onchange="scheduleAutoSave()">
      <button class="btn-icon" onclick="document.getElementById('${id}').remove();scheduleAutoSave()">× Remove</button>
    </div>
    ${rowsHtml}`;
  container.appendChild(block);
}

/* ── Traffic ────────────────────────────────────────────── */
function initTraffic() {
  const today = new Date();
  for (let i = 6; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    addTrafficRow(d.toISOString().slice(0, 10), '');
  }
}

function fmtNum(n) { return (parseInt(n) || 0).toLocaleString(); }

function recalcAll() {
  const rows = document.querySelectorAll('#traffic-list .tr-row');
  rows.forEach((row, i) => {
    const cur   = parseInt(row.querySelector('.tr-vol')?.value) || 0;
    const badge = row.querySelector('.pct-badge');
    if (!badge) return;
    if (i === 0) { badge.textContent = '—'; badge.className = 'pct-badge pct-neu'; row.dataset.pct = '—'; return; }
    const prev = parseInt(rows[i - 1].querySelector('.tr-vol')?.value) || 0;
    if (prev === 0) { badge.textContent = '—'; badge.className = 'pct-badge pct-neu'; row.dataset.pct = '—'; return; }
    const pct  = (cur - prev) / prev * 100;
    const sign = pct >= 0 ? '+' : '';
    const txt  = `${sign}${pct.toFixed(2)}%`;
    badge.textContent = txt;
    badge.className   = 'pct-badge ' + (pct > 0 ? 'pct-up' : pct < 0 ? 'pct-dn' : 'pct-neu');
    row.dataset.pct   = txt;
  });
  scheduleAutoSave();
}

function addTrafficRow(date = '', vol = '') {
  const list = document.getElementById('traffic-list');
  const row  = document.createElement('div');
  row.className = 'tr-row';
  row.innerHTML = `
    <div class="tr-col">
      <span class="tr-col-label">Date</span>
      <input type="date" class="tr-date" value="${date}" style="font-size:12px;padding:6px 8px;">
    </div>
    <div class="tr-col">
      <span class="tr-col-label">Volume</span>
      <input type="number" class="tr-vol" placeholder="0" value="${vol}" style="font-size:12px;padding:6px 8px;">
    </div>
    <div class="tr-col">
      <span class="tr-col-label">vs Prev Day</span>
      <span class="pct-badge pct-neu">—</span>
    </div>
    <button class="btn-icon" onclick="this.closest('.tr-row').remove();recalcAll()">×</button>`;
  row.querySelector('.tr-vol').addEventListener('input', recalcAll);
  row.querySelector('.tr-date').addEventListener('change', recalcAll);
  list.appendChild(row);
  recalcAll();
}

function trafficSummary() {
  const rows = document.querySelectorAll('#traffic-list .tr-row');
  if (!rows.length) return 'No data';
  const pct = rows[rows.length - 1].dataset.pct || '—';
  if (pct === '—') return 'No change data';
  const val = parseFloat(pct);
  return isNaN(val) ? pct : val > 0 ? `Increase: ${pct}` : val < 0 ? `Decrease: ${pct}` : `No Change: ${pct}`;
}

/* ── Todo ───────────────────────────────────────────────── */
function addTodo(val = '') {
  const list = document.getElementById('todo-list');
  const row  = document.createElement('div');
  row.className = 'todo-item';
  row.innerHTML = `
    <input type="text" class="todo-txt" placeholder="e.g. Guide Royal Green IPTSP through UAT" value="${val}" oninput="scheduleAutoSave()">
    <button class="btn-icon" onclick="this.closest('.todo-item').remove();scheduleAutoSave()">×</button>`;
  list.appendChild(row);
}

/* ── Date Format ────────────────────────────────────────── */
function fmtDateLabel(iso) {
  if (!iso) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [y, m, dd] = iso.split('-');
  return `${parseInt(dd)} ${months[parseInt(m) - 1]} ${y}`;
}

/* ── Auto-save ──────────────────────────────────────────── */
function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(saveDraft, 800);
}
function saveDraft() {
  try {
    localStorage.setItem(LS_DRAFT, JSON.stringify(collectFormData()));
    showSaveIndicator();
  } catch (e) {}
}
function showSaveIndicator() {
  const el = document.getElementById('save-indicator');
  if (!el) return;
  el.style.opacity = '1';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}
function loadDraft() {
  try {
    const raw = localStorage.getItem(LS_DRAFT);
    if (raw) restoreFormData(JSON.parse(raw));
  } catch (e) {}
}

function collectFormData() {
  const dlrBlocks = [];
  document.querySelectorAll('.dlr-date-block').forEach(block => {
    const dateVal = block.querySelector('.dlr-date')?.value || '';
    const vals = {};
    block.querySelectorAll('.dlr-val').forEach(inp => { vals[inp.dataset.code] = inp.value; });
    dlrBlocks.push({ dateVal, vals });
  });
  const trafficRows = [];
  document.querySelectorAll('#traffic-list .tr-row').forEach(row => {
    trafficRows.push({ date: row.querySelector('.tr-date')?.value || '', vol: row.querySelector('.tr-vol')?.value || '' });
  });
  const todos = [...document.querySelectorAll('.todo-txt')].map(i => i.value);
  const http5xx = {};
  OPERATORS.forEach(op => {
    http5xx[op] = {};
    HTTP_CODES.forEach(c => {
      http5xx[op][c] = document.getElementById(`hc5xx-${op}-${c}`)?.value || '';
    });
  });
  const netData = {};
  OPERATORS.forEach(op => {
    netData[op] = {
      times:  document.querySelector(`.net-times[data-op="${op}"]`)?.value || '',
      failed: document.getElementById(`net-failed-${op}`)?.textContent || '0'
    };
  });
  return {
    date: document.getElementById('rep-date')?.value || '',
    author: document.getElementById('rep-author')?.value || '',
    tog1xx:        togState['1xx']   || 'ok',   // kept for legacy
    togMno:        togState['mno']   || 'ok',
    togIptsp:      togState['iptsp'] || 'ok',
    togIssue:      togState['issue'] || 'ok',
    txtMnoOk:      document.getElementById('txt-mno-ok')?.value    || '',
    txtMnoIssue:   document.getElementById('txt-mno-issue')?.value || '',
    txtIptspOk:    document.getElementById('txt-iptsp-ok')?.value    || '',
    txtIptspIssue: document.getElementById('txt-iptsp-issue')?.value || '',
    txt5xxOverall: document.getElementById('txt-5xx-overall')?.value || '',
    http5xx, dlrBlocks,
    dlrOverall: document.getElementById('dlr-overall')?.value || '',
    netData,
    netOverall: document.getElementById('net-overall')?.value || '',
    chWa: document.getElementById('ch-wa')?.value || '',
    chPh: document.getElementById('ch-ph')?.value || '',
    chEm: document.getElementById('ch-em')?.value || '',
    chTk: document.getElementById('ch-tk')?.value || '',
    todos, trafficRows
  };
}

function restoreFormData(data) {
  const set = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
  set('rep-date', data.date);
  set('rep-author', data.author);
  set('txt-mno-ok',      data.txtMnoOk);
  set('txt-mno-issue',   data.txtMnoIssue);
  set('txt-iptsp-ok',    data.txtIptspOk);
  set('txt-iptsp-issue', data.txtIptspIssue);

  set('txt-5xx-overall', data.txt5xxOverall);
  set('dlr-overall', data.dlrOverall);
  set('net-overall', data.netOverall);
  set('ch-wa', data.chWa); set('ch-ph', data.chPh);
  set('ch-em', data.chEm); set('ch-tk', data.chTk);
  if (data.togMno)   setTog('mno',   data.togMno);
  if (data.togIptsp) setTog('iptsp', data.togIptsp);
  if (data.togIssue) setTog('issue', data.togIssue);
  OPERATORS.forEach(op => {
    if (data.http5xx?.[op]) {
      HTTP_CODES.forEach(c => {
        const el = document.getElementById(`hc5xx-${op}-${c}`);
        if (el) el.value = data.http5xx[op][c] || '';
      });
      updateHttp5xxTotal(op);
    }
    if (data.netData?.[op]) {
      const elT = document.querySelector(`.net-times[data-op="${op}"]`);
      const elF = document.getElementById(`net-failed-${op}`);
      if (elT) elT.value = data.netData[op].times || '';
      if (elF) elF.textContent = data.netData[op].failed || '0';
    }
  });
  if (data.dlrBlocks?.length) {
    document.getElementById('dlr-dates').innerHTML = '';
    data.dlrBlocks.forEach(b => addDlrDate(b.dateVal, b.vals));
  }
  if (data.trafficRows?.length) {
    document.getElementById('traffic-list').innerHTML = '';
    data.trafficRows.forEach(r => addTrafficRow(r.date, r.vol));
  }
  if (data.todos?.length) {
    document.getElementById('todo-list').innerHTML = '';
    data.todos.forEach(t => addTodo(t));
  }
}

/* ── History ────────────────────────────────────────────── */
function getHistory() {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY)) || []; } catch { return []; }
}
function saveToHistory(msg, date) {
  const hist = getHistory();
  hist.unshift({ id: Date.now(), date, time: new Date().toLocaleTimeString('en-BD', { hour: '2-digit', minute: '2-digit' }), preview: msg.slice(0, 80), msg });
  localStorage.setItem(LS_HISTORY, JSON.stringify(hist.slice(0, 30)));
  renderHistory();
}
function renderHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;
  const hist = getHistory();
  if (!hist.length) { list.innerHTML = '<div class="history-empty">No reports saved yet.<br>Generate a report to save it here.</div>'; return; }
  list.innerHTML = hist.map(entry => `
    <div class="history-item">
      <div class="history-item-date">${entry.date || '—'}</div>
      <div class="history-item-time">Saved at ${entry.time}</div>
      <div class="history-item-preview">${entry.preview}…</div>
      <div class="history-item-actions">
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px;" onclick="copyHistoryItem(${entry.id})">Copy</button>
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px;color:var(--red);" onclick="deleteHistoryItem(${entry.id})">Delete</button>
      </div>
    </div>`).join('');
}
function copyHistoryItem(id) {
  const entry = getHistory().find(e => e.id === id);
  if (entry) navigator.clipboard.writeText(entry.msg).then(() => showToast('Copied!'));
}
function deleteHistoryItem(id) {
  localStorage.setItem(LS_HISTORY, JSON.stringify(getHistory().filter(e => e.id !== id)));
  renderHistory();
}
function openHistory()  { document.getElementById('history-panel').classList.add('open'); document.getElementById('history-overlay').classList.add('open'); }
function closeHistory() { document.getElementById('history-panel').classList.remove('open'); document.getElementById('history-overlay').classList.remove('open'); }

/* ── Toast ──────────────────────────────────────────────── */
function showToast(msg, duration = 2500) {
  let toast = document.getElementById('app-toast');
  if (!toast) { toast = document.createElement('div'); toast.id = 'app-toast'; toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), duration);
}

/* ── Generate ───────────────────────────────────────────── */
function generateAndCopy() {
  const dateVal = document.getElementById('rep-date')?.value || '';
  const [y, m, d] = dateVal.split('-');
  const dateDisp = dateVal ? `${d}/${m}/${y}` : '—';
  const author   = document.getElementById('rep-author')?.value.trim() || '';

  // ── 1xx ──
  const txtMno   = togState['mno']   === 'issue'
    ? (document.getElementById('txt-mno-issue')?.value.trim()   || 'Issue — details pending')
    : (document.getElementById('txt-mno-ok')?.value.trim()      || 'Error observed minimal as usual.');
  const txtIptsp = togState['iptsp'] === 'issue'
    ? (document.getElementById('txt-iptsp-issue')?.value.trim() || 'Issue — details pending')
    : (document.getElementById('txt-iptsp-ok')?.value.trim()    || 'Error observed minimal as usual.');

  // ── 5xx ──
  const overall5xx = document.getElementById('txt-5xx-overall')?.value.trim() || '';
  let http5xxLines = '';
  OPERATORS.forEach(op => {
    const parts = [];
    HTTP_CODES.forEach(c => {
      const v = getHttp5xxVal(op, c);
      if (v > 0) parts.push(`${c}=${v}`);
    });
    const total = parts.reduce((sum, p) => sum + parseInt(p.split('=')[1]), 0);
    if (total === 0) return;
    http5xxLines += `* ${op}: ${total} (${parts.join(', ')})\n`;
  });

  // ── DLR ──
  let dlrLines = '';
  document.querySelectorAll('.dlr-date-block').forEach(block => {
    const dateIso = block.querySelector('.dlr-date')?.value;
    if (!dateIso) return;
    const vals = {};
    block.querySelectorAll('.dlr-val').forEach(inp => { vals[inp.dataset.code] = parseInt(inp.value) || 0; });
    if (Object.values(vals).every(v => v === 0)) return;
    dlrLines += `Date: ${fmtDateLabel(dateIso)}\n`;
    block.querySelectorAll('.dlr-val').forEach(inp => {
      const codeObj = DLR_CODES.find(c => c.code === inp.dataset.code);
      dlrLines += `* ${codeObj.label} = ${fmtNum(inp.value)}\n`;
    });
  });
  const dlrOverall = document.getElementById('dlr-overall')?.value.trim() || '';

  // ── Network ──
  let netLines = '';
  OPERATORS.forEach(op => {
    const t = parseInt(document.querySelector(`.net-times[data-op="${op}"]`)?.value) || 0;
    const e = parseInt(document.getElementById(`net-failed-${op}`)?.textContent)     || 0;
    netLines += `* ${op}: ${t} ${t === 1 ? 'time' : 'times'} | Errors: ${fmtNum(e)}\n`;
  });
  const netOverall = document.getElementById('net-overall')?.value.trim() || '';

  // ── Client Communication ──
  const wa = parseInt(document.getElementById('ch-wa')?.value) || 0;
  const ph = parseInt(document.getElementById('ch-ph')?.value) || 0;
  const em = parseInt(document.getElementById('ch-em')?.value) || 0;
  const tk = parseInt(document.getElementById('ch-tk')?.value) || 0;

  // ── Issues ──
  let issueLines = '';
  if (togState['issue'] === 'issue') {
    const todos = [...document.querySelectorAll('.todo-txt')].map(i => i.value.trim()).filter(Boolean);
    issueLines = todos.length ? `To-do:\n` + todos.map(t => `* ${t}`).join('\n') : 'Pending — details TBD';
  } else { issueLines = 'None.'; }

  // ── Traffic ──
  let trafficLines = '';
  document.querySelectorAll('#traffic-list .tr-row').forEach(row => {
    const rd = row.querySelector('.tr-date')?.value;
    const rv = row.querySelector('.tr-vol')?.value;
    const rp = row.dataset.pct || '—';
    if (rd && rv) trafficLines += `   ${rd} : ${fmtNum(rv)}  |  ${rp}\n`;
  });

  // ── Compose ──
  let msg = `*System Monitoring Overview Report*\nDate: ${dateDisp}\n`;
  if (author) msg += `Prepared By: ${author}\n`;
  msg += `${'─'.repeat(24)}\n`;
  msg += `*1. HTTP Status (1xx / 5xx)*\n1xx MNO: ${txtMno}\n1xx IPTSP: ${txtIptsp}\n5xx: ${overall5xx}\n${http5xxLines}\n`;
  msg += `*2. Delay / DLR*\n${dlrLines}*Overall status:* ${dlrOverall}\n\n`;
  msg += `*3. Network (P2P / NTTN)*\n${netLines}*Overall status:* ${netOverall}\n\n`;
  msg += `*4. Client Communication*\n* WhatsApp: ${wa}\n* Phone: ${ph}\n* Email: ${em}\n* Ticket: ${tk}\n\n`;
  msg += `*5. Major / Pending Issue*\n${issueLines}\n\n`;
  msg += `*6. Traffic Trend (vs Previous Day)*\n* ${trafficSummary()}\n${trafficLines}`;

  const previewSection = document.getElementById('preview-section');
  const previewBox     = document.getElementById('preview');
  previewBox.textContent = msg;
  previewSection.style.display = 'block';
  previewSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  navigator.clipboard.writeText(msg)
    .then(() => {
      showToast('Copied to clipboard!');
      const btn = document.getElementById('copy-btn');
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy WhatsApp Message'; }, 2500); }
      saveToHistory(msg, dateFull);
      saveDraft();
    })
    .catch(() => showToast('Clipboard error — copy manually from preview'));
}

/* ── Print ──────────────────────────────────────────────── */
function printReport() {
  const previewEl = document.getElementById('preview');
  if (!previewEl || !previewEl.textContent.trim()) { showToast('First generate the report, then print.'); return; }
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Morning Shift Report</title>
<style>body{font-family:'Courier New',monospace;font-size:13px;padding:32px;color:#000;max-width:700px;margin:0 auto;}pre{white-space:pre-wrap;line-height:1.8;}@media print{@page{margin:20mm;}}</style>
</head><body><pre>${previewEl.textContent.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
<script>window.onload=function(){window.print();}<\/script></body></html>`);
  win.document.close();
}

/* ── Clear Draft ────────────────────────────────────────── */
function clearDraft() {
  if (!confirm('Clear all form data and start fresh?')) return;
  localStorage.removeItem(LS_DRAFT);
  location.reload();
}

/* ═══════════════════════════════════════════════════════════
   CSV & SHEET AUTO-FILL
   ═══════════════════════════════════════════════════════════ */

/* ── CSV Helper: split one CSV row ─────────────────────── */
function splitCsvRow(line) {
  const result = [];
  let cur = '', inQ = false;
  for (const c of (line || '')) {
    if (c === '"') inQ = !inQ;
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += c;
  }
  result.push(cur);
  return result;
}

/* ── Status display helper ──────────────────────────────── */
const STATUS_TO_DROP_ZONE = {
  'csv-mno-status':   'drop-mno',
  'csv-iptsp-status': 'drop-iptsp',
  'csv-dlr-status':   'drop-dlr',
};
function setStatus(id, msg, type = 'ok') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `csv-status ${type}`;

  const zoneId = STATUS_TO_DROP_ZONE[id];
  if (zoneId) {
    const zone = document.getElementById(zoneId);
    if (!zone) return;
    const icon = zone.querySelector('.drop-zone-icon');
    const text = zone.querySelector('.drop-zone-text');
    if (type === 'ok') {
      zone.classList.add('uploaded');
      if (icon) icon.textContent = '✔';
      if (text) text.textContent = msg.length > 32 ? msg.substring(0, 32) + '…' : msg;
    } else if (type === 'error') {
      zone.classList.remove('uploaded');
      if (icon) icon.textContent = '⚠';
      if (text) text.textContent = 'Error — try again';
    } else {
      // info = loading state, reset to default
      if (icon) icon.textContent = '⬆';
      if (text) text.textContent = 'Loading…';
    }
  }
}

/* ── File reader helper ─────────────────────────────────── */
function readFile(input, callback) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => callback(e.target.result);
  reader.onerror = () => setStatus('csv-mno-status', 'File read error', 'error');
  reader.readAsText(file);
}

/* ── 1xx CSV parser (MNO + IPTSP separate) ─────────────── */
function parse1xxCsv(input, statusId, togKey, label) {
  const file = input.files[0];
  if (!file) return;
  setStatus(statusId, `Reading ${file.name}…`, 'info');

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const lines = e.target.result.split('\n');
      const headers = splitCsvRow(lines[0]);

      const codeIdx = headers.findIndex(h => h.replace(/"/g,'').trim() === 'ansResponseCode');
      const gwIdx   = headers.findIndex(h => h.replace(/"/g,'').trim() === 'applicableSmsGateway');
      const cidIdx  = headers.findIndex(h => h.replace(/"/g,'').trim() === 'clientId');

      if (codeIdx < 0 || gwIdx < 0) {
        setStatus(statusId, `Columns not found. Headers: ${headers.slice(0,5).map(h=>h.replace(/"/g,'')).join(', ')}`, 'error');
        return;
      }

      const groups = {}; // "clientId|||gateway|||code" → count
      let total = 0;

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols = splitCsvRow(lines[i]);
        const code = (cols[codeIdx] || '').replace(/"/g,'').trim();
        const gw   = (cols[gwIdx]   || '').replace(/"/g,'').trim();
        const cid  = cidIdx >= 0 ? (cols[cidIdx] || '').replace(/"/g,'').trim() : '';
        if (!code || code === 'null' || code === '-') continue;
        const n = parseInt(code);
        if (isNaN(n) || n < 1000 || n > 1099) continue;
        if (!gw || gw === 'null' || gw === '-') continue;
        const key = `${cid}|||${gw}|||${code}`;
        groups[key] = (groups[key] || 0) + 1;
        total++;
      }

      const isIssue = total >= 20000;
      let txt = '';
      if (!isIssue) {
        txt = 'Error observed minimal as usual.';
      } else {
        // Only clients with count >= 20000
        const overLimit = Object.entries(groups)
          .filter(([, cnt]) => cnt >= 20000)
          .sort((a, b) => b[1] - a[1]);
        txt = overLimit.map(([key, cnt]) => {
            const [cid, gw, code] = key.split('|||');
            return `${cid || 'Unknown'} receiving ${code} errors via ${gw} (${cnt.toLocaleString()})`;
          }).join('\n');
        if (!txt) txt = `Total: ${total.toLocaleString()} 1xx errors detected (multiple small sources).`;
      }

      // Fill separate MNO / IPTSP textareas
      setTog(togKey, isIssue ? 'issue' : 'ok');
      const okEl    = document.getElementById(`txt-${togKey}-ok`);
      const issueEl = document.getElementById(`txt-${togKey}-issue`);
      if (isIssue) { if (issueEl) issueEl.value = txt; }
      else         { if (okEl)    okEl.value    = txt; }

      setStatus(statusId, `${total.toLocaleString()} records — ${isIssue ? 'ISSUE' : 'Normal'}`, isIssue ? 'error' : 'ok');
      showToast(`${label}: ${isIssue ? 'Issue detected' : 'Normal'}`);
      scheduleAutoSave();
    } catch(err) {
      setStatus(statusId, 'Error: ' + err.message, 'error');
    }
  };
  reader.onerror = () => setStatus(statusId, 'File read error', 'error');
  reader.readAsText(file);
}

function parseMnoCsv(input)   { parse1xxCsv(input, 'csv-mno-status',  'mno',   'MNO 1xx');  }
function parseIptspCsv(input) { parse1xxCsv(input, 'csv-iptsp-status', 'iptsp', 'IPTSP 1xx'); }

/* ── DLR CSV parser ─────────────────────────────────────── */
function parseDlrCsv(input) {
  const file = input.files[0];
  if (!file) return;
  setStatus('csv-dlr-status', `Reading ${file.name}…`, 'info');

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const lines = e.target.result.split('\n');
      const headers = splitCsvRow(lines[0]);
      const bodyIdx = headers.findIndex(h => h.replace(/"/g,'').trim() === 'message_body');

      if (bodyIdx < 0) {
        setStatus('csv-dlr-status', `message_body column not found. Headers: ${headers.slice(0,4).map(h=>h.replace(/"/g,'')).join(', ')}`, 'error');
        return;
      }

      const codes = { '1000': 0, '1020': 0, '1052': 0 };
      let total = 0;

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols = splitCsvRow(lines[i]);
        const body = (cols[bodyIdx] || '').replace(/"/g,'');
        const m = body.match(/statusCode=(\d+)/);
        if (m && codes[m[1]] !== undefined) { codes[m[1]]++; total++; }
      }

      // Fill into LAST DLR date block
      const dlrBlocks = document.querySelectorAll('.dlr-date-block');
      if (dlrBlocks.length > 0) {
        const lastBlock = dlrBlocks[dlrBlocks.length - 1];
        Object.entries(codes).forEach(([code, count]) => {
          const inp = lastBlock.querySelector(`.dlr-val[data-code="${code}"]`);
          if (inp) inp.value = count;
        });
      }

      setStatus('csv-dlr-status',
        `${total.toLocaleString()} records → 1000: ${codes['1000'].toLocaleString()}, 1020: ${codes['1020']}, 1052: ${codes['1052'].toLocaleString()}`,
        'ok');
      showToast('DLR CSV loaded & filled');
      scheduleAutoSave();
    } catch(err) {
      setStatus('csv-dlr-status', 'Error: ' + err.message, 'error');
    }
  };
  reader.onerror = () => setStatus('csv-dlr-status', 'File read error', 'error');
  reader.readAsText(file);
}

/* ── Traffic: Google Sheet Fetch ────────────────────────── */
const PUBLISHED_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRB1vqT5gyRdaEOGzydaUnpY18NzveOLvu2htToZL4zTOPiG_1PMpbHzAoUostJODs2-oB064InlxG3/pub?output=csv';

async function fetchTrafficFromSheet() {
  const btn = document.getElementById('fetch-traffic-btn');
  btn.textContent = 'Fetching…';
  btn.disabled = true;
  setStatus('fetch-traffic-status', 'Connecting…', 'info');

  // Try direct first, then CORS proxies
  const attempts = [
    PUBLISHED_CSV_URL,
    `https://corsproxy.io/?${encodeURIComponent(PUBLISHED_CSV_URL)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(PUBLISHED_CSV_URL)}`,
  ];

  let lastErr = '';
  for (const url of attempts) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text || text.length < 20) throw new Error('Empty response');
      // Validate it looks like CSV (first cell should be "Date" or similar)
      if (text.trim().startsWith('<!') || text.trim().startsWith('{')) throw new Error('Not CSV');
      parseTrafficCsv(text);
      document.getElementById('traffic-csv-fallback').style.display = 'none';
      btn.textContent = 'Fetch from Google Sheet';
      btn.disabled = false;
      return;
    } catch(e) { lastErr = e.message; }
  }

  setStatus('fetch-traffic-status', `Failed: ${lastErr} — CSV upload করুন নিচে।`, 'error');
  document.getElementById('traffic-csv-fallback').style.display = 'block';
  btn.textContent = 'Fetch from Google Sheet';
  btn.disabled = false;
}

/* ── Network: Google Sheet Fetch ────────────────────────── */
const NETWORK_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT6aD89oOCp2V8v1TbDaeh1RLEq2azL1641GWWYtQtdNlVd-LC7hjG_0vJiv-iv1DRy5t3hmxA2V7Vf/pub?gid=615904792&single=true&output=csv';

// MNO name → Operator code
const MNO_TO_OP = {
  grameenphone: 'GP', grameen: 'GP',
  banglalink: 'BL',
  robi: 'RB',
  teletalk: 'TT'
};
function mnoToOp(name) {
  if (!name) return null;
  const k = name.toLowerCase().replace(/[^a-z]/g, '');
  for (const [key, val] of Object.entries(MNO_TO_OP)) {
    if (k.includes(key)) return val;
  }
  return null;
}

async function fetchNetworkFromSheet() {
  const btn = document.getElementById('fetch-network-btn');
  btn.textContent = 'Fetching…';
  btn.disabled = true;
  setStatus('fetch-network-status', 'Connecting…', 'info');

  const attempts = [
    NETWORK_CSV_URL,
    `https://corsproxy.io/?${encodeURIComponent(NETWORK_CSV_URL)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(NETWORK_CSV_URL)}`,
  ];

  let lastErr = '';
  for (const url of attempts) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text || text.length < 20) throw new Error('Empty response');
      if (text.trim().startsWith('<!') || text.trim().startsWith('{')) throw new Error('Not CSV');
      parseNetworkCsv(text);
      btn.textContent = 'Fetch from Google Sheet';
      btn.disabled = false;
      return;
    } catch (e) { lastErr = e.message; }
  }

  setStatus('fetch-network-status', `Failed: ${lastErr}`, 'error');
  btn.textContent = 'Fetch from Google Sheet';
  btn.disabled = false;
}

function parseNetworkCsv(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) { setStatus('fetch-network-status', 'No data', 'error'); return; }

  const headers = splitCsvRow(lines[0]).map(h => h.replace(/"/g,'').trim().toLowerCase());

  // Find column indexes (matches DATE, IMPACTED_OPERATOR, FAILED — current sheet headers)
  const dateIdx   = headers.findIndex(h => h === 'date');
  const mnoIdx    = headers.findIndex(h => h.includes('impacted_operator') || h.includes('operator') || h.includes('mno') || h.includes('p2p'));
  const failedIdx = headers.findIndex(h => h === 'failed' || h.includes('failed'));

  if (dateIdx < 0 || mnoIdx < 0 || failedIdx < 0) {
    setStatus('fetch-network-status', `Columns not found. Headers: ${headers.slice(0,8).join(' | ')}`, 'error');
    return;
  }

  // Find the last date that has data
  let lastDate = '';
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvRow(lines[i]);
    const d = (cols[dateIdx] || '').replace(/"/g,'').trim();
    if (d) lastDate = d;
  }

  if (!lastDate) { setStatus('fetch-network-status', 'No date found in sheet', 'error'); return; }

  // Aggregate by operator for last date
  const opData = {}; // { GP: { times: 0, failed: 0 }, ... }
  for (let i = 1; i < lines.length; i++) {
    const cols   = splitCsvRow(lines[i]);
    const d      = (cols[dateIdx]   || '').replace(/"/g,'').trim();
    const mno    = (cols[mnoIdx]    || '').replace(/"/g,'').trim();
    const failed = (cols[failedIdx] || '').replace(/"/g,'').trim();
    if (d !== lastDate) continue;
    const op = mnoToOp(mno);
    if (!op) continue;
    if (!opData[op]) opData[op] = { times: 0, failed: 0 };
    opData[op].times++;
    opData[op].failed += parseInt(failed) || 0;
  }

  if (!Object.keys(opData).length) {
    setStatus('fetch-network-status', `No operator data found for last date: ${lastDate}`, 'error');
    return;
  }

  // Fill Network Times inputs + Errors spans
  OPERATORS.forEach(op => {
    const elTimes  = document.querySelector(`.net-times[data-op="${op}"]`);
    const elFailed = document.getElementById(`net-failed-${op}`);
    if (elTimes)  elTimes.value       = opData[op]?.times  || 0;
    if (elFailed) elFailed.textContent = opData[op]?.failed || 0;
  });

  // Build status summary
  const summary = OPERATORS
    .filter(op => opData[op])
    .map(op => `${op}: ${opData[op].times} times | Errors: ${opData[op].failed.toLocaleString()}`)
    .join('  ·  ');

  setStatus('fetch-network-status', `${lastDate} → ${summary}`, 'ok');
  showToast('Network data loaded');
  scheduleAutoSave();
}


function parseTrafficCsvUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => parseTrafficCsv(e.target.result);
  reader.readAsText(file);
}

function parseTrafficCsv(csvText) {
  const statusEl = document.getElementById('fetch-traffic-status');
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) { setStatus('fetch-traffic-status', 'No data', 'error'); return; }

  const headers = splitCsvRow(lines[0]).map(h => h.replace(/"/g,'').trim());
  const dateIdx   = headers.findIndex(h => h.toLowerCase() === 'date');
  const dayEndIdx = headers.findIndex(h => h.replace(/\s/g,'').toLowerCase() === 'dayend');

  if (dateIdx < 0 || dayEndIdx < 0) {
    setStatus('fetch-traffic-status', `Columns not found. Headers: ${headers.slice(0,8).join(' | ')}`, 'error');
    return;
  }

  // Collect valid rows (have Day End value)
  const valid = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = splitCsvRow(lines[i]);
    const dateVal = (cols[dateIdx]   || '').replace(/"/g,'').trim();
    const dayEnd  = (cols[dayEndIdx] || '').replace(/[",]/g,'').trim();
    if (!dateVal || !dayEnd || isNaN(parseInt(dayEnd)) || parseInt(dayEnd) <= 0) continue;
    valid.push({ dateVal, dayEnd });
  }

  const last6 = valid.slice(-6);
  if (!last6.length) { setStatus('fetch-traffic-status', 'No rows with Day End values found', 'error'); return; }

  // Clear and fill traffic list
  document.getElementById('traffic-list').innerHTML = '';
  last6.forEach(r => addTrafficRow(parseSheetDate(r.dateVal), r.dayEnd));

  setStatus('fetch-traffic-status',
    `Loaded ${last6.length} days: ${last6[0].dateVal} → ${last6[last6.length-1].dateVal}`,
    'ok');
  showToast(`Traffic: ${last6.length} days loaded`);
  scheduleAutoSave();
}

function parseSheetDate(raw) {
  if (!raw) return '';
  raw = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m1 = raw.match(/^(\d{1,2})[- ]([A-Za-z]+)[- ](\d{2,4})$/);
  if (m1) {
    const months = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
    const mon = months[m1[2].toLowerCase().slice(0,3)];
    let yr = m1[3]; if (yr.length === 2) yr = '20' + yr;
    return `${yr}-${mon}-${m1[1].padStart(2,'0')}`;
  }
  const m2 = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m2) {
    let yr = m2[3]; if (yr.length === 2) yr = '20' + yr;
    return `${yr}-${m2[1].padStart(2,'0')}-${m2[2].padStart(2,'0')}`;
  }
  return raw;
}


/* ── Drag & Drop helpers ── */
function handleDragOver(e, zoneId) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  document.getElementById(zoneId).classList.add('drag-over');
}

function handleDragLeave(zoneId) {
  document.getElementById(zoneId).classList.remove('drag-over');
}

function handleDrop(e, inputId, parseFn) {
  e.preventDefault();
  const zoneId = e.currentTarget.id;
  document.getElementById(zoneId).classList.remove('drag-over');

  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.csv')) {
    alert('Only .csv files are supported.');
    return;
  }

  // Inject file into the hidden input and call the parse function
  const input = document.getElementById(inputId);
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  parseFn(input);
}
