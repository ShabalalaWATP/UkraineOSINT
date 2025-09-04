const { ymd } = require('../utils/date');
const { idFromUrl } = require('../utils/url');
const { fetchJson } = require('../utils/http');

async function fetchGuardian({ start, end, q, maxPerSource }) {
  const key = process.env.GUARDIAN_API_KEY;
  if (!key) return [];
  const qs = new URLSearchParams({
    'q': q || 'Ukraine',
    'from-date': ymd(start),
    'to-date': ymd(end),
    'api-key': key,
    'page-size': String(Math.min(maxPerSource || 100, 200)),
    'show-fields': 'trailText,bodyText',
    'order-by': 'newest'
  });
  const url = `https://content.guardianapis.com/search?${qs.toString()}`;
  const data = await fetchJson(url, { timeoutMs: 12000 });
  const results = data?.response?.results || [];
  return results.map((it) => ({
    id: idFromUrl(it.webUrl),
    source: 'guardian',
    title: it.webTitle,
    url: it.webUrl,
    published_at: it.webPublicationDate,
    description: it.fields?.trailText,
    content_excerpt: it.fields?.bodyText?.slice(0, 500),
    lang: 'en',
  }));
}

module.exports = { fetchGuardian };
