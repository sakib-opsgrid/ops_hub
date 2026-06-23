/* ═══════════════════════════════════════════
   MNP STATUS REPORTER · app.js
═══════════════════════════════════════════ */
'use strict';

/* ─── State ─── */
let entries = [];
let meta    = {};

/* ══════════════════════════════════════════
   DATE / TIME
══════════════════════════════════════════ */
function fmtDate(d) {
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2,'0')} ${M[d.getMonth()]} ${d.getFullYear()}`;
}

/* Snap to nearest report slot: 09:00 AM or 06:00 PM */
function snapTime(d) {
  const m = d.getHours() * 60 + d.getMinutes();
  return Math.abs(m - 540) <= Math.abs(m - 1080) ? '09:00 AM' : '06:00 PM';
}

/* ══════════════════════════════════════════
   PARSER
══════════════════════════════════════════ */
const RE_KW   = /^(disk|memory|swap|warning|critical|ok|unknown)$/i;
const RE_DATE = /^\d{2}-\d{2}-\d{4}/;
const RE_ALRT = /WARNING|CRITICAL/i;

function isHostLine(l) {
  if (!l) return false;
  if (RE_KW.test(l))    return false;
  if (RE_DATE.test(l))  return false;
  if (l.includes('\t')) return false;
  return true;
}

function getStatus(l) {
  return /CRITICAL/i.test(l) ? 'CRITICAL' : 'WARNING';
}

function getInfo(l) {
  const parts = l.split('\t');
  return parts.length >= 2 ? parts[parts.length - 1].trim() : l.trim();
}

/* Memory */
function parseMemory(info, host, status) {
  const pm = info.match(/(\d+)%\s*used/i);
  const mm = info.match(/Using\s+([\d,]+)\s*MB/i);
  if (!pm) return null;
  const pct = parseInt(pm[1]);
  return {
    host, type: 'Memory', status,
    partitions: [{
      name: 'Memory',
      mb:   mm ? parseInt(mm[1].replace(/,/g, '')) : null,
      pct,
      inode: null,
      usedPct: pct,
    }],
    worstUsed: pct,
    isMemory: true, isSwap: false,
  };
}

/* Swap */
function parseSwap(info, host, status) {
  const pm = info.match(/(\d+)%\s*free/i);
  const mm = info.match(/\(\s*([\d,]+)\s*MB/i);
  if (!pm) return null;
  const freePct = parseInt(pm[1]);
  return {
    host, type: 'Swap', status,
    partitions: [{
      name:   'Swap',
      mb:     mm ? parseInt(mm[1].replace(/,/g, '')) : null,
      pct:    freePct,
      inode:  null,
      usedPct: 100 - freePct,
    }],
    worstUsed: 100 - freePct,
    isMemory: false, isSwap: true,
  };
}

/* Disk — ALL partitions with free% ≤ 20 from one Nagios line */
function parseDisk(info, host, status) {
  const RE = /(\/[^\s:]*)\s+([\d,]+)\s+MB\s+\((\d+)%\s*inode=(\d+)%\)/g;
  const parts = [];
  let m;
  while ((m = RE.exec(info)) !== null) {
    const pct = parseInt(m[3]);
    if (pct > 20) continue;           // ← filter: ≤ 20% free only
    parts.push({
      name:    m[1],
      mb:      parseInt(m[2].replace(/,/g, '')),
      pct,
      inode:   parseInt(m[4]),
      usedPct: 100 - pct,
    });
  }
  if (!parts.length) return null;
  return {
    host, type: 'Disk', status,
    partitions: parts,
    worstUsed: Math.max(...parts.map(p => p.usedPct)),
    isMemory: false, isSwap: false,
  };
}

const KNOWN_SVC = ['disk', 'memory', 'swap'];

/* Detect if lines[idx] is a service name (next line is tab-data) */
function isServiceLine(lines, idx) {
  if (idx >= lines.length) return false;
  const l = lines[idx];
  if (!l || l.includes('\t') || RE_DATE.test(l)) return false;
  const next = lines[idx + 1];
  return !!(next && next.includes('\t'));
}

/* Generic service parser for kafka/ping/etc */
function parseGenericService(info, host, status, svcName) {
  const msg = info.replace(/^.*?Active:\s*/i, '').trim();
  return {
    host, type: 'Service', status,
    svcName, message: msg,
    partitions: [],
    isMemory: false, isSwap: false, isGeneric: true,
    worstUsed: 0,
  };
}

function parseRaw(raw) {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const out   = [];
  let i = 0;

  while (i < lines.length) {
    /* Hostname: current line is not a service/tab/date,
       and next line IS a service (followed by tab data) */
    if (!isHostLine(lines[i]) || !isServiceLine(lines, i + 1)) { i++; continue; }

    const host = lines[i++];
    if (i >= lines.length) break;

    /* Consume all service blocks under this host */
    while (i < lines.length && isServiceLine(lines, i)) {
      const svcName  = lines[i++].trim();
      const svcLower = svcName.toLowerCase();

      /* Consume tab-data lines for this service block */
      while (i < lines.length && lines[i].includes('\t')) {
        const l = lines[i++];
        if (!RE_ALRT.test(l)) continue;

        const status = getStatus(l);
        const info   = getInfo(l);
        let entry    = null;

        if      (svcLower === 'memory') entry = parseMemory(info, host, status);
        else if (svcLower === 'swap')   entry = parseSwap(info, host, status);
        else if (svcLower === 'disk')   entry = parseDisk(info, host, status);
        else                            entry = parseGenericService(info, host, status, svcName);

        if (entry) out.push(entry);
      }
    }
  }
  return out;
}

/* Dedup: one entry per host+type; for generic services collapse all same-host entries into one */
function dedup(arr) {
  const seen = new Set();
  return arr.filter(e => {
    const k = e.isGeneric ? `${e.host}::__generic__` : `${e.host}::${e.type}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

