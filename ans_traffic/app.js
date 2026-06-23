/* ─────────────────────────────────────────────────────────
   Kibana Report Processor — app.js
   Infozillion Teletech BD Ltd · Service Assurance
   ───────────────────────────────────────────────────────── */

let allResults = [];

/* ── Yesterday: DD - Mon - YY ── */
function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const months = ["Jan","Feb","Mar","Apr","May","Jun",
                  "Jul","Aug","Sep","Oct","Nov","Dec"];
  const day = String(d.getDate()).padStart(2, "0");
  const yr  = String(d.getFullYear()).slice(2);
  return `${day} - ${months[d.getMonth()]} - ${yr}`;
}

/* ── Number formatter ── */
function fmt(n) { return Number(n).toLocaleString(); }

/* ── Toast ── */
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

/* ── Clear all inputs ── */
function clearAll() {
  document.querySelectorAll(".count-input").forEach(el => el.value = "");
  document.getElementById("results-section").classList.remove("visible");
  allResults = [];
}

/* ── Generate Report ── */
function generateReport() {
  const date = getYesterday();
  allResults = [];

  document.querySelectorAll(".input-row").forEach(row => {
    const op      = row.dataset.op;
    const type    = row.dataset.type;
    const success = parseInt(row.querySelector(".success-input").value) || 0;
    const error   = parseInt(row.querySelector(".error-input").value)   || 0;
    const total   = success + error;
    allResults.push({ date, ans: op, type, success, error, total });
  });

  renderTable();

  const section = document.getElementById("results-section");
  section.classList.add("visible");
  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ── Render results table ── */
function renderTable() {
  const tbody = document.getElementById("result-tbody");
  tbody.innerHTML = "";

  let totalSuccess = 0, totalError = 0;
  let lastType = null;

  for (const row of allResults) {
    if (!lastType && row.type === "MNO") {
      const div = document.createElement("tr");
      div.className = "divider-row";
      div.innerHTML = `<td colspan="5">— MNO Operators —</td>`;
      tbody.appendChild(div);
    }
    if (lastType === "MNO" && row.type === "IPTSP") {
      const div = document.createElement("tr");
      div.className = "divider-row";
      div.innerHTML = `<td colspan="5">— IPTSP Operators —</td>`;
      tbody.appendChild(div);
    }
    lastType = row.type;

    totalSuccess += row.success;
    totalError   += row.error;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="td-date">${row.date}</td>
      <td class="td-ans">
        ${row.ans}
        <span class="td-badge ${row.type.toLowerCase()}">${row.type}</span>
      </td>
      <td class="td-num td-error">${fmt(row.error)}</td>
      <td class="td-num td-success">${fmt(row.success)}</td>
      <td class="td-num td-total">${fmt(row.total)}</td>
    `;
    tbody.appendChild(tr);
  }

  document.getElementById("stat-success").textContent = fmt(totalSuccess);
  document.getElementById("stat-error").textContent   = fmt(totalError);
  document.getElementById("stat-total").textContent   = fmt(totalSuccess + totalError);
  document.getElementById("results-meta").textContent =
    `${allResults.length} operators · ${getYesterday()}`;
}

/* ── Copy TSV for Google Sheets ── */
function copyForSheets() {
  const tsv = allResults
    .map(r => [r.date, r.ans, r.error, r.success, r.total].join("\t"))
    .join("\n");
  navigator.clipboard.writeText(tsv)
    .then(() => showToast("✓ Copied! Paste into Google Sheets"))
    .catch(() => showToast("Copy failed — please select manually"));
}

/* ── Download CSV ── */
function downloadCSV() {
  const header = "Date,ANS,Error,Success,Total";
  const rows   = allResults
    .map(r => [r.date, r.ans, r.error, r.success, r.total].join(","))
    .join("\n");
  const blob = new Blob([header + "\n" + rows], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `kibana-report-${getYesterday().replace(/ - /g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("✓ CSV downloaded");
}

/* ── Init ── */
document.getElementById("date-display").textContent = getYesterday();

/* ── Tab key: move to next input ── */
document.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const inputs = Array.from(document.querySelectorAll(".count-input"));
    const idx    = inputs.indexOf(document.activeElement);
    if (idx >= 0 && idx < inputs.length - 1) {
      inputs[idx + 1].focus();
      e.preventDefault();
    } else if (idx === inputs.length - 1) {
      generateReport();
    }
  }
});
