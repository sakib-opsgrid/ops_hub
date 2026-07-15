'use strict';
/* ================================================================
   Service Assurance — Shift Report Tool
   © 2026 Nickson Rizvi (Najmaz Sakib) · Infozillion Teletech BD
   ================================================================ */

// ── CLOCK ─────────────────────────────────────────────────────────


function initDT(prefix){
  const n = new Date();
  const from = new Date(n); from.setHours(from.getHours()-2);
  const toD = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const toT = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  document.getElementById(`${prefix}-from-date`).value = toD(from);
  document.getElementById(`${prefix}-from-time`).value = toT(from);
  document.getElementById(`${prefix}-to-date`).value   = toD(n);
  document.getElementById(`${prefix}-to-time`).value   = toT(n);
}

function fmtDT(dateVal, timeVal){
  if(!dateVal) return '—';
  const [y,m,d] = dateVal.split('-').map(Number);
  const [h,mn] = (timeVal||'00:00').split(':').map(Number);
  const mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${mo[m-1]} ${pad(d)}, ${y} @ ${pad(h)}:${pad(mn)}:00.000`;
}

function fmtTimeNow(){ const n=new Date(); return `${pad(n.getHours())}:${pad(n.getMinutes())}`; }

// ── AUTO DATE FROM CSV ────────────────────────────────────────────
function extractDateRange(rows){
  const sample=rows[0]||{};
  // Find timestamp key — handles @timestamp, timestamp, time, @time
  const tsKey=Object.keys(sample).find(k=>{
    const kl=k.toLowerCase().replace(/[^a-z]/g,'');
    return kl==='timestamp'||kl==='time';
  });
  if(!tsKey) return null;
  let min=null,max=null;
  const MONTHS={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};

  rows.forEach(r=>{
    const raw=(r[tsKey]||'').trim();
    if(!raw) return;
    let d=null;

    // ELK format: "May 24, 2026 @ 01:50:05.324"
    const elkM=raw.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})\s+@\s+(\d{2}):(\d{2}):(\d{2})/);
    if(elkM){
      const mo=MONTHS[elkM[1]];
      if(mo!==undefined){
        d=new Date(+elkM[3],mo,+elkM[2],+elkM[4],+elkM[5],+elkM[6]);
      }
    }
    // ISO / other formats
    if(!d||isNaN(d.getTime())){
      const cleaned=raw.replace(' @ ','T').replace(/\.\d+$/,'');
      d=new Date(cleaned);
    }
    if(!d||isNaN(d.getTime())) return;
    if(!min||d<min) min=d;
    if(!max||d>max) max=d;
  });
  if(!min||!max) return null;
  return {min,max};
}

function applyDateRange(prefix,range){
  if(!range) return;
  const toDate=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const toTime=d=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
  document.getElementById(`${prefix}-from-date`).value=toDate(range.min);
  document.getElementById(`${prefix}-from-time`).value=toTime(range.min);
  document.getElementById(`${prefix}-to-date`).value=toDate(range.max);
  document.getElementById(`${prefix}-to-time`).value=toTime(range.max);
}

// ── CSV PARSER ────────────────────────────────────────────────────
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(Boolean);
  if(lines.length<2) throw new Error('File has no data rows');
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delim).map(h=>h.replace(/^"|"$/g,'').trim());
  return lines.slice(1).map(line=>{
    const vals = splitCSVLine(line,delim);
    const obj={};
    headers.forEach((h,i)=>{ obj[h]=(vals[i]||'').replace(/^"|"$/g,'').trim(); });
    return obj;
  }).filter(r=>Object.values(r).some(v=>v));
}

function splitCSVLine(line,delim){
  const result=[]; let cur=''; let inQ=false;
  for(let i=0;i<line.length;i++){
    if(line[i]==='"'){ inQ=!inQ; }
    else if(line[i]===delim&&!inQ){ result.push(cur); cur=''; }
    else { cur+=line[i]; }
  }
  result.push(cur);
  return result;
}

function findKey(obj,options){
  const keys = Object.keys(obj).map(k=>k.trim());
  for(const opt of options){
    const found = keys.find(k=>k.toLowerCase()===opt.toLowerCase());
    if(found) return found;
  }
  return null;
}

// ── TAB SWITCHING ─────────────────────────────────────────────────
function switchTab(id,el){
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('panel-'+id).classList.add('active');
  el.classList.add('active');
  if(id==='4xx5xx') refreshHTTP();
  if(id==='backup') refreshBackup();
}

// ── AUTO THRESHOLD (9xxx/1xxx) ─────────────────────────────────────
const THRESHOLD = 3000;

function applyThreshold9(prefix, clientTotals, clientBreakdown){
  const exceeding = Object.entries(clientTotals)
    .filter(([,total]) => total >= THRESHOLD)
    .sort((a,b) => b[1]-a[1]);

  if(exceeding.length === 0){
    setSt(prefix,'Normal');
  } else {
    setSt(prefix,'Issue');
    const lines = exceeding.map(([cl]) => {
      // List each code this client is receiving, sorted by count desc
      const codes = clientBreakdown[cl].slice().sort((a,b)=>b.count-a.count);
      return codes.map(({code,count}) =>
        `${cl} receiving ${code} errors (${count.toLocaleString()})`
      ).join('\n');
    }).join('\n');
    const issueBox = document.getElementById(`${prefix}-issue`);
    if(issueBox) issueBox.value = lines;
  }
}

function applyThreshold1(prefix, clientTotals, clientBreakdown){
  const exceeding = Object.entries(clientTotals)
    .filter(([,total]) => total >= THRESHOLD)
    .sort((a,b) => b[1]-a[1]);

  if(exceeding.length === 0){
    setSt(prefix,'Normal');
  } else {
    setSt(prefix,'Issue');
    const lines = exceeding.map(([cl]) => {
      const items = clientBreakdown[cl].slice().sort((a,b)=>b.count-a.count);
      return items.map(({gw,code,count}) =>
        `${cl} receiving ${code} errors via ${gw} (${count.toLocaleString()})`
      ).join('\n');
    }).join('\n');
    const issueBox = document.getElementById(`${prefix}-issue`);
    if(issueBox) issueBox.value = lines;
  }
}

// ── STATUS TOGGLE ─────────────────────────────────────────────────
const statusMap={};
['9mno','9iptsp','1mno','1iptsp','http','dlr'].forEach(p=>{statusMap[p]='Normal';});

function setSt(prefix,val){
  statusMap[prefix]=val;
  const bn=document.getElementById(`${prefix}-btn-n`);
  const bi=document.getElementById(`${prefix}-btn-i`);
  const box=document.getElementById(`${prefix}-issue-box`);
  if(val==='Normal'){
    bn.className='st-btn normal-on'; bi.className='st-btn';
    if(box) box.style.display='none';
  } else {
    bi.className='st-btn issue-on'; bn.className='st-btn';
    if(box){ box.style.display='block'; box.querySelector('textarea').focus(); }
  }
}

// ── CAPTURE / COPY IMAGE ──────────────────────────────────────────
async function captureScreenshot(cardId, download, btn){
  const card = document.getElementById(cardId);
  if(!card||!card.innerHTML.trim()){ showToast('Generate a card first'); return; }
  const origText = btn.textContent;
  btn.textContent = 'Generating…';
  btn.disabled = true;
  showToast('Generating image…');

  const fullW = card.scrollWidth;
  const fullH = card.scrollHeight;
  card.style.setProperty('width',  fullW+'px','important');
  card.style.setProperty('height', fullH+'px','important');
  card.style.setProperty('overflow','visible','important');
  card.style.setProperty('max-width','none','important');

  await new Promise(r=>setTimeout(r,80));
  const w = card.offsetWidth;
  const h = card.offsetHeight;

  const restore=()=>{
    card.style.removeProperty('width');
    card.style.removeProperty('height');
    card.style.removeProperty('overflow');
    card.style.removeProperty('max-width');
  };

  try {
    const canvas = await html2canvas(card,{
      backgroundColor:'#FFFFFF', scale:2.5, useCORS:true, logging:false,
      width:w, height:h, windowWidth:w+200, windowHeight:h+200, x:0, y:0, scrollX:0, scrollY:0
    });
    restore();
    if(download){
      const a=document.createElement('a');
      a.href=canvas.toDataURL('image/png');
      a.download=`report_${formatFileDate(new Date())}.png`;
      a.click();
      showToast('Downloaded ✓');
    } else {
      canvas.toBlob(async blob=>{
        try{
          await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
          showToast('Copied! Paste in WhatsApp ✓');
        } catch {
          const url=URL.createObjectURL(blob);
          window.open(url,'_blank');
          showToast('Opened in new tab — save & share');
        }
      },'image/png');
    }
  } catch(err){
    restore();
    showToast('Capture failed: '+err.message);
  }
  btn.textContent=origText;
  btn.disabled=false;
}

function formatFileDate(d){
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// ── COPY TEXT ─────────────────────────────────────────────────────
function doCopy(id, btn){
  const el = document.getElementById(id);
  if(!el) return;
  const text = el.textContent || el.value;
  navigator.clipboard.writeText(text).then(()=>{
    const orig=btn.textContent; btn.textContent='Copied ✓';
    setTimeout(()=>btn.textContent=orig,2000);
  }).catch(()=>showToast('Copy failed'));
}

function copyReportText(typeLabel, prefix, btn){
  const reporter = document.getElementById(`${prefix}-reporter`)?.value||'—';
  const status = statusMap[prefix]||'Normal';
  const issue = document.getElementById(`${prefix}-issue`)?.value.trim()||'';
  const statusStr = status==='Normal'?'Normal':(issue||'—');
  const isNine = prefix.startsWith('9');
  const fromDate = document.getElementById(`${isNine?'9xxx':'1xxx'}-from-date`).value;
  const fromTime = document.getElementById(`${isNine?'9xxx':'1xxx'}-from-time`).value;
  const toDate   = document.getElementById(`${isNine?'9xxx':'1xxx'}-to-date`).value;
  const toTime   = document.getElementById(`${isNine?'9xxx':'1xxx'}-to-time`).value;
  const period = `${fmtDT(fromDate,fromTime)} - ${fmtDT(toDate,toTime)}`;
  const text = `${typeLabel},\n${period}\n\nReporter: ${reporter}\nStatus  : ${statusStr}`;
  showWaModal(text);
  navigator.clipboard.writeText(text).then(()=>{
    const orig=btn.textContent; btn.textContent='Copied ✓';
    setTimeout(()=>btn.textContent=orig,2000);
  });
}

// ═══════════════════════════════════════════════════════════════════
// 9XXX
// ═══════════════════════════════════════════════════════════════════
const data9={mno:null,iptsp:null,mno_file:null,iptsp_file:null};

function show9sub(which,el){
  document.getElementById('9sub-mno').style.display   = which==='mno'?'block':'none';
  document.getElementById('9sub-iptsp').style.display = which==='iptsp'?'block':'none';
  document.getElementById('9sub-mno-btn').className   = which==='mno'?'seg-btn seg-btn--active':'seg-btn';
  document.getElementById('9sub-iptsp-btn').className = which==='iptsp'?'seg-btn seg-btn--active':'seg-btn';
}

function parse9xxx(file,which){
  if(!file) return;
  data9[`${which}_file`]=file;
  const reader=new FileReader();
  reader.onload=e=>{
    const rows=parseCSV(e.target.result);
    const statusEl=document.getElementById(`status-9${which}`);
    const zoneEl=document.getElementById(`zone-9${which}`);
    const sample=rows[0]||{};
    const clientKey=findKey(sample,['clientId','client_id','ClientId','client']);
    const codeKey=findKey(sample,['a2pResponseCode','a2presponsecode','a2pResponsecode','responseCode']);
    if(!clientKey||!codeKey){ statusEl.textContent='⚠ Columns not found'; statusEl.className='upload-status error'; return; }
    data9[which]=rows;
    statusEl.textContent=`✓ ${rows.length.toLocaleString()} rows loaded`;
    statusEl.className='upload-status';
    zoneEl.classList.add('loaded');
    renderPivot9(which,rows,clientKey,codeKey);
    applyDateRange('9xxx',extractDateRange(rows));
  };
  reader.readAsText(file);
}

function renderPivot9(which,rows,clientKey,codeKey){
  const clients=new Set(), codes=new Set(), counts={};
  rows.forEach(r=>{
    const client=r[clientKey]||'null';
    const code=r[codeKey]||'null';
    clients.add(client); codes.add(code);
    const k=`${client}::${code}`;
    counts[k]=(counts[k]||0)+1;
  });
  const sortedClients=[...clients].sort();
  const sortedCodes=[...codes].sort();
  let html=`<table class="pivot-table"><thead><tr><th>Row Labels</th>`;
  sortedCodes.forEach(c=>{html+=`<th>${c}</th>`;});
  html+=`<th>Grand Total</th></tr></thead><tbody>`;
  const colTotals={};
  sortedCodes.forEach(c=>{colTotals[c]=0;});
  let grand=0;
  sortedClients.forEach(cl=>{
    let rowTotal=0;
    let row=`<tr><td>${cl}</td>`;
    sortedCodes.forEach(c=>{
      const v=counts[`${cl}::${c}`]||0;
      colTotals[c]+=v; rowTotal+=v;
      row+=`<td class="${v===0?'zero':'has-val'}">${v===0?'':v}</td>`;
    });
    grand+=rowTotal;
    row+=`<td class="has-val">${rowTotal||''}</td></tr>`;
    html+=row;
  });
  html+=`<tr class="grand-row"><td>Grand Total</td>`;
  sortedCodes.forEach(c=>{html+=`<td>${colTotals[c]||''}</td>`;});
  html+=`<td>${grand}</td></tr></tbody></table>`;
  document.getElementById(`pivot-9${which}`).innerHTML=html;

  // Per-client totals + code breakdown for threshold check
  const clientTotals={};
  const clientBreakdown={}; // client -> [{code, count}]
  sortedClients.forEach(cl=>{
    let t=0;
    const codes=[];
    sortedCodes.forEach(c=>{
      const v=counts[`${cl}::${c}`]||0;
      t+=v;
      if(v>0) codes.push({code:c,count:v});
    });
    clientTotals[cl]=t;
    clientBreakdown[cl]=codes;
  });

  data9[`${which}_pivot`]={sortedClients,sortedCodes,counts,colTotals,grand,clientTotals};
  applyThreshold9(`9${which}`,clientTotals,clientBreakdown);
}

function buildScreenshot(prefix){
  const which=prefix.replace('9','');
  const pivot=data9[`${which}_pivot`];
  if(!pivot){ showToast('Upload CSV first'); return; }
  const {sortedClients,sortedCodes,counts,colTotals,grand}=pivot;
  const reporter=document.getElementById(`${prefix}-reporter`).value||'—';
  const status=statusMap[prefix]||'Normal';
  const issue=document.getElementById(`${prefix}-issue`)?.value.trim()||'';
  const statusStr=status==='Normal'?'Normal':(issue||'—');
  const typeLabel=which==='mno'?'MNO':'IPTSP';
  const fromDate=document.getElementById('9xxx-from-date').value;
  const fromTime=document.getElementById('9xxx-from-time').value;
  const toDate=document.getElementById('9xxx-to-date').value;
  const toTime=document.getElementById('9xxx-to-time').value;
  const period=`${fmtDT(fromDate,fromTime)} - ${fmtDT(toDate,toTime)}`;

  let thCells=`<th style="text-align:left;">Count of a2pResponseCode</th><th colspan="${sortedCodes.length}" style="text-align:center;background:#DDE0EC;">Column Labels</th><th>Grand Total</th>`;
  let th2Cells=`<th style="text-align:left;">Row Labels</th>`;
  sortedCodes.forEach(c=>{th2Cells+=`<th>${c}</th>`;});
  th2Cells+=`<th>Grand Total</th>`;

  let bodyHTML='';
  sortedClients.forEach(cl=>{
    let rowTotal=0;
    let row=`<tr><td>${esc(cl)}</td>`;
    sortedCodes.forEach(c=>{
      const v=counts[`${cl}::${c}`]||0;
      rowTotal+=v;
      row+=`<td class="${v===0?'zero':''}">${v===0?'':v}</td>`;
    });
    row+=`<td>${rowTotal||''}</td></tr>`;
    bodyHTML+=row;
  });
  let footHTML=`<td style="text-align:left;">Grand Total</td>`;
  sortedCodes.forEach(c=>{footHTML+=`<td>${colTotals[c]||''}</td>`;});
  footHTML+=`<td>${grand}</td>`;

  const statusCls=status==='Normal'?'sc-status-normal':'sc-status-issue';
  document.getElementById(`sc-${prefix}`).innerHTML=`
    <div class="sc-eyebrow">Infozillion Teletech BD · Service Assurance</div>
    <div class="sc-title">9xxx Error Report — ${typeLabel}</div>
    <div class="sc-time">${esc(period)}</div>
    <table class="sc-table">
      <thead><tr>${thCells}</tr><tr>${th2Cells}</tr></thead>
      <tbody>${bodyHTML}</tbody>
      <tfoot><tr class="sc-grand">${footHTML}</tr></tfoot>
    </table>
    <div class="sc-meta">
      <div class="sc-meta-line"><strong>Reporter:</strong> ${esc(reporter)}</div>
      <div class="sc-meta-line"><strong>Status &nbsp;:</strong> <span class="${statusCls}">${esc(statusStr)}</span></div>
    </div>`;

  const wrap=document.getElementById(`ss-${prefix}`);
  wrap.classList.add('show');
  setTimeout(()=>wrap.scrollIntoView({behavior:'smooth',block:'nearest'}),100);
}

// ═══════════════════════════════════════════════════════════════════
// 1XXX
// ═══════════════════════════════════════════════════════════════════
const data1={mno:null,iptsp:null,mno_file:null,iptsp_file:null};

function show1sub(which,el){
  document.getElementById('1sub-mno').style.display   = which==='mno'?'block':'none';
  document.getElementById('1sub-iptsp').style.display = which==='iptsp'?'block':'none';
  document.getElementById('1sub-mno-btn').className   = which==='mno'?'seg-btn seg-btn--active':'seg-btn';
  document.getElementById('1sub-iptsp-btn').className = which==='iptsp'?'seg-btn seg-btn--active':'seg-btn';
}

function parse1xxx(file,which){
  if(!file) return;
  data1[`${which}_file`]=file;
  const reader=new FileReader();
  reader.onload=e=>{
    const rows=parseCSV(e.target.result);
    const statusEl=document.getElementById(`status-1${which}`);
    const zoneEl=document.getElementById(`zone-1${which}`);
    const sample=rows[0]||{};
    const clientKey=findKey(sample,['clientId','client_id','ClientId','client']);
    const gwKey=findKey(sample,['applicableSmsGateway','applicablesmsgateway','smsGateway','gateway']);
    const codeKey=findKey(sample,['ansResponseCode','ansresponsecode','ansResponsecode','ansResponse']);
    if(!clientKey||!codeKey){ statusEl.textContent='⚠ Columns not found'; statusEl.className='upload-status error'; return; }
    data1[which]=rows;
    statusEl.textContent=`✓ ${rows.length.toLocaleString()} rows loaded`;
    statusEl.className='upload-status';
    zoneEl.classList.add('loaded');
    renderPivot1(which,rows,clientKey,gwKey,codeKey);
    applyDateRange('1xxx',extractDateRange(rows));
  };
  reader.readAsText(file);
}

function renderPivot1(which,rows,clientKey,gwKey,codeKey){
  const clients=new Set(), gwCodeCols=[], gwCodeSet=new Set(), gateways=new Set();
  const counts={};
  rows.forEach(r=>{
    const client=r[clientKey]||'null';
    const gw=gwKey?(r[gwKey]||'null'):'null';
    const code=r[codeKey]||'null';
    clients.add(client); gateways.add(gw);
    const combo=`${gw}::${code}`;
    if(!gwCodeSet.has(combo)){ gwCodeSet.add(combo); gwCodeCols.push({gw,code}); }
    const k=`${client}::${gw}::${code}`;
    counts[k]=(counts[k]||0)+1;
  });
  gwCodeCols.sort((a,b)=>a.gw.localeCompare(b.gw)||a.code.localeCompare(b.code));
  const sortedClients=[...clients].sort();
  const sortedGWs=[...new Set(gwCodeCols.map(x=>x.gw))];
  const gwGroups={};
  gwCodeCols.forEach(({gw})=>{gwGroups[gw]=(gwGroups[gw]||0)+1;});

  let html=`<table class="pivot-table"><thead><tr><th rowspan="2">Row Labels</th>`;
  sortedGWs.forEach(gw=>{html+=`<th colspan="${gwGroups[gw]+1}" style="text-align:center;border-bottom:1px solid var(--border-strong);">${gw}</th>`;});
  html+=`<th rowspan="2">Grand Total</th></tr><tr>`;
  sortedGWs.forEach(gw=>{
    gwCodeCols.filter(x=>x.gw===gw).forEach(({code})=>{html+=`<th>${code}</th>`;});
    html+=`<th>${gw} Total</th>`;
  });
  html+=`</tr></thead><tbody>`;

  const colTotals={}, gwTotals={}, clientTotals={}, clientBreakdown={};
  gwCodeCols.forEach(({gw,code})=>{colTotals[`${gw}::${code}`]=0;});
  sortedGWs.forEach(gw=>{gwTotals[gw]=0;});
  let grand=0;

  sortedClients.forEach(cl=>{
    let rowTotal=0;
    let row=`<tr><td>${cl}</td>`;
    const breakdown=[];
    sortedGWs.forEach(gw=>{
      let gwRow=0;
      gwCodeCols.filter(x=>x.gw===gw).forEach(({code})=>{
        const v=counts[`${cl}::${gw}::${code}`]||0;
        colTotals[`${gw}::${code}`]+=v; gwTotals[gw]+=v; gwRow+=v;
        if(v>0) breakdown.push({gw,code,count:v});
        row+=`<td class="${v===0?'zero':'has-val'}">${v===0?'':v}</td>`;
      });
      rowTotal+=gwRow;
      row+=`<td class="${gwRow===0?'zero':'has-val'}">${gwRow||''}</td>`;
    });
    grand+=rowTotal;
    clientTotals[cl]=rowTotal;
    clientBreakdown[cl]=breakdown;
    row+=`<td class="has-val">${rowTotal||''}</td></tr>`;
    html+=row;
  });
  html+=`<tr class="grand-row"><td>Grand Total</td>`;
  sortedGWs.forEach(gw=>{
    gwCodeCols.filter(x=>x.gw===gw).forEach(({code})=>{html+=`<td>${colTotals[`${gw}::${code}`]||''}</td>`;});
    html+=`<td>${gwTotals[gw]||''}</td>`;
  });
  html+=`<td>${grand}</td></tr></tbody></table>`;

  document.getElementById(`pivot-1${which}`).innerHTML=html;
  data1[`${which}_pivot`]={sortedClients,gwCodeCols,sortedGWs,gwGroups,counts,colTotals,gwTotals,grand,clientTotals};
  applyThreshold1(`1${which}`,clientTotals,clientBreakdown);
}

function buildScreenshot1(prefix){
  const which=prefix.replace('1','');
  const pivot=data1[`${which}_pivot`];
  if(!pivot){ showToast('Upload CSV first'); return; }
  const {sortedClients,gwCodeCols,sortedGWs,gwGroups,counts,colTotals,gwTotals,grand}=pivot;
  const reporter=document.getElementById(`${prefix}-reporter`).value||'—';
  const status=statusMap[prefix]||'Normal';
  const issue=document.getElementById(`${prefix}-issue`)?.value.trim()||'';
  const statusStr=status==='Normal'?'Normal':(issue||'—');
  const typeLabel=which==='mno'?'MNO':'IPTSP';
  const fromDate=document.getElementById('1xxx-from-date').value;
  const fromTime=document.getElementById('1xxx-from-time').value;
  const toDate=document.getElementById('1xxx-to-date').value;
  const toTime=document.getElementById('1xxx-to-time').value;
  const period=`${fmtDT(fromDate,fromTime)} - ${fmtDT(toDate,toTime)}`;

  let tableHtml=`<table class="sc-table"><thead><tr><th rowspan="2" style="text-align:left;">Count of ansResponseCode</th>`;
  sortedGWs.forEach(gw=>{tableHtml+=`<th colspan="${gwGroups[gw]+1}" style="text-align:center;background:#DDE0EC;">${gw}</th>`;});
  tableHtml+=`<th rowspan="2">Grand Total</th></tr><tr>`;
  sortedGWs.forEach(gw=>{
    gwCodeCols.filter(x=>x.gw===gw).forEach(({code})=>{tableHtml+=`<th>${code}</th>`;});
    tableHtml+=`<th>${gw} Total</th>`;
  });
  tableHtml+=`</tr></thead><tbody>`;
  sortedClients.forEach(cl=>{
    let rowTotal=0;
    let row=`<tr><td>${esc(cl)}</td>`;
    sortedGWs.forEach(gw=>{
      let gwRow=0;
      gwCodeCols.filter(x=>x.gw===gw).forEach(({code})=>{
        const v=counts[`${cl}::${gw}::${code}`]||0;
        gwRow+=v; rowTotal+=v;
        row+=`<td class="${v===0?'zero':''}">${v===0?'':v}</td>`;
      });
      row+=`<td>${gwRow||''}</td>`;
    });
    row+=`<td>${rowTotal||''}</td></tr>`;
    tableHtml+=row;
  });
  tableHtml+=`<tr class="sc-grand"><td style="text-align:left;">Grand Total</td>`;
  sortedGWs.forEach(gw=>{
    gwCodeCols.filter(x=>x.gw===gw).forEach(({code})=>{tableHtml+=`<td>${colTotals[`${gw}::${code}`]||''}</td>`;});
    tableHtml+=`<td>${gwTotals[gw]||''}</td>`;
  });
  tableHtml+=`<td>${grand}</td></tr></tbody></table>`;

  const statusCls=status==='Normal'?'sc-status-normal':'sc-status-issue';
  document.getElementById(`sc-${prefix}`).innerHTML=`
    <div class="sc-eyebrow">Infozillion Teletech BD · Service Assurance</div>
    <div class="sc-title">1xxx Error Report — ${typeLabel}</div>
    <div class="sc-time">${esc(period)}</div>
    ${tableHtml}
    <div class="sc-meta">
      <div class="sc-meta-line"><strong>Reporter:</strong> ${esc(reporter)}</div>
      <div class="sc-meta-line"><strong>Status &nbsp;:</strong> <span class="${statusCls}">${esc(statusStr)}</span></div>
    </div>`;

  const wrap=document.getElementById(`ss-${prefix}`);
  wrap.classList.add('show');
  setTimeout(()=>wrap.scrollIntoView({behavior:'smooth',block:'nearest'}),100);
}

// ═══════════════════════════════════════════════════════════════════
// 4XX / 5XX HTTP
// ═══════════════════════════════════════════════════════════════════
const HTTP_SOURCES=["GP","RB","BL","TT","ADN","FN","MN","BR","RT","AIT","MTN","PRM","RCO","BN","WBL","RDT","BOS","BTC","LNK","ICO","AGI","ICC"];
const HTTP_CODES=["400","401","402","403","404","500","501","502","503","504"];

function buildHTTPSources(){
  const sl=document.getElementById('http-source-list');
  HTTP_SOURCES.forEach(s=>{
    const block=document.createElement('div');
    block.className='src-block'; block.id=`src-${s}`;
    const codesHtml=HTTP_CODES.map(c=>`
      <div class="code-item">
        <label>${c}</label>
        <input class="field-input" type="number" id="hc-${s}-${c}" placeholder="0" min="0" oninput="updateHTTPTotal('${s}');refreshHTTP()">
      </div>`).join('');
    block.innerHTML=`
      <div class="src-header" onclick="toggleSrc('${s}')">
        <span class="src-name">${s}</span>
        <span class="src-total">
          <span id="htotal-${s}">—</span>
          <span class="src-arrow">▼</span>
        </span>
      </div>
      <div class="src-codes"><div class="codes-grid">${codesHtml}</div></div>`;
    sl.appendChild(block);
  });
}

function toggleSrc(s){
  document.getElementById(`src-${s}`).classList.toggle('open');
}

function getHVal(s,c){
  const v=parseInt(document.getElementById(`hc-${s}-${c}`).value);
  return isNaN(v)?0:v;
}

function updateHTTPTotal(s){
  const total=HTTP_CODES.reduce((sum,c)=>sum+getHVal(s,c),0);
  const el=document.getElementById(`htotal-${s}`);
  const block=document.getElementById(`src-${s}`);
  if(total>0){
    el.textContent=`${total} hits`;
    block.classList.add('has-data');
  } else {
    el.textContent='—';
    block.classList.remove('has-data');
  }
}

function matchSource(ansType){
  const val=(ansType||'').toLowerCase();
  const tokens=val.split(/[-\/_ ]/);
  const sorted=HTTP_SOURCES.slice().sort((a,b)=>b.length-a.length);
  for(const src of sorted){
    const s=src.toLowerCase();
    if(tokens.some(t=>t===s||t.startsWith(s))) return src;
  }
  return null;
}

function parseHTTPcsv(file){
  if(!file) return;
  const statusEl=document.getElementById('status-http');
  const zoneEl=document.getElementById('zone-http');
  const reader=new FileReader();
  reader.onload=e=>{
    const rows=parseCSV(e.target.result);
    const sample=rows[0]||{};
    const ansKey=findKey(sample,['ans_type','ansType','ans_Type']);
    const evtKey=Object.keys(sample).find(k=>k.toLowerCase().includes('event'))||findKey(sample,['event.original','eventOriginal','event_original','original']);
    if(!ansKey||!evtKey){ statusEl.textContent='⚠ Columns not found (need ans_type, event.original)'; statusEl.className='upload-status error'; return; }
    const counts={};
    HTTP_SOURCES.forEach(s=>{counts[s]={};});
    rows.forEach(r=>{
      const src=matchSource(r[ansKey]);
      if(!src) return;
      const evt=r[evtKey]||'';
      const parts=evt.split(' ');
      let code=null;
      for(let i=0;i<parts.length;i++){
        if(parts[i].startsWith('HTTP/')&&i+1<parts.length){
          const c=parts[i+1];
          if(c&&c.length===3&&!isNaN(c)){code=c;break;}
        }
      }
      if(!code) return;
      if(!HTTP_CODES.includes(code)) return;
      counts[src][code]=(counts[src][code]||0)+1;
    });
    HTTP_SOURCES.forEach(s=>{
      HTTP_CODES.forEach(c=>{
        const el=document.getElementById(`hc-${s}-${c}`);
        if(el){ const v=counts[s][c]||0; el.value=v>0?v:''; }
      });
      updateHTTPTotal(s);
    });
    applyDateRange('http',extractDateRange(rows));
    statusEl.textContent=`✓ ${rows.length.toLocaleString()} rows parsed — sources auto-filled`;
    statusEl.className='upload-status';
    zoneEl.classList.add('loaded');
    refreshHTTP();
  };
  reader.readAsText(file);
}

function buildHTTPReport(){
  const fromDate=document.getElementById('http-from-date').value;
  const fromTime=document.getElementById('http-from-time').value;
  const toDate=document.getElementById('http-to-date').value;
  const toTime=document.getElementById('http-to-time').value;
  const reporter=document.getElementById('http-reporter').value||'—';
  const status=statusMap['http']||'Normal';
  const issue=document.getElementById('http-issue').value.trim();
  const statusStr=status==='Normal'?'Normal':(issue||'—');
  const period=`${fmtDT(fromDate,fromTime)} - ${fmtDT(toDate,toTime)}`;
  const lines=HTTP_SOURCES.map(s=>{
    const parts=[];
    HTTP_CODES.forEach(c=>{const v=getHVal(s,c);if(v>0)parts.push(`${c}-${v}`);});
    const total=parts.reduce((sum,p)=>sum+parseInt(p.split('-')[1]),0);
    const padS=s.padEnd(5,' ');
    return total===0?`${padS}: 0 hits`:`${padS}: ${total} hits (${parts.join(', ')})`;
  });
  return {period,srcLines:lines.join('\n'),reporter,statusStr,status};
}

function refreshHTTP(){
  const r=buildHTTPReport();
  const sc=document.getElementById('sc-http');
  if(!sc) return;
  const statusCls=r.status==='Normal'?'sc-status-normal':'sc-status-issue';
  sc.innerHTML=`
    <div class="sc-eyebrow">Infozillion Teletech BD · Service Assurance</div>
    <div class="sc-title">4xx / 5xx HTTP Report</div>
    <div class="sc-time">${esc(r.period)}</div>
    <pre style="font-family:'DM Mono','Courier New',monospace;font-size:0.78rem;line-height:1.75;color:#1A1916;white-space:pre;margin-bottom:16px;">${esc(r.srcLines)}</pre>
    <div class="sc-meta">
      <div class="sc-meta-line"><strong>Reporter:</strong> ${esc(r.reporter)}</div>
      <div class="sc-meta-line"><strong>Status &nbsp;:</strong> <span class="${statusCls}">${esc(r.statusStr)}</span></div>
    </div>`;
  const full=document.getElementById('http-full-text');
  if(full) full.textContent=`${r.period}\n\`\`\`\n${r.srcLines}\n\`\`\`\nReporter: ${r.reporter}\nStatus  : ${r.statusStr}`;
}

