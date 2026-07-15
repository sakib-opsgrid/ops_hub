function addRow(containerId, inputClass){
  const container = document.getElementById(containerId);
  const div = document.createElement('div');
  div.className = 'ip-row';
  div.innerHTML = `<input type="text" class="${inputClass}" placeholder="Enter IP address"><button class="row-remove" onclick="removeRow(this)">✕</button>`;
  container.appendChild(div);
}

function removeRow(btn){
  const row = btn.parentElement;
  const container = row.parentElement;
  if(container.children.length > 1){
    row.remove();
  } else {
    row.querySelector('input').value = '';
  }
}

function getValues(inputClass){
  return Array.from(document.querySelectorAll('.' + inputClass))
    .map(i => i.value.trim())
    .filter(v => v.length > 0);
}

async function checkActivateLocations(){
  const ips = [...new Set(getValues('activate-ip-input'))];
  const statusEl = document.getElementById('checkStatus');
  const btn = document.getElementById('checkBtn');
  statusEl.className = 'status';

  if(ips.length === 0){
    statusEl.textContent = 'Enter at least one IP address first.';
    statusEl.className = 'status error';
    return;
  }

  btn.disabled = true;
  statusEl.textContent = `Looking up ${ips.length} IP(s)...`;

  const captureArea = document.getElementById('captureArea');
  captureArea.innerHTML = '';
  let errors = [];

  for(const ip of ips){
    try{
      const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`);
      const data = await res.json();
      if(!data.success) throw new Error(data.message || 'Lookup failed');

      const isBD = (data.country_code || '').toUpperCase() === 'BD';
      const card = document.createElement('div');
      card.className = 'result-item-card';
      card.innerHTML = `
        <div class="result-head">
          <div class="result-ip">${data.ip}</div>
          <div class="result-flag">${data.flag && data.flag.emoji ? data.flag.emoji : ''}</div>
        </div>
        <div class="result-grid">
          <div class="result-item"><div class="k">Country</div><div class="v">${data.country || '—'}</div></div>
          <div class="result-item"><div class="k">Region</div><div class="v">${data.region || '—'}</div></div>
          <div class="result-item"><div class="k">City</div><div class="v">${data.city || '—'}</div></div>
          <div class="result-item"><div class="k">ISP / Org</div><div class="v">${(data.connection && data.connection.isp) || data.isp || '—'}</div></div>
        </div>
        <span class="bd-badge ${isBD ? 'bd-yes' : 'bd-no'}">${isBD ? '✓ Bangladeshi IP' : '✕ Not a Bangladeshi IP'}</span>
      `;
      captureArea.appendChild(card);
    }catch(err){
      errors.push(ip);
      const card = document.createElement('div');
      card.className = 'result-item-card';
      card.innerHTML = `<div class="result-head"><div class="result-ip">${ip}</div></div><span class="bd-badge bd-no">Lookup failed</span>`;
      captureArea.appendChild(card);
    }
  }

  document.getElementById('activateResults').classList.add('show');
  statusEl.textContent = errors.length
    ? `Done. Could not resolve: ${errors.join(', ')}`
    : `Done. ${ips.length} IP(s) checked.`;
  statusEl.className = errors.length ? 'status error' : 'status';
  btn.disabled = false;
}

function downloadImage(){
  const el = document.getElementById('captureArea');
  html2canvas(el, {backgroundColor:'#FBFAF8', scale:2}).then(canvas => {
    const link = document.createElement('a');
    link.download = `ip-location-check.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
}

function generateOutputs(){
  const sender = document.getElementById('senderName').value.trim() || '—';
  const client = document.getElementById('clientName').value.trim() || '—';
  const vpnType = document.getElementById('vpnType').value;

  const activateIps = [...new Set(getValues('activate-ip-input'))];
  const deactivateIps = [...new Set(getValues('deactivate-ip-input'))];

  if(activateIps.length === 0 && deactivateIps.length === 0){
    alert('Add at least one IP in the Activate or Deactivate section.');
    return;
  }

  let subjectAction = '';
  if(activateIps.length && deactivateIps.length) subjectAction = 'activation/deactivation';
  else if(activateIps.length) subjectAction = 'activation';
  else subjectAction = 'deactivation';
  const subject = `IP ${subjectAction} for ${client}`;

  let emailSections = '';
  if(activateIps.length){
    emailSections += `Please activate the following IP address:\n\n${activateIps.map(ip => `* ${ip}`).join('\n')}\n\n`;
  }
  if(deactivateIps.length){
    emailSections += `Please deactivate the following IP address:\n\n${deactivateIps.map(ip => `* ${ip}`).join('\n')}\n\n`;
  }

  const emailBody =
`Dear Team, 

In Production
Client Name: ${client}
VPN/Non-VPN: ${vpnType}

${emailSections}Regards,

${sender}
Senior Engineer, Service Assurance
Infozillion Teletech BD Ltd.  

Hosaf High Tower, 12th Floor,
9 Mohakhali C/A, Dhaka-1212, Bangladesh`;

  let waSections = '';
  if(activateIps.length){
    waSections += `Please activate the following IP address:\n\n${activateIps.map(ip => `\`${ip}\``).join('\n')}\n\n`;
  }
  if(deactivateIps.length){
    waSections += `Please deactivate the following IP address:\n\n${deactivateIps.map(ip => `\`${ip}\``).join('\n')}\n\n`;
  }

  const waBody =
`Dear Team,

In Production
Client Name:  *${client}*
VPN/Non-VPN: ${vpnType}

${waSections}FYI, the request is sent to you through email \`Subject: Re: ${subject}\``;

  document.getElementById('emailSubject').textContent = subject;
  document.getElementById('emailBody').textContent = emailBody;
  document.getElementById('waBody').textContent = waBody;
  document.getElementById('outputCard').classList.remove('hidden');
  document.getElementById('outputCard').scrollIntoView({behavior:'smooth', block:'start'});
}

function copyText(elId, btn){
  const text = document.getElementById(elId).textContent;
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copied ✓';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('copied');
    }, 1500);
  });
}

function resetTool(){
  // Reset activate rows to a single empty field
  const activateRows = document.getElementById('activateRows');
  activateRows.innerHTML = `<div class="ip-row"><input type="text" class="activate-ip-input" placeholder="e.g. 123.176.58.62"><button class="row-remove" onclick="removeRow(this)">✕</button></div>`;

  // Reset deactivate rows to a single empty field
  const deactivateRows = document.getElementById('deactivateRows');
  deactivateRows.innerHTML = `<div class="ip-row"><input type="text" class="deactivate-ip-input" placeholder="e.g. 161.248.247.211"><button class="row-remove" onclick="removeRow(this)">✕</button></div>`;

  // Clear request details
  document.getElementById('senderName').value = '';
  document.getElementById('clientName').value = '';
  document.getElementById('vpnType').value = 'NON-VPN';

  // Hide and clear location results
  document.getElementById('activateResults').classList.remove('show');
  document.getElementById('captureArea').innerHTML = '';
  document.getElementById('checkStatus').textContent = '';
  document.getElementById('checkStatus').className = 'status';

  // Hide outputs
  document.getElementById('outputCard').classList.add('hidden');
  document.getElementById('emailSubject').textContent = '';
  document.getElementById('emailBody').textContent = '';
  document.getElementById('waBody').textContent = '';

  window.scrollTo({top: 0, behavior: 'smooth'});
}
