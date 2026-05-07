Ukraine OSINT Aggregator + Gemini Analysis

Live site
- https://osint-ukraine-app-2025.web.app/
- Frontend hosting: Firebase Hosting project `osint-ukraine-app-2025`
- Backend API: Render web service at `https://ukraineosint.onrender.com`
- Source repo: https://github.com/ShabalalaWATP/UkraineOSINT

<img width="1909" height="857" alt="image" src="https://github.com/user-attachments/assets/d3358589-d7dc-4e55-9ca5-f75587755be5" />
<img width="1909" height="859" alt="image" src="https://github.com/user-attachments/assets/d2350c2a-25e3-4323-81fc-dac871410d8f" />
<img width="1908" height="917" alt="image" src="https://github.com/user-attachments/assets/92c3d88f-c42a-40dc-825b-5db47d4476fa" />

Overview
- Aggregates Ukraine war reporting by date range and keyword.
- Pulls from GDELT, The Guardian, Currents, GNews, NewsAPI.org, Webz.io News API Lite, and curated RSS feeds.
- Deduplicates by canonical URL, filters articles to the requested date range, and reports per-source errors without failing the whole fetch.
- Ranks a larger article pool before analysis so Gemini sees the most relevant, source-diverse, information-rich articles rather than simply the newest items.
- Automatically enriches the top slice of ranked articles with extracted full text before analysis.
- Sends the selected articles to Gemini for a structured OSINT report with inline citations.
- Exports reports as Markdown, HTML, DOCX, JSON, CSV, or browser print/PDF.

Production State Of Play

The app is split into two hosted parts:

```text
Browser
  -> Firebase Hosting static React app
  -> Render Express API
  -> News providers, article extraction, Gemini
```

GitHub is the source of truth for the code. The `main` branch currently drives the live deployment setup:

```text
Push to main
  -> GitHub Actions deploys frontend changes to Firebase Hosting
  -> Render deploys backend changes through the Render service Git integration or Manual Deploy
```

There is one GitHub Actions workflow in this repository: `.github/workflows/deploy-web.yml`. It deploys the frontend only. There is no GitHub Actions workflow for the Render backend in this repo.

Hosting Roles

Firebase Hosting
- Firebase hosts only the built React/Vite frontend.
- Firebase project: `osint-ukraine-app-2025`.
- Config lives in `web/.firebaserc` and `web/firebase.json`.
- Firebase serves `web/dist`.
- Firebase rewrites all paths to `/index.html`, so shared links and refreshed routes still load the React app.
- HTML is sent with `Cache-Control: no-cache` so new deployments are picked up quickly.
- Firebase does not run the API, store server secrets, call Gemini, or hold the news API keys.
- The deployed frontend knows where the API lives because it is built with `VITE_API_BASE=https://ukraineosint.onrender.com`.

Render
- Render hosts the backend Express API.
- Live API URL: `https://ukraineosint.onrender.com`.
- Render service root directory should be `server`.
- Build command: `npm install`.
- Start command: `node src/server.js`.
- Render stores the API keys and operational server configuration as environment variables.
- Render is where Gemini, Guardian, Currents, GNews, NewsAPI.org, and Webz.io keys belong.
- Render is also where `GEMINI_MODEL`, analysis limits, enrichment settings, CORS, and source filtering settings belong.
- When Render environment variables change, restart or redeploy the Render service so the Node process reads the new values.

GitHub
- GitHub repo: `https://github.com/ShabalalaWATP/UkraineOSINT`.
- Main working branch: `main`.
- GitHub stores the app code, README, Firebase config, and GitHub Actions workflow.
- Push code changes to GitHub before expecting GitHub Actions or Render's Git integration to see them.
- If Render auto-deploy is enabled, backend changes on `main` should deploy automatically after a push. If not, use Render's Manual Deploy button.

