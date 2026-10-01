'use strict';
/**
 * learning.js — language understanding and reasoning primitives.
 *
 *  - extractFacts: turns sentences into (subject, predicate, object) triples with pattern grammars.
 *  - parseQuestion: figures out what the user wants to know.
 *  - answer: composes an answer from facts, skills and recalled episodes with a confidence score.
 *  - detectCorrection: "no, X is Y" → unlearn + relearn.
 */

const T = require('./text');

const PREDICATES = [
  // [regex, predicate]  — subject in group 1, object in group 2
  [/^(.{2,60}?)\s+(?:is|are|was|were)\s+(?:a|an|the)?\s*(?:kind of|type of)\s+(.{2,120})$/i, 'is a'],
  [/^(.{2,60}?)\s+(?:is|are)\s+(?:called|named|known as)\s+(.{2,120})$/i, 'is called'],
  [/^(.{2,60}?)\s+(?:is|was)\s+(?:a|an)\s+(.{2,120})$/i, 'is a'],
  [/^(.{2,60}?)\s+(?:is|are|was|were)\s+(?:located\s+)?in\s+(.{2,120})$/i, 'is in'],
  [/^(.{2,60}?)\s+(?:is|are|was|were)\s+(?:located\s+)?(?:at|on)\s+(.{2,120})$/i, 'is at'],
  [/^(.{2,60}?)\s+(?:is|are|was|were)\s+(.{2,120})$/i, 'is'],
  [/^(.{2,60}?)\s+(?:has|have|had|contains?|includes?)\s+(.{2,120})$/i, 'has'],
  [/^(.{2,60}?)\s+(?:costs?|charges?|priced at)\s+(.{2,120})$/i, 'costs'],
  [/^(.{2,60}?)\s+(?:likes?|loves?|prefers?|enjoys?)\s+(.{2,120})$/i, 'likes'],
  [/^(.{2,60}?)\s+(?:wants?|needs?|requires?)\s+(.{2,120})$/i, 'needs'],
  [/^(.{2,60}?)\s+(?:means?|refers? to|stands? for)\s+(.{2,120})$/i, 'means'],
  [/^(.{2,60}?)\s+(?:offers?|provides?|sells?|runs?|organi[sz]es?)\s+(.{2,120})$/i, 'offers'],
  [/^(.{2,60}?)\s+(?:goes? to|travels? to|visits?|departs? for)\s+(.{2,120})$/i, 'goes to'],
  [/^(.{2,60}?)\s+(?:takes?|lasts?)\s+(.{2,120})$/i, 'takes'],
  [/^(.{2,60}?)\s+(?:starts?|begins?)\s+(?:on|at|from)\s+(.{2,120})$/i, 'starts'],
  [/^(.{2,60}?)\s+(?:should|must)\s+(.{2,120})$/i, 'should'],
  [/^(?:remember|note|learn)(?: that)?\s+(.{2,60}?)\s+(?:is|are)\s+(.{2,120})$/i, 'is'],
];

const PRONOUN = /^(it|he|she|they|this|that|there|here|i|you|we|my|your|our)$/i;

function cleanSubject(s) {
  return s.replace(/^(?:the|a|an|my|our|your)\s+/i, '').replace(/[,.;:!?]+$/, '').trim();
}
function cleanObject(o) {
  return o.replace(/[.;!]+$/, '').replace(/^(?:also|just|really|very)\s+/i, '').trim();
}

/** Extract triples from free text. Returns [{s,p,o}]. */
function extractFacts(text) {
  const out = [];
  for (const sentence of T.sentences(text)) {
    const s0 = sentence.replace(/^(?:so|well|and|but|also|btw|fyi)\s*,?\s*/i, '');
    if (T.isQuestion(s0) && /\?\s*$/.test(s0)) continue;
    for (const [re, p] of PREDICATES) {
      const m = s0.match(re);
      if (!m) continue;
      const s = cleanSubject(m[1]).toLowerCase(); const o = cleanObject(m[2]);
      if (!s || !o || PRONOUN.test(s) || s.split(' ').length > 6) continue;
      if (/^(not|no|never)\b/i.test(o)) { out.push({ s, p: p + ' not', o: o.replace(/^(not|no|never)\s*/i, '') }); break; }
      out.push({ s, p, o });
      break; // first matching grammar wins per sentence
    }
  }
  return out;
}

