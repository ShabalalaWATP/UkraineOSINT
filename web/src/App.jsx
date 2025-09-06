import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Document, Packer, Paragraph, HeadingLevel } from 'docx'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// If building for static hosting, set VITE_API_BASE to your deployed API host, e.g.
//   VITE_API_BASE = "https://your-api.onrender.com"
const API_BASE = import.meta.env.VITE_API_BASE || ''

const defaultStart = new Date(Date.now() - 6 * 24 * 3600 * 1000)
  .toISOString().slice(0, 10)
const defaultEnd = new Date().toISOString().slice(0, 10)
const defaultFocus = 'Operational changes, strikes, cross-border effects, aid/logistics, diplomacy/sanctions, domestic developments, cyber/info ops.'

const SOURCE_KEYS = [
  { id: 'gdelt', label: 'GDELT' },
  { id: 'guardian', label: 'Guardian' },
  { id: 'currents', label: 'Currents' },
  { id: 'newsdata', label: 'Newsdata' },
  { id: 'gnews', label: 'GNews' },
  { id: 'rss', label: 'RSS' },
]

const QUERY_PRESETS = [
  'Ukraine War',
  'Drone attacks Ukraine',
  'Missile defence Ukraine',
  'Black Sea Fleet',
  'Crimea strikes',
  'NATO aid Ukraine',
  'Sanctions Russia',
  'Frontline updates Donetsk',
  'British Army Ukraine',
  'Special Forces Ukraine',
  'Foreign Legion Ukraine',
  'Battlefield Changes Ukraine',
]