/* ══════════════════════════════════════════
   WHATSAPP PLAIN TEXT — no emoji, clean
══════════════════════════════════════════ */
function entryLine(e, n) {
  if (e.isGeneric) {
    return `${n}. ${e.host}: ${e.message}`;
  } else if (e.isMemory) {
    const p = e.partitions[0];
    return `${n}. ${e.host}: Memory${p.mb ? ' ' + p.mb.toLocaleString() + ' MB' : ''} (${p.pct}% used)`;
  } else if (e.isSwap) {
    const p = e.partitions[0];
    return `${n}. ${e.host}: Swap${p.mb ? ' ' + p.mb.toLocaleString() + ' MB' : ''} (${p.pct}% free)`;
  } else {
    const desc = e.partitions
      .map(p => `${p.name} ${p.mb.toLocaleString()} MB (${p.pct}% inode=${p.inode}%)`)
      .join(', ');
    return `${n}. ${e.host}: ${desc}`;
  }
}

/* Group generic service entries by host — one line per host */
function groupGeneric(list) {
  const result = [];
  const seen   = new Map(); // host -> entry index in result
  list.forEach(e => {
    if (!e.isGeneric) { result.push(e); return; }
    if (seen.has(e.host)) {
      // already have an entry for this host — skip duplicate
    } else {
      seen.set(e.host, result.length);
      result.push(e);
    }
  });
  return result;
}

function buildPlainText(ents, m) {
  const critList = ents.filter(e => e.status === 'CRITICAL');
  const warnList = ents.filter(e => e.status === 'WARNING');

  const lines = [];
  lines.push(`Date: ${m.date}`);
  lines.push(`Time: ${m.time}`);
  lines.push('');
  lines.push(`Total: ${ents.length}`);
  lines.push('');

  lines.push(`Critical: ${critList.length}`);
  critList.forEach((e, i) => lines.push(entryLine(e, i + 1)));
  lines.push('');

  lines.push(`Warning: ${warnList.length}`);
  warnList.forEach((e, i) => lines.push(entryLine(e, i + 1)));
  lines.push('');

  return lines.join('\n');
}

/* ══════════════════════════════════════════
   RENDER CARDS
══════════════════════════════════════════ */
function barColor(usedPct) {
  if (usedPct >= 95) return '#ef4444';
  if (usedPct >= 80) return '#f59e0b';
  return '#3b82f6';
}

