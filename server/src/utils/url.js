const crypto = require('crypto');

function canonicalizeUrl(input) {
  try {
    const u = new URL(input);
    const keepParams = new URLSearchParams();
    for (const [k, v] of u.searchParams.entries()) {
      const lk = k.toLowerCase();
      if (lk.startsWith('utm_') || lk === 'gclid' || lk === 'fbclid' || lk === 'mc_cid' || lk === 'mc_eid') continue;
      keepParams.append(k, v);
    }
    u.search = keepParams.toString();
    // strip AMP suffixes
    if (u.pathname.endsWith('/amp') || u.pathname.endsWith('.amp')) {
      u.pathname = u.pathname.replace(/\/(amp)$|(.amp)$/i, '');
    }
    return u.toString();
  } catch {
    return input;
  }
}

function idFromUrl(url) {
  const canon = canonicalizeUrl(url);
  return crypto.createHash('sha1').update(canon).digest('hex');
}

module.exports = { canonicalizeUrl, idFromUrl };