function generateHTTP(){
  refreshHTTP();
  const out=document.getElementById('http-output');
  out.style.display='block';
  setTimeout(()=>out.scrollIntoView({behavior:'smooth',block:'nearest'}),100);
}

// ═══════════════════════════════════════════════════════════════════
// DLR
// ═══════════════════════════════════════════════════════════════════
const DLR_KNOWN={'1000':'Success','1020':'Internal Server Error','1052':'Submission record not found'};
let dlrData={};

function parseDLR(file){
  if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    const rows=parseCSV(e.target.result);
    const statusEl=document.getElementById('status-dlr');
    const sample=rows[0]||{};
    const bodyKey=findKey(sample,['message_body','messageBody','body','message_Body']);
    if(!bodyKey){ statusEl.textContent='⚠ message_body column not found'; statusEl.className='upload-status error'; return; }
    dlrData={};
    rows.forEach(r=>{
      const body=r[bodyKey]||'';
      const match=body.match(/statusCode=(\d+)/);
      if(match){ const code=match[1]; dlrData[code]=(dlrData[code]||0)+1; }
    });
    renderDLRCounts();
    applyDateRange('dlr',extractDateRange(rows));
    statusEl.textContent=`✓ ${rows.length.toLocaleString()} rows parsed`;
    statusEl.className='upload-status';
    document.getElementById('zone-dlr').classList.add('loaded');
  };
  reader.readAsText(file);
}

