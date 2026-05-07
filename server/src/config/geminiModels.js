'use strict';

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';

const GEMINI_MODELS = [
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', note: 'Latest balanced model; preview rate limits may change.' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', note: 'Stable, lowest-latency/cost Gemini 3.1 option.' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview', note: 'Best quality/deeper reasoning; paid-only and slower.' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'Stable fallback with strong price/performance.' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', note: 'Stable economical fallback.' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'Stable higher-quality fallback.' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', note: 'Legacy compatibility fallback.' },
];

const GEMINI_FALLBACK_MODELS = [
  DEFAULT_GEMINI_MODEL,
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
];

module.exports = {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODELS,
  GEMINI_FALLBACK_MODELS,
};
