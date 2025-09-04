const { fetch } = require('undici');

async function fetchJson(url, { timeoutMs = 10000, headers } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText} ${text}`.trim());
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

module.exports = { fetchJson };

async function fetchText(url, { timeoutMs = 45000, headers } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers, redirect: 'follow' });
    const ctype = res.headers.get('content-type') || '';
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (ctype.includes('application/json')) {
      return await res.text();
    }
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

module.exports.fetchText = fetchText;
