Ukraine OSINT Aggregator + Gemini Analysis

Overview
- Gathers recent reporting on the Ukraine war from multiple free sources by date range and keyword, deduplicates, and synthesizes a structured OSINT report using Gemini.
- Stack: Node.js (Express) API + React (Vite + Tailwind) UI. Runs locally or can be deployed.
- Secrets are loaded from environment variables. Do not commit your API keys.

Key Features
- Multi‑source aggregation: GDELT, The Guardian, Currents API, Newsdata, GNews, plus curated RSS (Kyiv Independent, BBC, DW, ISW, etc.).
- Filters: date range, keyword, source toggles, language.
- Dedup + stats: URL canonicalization and per‑source timing/counts.
- Enrich Full Text (Top N): fetches article pages and extracts the main text (Readability) to produce higher‑quality excerpts for analysis.
- Gemini analysis: structured OSINT report (Executive Summary, Key Events, Timeline, Thematic, Claims/Corroboration, Outliers/Disinfo, Assessment/Confidence, Gaps, Citations). Renders as Markdown with a TOC.
- Exports: Markdown, HTML, Print to PDF, DOCX, JSON, CSV (all articles and analyzed subset).
- Polished UI: dark neon theme, quick keyword presets, sticky actions bar, collapsible Advanced filters, sticky TOC, per‑article favicons, skeleton loaders, toasts, mobile‑friendly layout, floating back‑to‑top, keyboard shortcuts.

Keyboard Shortcuts
- f: Fetch articles
- a: Analyze
- /: Focus keyword
- r: Reset all
- c: Clear output
- ?: Show shortcuts help
- After analysis: m (.md), d (.docx), h (HTML), p (Print), j (JSON)

Repository Structure
- server/ — Express API, connectors (GDELT/Guardian/Currents/Newsdata/GNews/RSS), Gemini analysis, extraction service
- web/ — React (Vite) + Tailwind UI

Requirements
- Node.js 20+ recommended (18+ should work)
- npm (or pnpm)

Environment Variables (server/.env)
- HOST=127.0.0.1
- PORT=3001
- GEMINI_API_KEY=your_gemini_key
- GUARDIAN_API_KEY=your_guardian_key (optional)
- CURRENTS_API_KEY=your_currents_key (optional)
- NEWSDATA_API_KEY=your_newsdata_key (optional)
- GNEWS_API_KEY=your_gnews_key (optional)

Do not commit secrets. This repo contains a .gitignore that excludes `server/.env` and `web/.env`.

Local Development
1) Configure API keys
- Copy `server/.env.example` to `server/.env` and fill in your keys.

2) Start the API (terminal 1)
- `cd server`
- `npm install`
- `npm run start`
- Health: http://127.0.0.1:3001/api/health

3) Start the Web UI (terminal 2)
- `cd web`
- `npm install`
- `npm run dev`
- Open the URL printed by Vite (usually http://localhost:5173). During dev, Vite proxies `/api` to the server.

Common Tasks
- Fetch: choose dates/keyword/sources → Fetch
- Enrich: click “Enrich Full Text (Top N)” to extract main text for better analysis (N = Docs to Analyze)
- Analyze: choose a model (default: gemini‑2.5‑flash) → Analyze; read the Markdown report with inline [#n] citations
- Export: use buttons in the Analysis panel (Markdown, HTML, Print to PDF, DOCX, JSON). CSV export buttons are in the filters panel.

Production Build (optional)
- Build web assets: `cd web && npm run build` → outputs `web/dist/`
- Serve the UI from a static host (e.g., Nginx, S3, Netlify) and run the API on a server (Render/Heroku/VPS).
- Configure a reverse proxy so the UI’s domain routes `/api` to the server (or update the UI to use an absolute API URL).

Security & Compliance
- This tool stores only metadata, short excerpts, and links to original articles. Full‑text extraction is for local analysis; always respect each site’s Terms of Service.
- Attribution: the report includes citations that map to the analyzed links.

Push This Project to GitHub (ShabalalaWATP/UkraineOSINT)
1) Create the repo on GitHub (empty, no README):
- https://github.com/new → owner: `ShabalalaWATP`, name: `UkraineOSINT`

2) Initialize and push from the project root:
- `git init`
- `git add -A`
- `git commit -m "Initial commit: Ukraine OSINT Aggregator"`
- `git branch -M main`
- Add remote (choose HTTPS or SSH):
  - HTTPS: `git remote add origin https://github.com/ShabalalaWATP/UkraineOSINT.git`
  - SSH:   `git remote add origin git@github.com:ShabalalaWATP/UkraineOSINT.git`
- `git push -u origin main`

Important: ensure `server/.env` is not staged. The included `.gitignore` already ignores it.

Troubleshooting
- Few or no articles: narrow the date range; some APIs are rate‑limited and paginated.
- Analysis fails: ensure `GEMINI_API_KEY` is set; try a smaller “Docs to Analyze”.
- Slow fetches: start with Guardian + RSS + GNews; GDELT can be slower/noisier.
- Ports in use: change `HOST`/`PORT` in `server/.env`, then restart.

Credits
- Sources: GDELT, The Guardian, CurrentsAPI, Newsdata.io, GNews, and curated RSS feeds (Kyiv Independent, BBC, DW, ISW).
- Readability extraction: @mozilla/readability.

Created by Alex Orr — GitHub @ShabalalaWATP

Branding (optional)
- You can add a Ukrainian badge image to the header.
- Save your image as `web/public/Ukraine.jpeg` (Vite serves files from `web/public` at `/`). If the `public` folder doesn't exist, create it.
- The app will attempt `/Ukraine.jpeg` first, then `/Ukraine.JPEG` as a fallback. If neither exists, it hides the image automatically.
- The image is auto‑sized (28px tall) and keeps aspect ratio with a subtle neon glow.
