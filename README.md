Ukraine OSINT Aggregator + Gemini Analysis

Live site
- https://osint-ukraine-app-2025.web.app/
- Frontend hosting: Firebase Hosting project `osint-ukraine-app-2025`
- Backend API: Render web service at `https://ukraineosint.onrender.com`

<img width="1909" height="857" alt="image" src="https://github.com/user-attachments/assets/d3358589-d7dc-4e55-9ca5-f75587755be5" />
<img width="1909" height="859" alt="image" src="https://github.com/user-attachments/assets/d2350c2a-25e3-4323-81fc-dac871410d8f" />
<img width="1908" height="917" alt="image" src="https://github.com/user-attachments/assets/92c3d88f-c42a-40dc-825b-5db47d4476fa" />

Overview
- Aggregates Ukraine war reporting by date range and keyword.
- Pulls from GDELT, The Guardian, Currents, Newsdata, GNews, and curated RSS feeds.
- Deduplicates by canonical URL, filters articles to the requested date range, and reports per-source errors without failing the whole fetch.
- Sends the selected articles to Gemini for a structured OSINT report with inline citations.
- Exports reports as Markdown, HTML, DOCX, JSON, CSV, or browser print/PDF.

How It Works
1. The React app runs on Firebase Hosting.
2. The frontend is built with `VITE_API_BASE=https://ukraineosint.onrender.com`, so all `/api/*` calls go to Render.
3. Render runs the Express server in `server/src/server.js`.
4. `/api/articles` calls the enabled source connectors in parallel.
5. Each source is isolated. If one provider fails, its error is returned in `stats`, while working providers still return articles.
6. `/api/analyze` sends selected articles to Gemini using the server-side `GEMINI_API_KEY`.
7. Gemini returns Markdown; the UI normalizes and renders it with clickable citations.

Repository Structure
- `server/` - Express API, source connectors, Gemini integration, extraction service, security/rate limiting.
- `server/src/sources/` - GDELT, Guardian, Currents, Newsdata, GNews, RSS connectors.
- `server/src/config/geminiModels.js` - Gemini model dropdown/default/fallback configuration.
- `web/` - React + Vite + Tailwind frontend.
- `web/.firebaserc` - Firebase project binding: `osint-ukraine-app-2025`.
- `web/firebase.json` - Firebase Hosting config.
- `.github/workflows/deploy-web.yml` - GitHub Action that builds and deploys the frontend to Firebase Hosting.

Current Production Setup
- GitHub repo: `https://github.com/ShabalalaWATP/UkraineOSINT`
- Branch: `main`
- Firebase Hosting:
  - Project: `osint-ukraine-app-2025`
  - Public directory: `web/dist`
  - SPA rewrite: all paths to `/index.html`
  - HTML cache: `no-cache`
- Render backend:
  - URL: `https://ukraineosint.onrender.com`
  - Root directory: `server`
  - Build command: `npm install`
  - Start command: `node src/server.js`
  - Required env: `HOST=0.0.0.0`, `GEMINI_API_KEY`

Gemini Setup
- SDK: `@google/genai`
- Default text model: `gemini-3-flash-preview`
- `/api/models` exposes the model list used by the UI dropdown.
- Gemini API keys must only be stored in Render environment variables.
- Do not put Gemini keys in Firebase, Vite env files, or frontend code.

Render environment variables:
```env
HOST=0.0.0.0
GEMINI_API_KEY=<Google AI Studio API key from a billed project>
GEMINI_MODEL=gemini-3-flash-preview
MAX_ANALYSIS_DOCS=100
GEMINI_EXCERPT_CHARS=1200
GEMINI_ENRICHED_EXCERPT_CHARS=2400
ANALYSIS_AUTO_ENRICH_FRACTION=0.25
ANALYSIS_AUTO_ENRICH_MAX=25
GUARDIAN_API_KEY=<optional>
CURRENTS_API_KEY=<optional>
NEWSDATA_API_KEY=<optional>
GNEWS_API_KEY=<optional>
ALLOWED_DOMAINS=
BLOCKED_DOMAINS=
```

Paid Gemini
- Create a Google AI Studio API key in a project with billing enabled.
- Set that key as `GEMINI_API_KEY` in Render.
- The key inherits free/paid behavior from its Google Cloud project.
- The app displays Gemini `usageMetadata.totalTokenCount` after analysis for usage sanity checks.
- Add Google Cloud billing alerts/budgets before heavy use.

News Source Behavior
- Sources run independently and in parallel.
- A source failure does not break the whole article fetch.
- Returned `stats` include `source`, `count`, `rawCount`, `filteredOut`, `ms`, and `error`.
- Articles are deduplicated by canonical URL and then sorted newest-first by `published_at`.
- The AI does not choose which headlines look best. Analysis uses the first N articles from that sorted list.
- GDELT may be slow to connect, so the server uses a longer upstream connection timeout and a user-agent.
- Newsdata archive/date searches require a Newsdata plan with archive access.
- GNews can rate-limit if queried too frequently.
- RSS is keyless and acts as a reliable baseline source.