const Q = [
  [/^(?:what|who)\s+(?:is|are|was|were)\s+(?:a|an|the)?\s*(.+?)\??$/i, 'define'],
  [/^(?:where)\s+(?:is|are|was|were|do|does)\s+(?:a|an|the)?\s*(.+?)(?:\s+(?:located|based|from))?\??$/i, 'where'],
  [/^(?:when)\s+(?:is|are|was|were|do|does|did|will)\s+(?:a|an|the)?\s*(.+?)(?:\s+(?:start|begin|happen|leave))?\??$/i, 'when'],
  [/^(?:how much)\s+(?:is|are|does|do)\s+(?:a|an|the)?\s*(.+?)(?:\s+cost)?\??$/i, 'cost'],
  [/^(?:what|which)\s+(?:does|do|did)\s+(?:a|an|the)?\s*(.+?)\s+(?:offer|provide|sell|have|do|like|need|want)\??$/i, 'what-does'],
  [/^(?:tell me about|describe|explain|what do you know about|what about)\s+(?:a|an|the)?\s*(.+?)\??$/i, 'define'],
  [/^(?:do you (?:know|remember))\s+(?:about\s+|what\s+|who\s+)?(.+?)\??$/i, 'define'],
  [/^(?:why)\s+(.+?)\??$/i, 'why'],
  [/^(?:how)\s+(?:do|does|can|should|would)\s+(?:i|we|you|one)?\s*(.+?)\??$/i, 'how'],
];

function parseQuestion(text) {
  const t = text.trim();
  for (const [re, kind] of Q) {
    const m = t.match(re);
    if (m) return { kind, subject: cleanSubject(m[1]).replace(/\?$/, '').trim().toLowerCase(), raw: t };
  }
  if (T.isQuestion(t)) return { kind: 'open', subject: T.tokens(t).join(' '), raw: t };
  return null;
}

function detectCorrection(text) {
  const m = text.match(/^(?:no|nope|wrong|incorrect|actually|correction)[,.!:]?\s+(.+)$/i);
  if (!m) return null;
  const facts = extractFacts(m[1]);
  return facts.length ? facts : null;
}

function detectIdentity(text) {
  const m = text.match(/^(?:i am|i'm|my name is|call me)\s+([a-z][a-z' -]{1,40})$/i);
  return m ? m[1].trim() : null;
}

const PRED_PHRASE = { 'is a': 'is a', 'is': 'is', 'is in': 'is in', 'is at': 'is at', 'has': 'has', 'costs': 'costs',
  'likes': 'likes', 'needs': 'needs', 'means': 'means', 'offers': 'offers', 'goes to': 'goes to', 'takes': 'takes',
  'starts': 'starts', 'should': 'should', 'is called': 'is called' };

function phrase(f) {
  const p = PRED_PHRASE[f.p] || f.p.replace(' not', ' not');
  return `${T.titleCase(f.s)} ${p} ${f.o}`;
}

/**
 * Compose an answer. Returns {text, confidence, evidence:[...], via}.
 * `memory` is a Memory; `skills` a Skills registry; `recall` the episodes already retrieved.
 */
function answer(question, memory, skills, recalled) {
  // 1. Procedural skills (math, dates, conversions, planning) get first shot — they are precise.
  const skill = skills.tryAll(question.raw);
  if (skill) return { text: skill.output, confidence: 0.95, evidence: [`skill:${skill.name}`], via: 'skill' };

  // 2. Semantic facts.
  const subj = question.subject;
  let facts = memory.factsAbout(subj);
  if (!facts.length) {
    // try the longest noun-ish chunk of the subject
    const toks = T.tokens(subj);
    for (let n = toks.length; n >= 1 && !facts.length; n--) {
      for (let i = 0; i + n <= toks.length && !facts.length; i++) facts = memory.factsAbout(toks.slice(i, i + n).join(' '));
    }
  }
  const byKind = {
    where: f => /^is (in|at)$/.test(f.p), when: f => /^(starts|takes)$/.test(f.p), cost: f => f.p === 'costs',
    'what-does': f => /^(offers|has|likes|needs|goes to)$/.test(f.p), how: f => f.p === 'should',
  };
  let chosen = facts;
  if (byKind[question.kind]) { const narrowed = facts.filter(byKind[question.kind]); if (narrowed.length) chosen = narrowed; }
  chosen = chosen.filter(f => f.wrong < 2).slice(0, 4);
  if (chosen.length) {
    for (const f of chosen) f.uses++;
    const conf = Math.min(0.95, chosen.reduce((a, f) => a + f.confidence, 0) / chosen.length + 0.1 * (chosen.length - 1));
    const lines = chosen.map(phrase);
    const text = lines.length === 1 ? lines[0] + '.' : lines.join('. ') + '.';
    return { text, confidence: conf, evidence: chosen.map(f => f.id), via: 'facts' };
  }

  // 3. Episodic recall: quote the most relevant memory.
  const subjToks = T.tokens(subj);
  const grounded = recalled.find(r => r.score > 0.25 && subjToks.some(t => r.ep.tokens.includes(t)));
  if (grounded) {
    const ep = grounded.ep;
    const who = ep.role === 'user' ? 'you told me' : ep.role === 'lesson' ? 'my lessons say' : 'I noted';
    return { text: `I recall ${who}: "${ep.text.slice(0, 220)}"`, confidence: Math.min(0.7, grounded.score), evidence: [ep.id], via: 'episodic' };
  }

  return { text: null, confidence: 0, evidence: [], via: 'none' };
}

module.exports = { extractFacts, parseQuestion, detectCorrection, detectIdentity, answer, phrase };
