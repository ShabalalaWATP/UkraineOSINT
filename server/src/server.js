'use strict';

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { z } = require('zod');
const { aggregateArticles } = require('./sources/aggregate');
const { analyzeWithGemini } = require('./services/gemini');
const { extractFromUrl } = require('./services/extract');

// Load environment variables from server/.env
dotenv.config();

const app = express();

// Respect PORT and HOST from env; bind to localhost by default to avoid EACCES on Windows
const PORT = Number(process.env.PORT) || 3001;
const HOST = (process.env.HOST || '127.0.0.1').trim();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const SourcesEnum = z.enum(['gdelt', 'guardian', 'currents', 'newsdata', 'gnews', 'rss']);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: '0.1.0' });
});

app.get('/api/articles', async (req, res) => {
  try {
    const schema = z.object({
      start: z.string(),
      end: z.string(),
      q: z.string().default('Ukraine'),
      sources: z.string().optional(), // comma-separated
      maxPerSource: z.coerce.number().int().min(1).max(200).default(50),
      language: z.string().optional(),
    });

    const params = schema.parse(req.query);

    const selectedSources = params.sources
      ? params.sources.split(',').map((s) => s.trim()).filter(Boolean)
      : ['gdelt', 'guardian', 'currents', 'newsdata', 'gnews', 'rss'];

    // Validate selected sources
    selectedSources.forEach((s) => SourcesEnum.parse(s));

    const { start, end, q, maxPerSource, language } = params;

    const { articles, stats } = await aggregateArticles({
      start,
      end,
      q,
      sources: selectedSources,
      maxPerSource,
      language,
    });

    res.json({ ok: true, count: articles.length, articles, stats });
  } catch (err) {
    console.error('GET /api/articles error', err);
    res.status(400).json({ ok: false, error: err.message || 'Invalid request' });
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const schema = z.object({
      start: z.string(),
      end: z.string(),
      q: z.string().default('Ukraine'),
      promptPreset: z.string().default('osint_structured_v1'),
      focus: z.string().optional().default(''),
      articles: z.array(
        z.object({
          id: z.string(),
          source: z.string(),
          title: z.string().optional(),
          url: z.string().url(),
          published_at: z.string(),
          description: z.string().optional(),
          content_excerpt: z.string().optional(),
          lang: z.string().optional(),
        })
      ),
      model: z.string().default('gemini-1.5-flash'),
      maxDocs: z.coerce.number().int().min(5).max(120).default(60),
    });

    const body = schema.parse(req.body);

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ ok: false, error: 'Missing GEMINI_API_KEY' });
    }

    const analysis = await analyzeWithGemini(body);
    res.json({ ok: true, analysis });
  } catch (err) {
    console.error('POST /api/analyze error', err);
    res.status(400).json({ ok: false, error: err.message || 'Invalid request' });
  }
});

// Extract full article content (best-effort) for a given URL
app.post('/api/extract', async (req, res) => {
  try {
    const schema = z.object({ url: z.string().url() });
    const { url } = schema.parse(req.body || {});
    const data = await extractFromUrl(url);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Extraction failed' });
  }
});

// Batch extract for multiple URLs (sequential to avoid overloading)
app.post('/api/extract-batch', async (req, res) => {
  try {
    const schema = z.object({ urls: z.array(z.string().url()).min(1).max(50) });
    const { urls } = schema.parse(req.body || {});
    const out = {};
    for (const u of urls) {
      try {
        out[u] = await extractFromUrl(u);
      } catch (e) {
        out[u] = { error: String(e?.message || e) };
      }
    }
    res.json({ ok: true, results: out });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Batch extraction failed' });
  }
});

// Start server, binding explicitly to HOST to avoid EACCES on some Windows setups
const server = app.listen(PORT, HOST, () => {
  console.log(`OSINT server listening on http://${HOST}:${PORT} (env: ${process.env.NODE_ENV || 'development'})`);
});

// Extra safety: surface listen errors clearly
server.on('error', (err) => {
  console.error('HTTP server error:', err);
  process.exit(1);
});

// Optional: log unhandled promise rejections to help debugging
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