function renderDLRCounts(){
  const countsBox=document.getElementById('dlr-counts-box');
  const manualBox=document.getElementById('dlr-manual-box');
  const allCodes=Object.keys(dlrData).sort();
  countsBox.innerHTML=allCodes.map(code=>`
    <div class="dlr-card">
      <div class="dlr-code">statusCode=${code}</div>
      <div class="dlr-count">${dlrData[code]}</div>
      <div class="dlr-label">${DLR_KNOWN[code]||'Unknown'}</div>
    </div>`).join('');
  manualBox.innerHTML=`
    <div style="font-family:var(--font-mono);font-size:0.62rem;letter-spacing:.1em;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:.75rem;">Manual Override</div>
    <div class="field-grid-3">
      ${allCodes.map(code=>`
        <div class="field-block">
          <label>${code}</label>
          <input class="field-input" type="number" id="dlr-m-${code}" value="${dlrData[code]}" min="0" oninput="updateDLRManual('${code}')">
        </div>`).join('')}
    </div>`;
}

function updateDLRManual(code){
  const v=parseInt(document.getElementById(`dlr-m-${code}`).value)||0;
  dlrData[code]=v;
  const countsBox=document.getElementById('dlr-counts-box');
  const allCodes=Object.keys(dlrData).sort();
  const countEls=countsBox.querySelectorAll('.dlr-count');
  const idx=allCodes.indexOf(code);
  if(countEls[idx]) countEls[idx].textContent=v;
}

