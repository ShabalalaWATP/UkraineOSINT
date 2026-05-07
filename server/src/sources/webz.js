const { idFromUrl } = require('../utils/url');
const { fetchJson } = require('../utils/http');

function startTimestamp(start) {
  const parsed = new Date(`${start}T00:00:00Z`).getTime();
  if (Number.isFinite(parsed)) return String(parsed);
  return '0';
}

function languageFilter(language) {
  const lang = (language || 'en').slice(0, 2).toLowerCase();
  if (lang === 'en') return 'language:english';
  return '';
}

function buildQuery({ q, language }) {
  const parts = [
    q || 'Ukraine',
    languageFilter(language),
    'site_type:news',
    'is_first:true',
  ].filter(Boolean);
  return parts.join(' ');
}

async function fetchWebz({ start, q, maxPerSource, language }) {
  const key = process.env.WEBZ_API_KEY;
  if (!key) return [];

  const qs = new URLSearchParams({
    token: key,
    format: 'json',
    q: buildQuery({ q, language }),
    ts: startTimestamp(start),
    sort: 'published',
    order: 'desc',
    size: String(Math.min(maxPerSource || 10, 10)),
  });

  const url = `https://api.webz.io/newsApiLite?${qs.toString()}`;
  const data = await fetchJson(url, { timeoutMs: 15000 });
  if (data?.error) throw new Error(String(data.error));

  return (data?.posts || []).map((post) => {
    const url = post.url || post.thread?.url || '';
    const title = post.title || post.thread?.title || '';
    const published = post.published || post.thread?.published || '';
    const text = post.text || post.highlightText || '';

    return {
      id: idFromUrl(url),
      source: 'webz',
      title,
      url,
      published_at: published,
      description: text.slice(0, 500),
      content_excerpt: text.slice(0, 1500),
      lang: post.language || (language || 'en').slice(0, 2),
    };
  }).filter((article) => article.url && article.published_at);
}

module.exports = { fetchWebz };