GitHub Actions
- GitHub Actions is in play for the frontend only.
- Workflow: `.github/workflows/deploy-web.yml`.
- Trigger: push to `main` when files under `web/**` change, excluding `web/**/*.md`, or when the workflow file changes.
- Runtime: Ubuntu runner, Node.js 20, `npm ci`, then `npm run build` in `web/`.
- The build step receives `VITE_API_BASE` from GitHub repository secrets.
- The deploy step uses `FirebaseExtended/action-hosting-deploy@v0`.
- Deployment target: Firebase Hosting `channelId: live`, project `osint-ukraine-app-2025`.
- Required GitHub repository secrets:

```text
VITE_API_BASE=https://ukraineosint.onrender.com
FIREBASE_SERVICE_ACCOUNT=<Firebase Hosting service account JSON>
```

Runtime Flow

1. A user opens `https://osint-ukraine-app-2025.web.app/`.
2. Firebase serves the static React app from `web/dist`.
3. The React app calls the Render API using `VITE_API_BASE`.
4. `GET /api/articles` runs the enabled source connectors in parallel.
5. Each source is isolated. If one provider fails, the API returns the working providers plus a source error in `stats`.
6. Articles are normalized, date-filtered, deduplicated, and returned to the frontend with source stats.
7. When the user runs analysis, the frontend sends a candidate pool to `POST /api/analyze`.
8. The backend ranks the candidate articles against the search term, focus text, source quality signals, recency, domain diversity, and excerpt quality.
9. The backend automatically enriches the top portion of ranked articles with full-text extraction where possible.
10. Gemini receives the selected ranked and enriched article set, not every fetched article.
11. Gemini returns a Markdown OSINT report with citations.
12. The frontend renders the report, citations, focus coverage, claims table, usage metadata, and export controls.

Repository Structure
- `server/` - Express API, source connectors, Gemini integration, extraction service, security/rate limiting.
- `server/src/server.js` - API routes, CORS, request limits, source aggregation, analysis route.
- `server/src/sources/` - GDELT, Guardian, Currents, GNews, NewsAPI.org, Webz.io News API Lite, RSS connectors.
- `server/src/config/geminiModels.js` - Gemini model dropdown/default/fallback configuration exposed by `/api/models`.
- `server/.env.example` - local backend environment template.
- `web/` - React + Vite + Tailwind frontend.
- `web/src/App.jsx` - main frontend UI, source toggles, fetch/analyze actions, exports, report rendering.
- `web/.firebaserc` - Firebase project binding: `osint-ukraine-app-2025`.
- `web/firebase.json` - Firebase Hosting config.
- `.github/workflows/deploy-web.yml` - GitHub Action that builds and deploys the frontend to Firebase Hosting.

Current Source Stack

Active sources shown in the frontend:
- `gdelt` - GDELT DOC 2.0, keyless, broad global coverage, can be slower than the paid APIs.
- `guardian` - The Guardian Open Platform, enabled by `GUARDIAN_API_KEY`.
- `currents` - Currents API, enabled by `CURRENTS_API_KEY`.
- `gnews` - GNews API, enabled by `GNEWS_API_KEY`.
- `newsapi` - NewsAPI.org `/v2/everything`, enabled by `NEWS_API_KEY`.
- `webz` - Webz.io News API Lite, enabled by `WEBZ_API_KEY`.
- `rss` - curated RSS feeds, keyless fallback/baseline source.

Removed/replaced sources:
- `newsdata` was replaced by NewsAPI.org.
- `worldnews` was replaced by Webz.io News API Lite.
- `NEWSDATA_API_KEY` and `WORLD_NEWS_API_KEY` are not used by the current app.

Render Environment Variables

Required:

```env
HOST=0.0.0.0
NODE_ENV=production
GEMINI_API_KEY=<Google AI Studio API key from a billed project>
```

Recommended current production settings:

```env
GEMINI_MODEL=gemini-3-flash-preview
MAX_ANALYSIS_DOCS=100
GEMINI_EXCERPT_CHARS=1200
GEMINI_ENRICHED_EXCERPT_CHARS=2400
ANALYSIS_AUTO_ENRICH_FRACTION=0.25
ANALYSIS_AUTO_ENRICH_MAX=25
ANALYSIS_AUTO_ENRICH_CONCURRENCY=4
ANALYSIS_AUTO_ENRICH_TIMEOUT_MS=8000
```

