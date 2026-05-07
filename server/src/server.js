'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const { z } = require('zod');
const { aggregateArticles } = require('./sources/aggregate');
const { analyzeWithGemini } = require('./services/gemini');
const { extractFromUrl } = require('./services/extract');
const { DEFAULT_GEMINI_MODEL, GEMINI_MODELS } = require('./config/geminiModels');
const { sanitizeErrorMessage } = require('./utils/http');

// Load environment variables from server/.env
dotenv.config();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // respect X-Forwarded-* (Render, proxies)

// Respect PORT and HOST from env; bind to localhost by default to avoid EACCES on Windows
const PORT = Number(process.env.PORT) || 3001;
const HOST = (process.env.HOST || '127.0.0.1').trim();

// Lock CORS to Firebase Hosting origins (allow no-origin for curl/Postman)
const allowedOrigins = [
  'https://osint-ukraine-app-2025.web.app',
  'https://osint-ukraine-app-2025.firebaseapp.com',
];
const previewRegex = /^https:\/\/osint-ukraine-app-2025--.*\.web\.app$/;

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (previewRegex.test(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
// Security headers (no CSP here to avoid breaking styles)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(express.json({ limit: '2mb' }));

// Basic rate limiting (tuned per route below)
const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 300 });
const analyzeLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
const extractLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use(generalLimiter);

const VALID_SOURCES = ['gdelt', 'guardian', 'currents', 'gnews', 'newsapi', 'webz', 'rss'];
const SOURCE_ALIASES = {
  newsdata: 'newsapi',
  worldnews: 'webz',
  world_news: 'webz',
};

function normalizeSources(value) {
  const rawSources = value
    ? String(value).split(',').map((s) => s.trim()).filter(Boolean)
    : VALID_SOURCES;
  const sources = [];
  const ignored = [];

  for (const raw of rawSources) {
    const key = raw.toLowerCase();
    const mapped = SOURCE_ALIASES[key] || key;
    if (!VALID_SOURCES.includes(mapped)) {
      ignored.push(raw);
      continue;
    }
    if (!sources.includes(mapped)) sources.push(mapped);
  }

  if (!sources.length) {
    throw new Error(`No valid sources selected. Expected one or more of: ${VALID_SOURCES.join(', ')}`);
  }

  return { sources, ignored };
}

const YmdDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date format YYYY-MM-DD');
const ShortText = z.string().max(300);
const FocusText = z.string().max(4000);
const HttpUrl = z.string().url().refine((value) => {
  try {
    const protocol = new URL(value).protocol.toLowerCase();
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}, 'Only http/https URLs are allowed');

function assertValidDateRange(start, end) {
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  const endMs = new Date(`${end}T23:59:59Z`).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error('Invalid date range');
  }
  if (startMs > endMs) {
    throw new Error('Start date must be before or equal to end date');
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: '0.1.0' });
});

app.get('/api/models', (_req, res) => {
  res.json({
    ok: true,
    defaultModel: DEFAULT_GEMINI_MODEL,
    models: GEMINI_MODELS,
  });
});

app.get('/api/articles', async (req, res) => {
  try {
    const schema = z.object({
      start: YmdDate,
      end: YmdDate,
      q: ShortText.default('Ukraine'),
      sources: z.string().max(300).optional(), // comma-separated
      maxPerSource: z.coerce.number().int().min(1).max(200).default(50),
      language: z.string().max(16).optional(),
    });

    const params = schema.parse(req.query);

    const { sources: selectedSources, ignored: ignoredSources } = normalizeSources(params.sources);

    const { start, end, q, maxPerSource, language } = params;
    assertValidDateRange(start, end);

    const { articles, stats } = await aggregateArticles({
      start,
      end,
      q,
      sources: selectedSources,
      maxPerSource,
      language,
    });

    res.json({
      ok: true,
      count: articles.length,
      articles,
      stats,
      sourceWarnings: ignoredSources.length ? ignoredSources.map((source) => `Ignored unknown source: ${source}`) : [],
    });
  } catch (err) {
    console.error('GET /api/articles error', err);
    res.status(400).json({ ok: false, error: sanitizeErrorMessage(err, 'Invalid request') });
  }
});

app.post('/api/analyze', analyzeLimiter, async (req, res) => {
  try {
    const schema = z.object({
      start: YmdDate,
      end: YmdDate,
      q: ShortText.default('Ukraine'),
      promptPreset: z.string().max(80).default('osint_structured_v1'),
      focus: FocusText.optional().default(''),
      articles: z.array(
        z.object({
          id: z.string().max(200),
          source: z.string().max(80),
          title: z.string().max(500).optional(),
          url: HttpUrl,
          published_at: z.string().max(80),
          description: z.string().max(5000).optional(),
          content_excerpt: z.string().max(12000).optional(),
          lang: z.string().max(16).optional(),
        })
      ).min(1).max(200),
      model: z.string().max(120).default(DEFAULT_GEMINI_MODEL),
      maxDocs: z.coerce.number().int().min(1).max(100).default(25),
    });

    const body = schema.parse(req.body);
    assertValidDateRange(body.start, body.end);

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ ok: false, error: 'Missing GEMINI_API_KEY' });
    }

    const analysis = await analyzeWithGemini(body);
    res.json({ ok: true, analysis });
  } catch (err) {
    console.error('POST /api/analyze error', err);
    res.status(400).json({ ok: false, error: sanitizeErrorMessage(err, 'Invalid request') });
  }
});

// Extract full article content (best-effort) for a given URL
app.post('/api/extract', extractLimiter, async (req, res) => {
  try {
    const schema = z.object({ url: HttpUrl });
    const { url } = schema.parse(req.body || {});
    const data = await extractFromUrl(url);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: sanitizeErrorMessage(err, 'Extraction failed') });
  }
});

// Batch extract for multiple URLs (sequential to avoid overloading)
app.post('/api/extract-batch', extractLimiter, async (req, res) => {
  try {
    const schema = z.object({ urls: z.array(HttpUrl).min(1).max(50) });
    const { urls } = schema.parse(req.body || {});
    const out = {};
    for (const u of urls) {
      try {
        out[u] = await extractFromUrl(u);
      } catch (e) {
        out[u] = { error: sanitizeErrorMessage(e, 'Extraction failed') };
      }
    }
    res.json({ ok: true, results: out });
  } catch (err) {
    res.status(400).json({ ok: false, error: sanitizeErrorMessage(err, 'Batch extraction failed') });
  }
});

// Start server, binding explicitly to HOST to avoid EACCES on some Windows setups
const server = app.listen(PORT, HOST, () => {
  console.log(`OSINT server listening on http://${HOST}:${PORT} (env: ${process.env.NODE_ENV || 'development'})`);
});

// Relax server timeouts to accommodate longer LLM runs
try {
  // Time to receive the entire request (headers+body)
  server.requestTimeout = 10 * 60 * 1000; // 10 minutes
  // Time allowed for headers to be sent
  server.headersTimeout = 11 * 60 * 1000; // 11 minutes
  // Keep-alive between requests on the same connection
  server.keepAliveTimeout = 2 * 60 * 1000; // 2 minutes
} catch {}

// Extra safety: surface listen errors clearly
server.on('error', (err) => {
  console.error('HTTP server error:', err);
  process.exit(1);
});

// Optional: log unhandled promise rejections to help debugging
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
