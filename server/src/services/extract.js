const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const dns = require('dns').promises;
const net = require('net');
const { fetch } = require('undici');

// Basic network range checks (quick-win SSRF guard)
function isPrivateIPv4(addr) {
  const parts = addr.split('.').map((x) => parseInt(x, 10));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast/reserved 224.0.0.0/4
  return false;
}

function isPrivateIPv6(addr) {
  const s = addr.toLowerCase();
  if (s === '::1') return true; // loopback
  if (s === '::') return true; // unspecified
  if (s.startsWith('fe80:')) return true; // link-local
  if (s.startsWith('fc') || s.startsWith('fd')) return true; // unique local
  if (s.startsWith('fec0:')) return true; // site local (deprecated)
  // IPv4-mapped IPv6 ::ffff:a.b.c.d
  if (s.includes('::ffff:')) {
    const last = s.split('::ffff:').pop();
    if (last && last.includes('.')) return isPrivateIPv4(last);
  }
  return false;
}

async function assertPublicResolvableHost(parsed) {
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost') throw new Error('Blocked host');
  // Block obvious IP literals quickly
  if (net.isIP(hostname)) {
    if (net.isIP(hostname) === 4 && isPrivateIPv4(hostname)) throw new Error('Blocked private IPv4 host');
    if (net.isIP(hostname) === 6 && isPrivateIPv6(hostname)) throw new Error('Blocked private IPv6 host');
    return; // literal public IP
  }
  // DNS resolution check
  let addrs = [];
  try {
    addrs = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (e) {
    throw new Error('Host resolution failed');
  }
  if (!addrs.length) throw new Error('No DNS results');
  for (const rec of addrs) {
    if (rec.family === 4 && isPrivateIPv4(rec.address)) throw new Error('Blocked private IPv4 resolution');
    if (rec.family === 6 && isPrivateIPv6(rec.address)) throw new Error('Blocked private IPv6 resolution');
  }
}

function validateAndNormalizeUrl(input) {
  let u;
  try { u = new URL(input); } catch { throw new Error('Invalid URL'); }
  const scheme = u.protocol.replace(':', '').toLowerCase();
  if (!(scheme === 'http' || scheme === 'https')) throw new Error('Only http/https allowed');
  // Optional: block non-standard ports
  if (u.port && !(u.port === '80' || u.port === '443')) throw new Error('Blocked non-standard port');
  return u;
}

async function safeFetchHtml(url, { timeoutMs = 15000, headers = {}, maxRedirects = 3, maxContentLength = 2_000_000 } = {}) {
  let current = validateAndNormalizeUrl(url);
  await assertPublicResolvableHost(current);

  for (let i = 0; i <= maxRedirects; i++) {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(current.toString(), {
        signal: controller.signal,
        redirect: 'manual',
        headers,
      });

      // Handle redirects manually with validation on each hop
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get('location');
        if (!loc) throw new Error('Redirect without Location');
        const next = new URL(loc, current);
        const normalized = validateAndNormalizeUrl(next.toString());
        await assertPublicResolvableHost(normalized);
        current = normalized;
        continue;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const len = Number(res.headers.get('content-length') || '0');
      if (Number.isFinite(len) && len > 0 && len > maxContentLength) throw new Error('Content too large');

      // Read body; undici will buffer; we rely on content-length guard above
      const text = await res.text();
      if (text.length > maxContentLength) throw new Error('Content too large');
      return { html: text, finalUrl: current.toString() };
    } finally {
      clearTimeout(to);
    }
  }
  throw new Error('Too many redirects');
}

async function extractFromUrl(url) {
  const { html, finalUrl } = await safeFetchHtml(url, {
    timeoutMs: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (OSINT Aggregator; +https://localhost) Chrome/120',
      'Accept-Language': 'en,en-GB;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    maxRedirects: 3,
    maxContentLength: 2_000_000,
  });
  const dom = new JSDOM(html, { url: finalUrl });
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