Optional source keys:

```env
GUARDIAN_API_KEY=<Guardian Open Platform key>
CURRENTS_API_KEY=<Currents API key>
GNEWS_API_KEY=<GNews API key>
NEWS_API_KEY=<NewsAPI.org key>
WEBZ_API_KEY=<Webz.io News API Lite key>
```

Optional source/domain controls:

```env
ALLOWED_DOMAINS=
BLOCKED_DOMAINS=
```

Paid Gemini Setup
- Use a Google AI Studio API key from a Google Cloud project with billing enabled.
- Put the key in Render as `GEMINI_API_KEY`.
- Do not put Gemini keys in Firebase, GitHub Actions build variables, Vite env files, or frontend code.
- The app's backend default is controlled by `GEMINI_MODEL`.
- The current preferred default in code and docs is `gemini-3-flash-preview`.
- `/api/models` exposes the model list used by the UI dropdown.
- The UI lets the user choose a model per analysis request.
- The app displays Gemini `usageMetadata.totalTokenCount` after analysis when Gemini returns it.
- Use Google Cloud billing alerts/budgets before heavy use.

How Searching And Article Selection Work

Fetch search:
- The `q` field is the main search query sent to the news sources.
- Date range, language, selected sources, and `maxPerSource` shape the provider requests.
- Each source has slightly different query syntax and plan limits, so the connectors translate the same user intent into provider-specific requests.
- NewsAPI.org searches `/v2/everything` with `sortBy=relevancy`.
- Webz.io Lite searches `newsApiLite` and is limited by the Lite plan, including short history and article count limits.
- GDELT is keyless and broad, but can be slow and noisy.
- RSS is not a full-text search API, so it acts as a reliable baseline rather than a perfect query match.

Focus text:
- The `focus` field is used for analysis ranking and Gemini instructions.
- The focus text is not sent to every news API as a raw query because doing that would often over-constrain provider searches and reduce recall.
- The backend uses focus terms to decide which fetched articles are most useful for the report.

Ranking:
- The frontend sends up to a larger candidate pool for analysis.
- The backend ranks candidates before Gemini sees them.
- Ranking considers query matches, focus matches, title/description/excerpt quality, Ukraine/Russia anchors for Ukraine-related searches, event-value terms, recency, source profile, source diversity, host diversity, and low-signal penalties.
- The backend applies a relevance floor. It can analyze fewer than the requested maximum rather than padding Gemini with weak or off-topic articles.
- Source diversity and host caps stop one provider or one domain dominating the report when other useful coverage exists.

Analysis Enrichment
- Full-text enrichment runs automatically during backend analysis.
- The normal workflow is fetch articles, then analyze.
- There is no manual enrichment button in the current UI.
- Backend analysis performs best-effort enrichment for the first 25% of selected articles, capped at 25 articles by default.
- Automatic enrichment is skipped per article when a site blocks extraction, times out, redirects unsafely, or returns unusable text.
- Gemini receives longer excerpts for enriched articles and shorter excerpts for the rest to keep reports detailed without overloading the request.
- Report metadata shows how many ranked articles were selected from the candidate pool and how many were enriched.

API Endpoints
- `GET /api/health` - service health.
- `GET /api/models` - Gemini model list and backend default.
- `GET /api/articles?start=YYYY-MM-DD&end=YYYY-MM-DD&q=Ukraine&sources=gdelt,guardian,currents,gnews,newsapi,webz,rss&maxPerSource=50&language=en` - aggregate articles.
- `POST /api/analyze` - generate Gemini OSINT report.
- `POST /api/extract` - extract one article URL.
- `POST /api/extract-batch` - extract up to 50 URLs sequentially.

