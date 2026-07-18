# OpsHub · Service Assurance
### Infozillion Teletech Bd Ltd — Built by Najmaz Sakib

> A unified internal web application that consolidates all Service Assurance operational tools into a single, sidebar-navigated interface. One link. Seven tools. Zero friction.

---

## Overview

OpsHub is a premium single-page hub built for the Service Assurance team at Infozillion Teletech Bd Ltd. It replaces the need to maintain and share multiple separate tool links — everything is accessible from one URL, with a consistent professional interface across all tools.

**Version:** v3.0.0  
**Protocol:** Works locally via `file://` and remotely via GitHub Pages  
**Dependencies:** None — pure HTML, CSS, and JavaScript. No build step required.

---

## Folder Structure

```
ops_hub/
├── index.html                  ← Hub launcher (main entry point)
├── README.md                   ← This file
│
├── daily_report/               ← Daily Shift Report v2.9.0
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── morning_shift/              ← Morning Shift Report v2.8.0
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── mnp_status/                 ← MNP Status Report v1.6
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── cp_mno_json/                ← ANS Msg JSON v2.4
│   └── index.html
│
├── ip_whitelist/               ← IP Whitelist Request v1.6.0
│   ├── index.html
│   ├── style.css
│   └── script.js
│
├── support_resolver/           ← A2P Support Resolver v1.7
│   └── index.html
│
└── ans_traffic/                ← ANS Traffic Report v2.4
    ├── index.html
    ├── style.css
    └── app.js
```

---

## Tools

| # | Tool | Version | Purpose |
|---|------|---------|---------|
| 1 | **Daily Shift Report** | v2.9.0 | Parses ELK CSV exports into pivot-table reports with auto-status detection. Generates WhatsApp-ready cards for 9xxx, 1xxx, 4xx/5xx HTTP, DLR, and Delay errors. Includes Drive Backup tab. |
| 2 | **Morning Shift Report** | v2.8.0 | Structured morning handover report with Google Sheets sync, auto-save, report history, and WhatsApp preview modal. |
| 3 | **MNP Status Report** | v1.6 | Parses raw Nagios output into a structured infrastructure dashboard. Critical items auto-sort to top. Exports WhatsApp-ready reports. |
| 4 | **ANS Msg JSON** | v2.4 | Converts A2P Trans MNO or IPTSP raw ELK logs into ANS message request JSON. Syntax highlighting and clipboard copy. Works for both MNO and IPTSP indexes. |
| 5 | **IP Whitelist Request** | v1.6.0 | Handles IP activation/deactivation workflows. Bulk geolocation via ipwho.is, screenshot capture, and auto-generated email and WhatsApp notifications. |
| 6 | **A2P Support Resolver** | v1.7 | Matches client error codes and queries against an internal knowledge base. Generates AI-powered professional replies and email drafts. |
| 7 | **ANS Traffic Report** | v2.4 | Enter Kibana document counts to generate MNO and IPTSP CDR daily traffic reports in Google Sheets-ready format. |

---

## Hub Features

### Dashboard
- **Stats bar** — live date, current time, Day/Night shift indicator, and last-used tool tracking
- **Tool cards** — color-coded by tool, with version badge, last-used timestamp, feature pills, and keyboard shortcut hint
- **Card hover** — subtle color wash matching each tool's accent
- **Search** — filter tools by name or feature in real time (`/` to focus)
- **Rotating quotes** — professional quote on every load, click to refresh

### Navigation
- **Sidebar** — collapsible sub-items for Daily Shift Report (9xxx, 1xxx, 4xx/5xx, DLR, Delay) and A2P Support Resolver tabs
- **Breadcrumb** — always shows current location (OpsHub › Tool Name)
- **Keyboard shortcuts** — press `?` to view all shortcuts

### Tool Viewer
- **Unified header hide** — each tool's own header is instantly hidden when loaded inside the hub (no flicker), using `window.self !== window.top` detection
- **Skeleton loading** — animated placeholder while tool loads
- **Reset button** — in the viewer bar, reloads the tool to a clean state
- **Tab switching** — sidebar sub-items jump directly to specific tabs inside tools

### Visual
- **Typography** — DM Sans · DM Mono · Instrument Serif
- **Color palette** — warm off-white (`#F5F4F0`) background, white surfaces, `#1A1916` dark text
- **Tool accents** — each tool has a unique color identity maintained across sidebar, cards, and viewer

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Open Daily Shift Report |
| `2` | Open Morning Shift Report |
| `3` | Open MNP Status Report |
| `4` | Open ANS Msg JSON |
| `5` | Open IP Whitelist Request |
| `6` | Open A2P Support Resolver |
| `7` | Open ANS Traffic Report |
| `Esc` | Return to Dashboard |
| `/` | Focus search bar |
| `?` | Show keyboard shortcuts modal |

---

## Deployment

### Local (file://)
Open `ops_hub/index.html` directly in any modern browser. All features work without a server.

### GitHub Pages
1. Create a new **public** GitHub repository (e.g. `ops-hub`)
2. Upload the entire `ops_hub/` folder contents to the repository root
3. Go to **Settings → Pages → Deploy from branch → main → / (root) → Save**
4. Share the single URL:

```
https://<your-username>.github.io/ops-hub/
```

---

## Technical Notes

- **No build step** — plain HTML/CSS/JS, no npm, no bundler
- **No external dependencies** — Google Fonts loaded via CDN (optional, gracefully degrades)
- **iframe-based tool loading** — each tool runs in its own iframe; the hub communicates via direct `contentWindow` DOM access
- **Header hide mechanism** — tools detect `window.self !== window.top` at parse time and apply `.in-hub` class to `<html>`, hiding their own header via CSS before first paint
- **Reset** — reloads the tool iframe (`iframe.src = ''` then reassign), clearing all state reliably on both `file://` and `http://`
- **Last used tracking** — stored in `localStorage` with key prefix `opshub_lu_`

---

## Credits

Designed and developed by **Najmaz Sakib**  
Senior Engineer, Service Assurance  
Infozillion Teletech Bd Ltd

© 2026 Najmaz Sakib · All rights reserved
