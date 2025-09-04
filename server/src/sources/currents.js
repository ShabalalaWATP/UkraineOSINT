const { ymd } = require('../utils/date');
const { idFromUrl } = require('../utils/url');
const { fetchJson } = require('../utils/http');

async function fetchCurrents({ start, end, q, maxPerSource, language }) {
  const key = process.env.CURRENTS_API_KEY;
  if (!key) return [];
  const qs = new URLSearchParams({
    keywords: q || 'Ukraine',
    start_date: ymd(start),
    end_date: ymd(end),
    language: language || 'en',
    page_size: String(Math.min(maxPerSource || 100, 200)),
    apiKey: key,
  });
  const url = `https://api.currentsapi.services/v1/search?${qs.toString()}`;
  const data = await fetchJson(url, { timeoutMs: 12000 });
  const news = data?.news || [];
  return news.map((n) => ({
    id: idFromUrl(n.url),
    source: 'currents',
    title: n.title,
    url: n.url,
    published_at: n.published,
    description: n.description,
    content_excerpt: n.description || '',
    lang: n.language || language || 'en',
  }));
}

module.exports = { fetchCurrents };
