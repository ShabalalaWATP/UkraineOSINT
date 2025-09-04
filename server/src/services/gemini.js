const { GoogleGenerativeAI } = require('@google/generative-ai');

function chunkArticles(articles, maxCharsPerChunk = 12000, maxDocs = 60) {
  const docs = articles.slice(0, maxDocs).map((a, idx) => {
    const n = idx + 1;
    const excerpt = (a.content_excerpt || a.description || a.title || '').replace(/\s+/g, ' ').slice(0, 800);
    return `[#${n}] ${a.title || '(no title)'}\nSource: ${a.source}\nDate: ${a.published_at}\nURL: ${a.url}\nExcerpt: ${excerpt}`;
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
  const intent = focus && focus.trim()
    ? `Analyst priorities (focus): ${focus.trim()}`
    : `Analyst priorities (focus): operational changes, strikes, cross-border effects, aid/logistics, diplomacy/sanctions, domestic developments, cyber/info ops.`;
  const format = `Return Markdown only with the following sections in order:

1) Executive Summary
- 5–8 bullets with bottom-line-up-front and significance.

2) Key Events (Bullets)
- Each: YYYY-MM-DD — concise event — citations [#n][#m].

3) Timeline (Chronological)
- 10–20 entries, YYYY-MM-DD — event — citations.

4) Thematic Analysis
- Operations (fronts/axes), Strikes, Diplomacy, Aid & Logistics, Domestic (RU/UA), Cyber/InfoOps, Economy/Energy.

5) Claims and Corroboration
- For each notable claim: Claim; Who asserts; Corroboration level (single-source / multi-source / contested); Assessment; Citations.

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
- If insufficient evidence, say so.
- Keep language concise and analytical; avoid rhetorical flourish.
- Use proper names and locations; dates as YYYY-MM-DD.
- Total length target: ~1200–1500 words.`;
  return `${header}\n\n${scope}\n${intent}\n\n${format}\n\n${rules}`;
}

async function analyzeWithGemini({ start, end, q, focus = '', promptPreset = 'osint_structured_v1', articles, model = 'gemini-1.5-flash', maxDocs = 60 }) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  let system;
  if (promptPreset === 'osint_structured_v1') {
    system = buildOsintStructuredPrompt({ start, end, q, focus });
  } else {
    system = `You are an analyst. Summarize documents for ${q} from ${start} to ${end} with citations like [#n].`;
  }

  const chunks = chunkArticles(articles, 12000, maxDocs);

  async function runWithModel(useModel) {
    const client = genAI.getGenerativeModel({ model: useModel });
    const parts = [];
    for (let i = 0; i < chunks.length; i++) {
      const prefix = chunks.length > 1 ? `Part ${i + 1}/${chunks.length}. ` : '';
      const instructions = `${prefix}You will receive a subset of the documents with IDs. Read and produce partial analysis notes that strictly follow the requested structure and include inline citations [#n]. Do not repeat the full documents.`;
      const user = `Documents:\n\n${chunks[i]}`;
      const res = await client.generateContent([{ text: system }, { text: instructions }, { text: user }]);
      const text = res?.response?.text?.() || '';
      parts.push(text);
    }
    let synthesis = parts.join('\n\n');
    if (parts.length > 1) {
      const res = await client.generateContent([
        { text: system },
        { text: 'Synthesize the partial analyses into ONE cohesive report following the exact section ordering and formatting rules. Merge and deduplicate content; keep inline citations [#n] intact and comprehensive.' },
        { text: synthesis },
      ]);
      synthesis = res?.response?.text?.() || synthesis;
    }
    return { report: synthesis, chunks: chunks.length };
  }

  let usedModel = model;
  let report = '';
  let chunkCount = chunks.length;
  let fallback = null;
  const fallbacks = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  // Ensure we try the requested model first, then fallback chain (skipping duplicates)
  const chain = [usedModel, ...fallbacks.filter(m => m !== usedModel)];
  let lastErr = null;
  for (const m of chain) {
    try {
      const out = await runWithModel(m);
      usedModel = m;
      report = out.report; chunkCount = out.chunks;
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
    chunks: chunkCount,
    report,
    fallback,
  };
}

module.exports = { analyzeWithGemini };