export default function App() {
  // Persisted UI state key
  const LS_KEY = 'osint_ui_state_v1'
  const initRef = useRef(false)
  const syncTimerRef = useRef(null)

  const [start, setStart] = useState(defaultStart)
  const [end, setEnd] = useState(defaultEnd)
  const [q, setQ] = useState('Ukraine')
  const [sources, setSources] = useState(SOURCE_KEYS.map(s => s.id))
  const [loadingFetch, setLoadingFetch] = useState(false)
  const [loadingAnalyze, setLoadingAnalyze] = useState(false)
  const [articles, setArticles] = useState([])
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [model, setModel] = useState('gemini-2.5-flash')
  const [preset, setPreset] = useState('osint_structured_v1')
  const [focus, setFocus] = useState(defaultFocus)
  const [docLimit, setDocLimit] = useState(30)
  const [showLimit, setShowLimit] = useState(60)
  const [analysisOnTop, setAnalysisOnTop] = useState(true)
  const [analyzedDocs, setAnalyzedDocs] = useState([])
  const [copied, setCopied] = useState(false)
  const [toasts, setToasts] = useState([])
  const [shareCopied, setShareCopied] = useState(false)
  const [mdSaved, setMdSaved] = useState(false)
  const [docxSaved, setDocxSaved] = useState(false)
  const [htmlSaved, setHtmlSaved] = useState(false)
  const [pdfOpened, setPdfOpened] = useState(false)
  const [jsonSaved, setJsonSaved] = useState(false)
  const [csvArticlesSaved, setCsvArticlesSaved] = useState(false)
  const [csvAnalyzedSaved, setCsvAnalyzedSaved] = useState(false)
  const reportRef = useRef(null)
  const keywordRef = useRef(null)
  const headerRef = useRef(null)
  const actionsRef = useRef(null)
  const analysisTopRef = useRef(null)
  const [showAdvanced, setShowAdvanced] = useState(true)
  const [lastFetch, setLastFetch] = useState(null) // { count, at }
  const [lastAnalyze, setLastAnalyze] = useState(null) // { docs, at, model }
  const [tocOpen, setTocOpen] = useState(false)
  const [headerHeight, setHeaderHeight] = useState(64)
  const [scrollOffset, setScrollOffset] = useState(140)
  const [showFab, setShowFab] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [enrichDone, setEnrichDone] = useState(0)
  const [enrichTotal, setEnrichTotal] = useState(0)
  const enrichAbortRef = useRef(false)
  const toc = useMemo(() => {
    if (!analysis?.report) return []
    const lines = analysis.report.split(/\r?\n/)
    const out = []
    for (const line of lines) {
      const m = line.match(/^(#{1,6})\s+(.*)$/)
      if (!m) continue
      const depth = m[1].length
      if (depth > 3) continue
      const text = m[2].trim()
      const id = text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
      out.push({ id, text, depth })
    }
    return out
  }, [analysis?.report])

  // Normalize model output into stricter Markdown (helps if the model used numbered titles)
  function normalizeReportText(text) {
    if (!text) return ''
    let t = String(text)
    // Convert lines like "1) Executive Summary" into Markdown headings
    t = t.replace(/^\s*(\d+)\)\s+(.*)$/gm, (m, n, rest) => {
      const num = parseInt(n, 10)
      if (num >= 1 && num <= 9) return `## ${rest}`
      return m
    })
    return t
  }

  // Utility: YYYY-MM-DD from date-like value (UTC)
  function ymd(d) {
    try { return new Date(d).toISOString().slice(0,10) } catch { return '' }
  }

  // Build timeline bins (articles per day)
  const timelineDays = useMemo(() => {
    if (!start || !end) return []
    const startD = new Date(`${start}T00:00:00Z`)
    const endD = new Date(`${end}T00:00:00Z`)
    if (!(startD instanceof Date) || isNaN(startD) || !(endD instanceof Date) || isNaN(endD)) return []
    const days = []
    for (let d = new Date(startD); d <= endD; d.setUTCDate(d.getUTCDate() + 1)) {
      days.push(d.toISOString().slice(0,10))
    }
    const counts = Object.create(null)
    for (const a of articles) {
      const k = ymd(a.published_at)
      if (!k) continue
      counts[k] = (counts[k] || 0) + 1
    }
    return days.map(date => ({ date, count: counts[date] || 0 }))
  }, [articles, start, end])

  const timelineMax = useMemo(() => Math.max(1, ...timelineDays.map(d => d.count)), [timelineDays])
  const timelinePeak = useMemo(() => timelineDays.reduce((p,c) => c.count > (p?.count||0) ? c : p, { date: start, count: 0 }), [timelineDays, start])

  // UK date formatter (DD Mon YYYY)
  function formatUK(dateStr) {
    if (!dateStr) return ''
    try {
      const d = new Date(`${dateStr}T00:00:00Z`)
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch {
      return dateStr
    }
  }

  // Helpers: parse primitives safely
  const toInt = (v, d) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : d
  }
  const toBool = (v, d) => {
    if (v === '1' || v === 'true') return true
    if (v === '0' || v === 'false') return false
    return d
  }

  // On mount: hydrate from URL, then localStorage for any missing
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search || '')
      const urlPatch = {}
      if (params.get('start')) urlPatch.start = params.get('start')
      if (params.get('end')) urlPatch.end = params.get('end')
      if (params.get('q')) urlPatch.q = params.get('q')
      if (params.get('sources')) urlPatch.sources = params.get('sources').split(',').filter(Boolean)
      if (params.get('model')) urlPatch.model = params.get('model')
      if (params.get('preset')) urlPatch.preset = params.get('preset')
      if (params.get('focus')) urlPatch.focus = params.get('focus')
      if (params.get('docLimit')) urlPatch.docLimit = toInt(params.get('docLimit'), 30)
      if (params.get('showLimit')) urlPatch.showLimit = toInt(params.get('showLimit'), 60)
      if (params.get('analysisOnTop')) urlPatch.analysisOnTop = toBool(params.get('analysisOnTop'), true)

      const ls = localStorage.getItem(LS_KEY)
      const saved = ls ? JSON.parse(ls) : null
      const patch = { ...(saved || {}), ...urlPatch } // URL wins

      if (patch.start) setStart(patch.start)
      if (patch.end) setEnd(patch.end)
      if (typeof patch.q === 'string') setQ(patch.q)
      if (Array.isArray(patch.sources) && patch.sources.length) setSources(patch.sources)
      if (typeof patch.model === 'string') setModel(patch.model)
      if (typeof patch.preset === 'string') setPreset(patch.preset)
      if (typeof patch.focus === 'string') setFocus(patch.focus)
      if (typeof patch.docLimit !== 'undefined') setDocLimit(patch.docLimit)
      if (typeof patch.showLimit !== 'undefined') setShowLimit(patch.showLimit)
      if (typeof patch.analysisOnTop === 'boolean') setAnalysisOnTop(patch.analysisOnTop)
    } catch {}
    finally {
      initRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync key UI state to URL + localStorage (debounced)
  useEffect(() => {
    if (!initRef.current) return
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => {
      try {
        // Persist to localStorage
        const state = { start, end, q, sources, model, preset, focus, docLimit, showLimit, analysisOnTop }
        localStorage.setItem(LS_KEY, JSON.stringify(state))

        // Build query string (avoid noise by omitting defaults where possible)
        const params = new URLSearchParams()
        if (start) params.set('start', start)
        if (end) params.set('end', end)
        if (q) params.set('q', q)
        const allSrc = SOURCE_KEYS.map(s => s.id)
        const isAll = sources.length === allSrc.length && allSrc.every(s => sources.includes(s))
        if (!isAll) params.set('sources', sources.join(','))
        if (model && model !== 'gemini-2.5-flash') params.set('model', model)
        if (preset && preset !== 'osint_structured_v1') params.set('preset', preset)
        if (focus && focus !== defaultFocus) params.set('focus', focus)
        if (docLimit !== 30) params.set('docLimit', String(docLimit))
        if (showLimit !== 60) params.set('showLimit', String(showLimit))
        if (analysisOnTop !== true) params.set('analysisOnTop', analysisOnTop ? '1' : '0')

        const qs = params.toString()
        const newUrl = qs ? (`?${qs}`) : ''
        const loc = window.location
        const finalUrl = loc.pathname + newUrl + loc.hash
        window.history.replaceState(null, '', finalUrl)
      } catch {}
    }, 250)
    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current) }
  }, [start, end, q, sources, model, preset, focus, docLimit, showLimit, analysisOnTop])

  // Section navigation helpers
  // Recompute offsets based on header + actions bar heights
  useEffect(() => {
    function updateOffsets() {
      const h = headerRef.current?.offsetHeight || 0
      const a = actionsRef.current?.offsetHeight || 0
      setHeaderHeight(h)
      setScrollOffset(h + a + 16)
    }
    updateOffsets()
    window.addEventListener('resize', updateOffsets)
    const obs = new MutationObserver(updateOffsets)
    if (actionsRef.current) obs.observe(actionsRef.current, { childList: true, subtree: true })
    return () => { window.removeEventListener('resize', updateOffsets); obs.disconnect() }
  }, [showAdvanced])
  const getHeadingPositions = () => {
    if (!toc || toc.length === 0) return []
    return toc.map(t => {
      const el = document.getElementById(t.id)
      if (!el) return null
      const rect = el.getBoundingClientRect()
      const top = rect.top + window.pageYOffset
      return { id: t.id, top }
    }).filter(Boolean).sort((a,b) => a.top - b.top)
  }
  const [currentIdx, setCurrentIdx] = useState(-1)
  useEffect(() => {
    function onScroll() {
      const heads = getHeadingPositions()
      if (heads.length === 0) { setCurrentIdx(-1); return }
      const y = window.pageYOffset + scrollOffset + 4
      let idx = -1
      for (let i = 0; i < heads.length; i++) {
        if (heads[i].top <= y) idx = i
        else break
      }
      setCurrentIdx(idx)
      setShowFab(window.pageYOffset > 240)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis?.report, toc.length])

  function scrollToSectionByIndex(nextIndex) {
    const heads = getHeadingPositions()
    if (nextIndex < 0 || nextIndex >= heads.length) return
    const target = heads[nextIndex]
    const y = Math.max(0, target.top - scrollOffset)
    window.scrollTo({ top: y, behavior: 'smooth' })
  }
  function goPrevSection() {
    if (currentIdx <= 0) return
    scrollToSectionByIndex(currentIdx - 1)
  }
  function goNextSection() {
    const heads = getHeadingPositions()
    const idx = currentIdx < 0 ? 0 : currentIdx + 1
    if (idx >= heads.length) return
    scrollToSectionByIndex(idx)
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : ''
      const isTyping = tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)
      if (isTyping) return
      const k = e.key.toLowerCase()
      if (k === '/') { e.preventDefault(); keywordRef.current?.focus(); return }
      if (k === 'f') { fetchArticles(); return }
      if (k === 'a') { runAnalysis(); return }
      if (k === 'r') { resetAll(); return }
      if (k === 'c') { clearOutput(); return }
      if (k === '?') { pushToast('Shortcuts: F=Fetch • A=Analyze • /=Focus • R=Reset • C=Clear • U=URL • M=.md • D=.docx • H=HTML • P=Print • J=JSON', 'success'); return }
      if (k === 'u') { copyShareLink(); return }
      if (!analysis) return
      if (k === 'm') { downloadReport(); return }
      if (k === 'd') { downloadDOCX(); return }
      if (k === 'h') { downloadHTML(); return }
      if (k === 'p') { printPDF(); return }
      if (k === 'j') { downloadJSON(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [analysis, start, end, q, model, docLimit])

  const selectedLabel = useMemo(() => {
    return SOURCE_KEYS.filter(s => sources.includes(s.id)).map(s => s.label).join(', ')
  }, [sources])

  async function fetchJSON(url, opts = {}, timeoutMs = 20000) {
    const controller = new AbortController()
    const to = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const fullUrl = (API_BASE && url.startsWith('/api')) ? (API_BASE.replace(/\/$/, '') + url) : url
      const res = await fetch(fullUrl, { ...opts, signal: controller.signal })
      const data = await res.json()
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || `HTTP ${res.status}`)
      }
      return data
    } catch (e) {
      if (e?.name === 'AbortError') {
        const secs = Math.round(timeoutMs / 1000)
        throw new Error(`Request timed out after ${secs}s`)
      }
      throw e
    } finally {
      clearTimeout(to)
    }
  }

  function pushToast(message, type = 'success') {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, message, type, state: 'toast-enter' }])
    setTimeout(() => setToasts(prev => prev.map(t => t.id === id ? { ...t, state: 'toast-enter-active' } : t)), 10)
    setTimeout(() => setToasts(prev => prev.map(t => t.id === id ? { ...t, state: 'toast-exit-active' } : t)), 3200)
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3600)
  }

  async function fetchArticles() {
    setLoadingFetch(true); setError(''); setAnalysis(null); setStats(null)
    try {
      const params = new URLSearchParams({ start, end, q, sources: sources.join(','), maxPerSource: '50', language: 'en' })
      const j = await fetchJSON(`/api/articles?${params.toString()}`, {}, 20000)
      setArticles(j.articles || [])
      setStats(j.stats || null)
      pushToast(`Fetched ${j.articles?.length || 0} articles`, 'success')
      setLastFetch({ count: j.articles?.length || 0, at: Date.now() })
    } catch (e) {
      setError(e.message)
      pushToast(`Fetch failed: ${e.message}`, 'error')
    } finally {
      setLoadingFetch(false)
    }
  }

  async function runAnalysis() {
    setLoadingAnalyze(true); setError('')
    try {
      const toAnalyze = articles.slice(0, Math.max(5, Math.min(120, Number(docLimit) || 40)))
      const payload = { start, end, q, model, promptPreset: preset, focus, maxDocs: toAnalyze.length, articles: toAnalyze }
      // Increase timeout to 5 minutes for large analyses / slower models
      const j = await fetchJSON('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, 300000)
      setAnalysis(j.analysis)
      setAnalyzedDocs(toAnalyze)
      pushToast('Analysis completed', 'success')
      setLastAnalyze({ docs: toAnalyze.length, at: Date.now(), model })
    } catch (e) {
      setError(e.message)
      pushToast(`Analysis failed: ${e.message}`, 'error')
    } finally {
      setLoadingAnalyze(false)
    }
  }

  function toggleSource(id) {
    setSources(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  function clearOutput() {
    setArticles([])
    setStats(null)
    setAnalysis(null)
    setError('')
    setAnalyzedDocs([])
    pushToast('Cleared output', 'success')
  }

  function resetAll() {
    setStart(defaultStart)
    setEnd(defaultEnd)
    setQ('')
    setSources(SOURCE_KEYS.map(s => s.id))
    setModel('gemini-2.5-flash')
    setPreset('osint_structured_v1')
    setFocus(defaultFocus)
    setDocLimit(30)
    setShowLimit(60)
    setAnalysisOnTop(true)
    clearOutput()
    pushToast('Reset all settings', 'success')
  }

  async function extractOne(url) {
    try {
      const j = await fetchJSON('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) }, 60000)
      return j.data || null
    } catch (e) {
      setError('Extract failed: ' + e.message)
      pushToast(`Extract failed: ${e.message}`, 'error')
      return null
    }
  }

  async function extractForTopN() {
    const n = Math.max(5, Math.min(120, Number(docLimit) || 30))
    const targets = articles.slice(0, n)
    if (!targets.length) return
    setEnriching(true)
    setEnrichDone(0)
    setEnrichTotal(targets.length)
    enrichAbortRef.current = false
    for (let i = 0; i < targets.length; i++) {
      if (enrichAbortRef.current) break
      const a = targets[i]
      const data = await extractOne(a.url)
      if (data && data.textContent) {
        const excerpt = data.textContent.replace(/\s+/g, ' ').slice(0, 2000)
        setArticles(prev => prev.map(x => x.id === a.id ? { ...x, content_excerpt: excerpt, title: x.title || data.title } : x))
      }
      setEnrichDone(i + 1)
    }
    const stopped = enrichAbortRef.current
    setEnriching(false)
    enrichAbortRef.current = false
    if (stopped) {
      pushToast(`Enrichment stopped at ${enrichDone}/${enrichTotal}`, 'error')
    } else {
      pushToast(`Extracted content for top ${targets.length}`, 'success')
    }
  }

  function stopEnrich() {
    enrichAbortRef.current = true
  }

  function downloadCSV(rows, fileLabel = 'articles') {
    const header = ['id','source','title','url','published_at','lang','description','content_excerpt']
    const esc = (v) => {
      const s = String(v ?? '').replaceAll('"', '""')
      return '"' + s + '"'
    }
    const lines = [header.join(',')]
    for (const r of rows) {
      lines.push([
        esc(r.id), esc(r.source), esc(r.title), esc(r.url), esc(r.published_at), esc(r.lang), esc(r.description), esc(r.content_excerpt)
      ].join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const topic = (q || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    a.href = url
    a.download = `osint-${fileLabel}_${start}_to_${end}_${topic || 'report'}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const nToExtract = useMemo(() => Math.max(5, Math.min(120, Number(docLimit) || 30)), [docLimit])

  function buildExportMarkdown() {
    if (!analysis) return ''
    const meta = [
      `# OSINT Report: ${q || 'Ukraine'} (${start} → ${end})`,
      `- Model: ${analysis.model}${analysis.fallback ? ' (fallback used)' : ''}`,
      `- Documents analyzed: ${analyzedDocs.length}`,
      `- Focus: ${focus ? focus : '(none)'}`,
      `- Generated: ${new Date().toISOString()}`,
      ''
    ].join('\n')
    const body = normalizeReportText(analysis.report || '').trim()
    let cites = ''
    if (analyzedDocs.length > 0) {
      const lines = analyzedDocs.map((d, i) => `- [#${i + 1}] ${d.title || d.url} — ${d.url}`)
      cites = `\n\n## Sources Cited\n${lines.join('\n')}`
    }
    return `${meta}${body}${cites}`
  }

  function exportFileName() {
    const topic = (q || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    return `osint-report_${start}_to_${end}_${topic || 'report'}.md`
  }

  async function copyReport() {
    try {
      const text = buildExportMarkdown()
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      // toast
      const m = 'Report copied to clipboard'
      const id = Math.random().toString(36).slice(2)
      setToasts(prev => [...prev, { id, message: m, type: 'success', state: 'toast-enter' }])
      setTimeout(() => setToasts(prev => prev.map(t => t.id === id ? { ...t, state: 'toast-enter-active' } : t)), 10)
      setTimeout(() => setToasts(prev => prev.map(t => t.id === id ? { ...t, state: 'toast-exit-active' } : t)), 1200)
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 1600)
    } catch (e) {
      setError('Copy failed: ' + e.message)
    }
  }

  function downloadReport() {
    try {
      const text = buildExportMarkdown()
      const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = exportFileName()
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setMdSaved(true); setTimeout(() => setMdSaved(false), 1500)
    } catch (e) {
      setError('Download failed: ' + e.message)
    }
  }

  function copyShareLink() {
    try {
      const href = window.location.href
      navigator.clipboard.writeText(href)
        .then(() => { setShareCopied(true); setTimeout(() => setShareCopied(false), 1500); pushToast('Share link copied to clipboard', 'success') })
        .catch(() => {
          // Fallback for older browsers
          const input = document.createElement('input')
          input.value = href
          document.body.appendChild(input)
          input.select()
          document.execCommand('copy')
          input.remove()
          setShareCopied(true); setTimeout(() => setShareCopied(false), 1500); pushToast('Share link copied to clipboard', 'success')
        })
    } catch (e) {
      setError('Copy link failed: ' + e.message)
      pushToast('Copy link failed: ' + e.message, 'error')
    }
  }

  function buildExportHTML() {
    const inner = reportRef.current ? reportRef.current.innerHTML : '<p>No content</p>'
    const cites = analyzedDocs.length > 0
      ? `<section class="citations-list"><h2>Sources Cited</h2><ul>${analyzedDocs.map((d, i) => `<li id="cite-${i+1}">[#${i+1}] <a href="${d.url}">${(d.title || d.url).replace(/</g,'&lt;')}</a></li>`).join('')}</ul></section>`
      : ''
    const title = `OSINT Report: ${q || 'Ukraine'} (${start} → ${end})`
    const css = `
      :root { color-scheme: dark; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, Noto Sans, 'Apple Color Emoji', 'Segoe UI Emoji'; margin: 24px; background: #0a0a0a; color: #e5e7eb; }
      h1,h2,h3{ margin: 1rem 0 .5rem; line-height: 1.2; }
      h1{ font-size: 1.6rem; }
      h2{ font-size: 1.25rem; }
      h3{ font-size: 1.1rem; }
      .meta { color:#9ca3af; font-size:.9rem; margin-bottom: .75rem; }
      .markdown ul{ list-style: disc; margin-left: 1.25rem; }
      .markdown ol{ list-style: decimal; margin-left: 1.25rem; }
      .markdown li{ margin: .25rem 0; }
      .markdown a{ color:#60a5fa; }
      .markdown code{ background:#111827; padding:.1rem .3rem; border-radius:4px }
      .markdown pre{ background:#111827; padding:.75rem; border-radius:8px; border:1px solid #1f2937; overflow:auto }
      .citations-list{ margin-top:1.5rem; font-size:.95rem; color:#cbd5e1 }
      .citations-list a{ color:#93c5fd }
      header .title{ background: linear-gradient(90deg, #00B0FF 0%, #FFD500 100%); -webkit-background-clip:text; background-clip:text; color:transparent; font-weight:700; font-size:1.8rem; }
      @media print {
        body { color-scheme: light; background:#fff; color:#111; }
        .markdown a { color:#0645ad; }
      }
    `
    return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title><style>${css}</style></head><body>
      <header>
        <div class="title">Ukraine OSINT Aggregator — Report</div>
        <div class="meta">${title}<br/>Model: ${analysis?.model || ''}${analysis?.fallback ? ' (fallback used)' : ''} · Documents: ${analyzedDocs.length} · Generated: ${new Date().toISOString()} · Focus: ${(focus || '(none)').replace(/</g,'&lt;')}</div>
      </header>
      <main>
        <section class="markdown">${inner}</section>
        ${cites}
      </main>
    </body></html>`
  }

  function downloadHTML() {
    try {
      const html = buildExportHTML()
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const topic = (q || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      a.download = `osint-report_${start}_to_${end}_${topic || 'report'}.html`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setHtmlSaved(true); setTimeout(() => setHtmlSaved(false), 1500)
    } catch (e) {
      setError('HTML export failed: ' + e.message)
    }
  }

  function printPDF() {
    try {
      const html = buildExportHTML()
      const w = window.open('', '_blank')
      if (!w) throw new Error('Popup blocked')
      w.document.open()
      w.document.write(html)
      w.document.close()
      w.focus()
      // Give the browser a moment to layout before printing
      setTimeout(() => { try { w.print(); } catch {} }, 300)
      setPdfOpened(true); setTimeout(() => setPdfOpened(false), 1500)
    } catch (e) {
      setError('Print failed: ' + e.message)
    }
  }

  function buildDocxFromMarkdown(md) {
    const lines = (md || '').split(/\r?\n/)
    const paras = []
    for (const line of lines) {
      if (!line.trim()) { paras.push(new Paragraph({ text: '' })); continue }
      const m = line.match(/^(#{1,6})\s+(.*)$/)
      if (m) {
        const depth = m[1].length
        const text = m[2]
        const heading = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][Math.min(depth,6)-1]
        paras.push(new Paragraph({ text, heading }))
        continue
      }
      const bullet = line.match(/^\s*[-*]\s+(.*)$/)
      if (bullet) {
        paras.push(new Paragraph({ text: bullet[1], bullet: { level: 0 } }))
        continue
      }
      paras.push(new Paragraph({ text: line }))
    }
    // Add citations
    if (analyzedDocs.length > 0) {
      paras.push(new Paragraph({ text: '' }))
      paras.push(new Paragraph({ text: 'Sources Cited', heading: HeadingLevel.HEADING_2 }))
      analyzedDocs.forEach((d, i) => {
        paras.push(new Paragraph({ text: `[#${i + 1}] ${d.title || d.url} — ${d.url}`, bullet: { level: 0 } }))
      })
    }
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({ text: `OSINT Report: ${q || 'Ukraine'} (${start} → ${end})`, heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: `Model: ${analysis?.model || ''}${analysis?.fallback ? ' (fallback used)' : ''}` }),
            new Paragraph({ text: `Documents analyzed: ${analyzedDocs.length}` }),
            new Paragraph({ text: `Generated: ${new Date().toISOString()}` }),
            new Paragraph({ text: '' }),
            ...paras,
          ],
        },
      ],
    })
    return doc
  }

  async function downloadDOCX() {
    try {
      const text = analysis?.report || ''
      const doc = buildDocxFromMarkdown(text)
      const blob = await Packer.toBlob(doc)
      const a = document.createElement('a')
      const url = URL.createObjectURL(blob)
      a.href = url
      const topic = (q || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      a.download = `osint-report_${start}_to_${end}_${topic || 'report'}.docx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setDocxSaved(true); setTimeout(() => setDocxSaved(false), 1500)
    } catch (e) {
      setError('DOCX export failed: ' + e.message)
    }
  }

  function downloadJSON() {
    try {
      const payload = {
        start,
        end,
        q,
        model: analysis?.model,
        fallback: !!analysis?.fallback,
        generatedAt: new Date().toISOString(),
        report: analysis?.report || '',
        analyzedDocs,
        articles,
        stats,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const topic = (q || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      a.href = url
      a.download = `osint-report_${start}_to_${end}_${topic || 'report'}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setJsonSaved(true); setTimeout(() => setJsonSaved(false), 1500)
    } catch (e) {
      setError('JSON export failed: ' + e.message)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden ua-sides">
      {/* Animated aurora background accents */}
      <div className="aurora absolute -top-40 -left-40 h-[420px] w-[420px] rounded-full"></div>
      <div className="aurora two absolute -bottom-40 -right-40 h-[420px] w-[420px] rounded-full"></div>
      <div className="aurora three absolute -top-10 right-1/3 h-[360px] w-[360px] rounded-full"></div>
      <header ref={headerRef} className="border-b border-neutral-800/60 sticky top-0 bg-neutral-950/70 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/Ukraine.jpeg"
              alt="Ukraine badge"
              className="badge-img"
              onError={(e)=>{
                if (e.currentTarget.getAttribute('data-alt-tried') !== '1') {
                  e.currentTarget.setAttribute('data-alt-tried','1');
                  e.currentTarget.src = '/Ukraine.JPEG';
                } else {
                  e.currentTarget.style.display = 'none';
                }
              }}
            />
            <div>
              <h1 className="title-main">Ukraine OSINT Aggregator</h1>
              <p className="subtitle">Curate multi-source reports with Gemini — fast, focused, cited.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 relative">
            <div className="text-xs text-neutral-400">Local • Dark Mode</div>
            <a
              href="https://github.com/ShabalalaWATP"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub @ShabalalaWATP"
              className="icon-btn"
              title="GitHub @ShabalalaWATP"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 .5C5.73.5.98 5.24.98 11.51c0 4.86 3.15 8.98 7.51 10.43.55.1.75-.24.75-.53 0-.26-.01-1.12-.02-2.03-3.05.66-3.69-1.3-3.69-1.3-.5-1.27-1.22-1.6-1.22-1.6-.99-.68.08-.66.08-.66 1.09.08 1.67 1.12 1.67 1.12.97 1.66 2.55 1.18 3.17.9.1-.7.38-1.18.69-1.45-2.44-.28-5.01-1.22-5.01-5.44 0-1.2.43-2.17 1.12-2.94-.11-.28-.48-1.41.11-2.94 0 0 .92-.29 3.02 1.12.88-.24 1.83-.36 2.77-.36.94 0 1.88.12 2.77.36 2.09-1.41 3.01-1.12 3.01-1.12.6 1.53.23 2.66.12 2.94.69.77 1.11 1.74 1.11 2.94 0 4.22-2.58 5.16-5.03 5.43.39.34.73 1 .73 2.02 0 1.46-.01 2.64-.01 3 0 .29.2.64.76.53 4.35-1.46 7.5-5.58 7.5-10.43C23.03 5.24 18.29.5 12 .5z"/>
              </svg>
            </a>
            <div className="relative">
              <button
                className="icon-btn"
                aria-label="Keyboard shortcuts"
                title="Keyboard shortcuts"
                onClick={() => pushToast('Shortcuts: F=Fetch • A=Analyze • /=Focus • R=Reset • C=Clear • U=URL • M=.md • D=.docx • H=HTML • P=Print • J=JSON', 'success')}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm.88 14.76h-1.76v-1.76h1.76v1.76zM12 13.2a.88.88 0 01-.88-.88V7.52h1.76v4.8c0 .49-.39.88-.88.88z"/></svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-6">
        {/* Sticky Actions Bar */}
        <div className="sticky z-20" style={{ top: headerHeight }}>
          <div ref={actionsRef} className="glass card-neon p-3 flex flex-wrap items-center gap-3">
            <div className="text-sm text-neutral-300">Actions</div>
            <div className="flex items-center gap-2">
              <button className="btn-neon" onClick={fetchArticles} disabled={loadingFetch || loadingAnalyze || enriching}>
                {loadingFetch ? <span className="spinner" /> : null}
                {loadingFetch ? 'Fetching…' : 'Fetch'}
              </button>
              <button className="btn-neon" onClick={runAnalysis} disabled={loadingAnalyze || loadingFetch || enriching || articles.length === 0}>
                {loadingAnalyze ? <span className="spinner" /> : null}
                {loadingAnalyze ? 'Analyzing…' : `Analyze (${Math.min(articles.length, Math.max(5, Math.min(120, Number(docLimit) || 40)))})`}
              </button>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <label className="label mr-1">Docs</label>
              <input type="number" min={5} max={120} className="input w-20" value={docLimit} onChange={e => setDocLimit(e.target.value)} />
              <label className="label ml-2">Top</label>
              <input type="checkbox" className="w-4 h-4" checked={analysisOnTop} onChange={e => setAnalysisOnTop(e.target.checked)} />
              <button className="btn-outline" onClick={() => setShowAdvanced(s => !s)}>{showAdvanced ? 'Hide Advanced' : 'Show Advanced'}</button>
            </div>
            {(lastFetch || lastAnalyze) && (
              <div className="w-full text-[11px] text-neutral-500 flex flex-wrap gap-3">
                {lastFetch && <span>Last fetch: {lastFetch.count} @ {new Date(lastFetch.at).toLocaleTimeString()}</span>}
                {lastAnalyze && <span>Last analyze: {lastAnalyze.docs} docs @ {new Date(lastAnalyze.at).toLocaleTimeString()} ({lastAnalyze.model})</span>}
              </div>
            )}
          </div>
        </div>

        {showAdvanced && (
        <section className="glass card-neon p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="label">Start Date</label>
              <input type="date" className="input w-full" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div>
              <label className="label">End Date</label>
              <input type="date" className="input w-full" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
            <div>
              <label className="label">Keyword</label>
              <input ref={keywordRef} type="text" className="input w-full" value={q} onChange={e => setQ(e.target.value)} placeholder="Ukraine" />
            </div>
            <div>
              <label className="label">Model</label>
              <select className="input w-full" value={model} onChange={e => setModel(e.target.value)}>
                <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</option>
                <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                <option value="gemini-2.0-flash">gemini-2.0-flash</option>
              </select>
              <div className="text-xs text-neutral-500 mt-1">
                2.5 Flash: free, balanced speed/quality. 2.5 Flash‑Lite: fastest/cheapest. 2.5 Pro: deeper reasoning (slower). 2.0 Flash: stable backup.
              </div>
            </div>
          </div>

          <div className="mt-3">
            <div className="label mb-2">Quick Presets</div>
            <div className="chips-scroll flex gap-2 overflow-x-auto whitespace-nowrap pb-1">
              {QUERY_PRESETS.map((term) => {
                const active = q.toLowerCase() === term.toLowerCase()
                return (
                  <button key={term} type="button" className={`chip ${active ? 'chip-active' : ''}`} onClick={() => setQ(term)}>
                    {term}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-4">
            <div className="label mb-2">Sources</div>
            <div className="flex flex-wrap gap-3">
              {SOURCE_KEYS.map(s => (
                <label key={s.id} className={`px-3 py-2 rounded-md border cursor-pointer ${sources.includes(s.id) ? 'bg-uaBlue/20 border-uaBlue/40' : 'bg-neutral-900 border-neutral-800'}`}>
                  <input type="checkbox" className="mr-2 align-middle" checked={sources.includes(s.id)} onChange={() => toggleSource(s.id)} />
                  <span className="align-middle">{s.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="label">Preset</label>
              <select className="input w-full" value={preset} onChange={e => setPreset(e.target.value)}>
                <option value="osint_structured_v1">OSINT Structured Report (v1)</option>
              </select>
            </div>
            <div>
              <label className="label">Docs to Analyze (5–120)</label>
              <input type="number" min={5} max={120} className="input w-full" value={docLimit} onChange={e => setDocLimit(e.target.value)} />
            </div>
            <div>
              <label className="label">Show Articles (UI)</label>
              <input type="number" min={10} max={500} className="input w-full" value={showLimit} onChange={e => setShowLimit(e.target.value)} />
            </div>
            <div className="flex flex-col items-start gap-2 justify-end">
              <label className="inline-flex items-center gap-2 text-sm text-neutral-300">
                <input type="checkbox" className="w-4 h-4" checked={analysisOnTop} onChange={e => setAnalysisOnTop(e.target.checked)} />
                Analysis on top
              </label>
              <div className="flex items-end gap-3">
                <button className="btn-neon" onClick={fetchArticles} disabled={loadingFetch || loadingAnalyze}>
                  {loadingFetch ? <span className="spinner" /> : null}
                  {loadingFetch ? 'Fetching…' : 'Fetch Articles'}
                </button>
                <button className="btn-neon" onClick={runAnalysis} disabled={loadingAnalyze || loadingFetch || articles.length === 0}>
                  {loadingAnalyze ? <span className="spinner" /> : null}
                  {loadingAnalyze ? 'Analyzing…' : `Analyze (${Math.min(articles.length, Math.max(5, Math.min(120, Number(docLimit) || 40)))})`}
                </button>
              </div>
            </div>
          </div>
          <div className="mt-3">
            <label className="label">Focus (optional)</label>
            <textarea className="input w-full min-h-[72px]" value={focus} onChange={e => setFocus(e.target.value)} placeholder="What should the report emphasize?" />
          </div>
          <div className="mt-2 text-sm text-neutral-400">Selected sources: {selectedLabel || 'None'}</div>
          <div className="mt-3 flex gap-3 flex-wrap items-center">
            <button className="btn-outline" type="button" onClick={clearOutput}>Clear Output</button>
            <button className="btn-danger" type="button" onClick={resetAll}>Reset All</button>
            <button
              className="btn-outline"
              type="button"
              title="Copy a shareable link with your current settings"
              onClick={copyShareLink}
            >
              {shareCopied ? 'Copied!' : 'Share Link'}
            </button>
            <button
              className="btn-outline"
              type="button"
              title="Fetch full article text for the first N results (based on Docs to Analyze) to enrich analysis with better excerpts."
              onClick={extractForTopN}
              disabled={!articles.length || loadingFetch || loadingAnalyze || enriching}
            >
              Enrich Full Text (Top {nToExtract})
            </button>
            {enriching && (
              <div className="flex items-center gap-2 text-xs text-neutral-300">
                <span className="spinner" />
                Enriching {enrichDone}/{enrichTotal}
                <button className="btn-xs" onClick={stopEnrich}>Stop</button>
              </div>
            )}
            <button
              className="btn-outline"
              type="button"
              onClick={() => { downloadCSV(articles, 'articles'); setCsvArticlesSaved(true); setTimeout(()=>setCsvArticlesSaved(false), 1500) }}
              disabled={!articles.length}
            >
              {csvArticlesSaved ? 'Saved!' : 'Download CSV (Articles)'}
            </button>
            <button
              className="btn-outline"
              type="button"
              onClick={() => { downloadCSV(analyzedDocs, 'analyzed'); setCsvAnalyzedSaved(true); setTimeout(()=>setCsvAnalyzedSaved(false), 1500) }}
              disabled={!analyzedDocs.length}
            >
              {csvAnalyzedSaved ? 'Saved!' : 'Download CSV (Analyzed)'}
            </button>
          </div>
          {stats && (
            <div className="mt-2 text-xs text-neutral-500">
              Source stats: {stats.map(s => `${s.source}(${s.count}${s.error ? ' err' : ''}, ${s.ms}ms)`).join(' · ')}
            </div>
          )}
          {/* Timeline visual */}
          {timelineDays.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
                <span>Timeline (articles per day)</span>
                <span>{formatUK(timelinePeak?.date)} — {timelinePeak?.count || 0} articles</span>
              </div>
              <div className="timeline" role="img" aria-label="Articles per day">
                {timelineDays.map((d, i) => (
                  <div
                    key={d.date + i}
                    className="bar"
                    title={`${formatUK(d.date)} — ${d.count} ${d.count===1?'article':'articles'}`}
                    style={{ height: `${Math.round((d.count / timelineMax) * 100)}%` }}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-neutral-500 mt-1">
                <span>{formatUK(timelineDays[0]?.date)}</span>
                <span>{formatUK(timelineDays[Math.floor(timelineDays.length/2)]?.date)}</span>
                <span>{formatUK(timelineDays[timelineDays.length - 1]?.date)}</span>
              </div>
            </div>
          )}
          {error && <div className="mt-3 text-red-400">{error}</div>}
        </section>
        )}

        {analysisOnTop && (
          <section ref={analysisTopRef} className="glass card-neon watermark-ua p-4">
            <h2 className="font-semibold mb-3 title-main">Analysis</h2>
            {!analysis && !loadingAnalyze && <div className="text-neutral-400">Run analysis to see the synthesized report with citations.</div>}
            {loadingAnalyze && (
              <div className="space-y-2">
                <div className="text-neutral-300"><span className="spinner inline-block align-middle mr-2" />Analyzing with {model}…</div>
                <div className="skeleton skeleton-title w-1/3"></div>
                <div className="skeleton skeleton-line w-2/3"></div>
                <div className="skeleton skeleton-line w-3/4"></div>
                <div className="skeleton skeleton-line w-1/2"></div>
              </div>
            )}
            {analysis && (
              <div className="max-w-none">
                <div className="text-xs text-neutral-400">Model: {analysis.model}{analysis.fallback ? ' (fallback used)' : ''} · Focus: {(focus || '(none)')}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="btn-outline" onClick={copyReport}>{copied ? 'Copied!' : 'Copy Markdown'}</button>
                  <button className="btn-outline" onClick={downloadReport}>{mdSaved ? 'Saved!' : 'Download .md'}</button>
                  <button className="btn-outline" onClick={downloadDOCX}>{docxSaved ? 'Saved!' : 'Download .docx'}</button>
                  <button className="btn-outline" onClick={downloadHTML}>{htmlSaved ? 'Saved!' : 'Download HTML'}</button>
                  <button className="btn-outline" onClick={printPDF}>{pdfOpened ? 'Opened' : 'Print to PDF'}</button>
                  <button className="btn-outline" onClick={downloadJSON}>{jsonSaved ? 'Saved!' : 'Export JSON'}</button>
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {toc.length > 0 && (
                    <>
                      <button className="btn-xs" onClick={goPrevSection} disabled={currentIdx <= 0}>Prev section</button>
                      <button className="btn-xs" onClick={goNextSection} disabled={currentIdx >= toc.length - 1}>Next section</button>
                    </>
                  )}
                  <button className="btn-xs ml-auto" onClick={() => analysisTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Back to top</button>
                </div>
                {toc.length > 0 && (
                  <div className={`mt-3 toc ${tocOpen ? '' : 'hidden'} lg:block`}>
                    <div className="text-neutral-500 mb-1">Table of Contents</div>
                    {toc.map((t, i) => (
                      <a key={t.id} href={`#${t.id}`} className={`toc-item l${t.depth} ${i===currentIdx ? 'active' : ''}`} onClick={(e)=>{e.preventDefault(); const el=document.getElementById(t.id); if (el) { const y = el.getBoundingClientRect().top + window.pageYOffset - scrollOffset; window.scrollTo({ top: y, behavior:'smooth' }); }}}>
                        {t.text}
                      </a>
                    ))}
                  </div>
                )}
                <div ref={reportRef} className="mt-2 markdown">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({node, ...props}) => { const txt = String(props.children).replace(/[,]/g,''); const id = txt.toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-'); return <h1 id={id} {...props} /> },
                      h2: ({node, ...props}) => { const txt = String(props.children).replace(/[,]/g,''); const id = txt.toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-'); return <h2 id={id} {...props} /> },
                      h3: ({node, ...props}) => { const txt = String(props.children).replace(/[,]/g,''); const id = txt.toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-'); return <h3 id={id} {...props} /> },
                      a: ({href, ...props}) => {
                        const h = href || ''
                        if (h.startsWith('#')) {
                          return <a href={h} onClick={(e)=>{ e.preventDefault(); const id=h.slice(1); const el=document.getElementById(id); if (el){ const y=el.getBoundingClientRect().top + window.pageYOffset - scrollOffset; window.scrollTo({ top:y, behavior:'smooth' }); } }} {...props} />
                        }
                        return <a href={h} target="_blank" rel="noreferrer" {...props} />
                      },
                    }}
                  >
                    {normalizeReportText(analysis.report || '').replace(/\[#(\d+)\]/g, (_m, n) => `[#${n}](#cite-${n})`)}
                  </ReactMarkdown>
                </div>
                {analyzedDocs.length > 0 && (
                  <div className="citations-list mt-4">
                    <div className="mb-1 font-medium">Citations</div>
                    <ul className="list-disc ml-5">
                      {analyzedDocs.map((d, i) => (
                        <li key={d.id + i} id={`cite-${i+1}`}>
                          [#{i+1}] <a href={d.url} target="_blank" rel="noreferrer">{d.title || d.url}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {analysisOnTop ? (
          <section className="glass card-neon p-4">
            <h2 className="font-semibold mb-3 title-main">Articles (showing {Math.min(articles.length, Number(showLimit) || 60)} of {articles.length})</h2>
            <div className="space-y-3 max-h-[60vh] overflow-auto pr-2">
              {loadingFetch && Array.from({ length: 6 }).map((_, i) => (
                <div key={'sk'+i} className="link-card">
                  <div className="skeleton skeleton-text w-24 mb-2"></div>
                  <div className="skeleton skeleton-title w-2/3"></div>
                  <div className="skeleton skeleton-line w-full mt-2"></div>
                  <div className="skeleton skeleton-line w-5/6 mt-2"></div>
                </div>
              ))}
              {!loadingFetch && articles.slice(0, Math.max(10, Math.min(500, Number(showLimit) || 60))).map((a, idx) => (
                <div key={a.id + idx} className="link-card">
                  <div className="flex items-center justify-between gap-3">
                    <div className="badge-source flex items-center gap-1">
                      <img src={`https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(a.url)}`} alt="" className="w-3.5 h-3.5 rounded-sm"/>
                      <span>{a.source}</span>
                    </div>
                    <div className="text-xs text-neutral-500">{new Date(a.published_at).toLocaleString()}</div>
                  </div>
                  <a href={a.url} target="_blank" rel="noreferrer" className="title-item mt-1 text-neutral-100 block">{a.title || a.url}</a>
                  <div className="desc-item mt-1 break-words">{a.description || (a.content_excerpt ? a.content_excerpt.slice(0, 240) + (a.content_excerpt.length > 240 ? '…' : '') : '')}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      className="btn-xs"
                      title="Extract full text for this article to improve analysis."
                      disabled={enriching}
                      onClick={() => extractOne(a.url).then(data => { if (data?.textContent) { const excerpt = data.textContent.replace(/\s+/g,' ').slice(0,2000); setArticles(prev => prev.map(x => x.id === a.id ? { ...x, content_excerpt: excerpt, title: x.title || data.title } : x)) } })}
                    >
                      Enrich
                    </button>
                    {a.content_excerpt && <span className="badge">extracted</span>}
                    <a className="btn-xs" href={a.url} target="_blank" rel="noreferrer">Open</a>
                  </div>
                </div>
              ))}
              {articles.length === 0 && <div className="text-neutral-400">No articles yet. Choose a range and fetch.</div>}
            </div>
          </section>
        ) : (
          <section className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3 glass card-neon p-4">
              <h2 className="font-semibold mb-3 title-main">Articles (showing {Math.min(articles.length, Number(showLimit) || 60)} of {articles.length})</h2>
              <div className="space-y-3 max-h-[60vh] overflow-auto pr-2">
                {articles.slice(0, Math.max(10, Math.min(500, Number(showLimit) || 60))).map((a, idx) => (
                  <a key={a.id + idx} href={a.url} target="_blank" rel="noreferrer" className="link-card">
                    <div className="flex items-center justify-between gap-3">
                      <div className="badge-source flex items-center gap-1"><img src={`https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(a.url)}`} alt="" className="w-3.5 h-3.5 rounded-sm"/><span>{a.source}</span></div>
                      <div className="text-xs text-neutral-500">{new Date(a.published_at).toLocaleString()}</div>
                    </div>
                    <div className="title-item mt-1 text-neutral-100">{a.title || a.url}</div>
                    <div className="desc-item mt-1 break-words">{a.description || a.content_excerpt || ''}</div>
                  </a>
                ))}
                {articles.length === 0 && <div className="text-neutral-400">No articles yet. Choose a range and fetch.</div>}
              </div>
            </div>
            <div ref={analysisTopRef} className="glass card-neon watermark-ua p-4">
              <h2 className="font-semibold mb-3 title-main">Analysis</h2>
              {!analysis && !loadingAnalyze && <div className="text-neutral-400">Run analysis to see the synthesized report with citations.</div>}
              {loadingAnalyze && (
                <div className="space-y-2">
                  <div className="text-neutral-300"><span className="spinner inline-block align-middle mr-2" />Analyzing with {model}…</div>
                  <div className="skeleton skeleton-title w-1/3"></div>
                  <div className="skeleton skeleton-line w-2/3"></div>
                  <div className="skeleton skeleton-line w-3/4"></div>
                  <div className="skeleton skeleton-line w-1/2"></div>
                </div>
              )}
              {analysis && (
                <div className="max-w-none lg:grid lg:grid-cols-[220px_1fr] lg:gap-4">
                  <div className="text-xs text-neutral-400">Model: {analysis.model}{analysis.fallback ? ' (fallback used)' : ''} · Focus: {(focus || '(none)')}</div>
                  <div className="mt-2 flex flex-wrap gap-2 lg:col-span-2">
                    <button className="btn-outline" onClick={copyReport}>{copied ? 'Copied!' : 'Copy Markdown'}</button>
                    <button className="btn-outline" onClick={downloadReport}>{mdSaved ? 'Saved!' : 'Download .md'}</button>
                    <button className="btn-outline" onClick={downloadDOCX}>{docxSaved ? 'Saved!' : 'Download .docx'}</button>
                    <button className="btn-outline" onClick={downloadHTML}>{htmlSaved ? 'Saved!' : 'Download HTML'}</button>
                    <button className="btn-outline" onClick={printPDF}>{pdfOpened ? 'Opened' : 'Print to PDF'}</button>
                    <button className="btn-outline" onClick={downloadJSON}>{jsonSaved ? 'Saved!' : 'Export JSON'}</button>
                  </div>
                  {toc.length > 0 && (
                    <div className={`mt-3 toc ${tocOpen ? '' : 'hidden'} lg:block lg:sticky lg:top-[120px] lg:self-start`}>
                      <div className="text-neutral-500 mb-1">Table of Contents</div>
                      {toc.map((t, i) => (
                        <a key={t.id} href={`#${t.id}`} className={`toc-item l${t.depth} ${i===currentIdx ? 'active' : ''}`} onClick={(e)=>{e.preventDefault(); const el=document.getElementById(t.id); if (el) { const y = el.getBoundingClientRect().top + window.pageYOffset - TOP_OFFSET; window.scrollTo({ top: y, behavior:'smooth' }); }}}>
                          {t.text}
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="lg:col-start-2">
                    <div className="mb-2 flex items-center gap-2 flex-wrap lg:hidden">
                      {toc.length > 0 && (
                        <>
                          <button className="btn-xs" onClick={() => setTocOpen(v => !v)}>{tocOpen ? 'Hide TOC' : 'Show TOC'}</button>
                          <button className="btn-xs" onClick={goPrevSection} disabled={currentIdx <= 0}>Prev section</button>
                          <button className="btn-xs" onClick={goNextSection} disabled={currentIdx >= toc.length - 1}>Next section</button>
                        </>
                      )}
                      <button className="btn-xs ml-auto" onClick={() => analysisTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Back to top</button>
                    </div>
                    <div ref={reportRef} className="mt-2 markdown lg:mt-0">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({node, ...props}) => { const txt = String(props.children).replace(/[,]/g,''); const id = txt.toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-'); return <h1 id={id} {...props} /> },
                          h2: ({node, ...props}) => { const txt = String(props.children).replace(/[,]/g,''); const id = txt.toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-'); return <h2 id={id} {...props} /> },
                          h3: ({node, ...props}) => { const txt = String(props.children).replace(/[,]/g,''); const id = txt.toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-'); return <h3 id={id} {...props} /> },
                          a: ({href, ...props}) => {
                            const h = href || ''
                            if (h.startsWith('#')) {
                              return <a href={h} onClick={(e)=>{ e.preventDefault(); const id=h.slice(1); const el=document.getElementById(id); if (el){ const y=el.getBoundingClientRect().top + window.pageYOffset - scrollOffset; window.scrollTo({ top:y, behavior:'smooth' }); } }} {...props} />
                            }
                            return <a href={h} target="_blank" rel="noreferrer" {...props} />
                          },
                        }}
                      >
                        {normalizeReportText(analysis.report || '').replace(/\[#(\d+)\]/g, (_m, n) => `[#${n}](#cite-${n})`)}
                      </ReactMarkdown>
                    </div>
                  </div>
                  {analyzedDocs.length > 0 && (
                    <div className="citations-list mt-4">
                      <div className="mb-1 font-medium">Citations</div>
                      <ul className="list-disc ml-5">
                        {analyzedDocs.map((d, i) => (
                          <li key={d.id + i} id={`cite-${i+1}`}>
                            [#{i+1}] <a href={d.url} target="_blank" rel="noreferrer">{d.title || d.url}</a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </main>
      <footer className="py-6 text-center text-[11px] text-neutral-500">
        Created by Alex Orr •
        <a
          href="https://github.com/ShabalalaWATP"
          target="_blank"
          rel="noreferrer"
          className="ml-1 text-neutral-400 hover:text-uaBlue hover:underline"
        >
          GitHub @ShabalalaWATP
        </a>
      </footer>
      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type} ${t.state}`}>{t.message}</div>
        ))}
      </div>
      {showFab && (
        <button className="fab" aria-label="Back to top" title="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 4l-6 6h4v6h4v-6h4z"/></svg>
        </button>
      )}
    </div>
  )
}
