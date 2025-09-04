const Parser = require('rss-parser');
const dayjs = require('dayjs');
const { idFromUrl } = require('../utils/url');

const parser = new Parser({ timeout: 15000 });

const FEEDS = [
  { name: 'Kyiv Independent', url: 'https://kyivindependent.com/rss' },
  { name: 'The Guardian - Ukraine', url: 'https://www.theguardian.com/world/ukraine/rss' },
  { name: 'BBC Europe', url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml' },
  { name: 'DW - Top Stories', url: 'https://www.dw.com/en/top-stories/rss' },
  { name: 'ISW - Updates', url: 'https://www.understandingwar.org/backgrounder/feed' }
];

async function fetchOne(feed, { start, end, q }) {
  try {
    const f = await parser.parseURL(feed.url);
    const items = (f.items || []).filter((it) => {
      const t = it.isoDate || it.pubDate || it.pubdate || it.date;
      if (!t) return false;
      const d = dayjs(t);
      return d.isAfter(dayjs(start).startOf('day').subtract(1, 'second')) && d.isBefore(dayjs(end).endOf('day').add(1, 'second'));
    }).filter((it) => {
      const text = `${it.title || ''} ${it.contentSnippet || it.content || ''}`.toLowerCase();
      return (q ? text.includes(q.toLowerCase()) : true);
    }).map((it) => ({
      id: idFromUrl(it.link),
      source: feed.name,
      title: it.title || '',
      url: it.link,
      published_at: it.isoDate || it.pubDate || '',
      description: it.contentSnippet || '',
      content_excerpt: (it.contentSnippet || it.content || '').slice(0, 500),
      lang: 'en',
    }));
    return items;
  } catch (e) {
    return [];
  }
}

async function fetchRss({ start, end, q, maxPerSource }) {
  const results = await Promise.all(FEEDS.map((f) => fetchOne(f, { start, end, q })));
  const flat = results.flat();
  const limited = flat
    .sort((a, b) => (new Date(b.published_at) - new Date(a.published_at)))
    .slice(0, Math.min(maxPerSource || 100, 200));
  return limited;
}

module.exports = { fetchRss };