function renderCards(data) {
  const container = document.getElementById('cards');
  const nores     = document.getElementById('nores');
  const cntEl     = document.getElementById('cnt');
  container.innerHTML = '';

  if (!data.length) {
    nores.style.display = 'block';
    cntEl.textContent   = '';
    return;
  }
  nores.style.display = 'none';
  cntEl.textContent   = `${data.length} entr${data.length === 1 ? 'y' : 'ies'}`;

  data.forEach((e, i) => {
    const card = document.createElement('div');
    card.className = 'alert-card';
    card.style.animationDelay = (i * 25) + 'ms';

    /* Partition rows */
    let partsHTML = '';
    if (e.isGeneric) {
      partsHTML = `<div class="part-item"><div class="part-info" style="font-size:0.74rem;color:var(--t2)">${e.message}</div></div>`;
    } else {
      e.partitions.forEach(p => {
        const col = barColor(p.usedPct);
        let pctLabel, infoStr;

        if (e.isMemory) {
          pctLabel = `${p.pct}% used`;
          infoStr  = p.mb ? `${p.mb.toLocaleString()} MB used` : '';
        } else if (e.isSwap) {
          pctLabel = `${p.pct}% free`;
          infoStr  = p.mb ? `${p.mb.toLocaleString()} MB free` : '';
        } else {
          pctLabel = `${p.pct}% free`;
          infoStr  = `${p.mb.toLocaleString()} MB · inode: ${p.inode}%`;
        }

        partsHTML += `
          <div class="part-item">
            <div class="part-row-top">
              <span class="part-name">${p.name}</span>
              <span class="part-pct">${pctLabel}</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width:${Math.min(p.usedPct,100)}%;background:${col}"></div>
            </div>
            ${infoStr ? `<div class="part-info">${infoStr}</div>` : ''}
          </div>`;
      });
    }

    card.innerHTML = `
      <div class="card-hd">
        <div class="card-left">
          <span class="card-num">${i + 1}</span>
          <span class="card-host">${e.host}</span>
        </div>
        <div class="card-right">
          <span class="card-type">${e.type}</span>
          <span class="badge ${e.status.toLowerCase()}">
            <span class="bdot"></span>${e.status}
          </span>
        </div>
      </div>
      <div class="card-body">${partsHTML}</div>`;

    container.appendChild(card);
  });
}

/* ══════════════════════════════════════════
   FILTER
══════════════════════════════════════════ */
function applyFilter() {
  const q  = document.getElementById('q').value.toLowerCase();
  const ft = document.getElementById('ftype').value;

  const data = entries.filter(e => {
    const mq = !q
      || e.host.toLowerCase().includes(q)
      || e.partitions.some(p => p.name.toLowerCase().includes(q));
    const mt = ft === 'all' || e.type === ft;
    return mq && mt;
  });

  renderCards(data);
}

/* ══════════════════════════════════════════
   GENERATE
══════════════════════════════════════════ */
function generate() {
  const raw   = document.getElementById('raw').value.trim();
  const errEl = document.getElementById('err');
  errEl.style.display = 'none';

  if (!raw) {
    errEl.textContent   = '⚠ Please paste monitoring data first.';
    errEl.style.display = 'block';
    return;
  }

  const now  = new Date();
  meta       = { date: fmtDate(now), time: snapTime(now) };
  const parsed = dedup(parseRaw(raw));

  if (!parsed.length) {
    errEl.textContent   = '⚠ No qualifying alerts found. Check that data includes DISK / MEMORY / SWAP WARNING lines with partitions ≤ 20% free.';
    errEl.style.display = 'block';
    return;
  }

  entries = parsed;

  const tot  = parsed.length;
  const crit = parsed.filter(e => e.status === 'CRITICAL').length;
  const warn = parsed.filter(e => e.status === 'WARNING').length;

  /* Update stats */
  document.getElementById('s-tot').textContent = tot;
  document.getElementById('s-wrn').textContent = warn;
  document.getElementById('s-crt').textContent = crit;
  document.getElementById('r-dt').textContent  = `${meta.date} · ${meta.time}`;

  /* WhatsApp time label */
  document.getElementById('wa-time-lbl').textContent = meta.time;

  /* Reset search */
  document.getElementById('q').value     = '';
  document.getElementById('ftype').value = 'all';

  /* Plain text */
  document.getElementById('plain').textContent = buildPlainText(parsed, meta);

  /* Render cards */
  renderCards(parsed);

  /* Switch screen */
  document.getElementById('s-input').classList.remove('active');
  document.getElementById('s-report').classList.add('active');
  window.scrollTo(0, 0);
}

/* ══════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════ */
function goBack() {
  document.getElementById('s-report').classList.remove('active');
  document.getElementById('s-input').classList.add('active');
  window.scrollTo(0, 0);
}

/* ══════════════════════════════════════════
   TOAST
══════════════════════════════════════════ */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

/* ══════════════════════════════════════════
   COPY / EXPORT
══════════════════════════════════════════ */
function copyWhatsApp() {
  const text = document.getElementById('plain').textContent;
  navigator.clipboard.writeText(text)
    .then(()  => showToast('✓ Copied — paste into WhatsApp'))
    .catch(()  => showToast('✗ Copy failed, try manually'));
}

function exportTxt() {
  const text = document.getElementById('plain').textContent;
  const blob = new Blob([text], { type: 'text/plain' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `mnp-${meta.date.replace(/ /g,'-')}-${meta.time.replace(':','').replace(' ','')}.txt`;
  a.click();
  showToast('✓ File downloaded');
}

/* ── Ctrl / Cmd + Enter to generate ── */
document.getElementById('raw').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generate();
});
