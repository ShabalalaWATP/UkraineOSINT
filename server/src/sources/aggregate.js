const { fetchGdelt } = require('./gdelt');
const { fetchGuardian } = require('./guardian');
const { fetchCurrents } = require('./currents');
const { fetchNewsdata } = require('./newsdata');
const { fetchGnews } = require('./gnews');
const { fetchRss } = require('./rss');
const { idFromUrl, canonicalizeUrl } = require('../utils/url');

async function aggregateArticles({ start, end, q, sources, maxPerSource, language }) {
  const tasks = [];
  const add = (fn, name) => {
    const t0 = Date.now();
    return tasks.push(
      fn({ start, end, q, maxPerSource, language })
        .then((list) => ({ name, list, ms: Date.now() - t0 }))
        .catch((e) => ({ name, list: [], error: String(e?.message || e), ms: Date.now() - t0 }))
    );
  };

  if (sources.includes('gdelt')) add(fetchGdelt, 'gdelt');
  if (sources.includes('guardian')) add(fetchGuardian, 'guardian');
  if (sources.includes('currents')) add(fetchCurrents, 'currents');
  if (sources.includes('newsdata')) add(fetchNewsdata, 'newsdata');
  if (sources.includes('gnews')) add(fetchGnews, 'gnews');
  if (sources.includes('rss')) add(fetchRss, 'rss');

  const results = await Promise.all(tasks);
  const all = results.flatMap(r => r.list || []);

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

  const stats = results.map(r => ({
    source: r.name,
    count: r.list?.length || 0,
    ms: r.ms || 0,
    error: r.error || null,
  }));
  return { articles: deduped, stats };
}

module.exports = { aggregateArticles };
