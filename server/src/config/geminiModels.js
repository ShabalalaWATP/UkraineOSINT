'use strict';

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';

const GEMINI_MODELS = [
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', note: 'Latest Flash model; best default for fast OSINT reports.' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', note: 'Stable Gemini 3.1 low-latency/cost option.' },
  { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite Preview', note: 'Preview Flash-Lite endpoint; may have stricter rate limits.' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview', note: 'Higher quality for harder synthesis; slower and more expensive.' },
  { id: 'gemini-flash-latest', label: 'Gemini Flash Latest Alias', note: 'Tracks Google’s latest Flash release; can change over time.' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'Stable fallback with strong price/performance.' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', note: 'Stable economical fallback.' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'Stable higher-quality fallback.' },
];

const GEMINI_FALLBACK_MODELS = [
  DEFAULT_GEMINI_MODEL,
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
];

module.exports = {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODELS,
  GEMINI_FALLBACK_MODELS,
};
