# OpsHub · Service Assurance
**Infozillion Teletech Bd Ltd · Built by Najmaz Sakib**

Version: v1.0.0

A unified launcher hub for all Service Assurance operational tools. One link — four tools.

---

## Folder Structure

```
ops-hub/
├── index.html            ← Hub launcher (this is the main page)
├── README.md             ← This file
├── daily_report/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── morning_shift/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── mnp_status/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── ans_traffic/
    ├── index.html
    ├── style.css
    └── app.js
```

---

## Tools Included

| Tool | Version | Purpose |
|------|---------|---------|
| Daily Shift Report | v2.9.0 | ELK CSV → 9xxx/1xxx/HTTP/DLR/Delay pivot reports |
| Morning Shift Report | v2.8.0 | Shift handover report with Google Sheets sync |
| MNP Status Reporter | — | Nagios raw output → WhatsApp dashboard |
| ANS Traffic Report | — | Kibana document counts → Google Sheets format |

---

## Deploy on GitHub Pages

1. Create a new GitHub repository (e.g. `ops-hub`) — set to **Public**
2. Upload the **entire folder contents** (index.html + 4 subfolders) to the repo root
3. Go to **Settings → Pages**
4. Source: **Deploy from a branch** → Branch: `main` → Folder: `/ (root)` → **Save**
5. Live at:

```
https://<your-username>.github.io/ops-hub/
```

> Share this single URL with your team. Everyone accesses all 4 tools from one link.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Open Daily Shift Report |
| `2` | Open Morning Shift Report |
| `3` | Open MNP Status Reporter |
| `4` | Open ANS Traffic Report |
| `Esc` | Back to Dashboard |

---

*© 2026 Najmaz Sakib · Infozillion Teletech Bd Ltd — Service Assurance*
