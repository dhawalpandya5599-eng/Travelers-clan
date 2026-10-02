'use strict';
/**
 * text.js — the sensory cortex of OYE.
 * Turns raw language into tokens, stems, sentences and sparse vectors.
 * Zero dependencies; deterministic.
 */

const STOP = new Set(('a an the and or but if then else of to in on at by for with from as is are was were be been being ' +
  'it its this that these those i you he she we they me him her us them my your his our their do does did doing have has had ' +
  'having not no nor so than too very can will just should could would may might must shall about into over under again ' +
  'further once here there when where why how all any both each few more most other some such only own same s t ' +
  'what which who whom whose am also yes ok okay please thanks thank hi hello hey').split(/\s+/));

const QUESTION_WORDS = new Set(['what', 'who', 'where', 'when', 'why', 'how', 'which', 'whom', 'whose', 'is', 'are', 'do', 'does', 'can', 'tell', 'explain', 'describe']);

/** Very small Porter-like stemmer: enough to unify plurals/tenses without a dependency. */
function stem(w) {
  if (w.length <= 3) return w;
  if (/(ss|us|is|as|os)$/.test(w)) return w; // atlas, bus, basis, chaos: not plurals
  const rules = [
    [/ies$/, 'y'], [/sses$/, 'ss'], [/ness$/, ''], [/ing$/, ''], [/edly$/, ''], [/ed$/, ''],
    [/ly$/, ''], [/ers$/, 'er'], [/ments$/, 'ment'], [/ations$/, 'ation'], [/s$/, ''],
  ];
  for (const [re, rep] of rules) {
    if (re.test(w)) {
      const out = w.replace(re, rep);
      if (out.length >= 3) return out;
    }
  }
  return w;
}

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Tokens with stopwords removed and stemmed. */
function tokens(text) {
  return normalize(text).split(' ').filter(w => w && !STOP.has(w) && w.length > 1).map(stem);
}

/** Raw lowercase words (stopwords kept) — for pattern matching. */
function words(text) {
  return normalize(text).split(' ').filter(Boolean);
}

function sentences(text) {
  return String(text || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s.length > 1);
}

function bag(text) {
  const b = Object.create(null);
  for (const t of tokens(text)) b[t] = (b[t] || 0) + 1;
  return b;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const k in a) { na += a[k] * a[k]; if (b[k]) dot += a[k] * b[k]; }
  for (const k in b) nb += b[k] * b[k];
  if (!na || !nb) return 0;
  return dot / Math.sqrt(na * nb);
}

function isQuestion(text) {
  const w = words(text);
  return /\?\s*$/.test(text.trim()) || (w.length > 0 && QUESTION_WORDS.has(w[0]));
}

/** Capitalised multi-word spans are strong entity candidates ("Travelers Clan", "Goa"). */
function entities(text) {
  const out = new Set();
  const re = /\b([A-Z][a-zA-Z0-9'-]+(?:\s+[A-Z][a-zA-Z0-9'-]+)*)\b/g;
  let m;
  while ((m = re.exec(text))) {
    const span = m[1];
    if (span.length > 2 && !STOP.has(span.toLowerCase())) out.add(span.toLowerCase());
  }
  return [...out];
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

function titleCase(s) {
  return String(s).replace(/\b\w/g, c => c.toUpperCase());
}

module.exports = { STOP, stem, normalize, tokens, words, sentences, bag, cosine, isQuestion, entities, hash, titleCase };
