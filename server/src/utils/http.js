const { Agent, fetch } = require('undici');

const SECRET_ENV_NAMES = [
  'GEMINI_API_KEY',
  'GUARDIAN_API_KEY',
  'CURRENTS_API_KEY',
  'GNEWS_API_KEY',
  'NEWS_API_KEY',
  'WEBZ_API_KEY',
];

function redactSecrets(value) {
  let out = String(value || '');
  for (const name of SECRET_ENV_NAMES) {
    const secret = process.env[name];
    if (secret && secret.length >= 6) {
      out = out.split(secret).join('[redacted]');
    }
  }
  return out
    .replace(/([?&](?:api[-_]?key|apikey|token|key)=)[^&\s"'<>]+/gi, '$1[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeErrorMessage(error, fallback = 'Request failed') {
  const message = typeof error === 'string' ? error : (error?.message || fallback);
  return redactSecrets(message).slice(0, 500) || fallback;
}

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
      throw new Error(sanitizeErrorMessage(`${res.status} ${res.statusText} ${text}`, `HTTP ${res.status}`));
    }
    return await res.json();
  } finally {
    clearTimeout(t);
    dispatcher.close().catch(() => {});
  }
}

module.exports = { fetchJson, sanitizeErrorMessage, redactSecrets };