function buildDLRScreenshot(){
  const fromDate=document.getElementById('dlr-from-date').value;
  const fromTime=document.getElementById('dlr-from-time').value;
  const toDate=document.getElementById('dlr-to-date').value;
  const toTime=document.getElementById('dlr-to-time').value;
  const reporter=document.getElementById('dlr-reporter').value||'—';
  const status=statusMap['dlr']||'Normal';
  const issue=document.getElementById('dlr-issue').value.trim();
  const statusStr=status==='Normal'?'Normal':(issue||'—');
  const period=`${fmtDT(fromDate,fromTime)} - ${fmtDT(toDate,toTime)}`;
  const statusCls=status==='Normal'?'sc-status-normal':'sc-status-issue';
  const allCodes=Object.keys(dlrData).sort();
  const rows=allCodes.length>0
    ?allCodes.map(code=>`<tr><td>${code}</td><td style="text-align:left;">${DLR_KNOWN[code]||'—'}</td><td>${dlrData[code]||''}</td></tr>`).join('')
    :`<tr><td colspan="3" style="text-align:center;color:#CCC;">No data</td></tr>`;

  document.getElementById('sc-dlr').innerHTML=`
    <div class="sc-eyebrow">Infozillion Teletech BD · Service Assurance</div>
    <div class="sc-title">DLR Report</div>
    <div class="sc-time">${esc(period)}</div>
    <table class="sc-table" style="margin-bottom:16px;">
      <thead><tr>
        <th style="text-align:left;">Status Code</th>
        <th style="text-align:left;">Error Description</th>
        <th>Count</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sc-meta">
      <div class="sc-meta-line"><strong>Reporter:</strong> ${esc(reporter)}</div>
      <div class="sc-meta-line"><strong>Status &nbsp;:</strong> <span class="${statusCls}">${esc(statusStr)}</span></div>
    </div>`;

  const wrap=document.getElementById('ss-dlr');
  wrap.classList.add('show');
  setTimeout(()=>wrap.scrollIntoView({behavior:'smooth',block:'nearest'}),100);
}

