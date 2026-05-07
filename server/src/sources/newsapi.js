const { ymd } = require('../utils/date');
const { idFromUrl } = require('../utils/url');
const { fetchJson } = require('../utils/http');

function usefulArticle(article) {
  if (!article?.url || !article?.publishedAt) return false;
  if (article.title === '[Removed]') return false;
  if (/^https?:\/\/removed\.com\/?$/i.test(article.url)) return false;
  return true;
}

async function fetchNewsApi({ start, end, q, maxPerSource, language }) {
  const key = process.env.NEWS_API_KEY;
  if (!key) return [];

  const qs = new URLSearchParams({
    q: q || 'Ukraine',
    from: ymd(start),
    to: ymd(end),
    language: (language || 'en').slice(0, 2),
    sortBy: 'relevancy',
    pageSize: String(Math.min(maxPerSource || 100, 100)),
    page: '1',
  });

  const url = `https://newsapi.org/v2/everything?${qs.toString()}`;
  const data = await fetchJson(url, {
    timeoutMs: 15000,
    headers: { 'X-Api-Key': key },
  });

  if (data?.status === 'error') {
    throw new Error(`${data.code || 'newsapi_error'} ${data.message || 'NewsAPI request failed'}`.trim());
  }

  return (data?.articles || []).filter(usefulArticle).map((a) => ({
    id: idFromUrl(a.url),
    source: 'newsapi',
    title: a.title || '',
    url: a.url,
    published_at: a.publishedAt,
    description: a.description || '',
    content_excerpt: a.content || a.description || '',
    lang: (language || 'en').slice(0, 2),
  }));
}

module.exports = { fetchNewsApi };
