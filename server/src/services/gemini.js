const { GoogleGenAI } = require('@google/genai');
const { DEFAULT_GEMINI_MODEL, GEMINI_FALLBACK_MODELS } = require('../config/geminiModels');
const { extractFromUrl } = require('./extract');

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

const MAX_DOCS_PER_ANALYSIS = numberEnv('MAX_ANALYSIS_DOCS', 100);
const MAX_CHARS_PER_CHUNK = numberEnv('GEMINI_CHUNK_CHAR_LIMIT', 180000);
const MAX_EXCERPT_CHARS = numberEnv('GEMINI_EXCERPT_CHARS', 1200);
const MAX_ENRICHED_EXCERPT_CHARS = numberEnv('GEMINI_ENRICHED_EXCERPT_CHARS', 2400);
const AUTO_ENRICH_FRACTION = numberEnv('ANALYSIS_AUTO_ENRICH_FRACTION', 0.25);
const AUTO_ENRICH_MAX = numberEnv('ANALYSIS_AUTO_ENRICH_MAX', 25);
const AUTO_ENRICH_CONCURRENCY = numberEnv('ANALYSIS_AUTO_ENRICH_CONCURRENCY', 4);
const AUTO_ENRICH_TIMEOUT_MS = numberEnv('ANALYSIS_AUTO_ENRICH_TIMEOUT_MS', 8000);

const SOURCE_PROFILES = [
  { match: /(^|\.)reuters\.com$/i, tier: 'high', note: 'wire service; generally high reliability; watch for syndicated repeats', weight: 18 },
  { match: /(^|\.)apnews\.com$/i, tier: 'high', note: 'wire service; generally high reliability; watch for syndicated repeats', weight: 18 },
  { match: /(^|\.)bbc\.(co\.uk|com)$/i, tier: 'high', note: 'public broadcaster; generally high reliability', weight: 16 },
  { match: /(^|\.)theguardian\.com$/i, tier: 'high', note: 'major outlet; distinguish original reporting from cited third-party claims', weight: 14 },
  { match: /(^|\.)kyivindependent\.com$/i, tier: 'high', note: 'Ukraine-focused outlet; useful local reporting, possible national perspective', weight: 15 },
  { match: /(^|\.)understandingwar\.org$/i, tier: 'analysis', note: 'specialist military analysis; do not treat as direct event reporting unless it cites evidence', weight: 16 },
  { match: /(^|\.)dw\.com$/i, tier: 'high', note: 'public broadcaster; generally high reliability', weight: 13 },
  { match: /(^|\.)politico\.com$/i, tier: 'high', note: 'policy outlet; strong for diplomacy and government sourcing', weight: 12 },
  { match: /(^|\.)axios\.com$/i, tier: 'medium', note: 'political reporting; useful but often single-chain sourcing', weight: 10 },
  { match: /(^|\.)cbsnews\.com$/i, tier: 'medium', note: 'mainstream outlet; verify original sourcing', weight: 10 },
  { match: /(^|\.)cnn\.com$/i, tier: 'medium', note: 'mainstream outlet; verify original sourcing', weight: 10 },
  { match: /(^|\.)pbs\.org$/i, tier: 'medium', note: 'public media; generally reliable, often secondary summaries', weight: 10 },
  { match: /(^|\.)gov\.ua$/i, tier: 'official', note: 'Ukrainian official source; primary claim, not independent corroboration', weight: 14 },
  { match: /(^|\.)mil\.gov\.ua$/i, tier: 'official', note: 'Ukrainian military official source; primary claim, not independent corroboration', weight: 14 },
  { match: /(^|\.)nato\.int$/i, tier: 'official', note: 'NATO official source; primary policy statement', weight: 13 },
  { match: /(^|\.)gov\.uk$/i, tier: 'official', note: 'UK official source; primary policy statement', weight: 13 },
  { match: /(^|\.)state\.gov$/i, tier: 'official', note: 'US official source; primary policy statement', weight: 13 },
  { match: /(^|\.)defense\.gov$/i, tier: 'official', note: 'US defense official source; primary policy statement', weight: 13 },
  { match: /(^|\.)ria\.ru$/i, tier: 'state', note: 'Russian state media; useful for official/adversary claims, not independent confirmation', weight: -4 },
  { match: /(^|\.)tass\.com$/i, tier: 'state', note: 'Russian state media; useful for official/adversary claims, not independent confirmation', weight: -4 },
  { match: /(^|\.)rt\.com$/i, tier: 'state', note: 'Russian state media; useful for narratives/disinfo, not independent confirmation', weight: -8 },
  { match: /(^|\.)sputnikglobe\.com$/i, tier: 'state', note: 'Russian state media; useful for narratives/disinfo, not independent confirmation', weight: -8 },
  { match: /(^|\.)breitbart\.com$/i, tier: 'partisan', note: 'partisan outlet; do not use as sole basis for conclusions', weight: -6 },
  { match: /(^|\.)foxnews\.com$/i, tier: 'partisan', note: 'partisan/mainstream hybrid; verify original sourcing', weight: 2 },
  { match: /(^|\.)nationalinterest\.org$/i, tier: 'commentary', note: 'commentary/analysis outlet; avoid treating as primary event reporting', weight: 1 },
];