function copyDLRText(btn){
  const fromDate=document.getElementById('dlr-from-date').value;
  const fromTime=document.getElementById('dlr-from-time').value;
  const toDate=document.getElementById('dlr-to-date').value;
  const toTime=document.getElementById('dlr-to-time').value;
  const reporter=document.getElementById('dlr-reporter').value||'—';
  const status=statusMap['dlr']||'Normal';
  const issue=document.getElementById('dlr-issue').value.trim();
  const statusStr=status==='Normal'?'Normal':(issue||'—');
  const period=`${fmtDT(fromDate,fromTime)} - ${fmtDT(toDate,toTime)}`;
  const text=`DLR,\n${period}\n\nReporter: ${reporter}\nStatus  : ${statusStr}`;
  navigator.clipboard.writeText(text).then(()=>{
    const orig=btn.textContent; btn.textContent='Copied ✓';
    setTimeout(()=>btn.textContent=orig,2000);
  });
}

// ═══════════════════════════════════════════════════════════════════
// DELAY REPORT
// ═══════════════════════════════════════════════════════════════════
const DELAY_THRESHOLD=1;
const OP_ORDER=['GrameenPhone','Robi','Banglalink','Teletalk'];
const OP_CLASS={GrameenPhone:'gp',Robi:'robi',Banglalink:'bl',Teletalk:'tt'};
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
let delayState={data:null,timeRange:{min:null,max:null}};

function initDelay(){
  const dropZone=document.getElementById('delay-dropZone');
  const fileInput=document.getElementById('delay-fileInput');
  const browseBtn=document.getElementById('delay-browseBtn');

  browseBtn.addEventListener('click',e=>{e.stopPropagation();fileInput.click();});
  dropZone.addEventListener('click',e=>{if(e.target.closest('button'))return;fileInput.click();});
  dropZone.addEventListener('dragover',e=>{e.preventDefault();dropZone.classList.add('drag-over');});
  dropZone.addEventListener('dragleave',e=>{if(!dropZone.contains(e.relatedTarget))dropZone.classList.remove('drag-over');});
  dropZone.addEventListener('drop',e=>{
    e.preventDefault();dropZone.classList.remove('drag-over');
    const file=e.dataTransfer.files[0];if(file)handleDelayFile(file);
  });
  fileInput.addEventListener('change',()=>{if(fileInput.files[0])handleDelayFile(fileInput.files[0]);fileInput.value='';});
  document.getElementById('delay-resetBtn').addEventListener('click',resetDelay);
  document.getElementById('delay-generateBtn').addEventListener('click',generateDelayCard);
  document.getElementById('delay-copyImgBtn').addEventListener('click',()=>captureDelayCard(false));
  document.getElementById('delay-downloadImgBtn').addEventListener('click',()=>captureDelayCard(true));
  document.getElementById('delay-fStatus').addEventListener('change',function(){
    document.getElementById('delay-fIssueGroup').style.display=this.value==='Issue'?'flex':'none';
  });
  document.getElementById('delay-copyTableBtn').addEventListener('click',()=>{
    if(delayState.data)copyDelayTable(delayState.data);
  });
  document.getElementById('delay-exportCsvBtn').addEventListener('click',()=>{
    if(delayState.data)exportDelayCSV(delayState.data);
  });
  initDelayDatetimes();
}

function initDelayDatetimes(){
  const n=new Date();
  const from=new Date(n);from.setHours(from.getHours()-2);
  document.getElementById('delay-fFrom').value=toDatetimeLocal(from);
  document.getElementById('delay-fTo').value=toDatetimeLocal(n);
}

