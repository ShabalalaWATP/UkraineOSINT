const { fetchGdelt } = require('./gdelt');
const { fetchGuardian } = require('./guardian');
const { fetchCurrents } = require('./currents');
const { fetchGnews } = require('./gnews');
const { fetchNewsApi } = require('./newsapi');
const { fetchWebz } = require('./webz');
const { fetchRss } = require('./rss');
const { idFromUrl, canonicalizeUrl } = require('../utils/url');
const { sanitizeErrorMessage } = require('../utils/http');

function isWithinDateRange(article, start, end) {
  if (!start || !end) return true;
  const published = new Date(article.published_at);
  if (Number.isNaN(published.getTime())) return false;

  const startAt = new Date(`${start}T00:00:00Z`);
  const endAt = new Date(`${end}T23:59:59.999Z`);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return true;

  return published >= startAt && published <= endAt;
}

async function aggregateArticles({ start, end, q, sources, maxPerSource, language }) {
  const tasks = [];
  const add = (fn, name) => {
    const t0 = Date.now();
    return tasks.push(
      fn({ start, end, q, maxPerSource, language })
        .then((list) => ({ name, list, ms: Date.now() - t0 }))
        .catch((e) => ({ name, list: [], error: sanitizeErrorMessage(e), ms: Date.now() - t0 }))
    );
  };

  if (sources.includes('gdelt')) add(fetchGdelt, 'gdelt');
  if (sources.includes('guardian')) add(fetchGuardian, 'guardian');
  if (sources.includes('currents')) add(fetchCurrents, 'currents');
  if (sources.includes('gnews')) add(fetchGnews, 'gnews');
  if (sources.includes('newsapi')) add(fetchNewsApi, 'newsapi');
  if (sources.includes('webz')) add(fetchWebz, 'webz');
  if (sources.includes('rss')) add(fetchRss, 'rss');

  const results = await Promise.all(tasks);
  const filteredResults = results.map((r) => {
    const rawList = r.list || [];
    const list = rawList.filter((article) => isWithinDateRange(article, start, end));
    return {
      ...r,
      list,
      rawCount: rawList.length,
      filteredOut: rawList.length - list.length,
    };
  });
  let all = filteredResults.flatMap(r => r.list || []);

  // Optional domain allow/block lists via environment
  const blocked = (process.env.BLOCKED_DOMAINS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const allowed = (process.env.ALLOWED_DOMAINS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (blocked.length || allowed.length) {
    all = all.filter(a => {
      let host = '';
      try { host = new URL(a.url).hostname.toLowerCase(); } catch {}
      if (!host) return false;
      if (allowed.length && !allowed.some(d => host.endsWith(d))) return false;
      if (blocked.length && blocked.some(d => host.endsWith(d))) return false;
      return true;
    });
  }

  const map = new Map();
  for (const a of all) {
    const url = canonicalizeUrl(a.url);
    const id = a.id || idFromUrl(url);
    const key = id;
    if (!map.has(key)) {
      map.set(key, { ...a, id, url });
    }
  }
  const deduped = Array.from(map.values())
    .sort((a, b) => (new Date(b.published_at) - new Date(a.published_at)));

  const stats = filteredResults.map(r => ({
    source: r.name,
    count: r.list?.length || 0,
    rawCount: r.rawCount || 0,
    filteredOut: r.filteredOut || 0,
    ms: r.ms || 0,
    error: r.error || null,
  }));
  return { articles: deduped, stats };
}

module.exports = { aggregateArticles };