const EVENT_KEYWORDS = [
  'strike', 'strikes', 'missile', 'drone', 'shahed', 'kinzhal', 'air defense', 'air defence',
  'frontline', 'front line', 'offensive', 'counteroffensive', 'recaptured', 'captured',
  'donetsk', 'kharkiv', 'kherson', 'zaporizhzhia', 'crimea', 'black sea', 'kursk',
  'energy', 'power grid', 'infrastructure', 'sanctions', 'aid', 'weapons', 'tomahawk',
  'ceasefire', 'peace', 'negotiations', 'zelensky', 'putin', 'russia', 'ukraine',
  'nato', 'eu', 'frozen assets', 'children', 'deport', 'cyber',
];

const LOW_SIGNAL_PATTERNS = [
  /america\s*250/i,
  /naval station norfolk/i,
  /sports/i,
  /celebrity/i,
  /horoscope/i,
  /live updates?:?\s*$/i,
];

function createGeminiClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Missing GEMINI_API_KEY');
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function textFromResponse(response) {
  if (typeof response?.text === 'string') return response.text;
  const parts = response?.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part.text || '').join('');
}

function mergeUsageMetadata(total, next) {
  if (!next) return total;
  const out = { ...total };
  for (const [key, value] of Object.entries(next)) {
    if (typeof value === 'number') out[key] = (out[key] || 0) + value;
  }
  return out;
}

