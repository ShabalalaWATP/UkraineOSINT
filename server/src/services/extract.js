const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const { fetchText } = require('../utils/http');

async function extractFromUrl(url) {
  const html = await fetchText(url, {
    timeoutMs: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (OSINT Aggregator; +https://localhost) Chrome/120',
      'Accept-Language': 'en,en-GB;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article) return { title: '', byline: '', textContent: '', content: '', length: 0 };
  const textContent = (article.textContent || '').trim();
  const content = (article.content || '').trim();
  return {
    title: article.title || '',
    byline: article.byline || '',
    textContent,
    content,
    length: textContent.length,
  };
}

module.exports = { extractFromUrl };