Security And Reliability
- Secrets stay server-side in Render env vars.
- The frontend only receives the public API base URL.
- CORS is restricted to the production Firebase origins and matching Firebase preview URLs.
- `/api/extract` includes SSRF protection: HTTP/HTTPS only, private IP blocking, redirect checks, size caps, and timeouts.
- `ALLOWED_DOMAINS` and `BLOCKED_DOMAINS` can filter source domains before analysis.
- Basic rate limits are applied to general, analyze, and extraction routes.
- Source fetches are isolated, so one failing provider should not break the whole article fetch.
- Source stats expose per-provider counts, filtered counts, timing, and errors so provider failures are visible in the UI.

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
GNEWS_API_KEY=
NEWS_API_KEY=
WEBZ_API_KEY=
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

Frontend to Firebase through GitHub Actions:
1. Commit and push frontend changes to `main`.
2. The workflow runs only if the push changes `web/**` or `.github/workflows/deploy-web.yml`.
3. GitHub Actions installs dependencies in `web/`.
4. GitHub Actions builds the frontend with `VITE_API_BASE` from repository secrets.
5. GitHub Actions deploys the built `web/dist` output to Firebase Hosting live channel.
6. Verify the site at `https://osint-ukraine-app-2025.web.app/`.

Backend to Render:
1. Commit and push backend changes to `main`.
2. If Render auto-deploy is enabled, Render should deploy from GitHub automatically.
3. If Render auto-deploy is off or unclear, open the Render dashboard for `ukraineosint` and click Manual Deploy.
4. Environment variable changes in Render need a restart or redeploy.
5. Verify:

```text
https://ukraineosint.onrender.com/api/health
https://ukraineosint.onrender.com/api/models
```

Manual Firebase deploy, if GitHub Actions is not being used:

```powershell
npm install -g firebase-tools
firebase login
cd web
$env:VITE_API_BASE="https://ukraineosint.onrender.com"
npm run build
firebase deploy --only hosting
```

Operational Checks

Check backend health:

```powershell
Invoke-RestMethod "https://ukraineosint.onrender.com/api/health"
```

Check Gemini model list:

```powershell
Invoke-RestMethod "https://ukraineosint.onrender.com/api/models"
```

Check source aggregation:

```powershell
Invoke-RestMethod "https://ukraineosint.onrender.com/api/articles?start=2026-05-01&end=2026-05-07&q=Ukraine%20war&sources=gdelt,guardian,currents,gnews,newsapi,webz,rss&maxPerSource=10&language=en"
```

Run local verification:

```powershell
cd server
npm audit
node --check src\server.js

cd ..\web
npm audit
npm run build
```

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
- GitHub Actions did not run: check whether the push touched `web/**` or `.github/workflows/deploy-web.yml`; README-only changes do not trigger the Firebase deploy workflow.
- Firebase deploy failed: check GitHub secrets `VITE_API_BASE` and `FIREBASE_SERVICE_ACCOUNT`.
- Backend did not update: check Render's Deploys tab, confirm the service is connected to this GitHub repo/branch, or use Manual Deploy.
- Fetch timeout: Render may be starting up or GDELT may be slow. Retry once and inspect source stats.
- Source returns zero articles: check `Source stats` in the UI. A provider may be rate-limited, missing a key, plan-gated, or outside its plan's date window.
- GNews 429: wait and retry with fewer sources or lower frequency.
- NewsAPI.org returns zero articles: confirm `NEWS_API_KEY` exists in Render and that the requested date range is allowed by the NewsAPI.org plan.
- Webz.io returns zero articles: confirm `WEBZ_API_KEY` exists in Render and that the requested date range is within the Lite plan's supported history window.
- CORS error: confirm the frontend origin is listed in the backend CORS configuration.
- No analysis: check `GEMINI_API_KEY` in Render and verify `/api/models`.
- Wrong model: set `GEMINI_MODEL=gemini-3-flash-preview` in Render or choose a model in the UI dropdown.
- Bad historical results: backend filters by `published_at`; check source `filteredOut` in `stats`.

Credits
- Sources: GDELT, The Guardian, CurrentsAPI, GNews, NewsAPI.org, Webz.io News API Lite, curated RSS feeds.
- Readability extraction: `@mozilla/readability`.
- Created by Alex Orr - GitHub `@ShabalalaWATP`.