function compactText(value, limit) {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function articleHost(article) {
  try {
    return new URL(article.url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function sourceProfile(article) {
  const host = articleHost(article);
  const source = String(article.source || '').toLowerCase();
  const profile = SOURCE_PROFILES.find((item) => item.match.test(host));
  if (profile) return { host, ...profile };
  if (/guardian/.test(source)) return { host, tier: 'high', note: 'major outlet; distinguish original reporting from cited third-party claims', weight: 14 };
  if (/bbc/.test(source)) return { host, tier: 'high', note: 'public broadcaster; generally high reliability', weight: 16 };
  if (/isw|understandingwar/.test(source)) return { host, tier: 'analysis', note: 'specialist military analysis; do not treat as direct event reporting unless it cites evidence', weight: 16 };
  if (/kyiv independent/.test(source)) return { host, tier: 'high', note: 'Ukraine-focused outlet; useful local reporting, possible national perspective', weight: 15 };
  if (/gdelt|gnews|currents|newsdata/.test(source)) return { host, tier: 'aggregated', note: 'aggregated result; assess the linked outlet, not the aggregator', weight: 0 };
  return { host, tier: 'unknown', note: 'unprofiled source; judge cautiously from content and corroboration', weight: 0 };
}

function tokenSet(text) {
  return new Set(
    compactText(text, 4000)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2)
  );
}

function scoreArticle(article, { q, focus, newestMs, oldestMs }) {
  const profile = sourceProfile(article);
  const text = compactText(`${article.title || ''} ${article.description || ''} ${article.content_excerpt || ''}`, 6000);
  const lower = text.toLowerCase();
  const tokens = tokenSet(text);
  let score = 0;

  score += profile.weight;
  if (article.content_excerpt && article.content_excerpt.length > 300) score += 8;
  if (article.description && article.description.length > 80) score += 3;
  if (article.title && article.title.length > 20) score += 2;

  const queryTerms = compactText(q || 'Ukraine', 200).toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2);
  for (const term of queryTerms) {
    if (tokens.has(term)) score += 8;
  }

  const focusTerms = compactText(focus || '', 800).toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 4);
  const uniqueFocusTerms = Array.from(new Set(focusTerms)).slice(0, 40);
  for (const term of uniqueFocusTerms) {
    if (tokens.has(term)) score += 2;
  }

  for (const keyword of EVENT_KEYWORDS) {
    if (lower.includes(keyword)) score += 3;
  }
  for (const pattern of LOW_SIGNAL_PATTERNS) {
    if (pattern.test(lower)) score -= 20;
  }

  if (!/\bukrain(e|ian|ians)\b/i.test(lower) && !/\brussia(n|ns)?\b/i.test(lower)) score -= 20;

  const publishedMs = new Date(article.published_at).getTime();
  if (Number.isFinite(publishedMs) && Number.isFinite(newestMs) && newestMs > oldestMs) {
    score += ((publishedMs - oldestMs) / (newestMs - oldestMs)) * 10;
  }

  return { score, profile };
}

function rankedArticlesForAnalysis(articles, { q, focus, maxDocs }) {
  const candidates = articles.filter((article) => article?.url);
  const times = candidates.map((article) => new Date(article.published_at).getTime()).filter(Number.isFinite);
  const newestMs = times.length ? Math.max(...times) : NaN;
  const oldestMs = times.length ? Math.min(...times) : NaN;
  const ranked = candidates.map((article, originalIndex) => {
    const { score, profile } = scoreArticle(article, { q, focus, newestMs, oldestMs });
    return {
      ...article,
      analysis_rank: originalIndex + 1,
      analysis_score: Number(score.toFixed(2)),
      source_tier: profile.tier,
      source_note: profile.note,
      source_host: profile.host,
    };
  }).sort((a, b) => {
    if (b.analysis_score !== a.analysis_score) return b.analysis_score - a.analysis_score;
    return new Date(b.published_at) - new Date(a.published_at);
  });

  return ranked.slice(0, maxDocs);
}

async function enrichTopArticles(articles) {
  if (!AUTO_ENRICH_FRACTION || AUTO_ENRICH_FRACTION <= 0) {
    return { articles, enrichedCount: 0, attemptedCount: 0 };
  }

  const attemptedCount = Math.min(
    articles.length,
    AUTO_ENRICH_MAX,
    Math.max(1, Math.ceil(articles.length * AUTO_ENRICH_FRACTION))
  );
  if (attemptedCount <= 0) {
    return { articles, enrichedCount: 0, attemptedCount: 0 };
  }
  const out = articles.map((article) => ({ ...article }));
  let nextIndex = 0;
  let enrichedCount = 0;

  async function worker() {
    while (nextIndex < attemptedCount) {
      const index = nextIndex++;
      const article = out[index];
      if (!article?.url) continue;
      try {
        const data = await extractFromUrl(article.url, { timeoutMs: AUTO_ENRICH_TIMEOUT_MS });
        const text = compactText(data?.textContent, MAX_ENRICHED_EXCERPT_CHARS);
        if (text.length > compactText(article.content_excerpt || article.description || '', MAX_EXCERPT_CHARS).length) {
          out[index] = {
            ...article,
            title: article.title || data?.title || '',
            content_excerpt: text,
            enriched: true,
          };
          enrichedCount += 1;
        }
      } catch {
        // Extraction is a best-effort quality boost. Analysis must continue when sites block or time out.
      }
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(AUTO_ENRICH_CONCURRENCY, attemptedCount)) },
    () => worker()
  );
  await Promise.all(workers);
  return { articles: out, enrichedCount, attemptedCount };
}

