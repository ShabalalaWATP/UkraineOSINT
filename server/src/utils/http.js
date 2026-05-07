const { Agent, fetch } = require('undici');

function createDispatcher(timeoutMs) {
  return new Agent({
    connect: {
      timeout: Math.max(timeoutMs, 30000),
    },
  });
}

async function fetchJson(url, { timeoutMs = 10000, headers } = {}) {
  const controller = new AbortController();
  const dispatcher = createDispatcher(timeoutMs);
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      dispatcher,
      signal: controller.signal,
      headers: {
        'user-agent': 'UkraineOSINT/0.1 (+https://github.com/ShabalalaWATP/UkraineOSINT)',
        ...(headers || {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText} ${text}`.trim());
    }
    return await res.json();
  } finally {
    clearTimeout(t);
    dispatcher.close().catch(() => {});
  }
}

module.exports = { fetchJson };

async function fetchText(url, { timeoutMs = 45000, headers } = {}) {
  const controller = new AbortController();
  const dispatcher = createDispatcher(timeoutMs);
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      dispatcher,
      signal: controller.signal,
      headers: {
        'user-agent': 'UkraineOSINT/0.1 (+https://github.com/ShabalalaWATP/UkraineOSINT)',
        ...(headers || {}),
      },
      redirect: 'follow',
    });
    const ctype = res.headers.get('content-type') || '';
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (ctype.includes('application/json')) {
      return await res.text();
    }
    return await res.text();
  } finally {
    clearTimeout(t);
    dispatcher.close().catch(() => {});
  }
}

module.exports.fetchText = fetchText;
