Ukraine OSINT Aggregator + Gemini Analysis

Live Site
- https://osint-ukraine-app-2025.web.app/
- 
<img width="1909" height="857" alt="image" src="https://github.com/user-attachments/assets/d3358589-d7dc-4e55-9ca5-f75587755be5" />
<img width="1909" height="859" alt="image" src="https://github.com/user-attachments/assets/d2350c2a-25e3-4323-81fc-dac871410d8f" />
<img width="1908" height="917" alt="image" src="https://github.com/user-attachments/assets/92c3d88f-c42a-40dc-825b-5db47d4476fa" />


Overview
- Aggregates Ukraine war reporting by date range and keyword from multiple sources, deduplicates, and synthesizes a structured OSINT report with inline citations using Gemini.
- Stack: Node.js (Express) API + React (Vite + Tailwind) UI. Runs locally or in the cloud (free) via Firebase Hosting (frontend) + Render (backend).
- Secrets are environment variables. Never commit API keys.

Key Features
- Multi‑source aggregation: GDELT, The Guardian, Currents API, Newsdata, GNews, plus curated RSS (Kyiv Independent, BBC, DW, ISW, etc.).
- Filters: date range, keyword, source toggles, language; dedup + per‑source stats.
- Enrich Full Text (Top N): fetch & extract the main text for better analysis.
- Gemini analysis: Executive Summary, Key Events, Timeline, Thematic Analysis, Claims & Corroboration (Evidence badges, Sources/Outlets counts, UK MI probability yardstick), Outliers/Disinfo, Assessment/Confidence, Gaps, Citations.
- Markdown renderer: Heading normalization (e.g., “1) …” → “## …”), clickable citations [#n] → Sources, sticky TOC.
- Timeline: UK‑date labels and histogram of articles/day.
- Exports: Markdown, HTML, Print to PDF, DOCX, JSON, CSV (all articles / analyzed subset).
- UX: Dark neon theme, keyboard shortcuts, toasts, state persistence + shareable URL, inline “Saved!” feedback, mobile‑friendly.

Keyboard Shortcuts
- f: Fetch articles
- a: Analyze
- /: Focus keyword
- r: Reset all
- c: Clear output
- u: Copy share link
- ?: Show shortcuts help
- After analysis: m (.md), d (.docx), h (HTML), p (Print), j (JSON)

Repository Structure
- `server/` — Express API, source connectors, Gemini analysis, extractor
- `web/` — React (Vite) + Tailwind UI

Requirements
- Node.js 20+
- npm

Security Highlights
- API keys only on the server (Render env vars). Frontend uses `VITE_API_BASE` and never ships secrets.
- CORS locked to Firebase Hosting origins in production.
- `/api/extract` SSRF guard: http/https only, blocks private IPs, safe redirects, size/timeouts.
- Optional domain quality gates: `ALLOWED_DOMAINS` or `BLOCKED_DOMAINS` to filter low‑credibility sources.

Local Development
1) Configure API keys
- Copy `server/.env.example` → `server/.env` and fill keys:
  - `HOST=127.0.0.1`
  - `PORT=55001` (matches Vite dev proxy by default)
  - `GEMINI_API_KEY=...`
  - Optional: `GUARDIAN_API_KEY`, `CURRENTS_API_KEY`, `GNEWS_API_KEY`, `NEWSDATA_API_KEY`

2) Start the API (terminal 1)
- `cd server`
- `npm install`
- `npm start`
- Health: `http://127.0.0.1:55001/api/health`

3) Start the Web UI (terminal 2)
- `cd web`
- `npm install`
- `npm run start` (alias for dev)
- Open the Vite URL (usually `http://localhost:5173`). Dev proxy forwards `/api` → `http://127.0.0.1:55001`.

Alternative (dev against cloud API)
- Set `VITE_API_BASE` to your Render URL, then run dev:
  - Windows PowerShell: `$env:VITE_API_BASE="https://<your-render-service>.onrender.com"; npm run dev`
  - macOS/Linux: `VITE_API_BASE=https://<your-render-service>.onrender.com npm run dev`

Cloud Deployment (Free)
Frontend: Firebase Hosting
1) Prereqs: `npm i -g firebase-tools` and `firebase login`
2) Build with API base:
- `cd web`
- `VITE_API_BASE=https://<your-render-service>.onrender.com npm run build`
3) Deploy:
- `firebase deploy --only hosting` (uses `web/firebase.json`)

Backend: Render (Web Service)
1) New Web Service → connect GitHub repo → Root Directory: `server`
2) Runtime: Node 20+ | Build: `npm install` | Start: `node src/server.js`
3) Environment:
- `HOST=0.0.0.0`
- `GEMINI_API_KEY=...` (+ optional Guardian/Currents/GNews/Newsdata)
- Optional allow/block:
  - `ALLOWED_DOMAINS=bbc.co.uk,bbc.com,dw.com,kyivindependent.com,understandingwar.org,reuters.com,apnews.com,theguardian.com`
  - `BLOCKED_DOMAINS=zerohedge.com,freerepublic.com` (use either allowlist or blocklist)

CI/CD (Auto‑deploy)
- Backend (Render): enable auto‑deploy on push to `main` for the `server/` service.
- Frontend (GitHub Actions → Firebase Hosting):
  - Workflow: `.github/workflows/deploy-web.yml` (included)
  - GitHub Secrets:
    - `VITE_API_BASE` = `https://<your-render-service>.onrender.com`
    - `FIREBASE_SERVICE_ACCOUNT` = JSON for a service account with Firebase Hosting Admin role (project: e.g., `osint-ukraine-app-2025`).
  - Push changes under `web/**` → Action builds and deploys to Hosting (live).

Running in Production (manual)
- Build UI locally: `cd web && VITE_API_BASE=<api-url> npm run build`
- Deploy UI: `firebase deploy --only hosting`
- Render redeploys server automatically on push, or click “Manual Deploy”.

Screenshots
- Executive Summary & TOC — [add screenshot here]
- Timeline (articles/day) — [add screenshot here]
- Claims & Corroboration (evidence badges) — [add screenshot here]
- Exports (Markdown/HTML/DOCX/CSV) — [add screenshot here]

Troubleshooting
- Raw Markdown visible on site: hard refresh (Ctrl+F5). The app normalizes headings like `1) Executive Summary` → proper Markdown.
- Timeout on Analyze: client timeout is 5 minutes; server timeouts increased. Try fewer docs or a faster model; “Enrich Full Text” improves quality.
- CORS “Not allowed”: confirm Hosting URL matches the allowlist in `server/src/server.js`.
- No analysis: ensure `GEMINI_API_KEY` is set on Render.
- Unwanted sources: set `ALLOWED_DOMAINS` or `BLOCKED_DOMAINS` in Render environment.

Credits
- Sources: GDELT, The Guardian, CurrentsAPI, Newsdata.io, GNews, curated RSS (Kyiv Independent, BBC, DW, ISW).
- Readability extraction: @mozilla/readability.

Created by Alex Orr — GitHub @ShabalalaWATP