function chunkArticles(articles, maxCharsPerChunk = MAX_CHARS_PER_CHUNK, maxDocs = MAX_DOCS_PER_ANALYSIS) {
  const docs = articles.slice(0, maxDocs).map((a, idx) => {
    const n = idx + 1;
    const excerptLimit = a.enriched ? MAX_ENRICHED_EXCERPT_CHARS : MAX_EXCERPT_CHARS;
    const excerpt = compactText(a.content_excerpt || a.description || a.title || '', excerptLimit);
    let host = '';
    try { host = new URL(a.url).hostname; } catch {}
    const sourceContext = a.source_tier
      ? `\nSource context: ${a.source_tier}; ${a.source_note || 'assess cautiously'}`
      : '';
    const rankContext = Number.isFinite(a.analysis_score)
      ? `\nSelection score: ${a.analysis_score}`
      : '';
    return `[#${n}] ${a.title || '(no title)'}\nOutlet: ${host || a.source}\nDate: ${a.published_at}\nURL: ${a.url}${sourceContext}${rankContext}\nExcerpt: ${excerpt}`;
  });
  const chunks = [];
  let buf = '';
  for (const doc of docs) {
    if ((buf + '\n\n' + doc).length > maxCharsPerChunk) {
      if (buf) chunks.push(buf);
      buf = doc;
    } else {
      buf = buf ? buf + '\n\n' + doc : doc;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

function buildOsintStructuredPrompt({ start, end, q, focus }) {
  const header = `You are an OSINT analyst producing a decision-ready report on the Ukraine war.`;
  const scope = `Timeframe: ${start} to ${end}. Topic: ${q}.`;
  const focusText = (focus && focus.trim())
    ? focus.trim()
    : 'operational changes, strikes, cross-border effects, aid/logistics, diplomacy/sanctions, domestic developments, cyber/info ops.';
  const intent = `Analyst priorities (focus): ${focusText}`;
  const format = `Return Markdown only with the following sections in order:

1) Executive Summary
- 5–8 bullets with bottom-line-up-front and significance.

2) Key Events (Bullets)
- Each: DD Mon YYYY — concise event — citations [#n][#m].

3) Timeline (Chronological)
- 10–20 entries, DD Mon YYYY — event — citations.

4) Thematic Analysis
- Operations (fronts/axes), Strikes, Diplomacy, Aid & Logistics, Domestic (RU/UA), Cyber/InfoOps, Economy/Energy.

5) Claims and Corroboration
- For each notable claim, use this mini-structure (one block per claim):
  - Claim: <one sentence>
  - Who asserts: <outlet/person>
  - Evidence: \`Single-source\` | \`Multi-source\` | \`Contested\`
  - Sources: <N> • Outlets: <M>
  - Assessment: <1–2 sentences>
  - Likelihood (UK MI yardstick): \`Almost certain (90–100%)\` | \`Highly likely (80–90%)\` | \`Likely (55–75%)\` | \`About as likely as not (40–60%)\` | \`Unlikely (20–45%)\` | \`Highly unlikely (10–20%)\` | \`Remote (0–10%)\`
  - Citations: [#n][#m]

6) Outliers & Disinfo
- What, why it’s questionable, likely impact, citations.

7) Assessment & Confidence
- 1 short paragraph; then "Confidence: low/medium/high" with reasons (sources, consistency, gaps).

8) Intelligence Gaps & Collection
- Bullets with concrete follow-ups, indicators to watch.

9) Sources Cited
- List [#n] with title or domain.`;
  const rules = `Rules:
- Use ONLY the provided documents; avoid speculation.
- Attribute clearly and cite inline with [#n] immediately after claims.
- Prefer cross-source corroboration; note contradictions explicitly.
- Treat Source context as a guide to reliability. Official and state sources are primary claims, not independent corroboration.
- Do not count repeated reports from the same original wire, agency, government statement, or quoted interview as independent corroboration.
- Exclude low-signal or off-topic items from Key Events and Timeline unless they materially affect Ukraine war operations, diplomacy, aid, sanctions, energy security, cyber/info ops, or humanitarian issues.
- Prioritize events with operational impact, policy impact, or multi-source significance over generic political diary items.
- If insufficient evidence, say so.
 - Keep language concise and analytical; avoid rhetorical flourish.
 - Prefer high-credibility mainstream outlets; treat tabloids/aggregators/partisan blogs as low credibility. Do NOT base conclusions solely on low-credibility sources.
 - Use proper names and locations; dates as DD Mon YYYY (UK).
 - Use inline badges in backticks for Evidence and Likelihood as shown.
 - Total length target: ~1200–1500 words.`;
  const focusDirective = `Focus directive: prioritize coverage of the analyst focus above when selecting events, structuring themes, and writing the Executive Summary. Explicitly reference focus items where applicable.`;
  return `${header}\n\n${scope}\n${intent}\n\n${focusDirective}\n\n${format}\n\n${rules}`;
}

async function analyzeWithGemini({ start, end, q, focus = '', promptPreset = 'osint_structured_v1', articles, model = DEFAULT_GEMINI_MODEL, maxDocs = 60 }) {
  const ai = createGeminiClient();
  const docCount = Math.max(1, Math.min(MAX_DOCS_PER_ANALYSIS, Number(maxDocs) || MAX_DOCS_PER_ANALYSIS, articles.length));
  const selectedArticles = rankedArticlesForAnalysis(articles, { q, focus, maxDocs: docCount });
  const actualDocCount = selectedArticles.length;

  let system;
  if (promptPreset === 'osint_structured_v1') {
    system = buildOsintStructuredPrompt({ start, end, q, focus });
  } else {
    system = `You are an analyst. Summarize documents for ${q} from ${start} to ${end} with citations like [#n].`;
  }

  const prepared = await enrichTopArticles(selectedArticles);
  const chunks = chunkArticles(prepared.articles, MAX_CHARS_PER_CHUNK, docCount);

  async function runWithModel(useModel) {
    const parts = [];
    let usageMetadata = {};
    for (let i = 0; i < chunks.length; i++) {
      const prefix = chunks.length > 1 ? `Part ${i + 1}/${chunks.length}. ` : '';
      const instructions = `${prefix}You will receive a subset of the documents with IDs. Read and produce partial analysis notes that strictly follow the requested structure and include inline citations [#n]. Do not repeat the full documents.\n\nAnalyst focus: ${focus || '(none provided)'}\nIn your notes, prioritize items relevant to the focus and explicitly mention them where appropriate.\nFor each claim, include: an Evidence badge (\`Single-source\`/\`Multi-source\`/\`Contested\`), Sources & Outlets counts, and a Likelihood using the UK MI yardstick terms.`;
      const user = `Documents:\n\n${chunks[i]}`;
      const res = await ai.models.generateContent({
        model: useModel,
        contents: `${instructions}\n\n${user}`,
        config: {
          systemInstruction: system,
          temperature: 0.2,
        },
      });
      usageMetadata = mergeUsageMetadata(usageMetadata, res?.usageMetadata);
      const text = textFromResponse(res);
      parts.push(text);
    }
    let synthesis = parts.join('\n\n');
    if (parts.length > 1) {
      const res = await ai.models.generateContent({
        model: useModel,
        contents: `Synthesize the partial analyses into ONE cohesive report following the exact section ordering and formatting rules. Merge and deduplicate content; keep inline citations [#n] intact and comprehensive. Ensure the analyst focus is clearly addressed throughout (especially in the Executive Summary and Thematic Analysis). For Claims and Corroboration, make sure each claim shows: Evidence badge, Sources & Outlets counts, and Likelihood using the UK MI yardstick. Analyst focus: ${focus || '(none provided)'}\n\n${synthesis}`,
        config: {
          systemInstruction: system,
          temperature: 0.2,
        },
      });
      usageMetadata = mergeUsageMetadata(usageMetadata, res?.usageMetadata);
      synthesis = textFromResponse(res) || synthesis;
    }
    return { report: synthesis, chunks: chunks.length, usageMetadata };
  }

  let usedModel = model;
  let report = '';
  let chunkCount = chunks.length;
  let fallback = null;
  let usageMetadata = {};
  // Ensure we try the requested model first, then fallback chain (skipping duplicates)
  const chain = [usedModel, ...GEMINI_FALLBACK_MODELS.filter(m => m !== usedModel)];
  let lastErr = null;
  for (const m of chain) {
    try {
      const out = await runWithModel(m);
      usedModel = m;
      report = out.report; chunkCount = out.chunks;
      usageMetadata = out.usageMetadata || {};
      break;
    } catch (err) {
      lastErr = err;
      fallback = (fallback ? fallback + ' -> ' : '') + m;
    }
  }
  if (!report) throw lastErr || new Error('Model generation failed');

  return {
    model: usedModel,
    start,
    end,
    q,
    focus,
    promptPreset,
    docCount: actualDocCount,
    candidateCount: articles.length,
    enrichedCount: prepared.enrichedCount,
    enrichAttemptedCount: prepared.attemptedCount,
    selectedArticles: prepared.articles.map((article, index) => ({
      id: article.id,
      source: article.source,
      title: article.title,
      url: article.url,
      published_at: article.published_at,
      description: article.description,
      content_excerpt: article.content_excerpt,
      lang: article.lang,
      analysis_rank: index + 1,
      analysis_score: article.analysis_score,
      source_tier: article.source_tier,
      source_note: article.source_note,
      source_host: article.source_host,
      enriched: Boolean(article.enriched),
    })),
    chunks: chunkCount,
    report,
    usageMetadata,
    fallback,
  };
}

module.exports = { analyzeWithGemini };
