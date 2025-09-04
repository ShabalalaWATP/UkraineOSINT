const { ymd } = require('../utils/date');
const { idFromUrl } = require('../utils/url');
const { fetchJson } = require('../utils/http');

async function fetchGnews({ start, end, q, maxPerSource, language }) {
  const key = process.env.GNEWS_API_KEY;
  if (!key) return [];
  const qs = new URLSearchParams({
    q: q || 'Ukraine',
    from: ymd(start),
    to: ymd(end),
    lang: (language || 'en').slice(0, 2),
    token: key,
    max: String(Math.min(maxPerSource || 100, 100)),
    sortby: 'publishedAt',
  });
  const url = `https://gnews.io/api/v4/search?${qs.toString()}`;
  const data = await fetchJson(url, { timeoutMs: 12000 });
  const articles = data?.articles || [];
  return articles.map((a) => ({
    id: idFromUrl(a.url),
    source: 'gnews',
    title: a.title,
    url: a.url,
    published_at: a.publishedAt,
    description: a.description,
    content_excerpt: a.description || '',
    lang: (language || 'en').slice(0, 2),
  }));
}

module.exports = { fetchGnews };
