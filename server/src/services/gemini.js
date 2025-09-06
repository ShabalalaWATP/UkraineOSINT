const { GoogleGenerativeAI } = require('@google/generative-ai');

function chunkArticles(articles, maxCharsPerChunk = 12000, maxDocs = 60) {
  const docs = articles.slice(0, maxDocs).map((a, idx) => {
    const n = idx + 1;
    const excerpt = (a.content_excerpt || a.description || a.title || '').replace(/\s+/g, ' ').slice(0, 1200);
    let host = '';
    try { host = new URL(a.url).hostname; } catch {}
    return `[#${n}] ${a.title || '(no title)'}\nOutlet: ${host || a.source}\nDate: ${a.published_at}\nURL: ${a.url}\nExcerpt: ${excerpt}`;
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
- If insufficient evidence, say so.
 - Keep language concise and analytical; avoid rhetorical flourish.
 - Prefer high-credibility mainstream outlets; treat tabloids/aggregators/partisan blogs as low credibility. Do NOT base conclusions solely on low-credibility sources.
 - Use proper names and locations; dates as DD Mon YYYY (UK).
 - Use inline badges in backticks for Evidence and Likelihood as shown.
 - Total length target: ~1200–1500 words.`;
  const focusDirective = `Focus directive: prioritize coverage of the analyst focus above when selecting events, structuring themes, and writing the Executive Summary. Explicitly reference focus items where applicable.`;
  return `${header}\n\n${scope}\n${intent}\n\n${focusDirective}\n\n${format}\n\n${rules}`;
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
      const instructions = `${prefix}You will receive a subset of the documents with IDs. Read and produce partial analysis notes that strictly follow the requested structure and include inline citations [#n]. Do not repeat the full documents.\n\nAnalyst focus: ${focus || '(none provided)'}\nIn your notes, prioritize items relevant to the focus and explicitly mention them where appropriate.\nFor each claim, include: an Evidence badge (\`Single-source\`/\`Multi-source\`/\`Contested\`), Sources & Outlets counts, and a Likelihood using the UK MI yardstick terms.`;
      const user = `Documents:\n\n${chunks[i]}`;
      const res = await client.generateContent([{ text: system }, { text: instructions }, { text: user }]);
      const text = res?.response?.text?.() || '';
      parts.push(text);
    }
    let synthesis = parts.join('\n\n');
    if (parts.length > 1) {
      const res = await client.generateContent([
        { text: system },
        { text: `Synthesize the partial analyses into ONE cohesive report following the exact section ordering and formatting rules. Merge and deduplicate content; keep inline citations [#n] intact and comprehensive. Ensure the analyst focus is clearly addressed throughout (especially in the Executive Summary and Thematic Analysis). For Claims and Corroboration, make sure each claim shows: Evidence badge, Sources & Outlets counts, and Likelihood using the UK MI yardstick. Analyst focus: ${focus || '(none provided)'}` },
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
  const fallbacks = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-pro', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];
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
