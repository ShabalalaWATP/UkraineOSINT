const { gdeltTimestamp } = require('../utils/date');
const { idFromUrl } = require('../utils/url');
const { fetchJson } = require('../utils/http');

async function fetchGdelt({ start, end, q, maxPerSource }) {
  const qs = new URLSearchParams({
    query: q || 'Ukraine',
    startdatetime: gdeltTimestamp(`${start}T00:00:00Z`),
    enddatetime: gdeltTimestamp(`${end}T23:59:59Z`),
    format: 'json',
    maxrecords: String(Math.min(maxPerSource || 100, 250)),
  });
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?${qs.toString()}`;
  const data = await fetchJson(url, { timeoutMs: 12000 });
  const items = (data.articles || []).map((a) => ({
    id: idFromUrl(a.url),
    source: 'gdelt',
    title: a.title || '',
    url: a.url,
    published_at: a.seendate || '',
    description: a.sourcecountry ? `Country: ${a.sourcecountry}` : undefined,
    content_excerpt: a.title || '',
    lang: a.language || undefined,
  }));
  return items;
}

module.exports = { fetchGdelt };
