const { ymd } = require('../utils/date');
const { idFromUrl } = require('../utils/url');
const { fetchJson } = require('../utils/http');

function normalizePublishDate(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    return `${text.replace(' ', 'T')}Z`;
  }
  return text;
}

async function fetchWorldNews({ start, end, q, maxPerSource, language }) {
  const key = process.env.WORLD_NEWS_API_KEY;
  if (!key) return [];

  const qs = new URLSearchParams({
    text: q || 'Ukraine',
    'earliest-publish-date': ymd(start),
    'latest-publish-date': ymd(end),
    language: (language || 'en').slice(0, 2),
    number: String(Math.min(maxPerSource || 100, 100)),
    offset: '0',
    sort: 'publish-time',
    'sort-direction': 'desc',
  });

  const url = `https://api.worldnewsapi.com/search-news?${qs.toString()}`;
  const data = await fetchJson(url, {
    timeoutMs: 45000,
    headers: { 'x-api-key': key },
  });
  const articles = data?.news || [];

  return articles.map((a) => {
    const url = a.url || '';
    const summary = a.summary || '';
    const text = a.text || '';
    const excerpt = summary || text;

    return {
      id: idFromUrl(url),
      source: 'worldnews',
      title: a.title || '',
      url,
      published_at: normalizePublishDate(a.publish_date),
      description: summary || text.slice(0, 500),
      content_excerpt: excerpt.slice(0, 1500),
      lang: a.language || (language || 'en').slice(0, 2),
    };
  }).filter((a) => a.url && a.published_at);
}

module.exports = { fetchWorldNews };
