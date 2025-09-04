const { ymd } = require('../utils/date');
const { idFromUrl } = require('../utils/url');
const { fetchJson } = require('../utils/http');

async function fetchNewsdata({ start, end, q, maxPerSource, language }) {
  const key = process.env.NEWSDATA_API_KEY;
  if (!key) return [];
  const qs = new URLSearchParams({
    apikey: key,
    q: q || 'Ukraine',
    from_date: ymd(start),
    to_date: ymd(end),
    language: language || 'en',
    page: '1'
  });
  const url = `https://newsdata.io/api/1/news?${qs.toString()}`;
  const data = await fetchJson(url, { timeoutMs: 12000 });
  const results = data?.results || [];
  return results.slice(0, Math.min(maxPerSource || 100, 100)).map((it) => ({
    id: idFromUrl(it.link),
    source: 'newsdata',
    title: it.title,
    url: it.link,
    published_at: it.pubDate || it.pubDate_tz || '',
    description: it.description,
    content_excerpt: it.description || '',
    lang: it.language || language || 'en',
  }));
}

module.exports = { fetchNewsdata };