function toDatetimeLocal(d){
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function showDelayScreen(which){
  document.getElementById('delay-screen-upload').style.display=which==='upload'?'block':'none';
  document.getElementById('delay-screen-loading').style.display=which==='loading'?'block':'none';
  const res=document.getElementById('delay-results');
  if(which==='results'){res.classList.add('show');}else{res.classList.remove('show');}
}

function setDelayLoading(label,pct){
  document.getElementById('delay-loadingLabel').textContent=label;
  document.getElementById('delay-loadingFill').style.width=Math.min(pct,100)+'%';
}

function handleDelayFile(file){
  if(!file.name.toLowerCase().endsWith('.csv')){showToast('Please select a .csv file');return;}
  showDelayScreen('loading');setDelayLoading('Reading file…',10);
  const reader=new FileReader();
  reader.onprogress=e=>{if(e.lengthComputable)setDelayLoading('Reading file…',(e.loaded/e.total)*40);};
  reader.onload=e=>{
    setTimeout(()=>{
      try{
        setDelayLoading('Parsing CSV…',50);
        const rows=parseDelayCSV(e.target.result);
        setDelayLoading(`Computing delays for ${rows.length.toLocaleString()} rows…`,70);
        setTimeout(()=>{
          const data=computeDelayData(rows);
          delayState.data=data;
          setDelayLoading('Rendering report…',90);
          setTimeout(()=>{
            renderDelayResults(data,file.name,rows.length);
            setDelayLoading('Done',100);
            setTimeout(()=>showDelayScreen('results'),150);
          },80);
        },40);
      }catch(err){showDelayScreen('upload');showToast('Error: '+err.message);}
    },30);
  };
  reader.onerror=()=>{showDelayScreen('upload');showToast('Could not read file');};
  reader.readAsText(file,'UTF-8');
}

function parseDelayCSV(text){
  const lines=text.split(/\r?\n/).filter(l=>l.trim().length>0);
  if(lines.length<2)throw new Error('File has no data rows');
  const delim=lines[0].includes('\t')?'\t':',';
  const headers=splitCSVLine(lines[0],delim).map(h=>h.replace(/^["']|["']$/g,'').trim().toLowerCase().replace(/[^a-z0-9]/g,''));
  const col={
    ts:   headers.findIndex(h=>['timestamp','time'].some(c=>h===c||h===('@'+c))),
    req:  headers.findIndex(h=>['ansrequesttime','ansrequesttime','requesttime'].includes(h)),
    res:  headers.findIndex(h=>['ansresponsetime','ansresponsetime','responsetime'].includes(h)),
    op:   headers.findIndex(h=>['applicablesmsgateway','applicablesmsgatewaykeyword','operator','gateway'].includes(h)),
  };
  if(col.req===-1)throw new Error('Column "ansRequestTime" not found');
  if(col.res===-1)throw new Error('Column "ansResponseTime" not found');
  if(col.op===-1)throw new Error('Column "applicableSmsGateway" not found');
  const rows=[];
  for(let i=1;i<lines.length;i++){
    const cells=splitCSVLine(lines[i],delim).map(c=>c.trim());
    rows.push({ts:col.ts!==-1?cells[col.ts]:'',request:cells[col.req]||'',response:cells[col.res]||'',operator:cells[col.op]||'(blank)'});
  }
  return rows;
}

function parseISODate(str){
  if(!str)return null;
  const d=new Date(str.replace(' ','T'));
  return isNaN(d.getTime())?null:d;
}

function parseTimestamp(str){
  if(!str)return null;
  const cleaned=str.replace(' @ ','T').replace(/\.\d{3}$/,'');
  let d=new Date(cleaned);
  if(!isNaN(d.getTime()))return d;
  d=new Date(str);
  return isNaN(d.getTime())?null:d;
}

function computeDelayData(rows){
  const operatorSet=new Set();
  let tsMin=null,tsMax=null;
  const pivot={},opTotals={},delayTotals={};
  let grand=0;
  for(const row of rows){
    const op=row.operator||'(blank)';
    const req=parseISODate(row.request);
    const res=parseISODate(row.response);
    operatorSet.add(op);
    const ts=row.ts?parseTimestamp(row.ts):null;
    if(ts){if(!tsMin||ts<tsMin)tsMin=ts;if(!tsMax||ts>tsMax)tsMax=ts;}
    if(!req||!res)continue;
    const delaySec=(res.getTime()-req.getTime())/1000;
    const delayInt=Math.round(delaySec);
    if(!tsMin||req<tsMin)tsMin=req;if(!tsMax||res>tsMax)tsMax=res;
    if(!pivot[delayInt])pivot[delayInt]={};
    pivot[delayInt][op]=(pivot[delayInt][op]||0)+1;
    opTotals[op]=(opTotals[op]||0)+1;
    delayTotals[delayInt]=(delayTotals[delayInt]||0)+1;
    grand++;
  }
  const allOps=[...operatorSet];
  const opArr=[...OP_ORDER.filter(o=>allOps.includes(o)),...allOps.filter(o=>!OP_ORDER.includes(o)).sort()];
  const delayKeys=Object.keys(pivot).map(Number).sort((a,b)=>a-b);
  return{pivot,opArr,opTotals,delayTotals,delayKeys,grand,tsMin,tsMax};
}

function renderDelayResults(data,fileName,rowCount){
  const{pivot,opArr,opTotals,delayTotals,delayKeys,grand,tsMin,tsMax}=data;

  document.getElementById('delay-resultsMeta').textContent=`${fileName} · ${rowCount.toLocaleString()} rows · ${grand.toLocaleString()} computed`;

  const tr=document.getElementById('delay-timeRange');
  if(tsMin&&tsMax){
    tr.innerHTML=`<span><strong>From</strong> ${formatDT(tsMin)}</span><span><strong>To</strong> ${formatDT(tsMax)}</span><span><strong>Duration</strong> ${formatDuration(tsMax-tsMin)}</span>`;
    document.getElementById('delay-fFrom').value=toDatetimeLocal(tsMin);
    document.getElementById('delay-fTo').value=toDatetimeLocal(tsMax);
    document.getElementById('delay-fromHint').textContent='from CSV';
    document.getElementById('delay-toHint').textContent='from CSV';
    delayState.timeRange={min:tsMin,max:tsMax};
  } else {
    tr.innerHTML=`<span><strong>Time range</strong> not detected — enter manually below</span>`;
  }

  // Pivot table
  const thead=document.querySelector('#delay-pivotTable thead');
  const tbody=document.querySelector('#delay-pivotTable tbody');
  const tfoot=document.querySelector('#delay-pivotTable tfoot');
  thead.innerHTML=`<tr><th>Time to get response (s)</th>${opArr.map(op=>`<th>${op}</th>`).join('')}<th>Total</th></tr>`;
  tbody.innerHTML=delayKeys.map(d=>{
    const isDelayed=d>=DELAY_THRESHOLD;
    return `<tr><td style="${isDelayed?'color:var(--warn);font-weight:600;':''}">${d}</td>${opArr.map(op=>{
      const v=pivot[d][op]||0;
      return `<td class="${v===0?'zero':''}${isDelayed&&v>0?' rc-td-delayed':''}">${v===0?'':v}</td>`;
    }).join('')}<td>${delayTotals[d]||''}</td></tr>`;
  }).join('');
  tfoot.innerHTML=`<tr class="grand-row"><td>Grand Total</td>${opArr.map(op=>`<td>${opTotals[op]||0}</td>`).join('')}<td>${grand}</td></tr>`;

  // Op cards
  const DELAY_PCT_THRESHOLD=30;
  const cards=document.getElementById('delay-opCards');
  const withTotal=[...opArr,null];
  cards.innerHTML=withTotal.map(op=>{
    if(op===null){
      const delayed=Object.entries(opTotals).reduce((s,[,v])=>s+v,0)-delayKeys.filter(d=>d<DELAY_THRESHOLD).reduce((s,d)=>s+(delayTotals[d]||0),0);
      const total=grand;
      const pct=total>0?Math.round(delayed/total*100):0;
      const isIssue=pct>=DELAY_PCT_THRESHOLD;
      return `<div class="op-card c-total${isIssue?' op-card--issue':''}">
        <div class="op-card__name">All Operators</div>
        <div class="op-card__total">${total.toLocaleString()}</div>
        <div class="op-card__delayed">${delayed>0?`<span class="${isIssue?'d-num-issue':'d-num'}">${delayed.toLocaleString()}</span> <span class="${isIssue?'d-pct-issue':'d-pct'}">delayed (${pct}%)</span>`:`<span class="d-none">No delays</span>`}</div>
        ${isIssue?`<div class="op-card__flag">⚠ Inform client</div>`:''}
      </div>`;
    }
    const total=opTotals[op]||0;
    const delayed=delayKeys.filter(d=>d>=DELAY_THRESHOLD).reduce((s,d)=>s+(pivot[d][op]||0),0);
    const pct=total>0?Math.round(delayed/total*100):0;
    const isIssue=pct>=DELAY_PCT_THRESHOLD;
    const cls=OP_CLASS[op]||'';
    return `<div class="op-card ${cls?'c-'+cls:''}${isIssue?' op-card--issue':''}">
      <div class="op-card__name">${op}</div>
      <div class="op-card__total">${total.toLocaleString()}</div>
      <div class="op-card__delayed">${delayed>0?`<span class="${isIssue?'d-num-issue':'d-num'}">${delayed.toLocaleString()}</span> <span class="${isIssue?'d-pct-issue':'d-pct'}">delayed (${pct}%)</span>`:`<span class="d-none">No delays</span>`}</div>
      ${isIssue?`<div class="op-card__flag">⚠ Inform client</div>`:''}
    </div>`;
  }).join('');
}

function formatDT(d){const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;}
function formatDuration(ms){const s=Math.round(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60);if(h>0)return`${h}h ${m%60}m`;if(m>0)return`${m}m ${s%60}s`;return`${s}s`;}
function formatCardDT(d){const p=(n,l=2)=>String(n).padStart(l,'0');return `${MONTHS[d.getMonth()]} ${p(d.getDate())}, ${d.getFullYear()} @ ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.000`;}

function generateDelayCard(){
  if(!delayState.data){showToast('No data loaded');return;}
  const{pivot,opArr,opTotals,delayTotals,delayKeys,grand}=delayState.data;
  const reportType=document.getElementById('delay-fReportType').value||'Delay Report';
  const reporter=document.getElementById('delay-fReporter').value||'—';
  const status=document.getElementById('delay-fStatus').value;
  const issueText=document.getElementById('delay-fIssue').value.trim();
  const fromVal=document.getElementById('delay-fFrom').value;
  const toVal=document.getElementById('delay-fTo').value;
  const fromStr=fromVal?formatCardDT(new Date(fromVal)):'—';
  const toStr=toVal?formatCardDT(new Date(toVal)):'—';
  const DELAY_PCT_THRESHOLD=30;

  // Build operator column headers with color tops
  const opClassMap={GrameenPhone:'rc-th-gp',Robi:'rc-th-robi',Banglalink:'rc-th-bl',Teletalk:'rc-th-tt'};
  let thCells=`<th style="text-align:left;">Time to get response (s)</th>`;
  opArr.forEach(op=>{thCells+=`<th class="${opClassMap[op]||'rc-th-blank'}">${op}</th>`;});
  thCells+=`<th class="rc-th-grand">Grand Total</th>`;

  let bodyHTML='';
  delayKeys.forEach(d=>{
    const isDelayed=d>=DELAY_THRESHOLD;
    let row=`<tr><td style="text-align:left;${isDelayed?'color:#B84E1A;font-weight:600;':''}">${d}</td>`;
    opArr.forEach(op=>{
      const v=pivot[d][op]||0;
      row+=`<td class="${v===0?'rc-td-zero':'rc-td-total'}${isDelayed&&v>0?' rc-td-delayed':''}">${v===0?'':v}</td>`;
    });
    row+=`<td class="rc-td-total">${delayTotals[d]||''}</td></tr>`;
    bodyHTML+=row;
  });

  let footHTML=`<td style="text-align:left">Grand Total</td>`;
  opArr.forEach(op=>{footHTML+=`<td>${(opTotals[op]||0).toLocaleString()}</td>`;});
  footHTML+=`<td>${grand.toLocaleString()}</td>`;

  // % Delayed row — always shown, even if 0%
  let delayedCount=0;
  let pctRow=`<td style="text-align:left;font-weight:700;">% Delayed</td>`;
  opArr.forEach(op=>{
    const total=opTotals[op]||0;
    const delayed=delayKeys.filter(d=>d>=DELAY_THRESHOLD).reduce((s,d)=>s+(pivot[d][op]||0),0);
    delayedCount+=delayed;
    const pct=total>0?Math.round(delayed/total*100):0;
    const isIssue=pct>=DELAY_PCT_THRESHOLD;
    pctRow+=`<td class="${isIssue?'rc-pct-issue':'rc-pct-ok'}">${pct}%</td>`;
  });
  const grandPct=grand>0?Math.round(delayedCount/grand*100):0;
  const grandIsIssue=grandPct>=DELAY_PCT_THRESHOLD;
  pctRow+=`<td class="${grandIsIssue?'rc-pct-issue':'rc-pct-ok'}">${grandPct}%</td>`;

  const statusHTML=status==='Normal'
    ?`<span class="rc-status-normal">Normal</span>`
    :`<span class="rc-status-issue">Issue</span>${issueText?` — <span class="rc-issue-text">${esc(issueText)}</span>`:''}`;

  document.getElementById('delay-reportCard').innerHTML=`
    <div class="rc-eyebrow">Infozillion Teletech BD · Service Assurance</div>
    <div class="rc-title">${esc(reportType)}</div>
    <div class="rc-time">${esc(fromStr)} &mdash; ${esc(toStr)}</div>
    <table class="rc-table">
      <thead><tr>${thCells}</tr></thead>
      <tbody>${bodyHTML}</tbody>
      <tfoot>
        <tr>${footHTML}</tr>
        <tr class="rc-pct-row">${pctRow}</tr>
      </tfoot>
    </table>
    <div class="rc-meta">
      <div class="rc-meta-line"><strong>Reporter:</strong> ${esc(reporter)}</div>
      <div class="rc-meta-line"><strong>Status:</strong> ${statusHTML}</div>
    </div>`;

  const preview=document.getElementById('delay-cardPreview');
  preview.style.display='block';
  setTimeout(()=>preview.scrollIntoView({behavior:'smooth',block:'nearest'}),50);
}

async function captureDelayCard(download){
  const card=document.getElementById('delay-reportCard');
  if(!card.innerHTML.trim()){showToast('Generate a card first');return;}
  showToast('Generating image…');
  const fullW=card.scrollWidth,fullH=card.scrollHeight;
  card.style.setProperty('width',fullW+'px','important');
  card.style.setProperty('height',fullH+'px','important');
  card.style.setProperty('overflow','visible','important');
  card.style.setProperty('max-width','none','important');
  await new Promise(r=>setTimeout(r,80));
  const w=card.offsetWidth,h=card.offsetHeight;
  const restore=()=>{card.style.removeProperty('width');card.style.removeProperty('height');card.style.removeProperty('overflow');card.style.removeProperty('max-width');};
  try{
    const canvas=await html2canvas(card,{backgroundColor:'#FFFFFF',scale:2.5,useCORS:true,logging:false,width:w,height:h,windowWidth:w+200,windowHeight:h+200,x:0,y:0,scrollX:0,scrollY:0});
    restore();
    if(download){
      const a=document.createElement('a');a.href=canvas.toDataURL('image/png');
      a.download=`delay_report_${formatFileDate(new Date())}.png`;a.click();
      showToast('Downloaded ✓');
    } else {
      canvas.toBlob(async blob=>{
        try{await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);showToast('Copied! Paste in WhatsApp ✓');}
        catch{const url=URL.createObjectURL(blob);window.open(url,'_blank');showToast('Opened in new tab');}
      },'image/png');
    }
  }catch(err){restore();showToast('Capture failed: '+err.message);}
}

function copyDelayTable({pivot,delayKeys,opArr,opTotals,delayTotals,grand}){
  const rows=[['Time to get response (s)',...opArr,'Grand Total'].join('\t')];
  for(const d of delayKeys){const cells=[d];for(const op of opArr)cells.push(pivot[d][op]||0);cells.push(delayTotals[d]||0);rows.push(cells.join('\t'));}
  const ft=['Grand Total'];for(const op of opArr)ft.push(opTotals[op]||0);ft.push(grand);rows.push(ft.join('\t'));
  navigator.clipboard.writeText(rows.join('\n')).then(()=>showToast('Table copied — paste into Excel')).catch(()=>showToast('Copy failed'));
}

function exportDelayCSV({pivot,delayKeys,opArr,opTotals,delayTotals,grand}){
  const rows=[['Time to get response (s)',...opArr,'Grand Total'].join(',')];
  for(const d of delayKeys){const cells=[d];for(const op of opArr)cells.push(pivot[d][op]||0);cells.push(delayTotals[d]||0);rows.push(cells.join(','));}
  const ft=['Grand Total'];for(const op of opArr)ft.push(opTotals[op]||0);ft.push(grand);rows.push(ft.join(','));
  const blob=new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`delay_report_${formatFileDate(new Date())}.csv`;a.click();
  showToast('CSV exported');
}

function resetDelay(){
  delayState={data:null,timeRange:{min:null,max:null}};
  document.getElementById('delay-cardPreview').style.display='none';
  document.getElementById('delay-reportCard').innerHTML='';
  initDelayDatetimes();
  document.getElementById('delay-fromHint').textContent='auto from CSV';
  document.getElementById('delay-toHint').textContent='auto from CSV';
  showDelayScreen('upload');
}

// Delay report card styles (inline for report card)
const rcStyles=`
.rc-eyebrow{font-size:.6rem;letter-spacing:.14em;text-transform:uppercase;color:#999;margin-bottom:4px;font-family:'DM Mono',monospace;}
.rc-title{font-family:'Instrument Serif',serif;font-size:1.5rem;font-weight:400;color:#1A1916;letter-spacing:-.01em;margin-bottom:4px;}
.rc-time{font-size:.72rem;color:#888;margin-bottom:22px;font-family:'DM Mono',monospace;}
.rc-table{border-collapse:collapse;width:100%;margin-bottom:20px;font-size:.78rem;font-family:'DM Mono',monospace;}
.rc-table thead tr:first-child th{background:#EEF0F5;padding:8px 14px;text-align:right;font-weight:600;color:#1A1916;border:1px solid #D0D4DE;white-space:nowrap;}
.rc-table thead tr:first-child th:first-child{text-align:left;}
.rc-th-gp{border-top:3px solid #0074B7!important}
.rc-th-robi{border-top:3px solid #C0392B!important}
.rc-th-bl{border-top:3px solid #D35400!important}
.rc-th-tt{border-top:3px solid #27AE60!important}
.rc-th-blank{border-top:3px solid #999!important}
.rc-table tbody tr:nth-child(odd) td{background:#FFFFFF}
.rc-table tbody tr:nth-child(even) td{background:#F9FAFB}
.rc-table tbody td{padding:7px 14px;border:1px solid #D0D4DE;text-align:right;color:#1A1916;}
.rc-table tbody td:first-child{text-align:left;font-weight:600;background:#EEF0F5!important;}
.rc-td-zero{color:#CCC!important}
.rc-td-delayed{color:#B84E1A!important;font-weight:600}
.rc-td-total{font-weight:600}
.rc-table tfoot td{background:#EEF0F5!important;padding:8px 14px;border:1px solid #C0C4CE;border-top:2px solid #A0A4AE;font-weight:700;color:#1A1916;text-align:right;}
.rc-table tfoot td:first-child{text-align:left;}
.rc-pct-row td{background:#FFFFFF!important;border-top:1px solid #D0D4DE!important;font-weight:700;}
.rc-pct-ok{color:#1A6B3C!important;}
.rc-pct-issue{color:#B84E1A!important;background:#FDF0E8!important;}
.rc-meta{margin-top:6px;}
.rc-meta-line{font-size:.78rem;line-height:1.9;color:#1A1916;font-family:'DM Mono',monospace;}
.rc-meta-line strong{font-weight:600}
.rc-status-normal{color:#1A6B3C;font-weight:600}
.rc-status-issue{color:#B84E1A;font-weight:600}
.rc-issue-text{color:#B84E1A}
`;
const styleTag=document.createElement('style');
styleTag.textContent=rcStyles;
document.head.appendChild(styleTag);

// ═══════════════════════════════════════════════════════════════════
// DRIVE BACKUP
// ═══════════════════════════════════════════════════════════════════
function buildFileName(errorType,ansType,fromDate,fromTime){
  if(!fromDate)return`${errorType}_${ansType}_unknown.csv`;
  const d=fromDate.replace(/-/g,'');
  const h=(fromTime||'00:00').split(':')[0].padStart(2,'0');
  return`${errorType}_${ansType}_${d}_${h}.csv`;
}

function downloadRenamedCSV(file,fileName){
  if(!file)return;
  const url=URL.createObjectURL(file);
  const a=document.createElement('a');
  a.href=url;a.download=fileName;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function downloadReport9(which){
  const file=data9[`${which}_file`];
  if(!file){showToast('No file uploaded');return;}
  const fromDate=document.getElementById('9xxx-from-date').value;
  const fromTime=document.getElementById('9xxx-from-time').value;
  downloadRenamedCSV(file,buildFileName('X9',which==='mno'?'M':'I',fromDate,fromTime));
}

function downloadReport1(which){
  const file=data1[`${which}_file`];
  if(!file){showToast('No file uploaded');return;}
  const fromDate=document.getElementById('1xxx-from-date').value;
  const fromTime=document.getElementById('1xxx-from-time').value;
  downloadRenamedCSV(file,buildFileName('X1',which==='mno'?'M':'I',fromDate,fromTime));
}

function refreshBackup(){
  const fromDate9=document.getElementById('9xxx-from-date').value;
  const fromTime9=document.getElementById('9xxx-from-time').value;
  const fromDate1=document.getElementById('1xxx-from-date').value;
  const fromTime1=document.getElementById('1xxx-from-time').value;
  const files=[
    {file:data9['mno_file'],  name:buildFileName('X9','M',fromDate9,fromTime9),label:'9xxx MNO'},
    {file:data9['iptsp_file'],name:buildFileName('X9','I',fromDate9,fromTime9),label:'9xxx IPTSP'},
    {file:data1['mno_file'],  name:buildFileName('X1','M',fromDate1,fromTime1),label:'1xxx MNO'},
    {file:data1['iptsp_file'],name:buildFileName('X1','I',fromDate1,fromTime1),label:'1xxx IPTSP'},
  ];
  const list=document.getElementById('save-file-list');
  list.innerHTML=files.map((f,i)=>`
    <div class="file-status-row">
      <div>
        <div class="file-status-name">${f.name}</div>
        <div class="file-status-label">${f.label} · ${f.file?'<span class="file-status-ready">Ready</span>':'Not uploaded'}</div>
      </div>
      ${f.file?`<button class="btn btn--outline btn--sm" onclick="${i<2?'downloadReport9':'downloadReport1'}('${i%2===0?'mno':'iptsp'}')">⬇</button>`:''}
    </div>`).join('');
}

function downloadAllFiles(){
  const fromDate9=document.getElementById('9xxx-from-date').value;
  const fromTime9=document.getElementById('9xxx-from-time').value;
  const fromDate1=document.getElementById('1xxx-from-date').value;
  const fromTime1=document.getElementById('1xxx-from-time').value;
  const files=[
    {file:data9['mno_file'],  name:buildFileName('X9','M',fromDate9,fromTime9)},
    {file:data9['iptsp_file'],name:buildFileName('X9','I',fromDate9,fromTime9)},
    {file:data1['mno_file'],  name:buildFileName('X1','M',fromDate1,fromTime1)},
    {file:data1['iptsp_file'],name:buildFileName('X1','I',fromDate1,fromTime1)},
  ];
  const available=files.filter(f=>f.file);
  if(available.length===0){showToast('No files uploaded yet');return;}
  available.forEach((f,i)=>setTimeout(()=>downloadRenamedCSV(f.file,f.name),i*400));
  showToast(`Downloading ${available.length} file(s)…`);
}

// ═══════════════════════════════════════════════════════════════════
// RESET ALL
// ═══════════════════════════════════════════════════════════════════
function resetAll(btn){
  if(!confirm('Reset all data? This will clear all uploaded files, form fields, and generated reports.'))return;

  // 9xxx
  ['mno','iptsp'].forEach(w=>{
    data9[w]=null;data9[`${w}_file`]=null;data9[`${w}_pivot`]=null;
    const s=document.getElementById(`status-9${w}`);if(s){s.textContent='';s.className='upload-status';}
    document.getElementById(`zone-9${w}`).classList.remove('loaded');
    document.getElementById(`pivot-9${w}`).innerHTML=`<div class="no-data">Upload ${w.toUpperCase()} CSV to generate pivot table</div>`;
    document.getElementById(`ss-9${w}`).classList.remove('show');
  });
  // 1xxx
  ['mno','iptsp'].forEach(w=>{
    data1[w]=null;data1[`${w}_file`]=null;data1[`${w}_pivot`]=null;
    const s=document.getElementById(`status-1${w}`);if(s){s.textContent='';s.className='upload-status';}
    document.getElementById(`zone-1${w}`).classList.remove('loaded');
    document.getElementById(`pivot-1${w}`).innerHTML=`<div class="no-data">Upload ${w.toUpperCase()} CSV to generate pivot table</div>`;
    document.getElementById(`ss-1${w}`).classList.remove('show');
  });
  // HTTP
  HTTP_SOURCES.forEach(s=>{
    HTTP_CODES.forEach(c=>{const el=document.getElementById(`hc-${s}-${c}`);if(el)el.value='';});
    const block=document.getElementById(`src-${s}`);
    if(block){block.classList.remove('has-data','open');}
    const totalEl=document.getElementById(`htotal-${s}`);
    if(totalEl){totalEl.textContent='—';}
  });
  const httpZone=document.getElementById('zone-http');if(httpZone)httpZone.classList.remove('loaded');
  const httpStatus=document.getElementById('status-http');if(httpStatus){httpStatus.textContent='';httpStatus.className='upload-status';}
  document.getElementById('http-output').style.display='none';
  // DLR
  dlrData={};
  document.getElementById('zone-dlr').classList.remove('loaded');
  const dlrStatus=document.getElementById('status-dlr');if(dlrStatus){dlrStatus.textContent='';dlrStatus.className='upload-status';}
  document.getElementById('dlr-counts-box').innerHTML='';
  document.getElementById('dlr-manual-box').innerHTML='';
  document.getElementById('ss-dlr').classList.remove('show');
  // Delay
  resetDelay();
  // Datetimes
  ['9xxx','1xxx','http','dlr'].forEach(p=>initDT(p));
  // Statuses
  ['9mno','9iptsp','1mno','1iptsp','http','dlr'].forEach(p=>{
    statusMap[p]='Normal';
    const bn=document.getElementById(`${p}-btn-n`);if(bn)bn.className='st-btn normal-on';
    const bi=document.getElementById(`${p}-btn-i`);if(bi)bi.className='st-btn';
    const box=document.getElementById(`${p}-issue-box`);if(box)box.style.display='none';
    const rep=document.getElementById(`${p}-reporter`);if(rep)rep.value='Rizvi';
  });
  // File inputs
  document.querySelectorAll('input[type=file]').forEach(f=>{f.value='';});
  // Backup
  const list=document.getElementById('save-file-list');if(list)list.innerHTML='';

  const orig=btn.textContent;btn.textContent='Done ✓';
  setTimeout(()=>{btn.textContent=orig;},2000);
}

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{
  ['9xxx','1xxx','http','dlr'].forEach(p=>initDT(p));
  buildHTTPSources();
  refreshHTTP();
  initDelay();
});

/* ── WA Preview Modal ─────────────────────────── */
function showWaModal(text) {
  const overlay = document.getElementById('wa-modal-overlay');
  const pre = document.getElementById('wa-modal-content');
  if (!overlay || !pre) return;
  pre.textContent = text;
  overlay.style.display = 'flex';
}
function closeWaModal() {
  const o = document.getElementById('wa-modal-overlay');
  if (o) o.style.display = 'none';
}
function copyFromModal() {
  const pre = document.getElementById('wa-modal-content');
  const btn = document.getElementById('wa-modal-copy-btn');
  if (!pre) return;
  navigator.clipboard.writeText(pre.textContent).then(() => {
    if (btn) { btn.textContent = 'Copied ✓'; btn.style.background = '#1A6B3C'; }
    setTimeout(() => { if(btn){btn.textContent='Copy to Clipboard';btn.style.background='#1A1916';} }, 2000);
  });
}
document.addEventListener('click', e => { const o=document.getElementById('wa-modal-overlay'); if(e.target===o)closeWaModal(); });
document.addEventListener('keydown', e => { if(e.key==='Escape')closeWaModal(); });