Analysis Enrichment
- The manual `Enrich Full Text` button works after fetching articles and before analysis.
- It cannot run before fetching because there are no article URLs yet.
- Running it after analysis only updates article excerpts; rerun analysis to use the enriched text.
- Backend analysis also performs best-effort enrichment automatically for the first 25% of selected articles, capped at 25 articles by default.
- Automatic enrichment is skipped per article when a site blocks extraction, times out, redirects unsafely, or returns unusable text.
- Gemini receives longer excerpts for enriched articles and shorter excerpts for the rest to keep reports detailed without overloading the API request.

Security
- Secrets stay server-side in Render env vars.
- Frontend only receives the public API base URL.
- CORS is restricted to:
  - `https://osint-ukraine-app-2025.web.app`
  - `https://osint-ukraine-app-2025.firebaseapp.com`
  - Firebase preview URLs for this project.
- `/api/extract` includes SSRF protection: HTTP/HTTPS only, private IP blocking, redirect checks, size caps, and timeouts.
- `ALLOWED_DOMAINS` or `BLOCKED_DOMAINS` can filter source domains before analysis.
- Basic rate limits are applied to general, analyze, and extraction routes.

Local Development
Requirements:
- Node.js 20+
- npm

1. Configure server env:
```powershell
Copy-Item server\.env.example server\.env
```

Fill `server/.env`:
```env
HOST=127.0.0.1
PORT=55001
NODE_ENV=development
GEMINI_API_KEY=<your key>
GEMINI_MODEL=gemini-3-flash-preview
MAX_ANALYSIS_DOCS=100
GUARDIAN_API_KEY=
CURRENTS_API_KEY=
NEWSDATA_API_KEY=
GNEWS_API_KEY=
```

2. Start the API:
```powershell
cd server
npm install
npm start
```

Health check:
```text
http://127.0.0.1:55001/api/health
```

3. Start the web app:
```powershell
cd web
npm install
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:55001` by default.

Development against the live Render API:
```powershell
cd web
$env:VITE_API_BASE="https://ukraineosint.onrender.com"
npm run dev
```

Deployment
Backend on Render:
1. Push backend changes to `main`.
2. If Render auto-deploy is enabled, it should deploy automatically.
3. Otherwise, open Render Dashboard and click Manual Deploy on the `ukraineosint` service.
4. Verify:
```text
https://ukraineosint.onrender.com/api/health
https://ukraineosint.onrender.com/api/models
```

Frontend on Firebase:
1. GitHub Actions deploys frontend changes when files under `web/**` or the workflow change.
2. The workflow builds from `web/` and uses GitHub secret `VITE_API_BASE`.
3. Required GitHub secrets:
```text
VITE_API_BASE=https://ukraineosint.onrender.com
FIREBASE_SERVICE_ACCOUNT=<Firebase Hosting Admin service account JSON>
```
4. The workflow deploys to Firebase Hosting channel `live`.

Manual Firebase deploy:
```powershell
npm install -g firebase-tools
firebase login
cd web
$env:VITE_API_BASE="https://ukraineosint.onrender.com"
npm run build
firebase deploy --only hosting
```

Main API Endpoints
- `GET /api/health` - service health.
- `GET /api/models` - Gemini model list and backend default.
- `GET /api/articles?start=YYYY-MM-DD&end=YYYY-MM-DD&q=Ukraine&sources=gdelt,guardian,currents,newsdata,gnews,rss&maxPerSource=50&language=en` - aggregate articles.
- `POST /api/analyze` - generate Gemini OSINT report.
- `POST /api/extract` - extract one article URL.
- `POST /api/extract-batch` - extract up to 50 URLs sequentially.

Keyboard Shortcuts
- `f` - Fetch articles
- `a` - Analyze
- `/` - Focus keyword
- `r` - Reset all
- `c` - Clear output
- `u` - Copy share link
- `?` - Show shortcuts
- After analysis: `m` Markdown, `d` DOCX, `h` HTML, `p` Print, `j` JSON

Troubleshooting
- Frontend still shows old UI: hard refresh the Firebase site, then confirm the current asset bundle changed.
- Fetch timeout: Render may be cold-starting. Retry once; the UI allows 60 seconds.
- Source returns zero articles: check `Source stats` in the UI. A provider may be rate-limited, missing a key, or plan-gated.
- Newsdata archive error: upgrade Newsdata plan or disable Newsdata in the UI.
- GNews 429: wait and retry with fewer sources or lower frequency.
- CORS error: confirm the frontend origin is listed in `server/src/server.js`.
- No analysis: check `GEMINI_API_KEY` in Render and verify `/api/models`.
- Wrong model: set `GEMINI_MODEL=gemini-3-flash-preview` in Render or choose a model in the UI dropdown.
- Bad historical results: backend filters by `published_at`; check source `filteredOut` in `stats`.

Verification Commands
```powershell
cd server
npm audit
node --check src\server.js

cd ..\web
npm audit
npm run build
```

Credits
- Sources: GDELT, The Guardian, CurrentsAPI, Newsdata.io, GNews, curated RSS feeds.
- Readability extraction: `@mozilla/readability`.
- Created by Alex Orr - GitHub `@ShabalalaWATP`.
