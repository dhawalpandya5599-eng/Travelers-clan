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
const R = require('./reason');

const PREDICATES = [
  // [regex, predicate]  — subject in group 1, object in group 2
  [/^(.{2,60}?)\s+(?:raises?|increases?|improves?|boosts?)\s+(.{2,120})$/i, 'raises'],
  [/^(.{2,60}?)\s+(?:lowers?|reduces?|decreases?|hurts?)\s+(.{2,120})$/i, 'lowers'],
  [/^(.{2,60}?)\s+(?:usually\s+|often\s+|mostly\s+)?(?:travels?|visits?|goes?)\s+in\s+(.{2,120})$/i, 'travels in'],
  [/^(.{2,60}?)\s+(?:pays?|paid)\s+(?:in|with|by)\s+(.{2,120})$/i, 'pays in'],
  [/^(.{2,60}?)\s+(?:comes?|came)\s+from\s+(.{2,120})$/i, 'comes from'],
  [/^(.{2,60}?)\s+(?:peaks?|opens?)\s+in\s+(.{2,120})$/i, 'peaks in'],
  [/^(.{2,60}?)\s+(?:converts?|performs?|works?)\s+(better|worse|twice|more|less)\s+(.{2,120})$/i, 'converts'],
  [/^(.{2,60}?)\s+(?:outperforms?|beats?)\s+(.{2,120})$/i, 'outperforms'],
  [/^(.{2,60}?)\s+(?:refunds?)\s+(.{2,120})$/i, 'refunds'],
  [/^(.{2,60}?)\s+(?:spent|spends?)\s+(.{2,120})$/i, 'spent'],
  [/^(.{2,60}?)\s+(?:excludes?|leaves? out)\s+(.{2,120})$/i, 'excludes'],
  [/^(.{2,60}?)\s+(?:doubles?|halves?|protects?|perform best|performs best)\s*(.{0,120})$/i, 'affects'],
  [/^(.{2,60}?)\s+(?:pays?)\s+(\d.{1,80}|[a-z]+ percent.{0,60})$/i, 'pays'],
  [/^(.{2,60}?)\s+(?:allows?|permits?|gives?|grants?)\s+(.{2,120})$/i, 'allows'],
  [/^(.{2,60}?)\s+(?:seats?|fits?|holds?)\s+(.{2,120})$/i, 'seats'],
  [/^(.{2,60}?)\s+(?:filters?|removes?|reduces?)\s+(.{2,120})$/i, 'filters'],
  [/^(.{2,60}?)\s+(?:drives?|creates?|builds?|refers?|sends?|brings?|triggers?)\s+(.{2,120})$/i, 'drives'],
  [/^(.{2,60}?)\s+(?:travels?)\s+(free|with|without)\s+(.{2,120})$/i, 'travels'],
  [/^(.{2,60}?)\s+(?:does not|doesn't|do not|don't|did not|didn't)\s+(?:have|include|contain|offer|cover|provide)\s+(.{2,120})$/i, 'has not'],
  [/^(.{2,60}?)\s+(?:is not|isn't|are not|aren't)\s+(?:located\s+)?in\s+(.{2,120})$/i, 'is in not'],
  [/^(.{2,60}?)\s+(?:is not|isn't|are not|aren't)\s+(.{2,120})$/i, 'is not'],
  [/^(.{2,60}?)\s+(?:is|are|was|were)\s+(?:a|an|the)?\s*(?:kind of|type of)\s+(.{2,120})$/i, 'is a'],
  [/^(.{2,60}?)\s+(?:is|are)\s+(?:called|named|known as)\s+(.{2,120})$/i, 'is called'],
  [/^(.{2,60}?)\s+(?:is|was)\s+(?:a|an)\s+(.{2,120})$/i, 'is a'],
  [/^(.{2,60}?)\s+(?:is|are|was|were)\s+(?:located\s+)?in\s+(.{2,120})$/i, 'is in'],
  [/^(.{2,60}?)\s+(?:is|are|was|were)\s+(?:located\s+)?(?:at|on)\s+(.{2,120})$/i, 'is at'],
  [/^(.{2,60}?)\s+(?:is|are|was|were)\s+(.{2,120})$/i, 'is'],
  [/^(.{2,60}?)\s+(?:has|have|had|contains?|includes?)\s+(.{2,120})$/i, 'has'],
  [/^(.{2,60}?)\s+(?:costs?|charges?|priced at)\s+(.{2,120})$/i, 'costs'],
  [/^(.{2,60}?)\s+(?:likes?|loves?|prefers?|enjoys?)\s+(.{2,120})$/i, 'likes'],
  [/^(.{2,60}?)\s+(?:worry|worries|worried|fear|fears|hesitate|hesitates)\s+(?:about|over|on)\s+(.{2,120})$/i, 'worries about'],
  [/^(.{2,60}?)\s+(?:are|is)\s+convinced\s+by\s+(.{2,120})$/i, 'is convinced by'],
  [/^(.{2,60}?)\s+(?:should|must)\s+be\s+spoken\s+to\s+in\s+(?:a|an)?\s*(.{2,120}?)\s+tone[.!]?$/i, 'tone'],
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
  for (const raw of T.sentences(text)) {
    // Compound statements: "Goa is a beach state and Goa season is November to February."
    const parts = raw.split(/,?\s+(?:and|but|while)\s+(?=[A-Z][\w' -]{1,40}\s+(?:is|are|was|has|have|offers?|likes?|costs?|takes?|starts?|needs?|wants?|includes?)\b)/);
    for (const sentence of parts) {
    const s0 = sentence.replace(/^(?:so|well|and|but|also|btw|fyi)(?:,\s*|\s+(?=[a-z]))/i, ''); // filler only when followed by a comma or lowercase word
    if (T.isQuestion(s0) && /\?\s*$/.test(s0)) continue;
    for (const [re, p] of PREDICATES) {
      const m = s0.match(re);
      if (!m) continue;
      const s = cleanSubject(m[1]).toLowerCase(); const o = cleanObject(m[3] != null ? m[2] + ' ' + m[3] : m[2]);
      if (!s || !o || PRONOUN.test(s) || s.split(' ').length > 8) continue;
      if (/^(not|no|never)\b/i.test(o)) { out.push({ s, p: p + ' not', o: o.replace(/^(not|no|never)\s*/i, '') }); break; }
      // "X is a village in Parvati valley" → X is a village; X is in Parvati valley
      const loc = p === 'is a' && o.match(/^([a-z][a-z' -]{1,30}?)\s+(?:in|at|near)\s+(.{2,80})$/i) && !/\b(who|that|which|with)\b/i.test(o) ? o.match(/^([a-z][a-z' -]{1,30}?)\s+(?:in|at|near)\s+(.{2,80})$/i) : null;
      if (loc) { out.push({ s, p, o: loc[1] }); out.push({ s, p: /\bat\b/.test(o) ? 'is at' : 'is in', o: loc[2] }); break; }
      out.push({ s, p, o });
      break; // first matching grammar wins per sentence
    }
    }
  }
  return out;
}

const YESNO = [
  [/^(?:is|are)\s+(?:the\s+)?(.+?)\s+(high|low)\s+in\s+(.+?)\??$/i, 'trait'],
  [/^(?:does|do|did|will)\s+(?:the\s+)?(.+?)\s+(?:raise|increase|improve|boost)\s+(.+?)\??$/i, 'raises'],
  [/^(?:does|do|did|will)\s+(?:the\s+)?(.+?)\s+(?:lower|reduce|decrease|hurt)\s+(.+?)\??$/i, 'lowers'],
  [/^(?:is|are|was|were)\s+(?:the\s+)?(.+?)\s+(?:located\s+)?in\s+season\s+in\s+([a-z]+)\??$/i, 'season'],
  [/^(?:is|are|was|were)\s+(?:the\s+)?(.+?)\s+(?:located\s+)?(?:in|inside|part of)\s+(.+?)\??$/i, 'is in'],
  [/^(?:is|are|was|were)\s+(?:the\s+)?(.+?)\s+(?:a|an)\s+(.+?)\??$/i, 'is a'],
  [/^(?:is|are|was|were)\s+(?:the\s+)?(.+?)\s+(.+?)\??$/i, 'is'],
  [/^(?:does|do|did)\s+(?:the\s+)?(.+?)\s+(?:have|has|include|includes|contain|offer|offers|cover)\s+(?:a|an|the)?\s*(.+?)\??$/i, 'has'],
  [/^(?:does|do|did)\s+(?:the\s+)?(.+?)\s+(?:like|likes|love)\s+(.+?)\??$/i, 'likes'],
  [/^(?:does|do|did)\s+(?:the\s+)?(.+?)\s+(?:need|needs|require|requires)\s+(.+?)\??$/i, 'needs'],
  [/^(?:does|do|did)\s+(?:the\s+)?(.+?)\s+(?:go|goes|travel|travels)\s+to\s+(.+?)\??$/i, 'goes to'],
  [/^(?:can|could)\s+(?:anyone|i|we|you)\s+(?:join|book)\s+(?:the\s+)?(.+?)\??$/i, 'open'],
];
const WHO = [
  [/^(?:who|which\s+\w+)\s+(?:needs?|requires?)\s+(.+?)\??$/i, /^needs$/, 0.2],
  [/^(?:what|which)\s+(?:raises|increases|improves|boosts)\s+(.+?)\??$/i, /^raises$/, 0.3],
  [/^(?:what|which)\s+(?:lowers|reduces|decreases|hurts)\s+(.+?)\??$/i, /^lowers$/, 0.3],
  [/^(?:who|which(?:\s+\w+)?|what)\s+(?:is|are)\s+(?:a|an|the)?\s*(.+?)\??$/i, /^(is a|is)$/],
  [/^(?:who|which\s+\w+)\s+(?:has|have)\s+(.+?)\??$/i, /^has$/],
  [/^(?:who|which\s+\w+)\s+(?:likes?|loves?)\s+(.+?)\??$/i, /^likes$/],
  [/^(?:who|which\s+\w+)\s+(?:offers?|sells?)\s+(.+?)\??$/i, /^offers$/],
  [/^(?:who|which\s+\w+)\s+(?:is|are)\s+(?:in|from)\s+(.+?)\??$/i, /^is in$/],
];
const Q = [
  [/^(?:which|what)\s+(state|country|city|region|valley|district)\s+(?:is|are)\s+(?:the\s+)?(.+?)\s+in\??$/i, 'where-kind'],
  [/^(?:what|who)\s+(?:is|are|was|were)\s+(?:a|an|the)?\s*(.+?)\??$/i, 'define'],
  [/^(?:where)\s+(?:is|are|was|were|do|does)\s+(?:a|an|the)?\s*(.+?)(?:\s+(?:located|based|from))?\??$/i, 'where'],
  [/^(?:when)\s+(?:is|are|was|were|do|does|did|will)\s+(?:a|an|the)?\s*(.+?)(?:\s+(?:usually\s+|often\s+)?(?:start|begin|happen|leave|travel|go|visit|peak|open|sell out))?\??$/i, 'when'],
  [/^(?:what|which currency)\s+(?:do|does|did)\s+(?:a|an|the)?\s*(.+?)\s+pay\s+(?:in|with)\??$/i, 'pay'],
  [/^(?:how much)\s+(?:is|are|does|do|did|was|were)\s+(?:a|an|the)?\s*(.+?)(?:\s+cost(?:\s+per\s+[\w ]+)?)?\??$/i, 'cost'],
  [/^(?:where)\s+(?:do|does|did)\s+(?:a|an|the)?\s*(.+?)\s+come\s+from\??$/i, 'from'],
  [/^(?:how long)\s+(?:is|are|does|do|will)\s+(?:a|an|the)?\s*(.+?)(?:\s+(?:take|last))?\??$/i, 'when'],
  [/^(?:what|which)\s+(?:does|do|did)\s+(?:a|an|the)?\s*(.+?)\s+(?:worry|fear|hesitate)\s+(?:about|over)\??$/i, 'worry'],
  [/^(?:what|which)\s+tone\s+(?:should|do|does)\s+(?:we\s+use\s+(?:for|with)\s+)?(?:a|an|the)?\s*(.+?)(?:\s+be\s+spoken\s+to\s+in)?\??$/i, 'tone'],
  [/^(?:what|which)\s+(?:does|do|did)\s+(?:a|an|the)?\s*(.+?)\s+(?:offer|provide|sell|have|do|like|need|want|refund|allow|give|seat|filter|drive|outperform)\??$/i, 'what-does'],
  [/^(?:how many (?:people|persons|travelers|seats))\s+(?:does|do|can)\s+(?:a|an|the)?\s*(.+?)\s+(?:seat|fit|hold|carry)\??$/i, 'seats'],
  [/^(?:tell me about|describe|explain|what do you know about|what about)\s+(?:a|an|the)?\s*(.+?)\??$/i, 'define'],
  [/^(?:do you (?:know|remember))\s+(?:about\s+|what\s+|who\s+)?(.+?)\??$/i, 'define'],
  [/^(?:why)\s+(.+?)\??$/i, 'why'],
  [/^(?:how)\s+(?:do|does|can|should|would)\s+(?:i|we|you|one)?\s*(.+?)\??$/i, 'how'],
];

const num = (str) => { const m = String(str).replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(k|thousand|lakh)?/i); if (!m) return null; let v = +m[1]; if (/k|thousand/i.test(m[2] || '')) v *= 1000; if (/lakh/i.test(m[2] || '')) v *= 100000; return v; };
const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, twentyfive: 25, thirty: 30, forty: 40, fifty: 50 };
const pct = (str) => { const m = String(str).match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/i); if (m) return +m[1]; const w = String(str).match(/\b([a-z]+)\s+percent/i); return w && WORDNUM[w[1].toLowerCase()] ? WORDNUM[w[1].toLowerCase()] : null; };
const costOf = (memory, subject) => { const f = memory.factsAbout(subject).find(x => x.p === 'costs' && x.wrong < 2 && num(x.o) != null); return f ? { v: num(f.o), f } : null; };
const PRONOUN_Q = /^(it|its|he|she|they|them|him|her|his|their|that|this|the trip|the lead)$/i;

function parseQuestion(text) {
  const t = text.trim().replace(/^(?:and|so|also|but|then|ok|okay)[,\s]+(?=\w)/i, '');
  let m;
  if ((m = t.match(/^how many (?:people|persons|travelers|travellers|seats|pax)\s+(?:does|do|can)\s+(?:a|an|the)?\s*(.+?)\s+(?:seat|fit|hold|carry)\??$/i))) return { kind: 'seats', subject: cleanSubject(m[1]).toLowerCase(), raw: t };
  if ((m = t.match(/^how many\s+(.+?)\s+(?:do we have|are there|have we got|do i have)\??$/i)) || (m = t.match(/^how many\s+(.+?)\??$/i))) return { kind: 'count', subject: cleanSubject(m[1]).toLowerCase(), raw: t };
  if ((m = t.match(/^which\s+(?:is|one is)\s+(cheaper|more expensive|costlier|longer|shorter)\s*,?\s+(?:the\s+)?(.+?)\s+or\s+(?:the\s+)?(.+?)\??$/i))) return { kind: 'compare', cmp: m[1].toLowerCase(), a: cleanSubject(m[2]).toLowerCase(), b: cleanSubject(m[3]).toLowerCase(), subject: m[2], raw: t };
  if ((m = t.match(/^which\s+(\w+)\s+(?:is|costs)\s+(?:the\s+)?(cheapest|cheaper|most expensive|more expensive|costliest|longest|shortest)\??$/i))) return { kind: 'compare-all', group: m[1].toLowerCase(), cmp: m[2].toLowerCase(), subject: m[1], raw: t };
  if ((m = t.match(/^how much (?:more|less)\s+(?:does|do|is)\s+(?:the\s+)?(.+?)\s+(?:cost\s+)?than\s+(?:the\s+)?(.+?)\??$/i))) return { kind: 'difference', a: cleanSubject(m[1]).toLowerCase(), b: cleanSubject(m[2]).toLowerCase(), subject: m[1], raw: t };
  if ((m = t.match(/^(?:what is|what's|how much is)\s+the\s+total\s+(?:cost\s+)?for\s+(\d+)\s+(?:people|persons|pax|travelers|travellers|friends|adults)\s+(?:on|for)\s+(?:the\s+)?(.+?)\??$/i))) return { kind: 'total', n: +m[1], subject: cleanSubject(m[2]).toLowerCase(), raw: t };
  if ((m = t.match(/^(?:how much|what)\s+(?:is the\s+|is\s+)?advance\s+(?:for|on)\s+(?:the\s+)?(.+?)\??$/i))) return { kind: 'advance', subject: cleanSubject(m[1]).toLowerCase(), raw: t };
  if ((m = t.match(/^(?:should|must)\s+(?:we|i|you|one)\s+(.+?)\??$/i))) return { kind: 'should', subject: T.tokens(m[1]).join(' '), action: m[1], raw: t };
  for (const [re, p] of YESNO) {
    const m = t.match(re);
    if (!m) continue;
    const s = cleanSubject(m[1]).toLowerCase();
    if (/^(it|that|this|there|he|she|they)$/.test(s) || /^(?:what|who|where|when|why|how)\b/i.test(t)) continue;
    if (p === 'open') return { kind: 'yesno', claim: { s, p: 'is', o: 'open to anyone' }, subject: s, raw: t };
    if (p === 'trait') return { kind: 'yesno', claim: { s, p: 'is', o: `${m[2]} in ${m[3].replace(/\?$/, '')}` }, subject: s, raw: t };
    return { kind: 'yesno', claim: { s, p, o: (m[2] || '').replace(/\?$/, '').trim() }, subject: s, raw: t };
  }
  for (const [re, kind] of Q) {
    const m = t.match(re);
    if (m && kind === 'where-kind') return { kind: 'where', subject: cleanSubject(m[2]).toLowerCase(), wantKind: m[1].toLowerCase(), raw: t };
    if (m && kind === 'what-does') { const verb = (t.match(/\s(offer|provide|sell|have|do|like|need|want|refund|allow|give|seat|filter|drive|outperform)\??$/i) || [])[1]; return { kind, subject: cleanSubject(m[1]).replace(/\?$/, '').trim().toLowerCase(), verb: verb && verb.toLowerCase(), raw: t }; }
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

const PRED_PHRASE = { spent: 'spent', excludes: 'excludes', affects: 'affects', pays: 'pays', 'peaks in': 'peaks in', converts: 'converts', outperforms: 'outperforms', refunds: 'refunds', allows: 'allows', seats: 'seats', filters: 'filters', drives: 'drives', travels: 'travels', 'comes from': 'come from', raises: 'raises', lowers: 'lowers', 'travels in': 'usually travel in', 'pays in': 'pay in', 'worries about': 'worries about', 'is convinced by': 'is convinced by', 'tone': 'should be spoken to in a tone that is', 'is a': 'is a', 'is': 'is', 'is in': 'is in', 'is at': 'is at', 'has': 'has', 'costs': 'costs',
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

  // 2. Reasoning: yes/no claims, including season logic and inheritance.
  if (question.kind === 'yesno') {
    const c = question.claim;
    if (c.p === 'season') {
      const r = R.season(memory, c.s, c.o);
      if (r) return { text: `${r.yes ? 'Yes' : 'No'}. ${T.titleCase(r.fact.s)} ${r.fact.p} ${r.fact.o}.`, confidence: 0.9, evidence: [r.fact.id], via: 'reason' };
    }
    const pr = R.prove(memory, c);
    return { text: pr.text, confidence: pr.verdict === 'unknown' ? 0.4 : 0.85, evidence: pr.evidence, via: 'reason' };
  }
  if (question.kind === 'count') {
    for (const [, pred] of WHO) { const who = R.whoIs(memory, pred, question.subject.replace(/s$/, '')); if (who.subjects.length) return { text: `${who.subjects.length}: ${who.subjects.map(T.titleCase).join(', ')}.`, confidence: 0.85, evidence: who.evidence, via: 'reason' }; }
    const who = R.whoIs(memory, /^(is a|is)$/, question.subject.replace(/s$/, ''));
    return { text: who.subjects.length ? `${who.subjects.length}: ${who.subjects.map(T.titleCase).join(', ')}.` : `I know of none yet.`, confidence: who.subjects.length ? 0.85 : 0.5, evidence: who.evidence, via: 'reason' };
  }
  if (question.kind === 'compare' || question.kind === 'difference') {
    const a = costOf(memory, question.a), b = costOf(memory, question.b);
    if (a && b) {
      if (question.kind === 'difference') return { text: `${T.titleCase(question.a)} costs ${a.v} and ${T.titleCase(question.b)} costs ${b.v}: a difference of ${Math.abs(a.v - b.v)}.`, confidence: 0.9, evidence: [a.f.id, b.f.id], via: 'reason' };
      const wantLow = /cheap|shorter/.test(question.cmp);
      const win = (a.v < b.v) === wantLow ? question.a : question.b; const lose = win === question.a ? question.b : question.a;
      const wv = win === question.a ? a.v : b.v, lv = win === question.a ? b.v : a.v;
      return { text: `${T.titleCase(win)} is ${question.cmp} at ${wv}, versus ${lv} for ${T.titleCase(lose)}.`, confidence: 0.9, evidence: [a.f.id, b.f.id], via: 'reason' };
    }
  }
  if (question.kind === 'compare-all') {
    const g = T.stem(question.group);
    const priced = memory.facts.filter(f => f.p === 'costs' && f.wrong < 2 && num(f.o) != null && T.tokens(f.s).includes(g)).map(f => ({ f, v: num(f.o) }));
    if (priced.length >= 2) {
      const low = /cheap|short/.test(question.cmp);
      priced.sort((x, y) => low ? x.v - y.v : y.v - x.v);
      return { text: `${T.titleCase(priced[0].f.s)} at ${priced[0].v} (then ${priced.slice(1, 3).map(p => `${T.titleCase(p.f.s)} at ${p.v}`).join(', ')}).`, confidence: 0.85, evidence: priced.map(p => p.f.id), via: 'reason' };
    }
  }
  if (question.kind === 'total') {
    const c = costOf(memory, question.subject);
    if (c) return { text: `${question.n} × ${c.v} = ${question.n * c.v} for ${T.titleCase(question.subject)}.`, confidence: 0.9, evidence: [c.f.id], via: 'reason' };
  }
  if (question.kind === 'advance') {
    const c = costOf(memory, question.subject);
    // Most recent rule wins (a specific rule taught today beats the generic curriculum range); ranges like "twenty to thirty" are skipped.
    const rules = [...memory.factsAbout(question.subject + ' advance'), ...memory.factsAbout('advance'), ...memory.factsAbout(question.subject).filter(f => /advance/i.test(f.o))]
      .filter(f => f.wrong < 2 && !/\b(to|-|–)\s+[a-z0-9]+\s*(?:%|percent)/i.test(f.o)).sort((a, b) => b.t - a.t);
    const adv = rules.map(f => pct(f.o)).find(v => v != null) ?? memory.factsAbout('advance').map(f => pct(f.o)).find(v => v != null);
    if (c && adv != null) return { text: `Advance is ${adv}% of ${c.v} = ${Math.round(c.v * adv / 100)} for ${T.titleCase(question.subject)}.`, confidence: 0.85, evidence: [c.f.id], via: 'reason' };
  }
  if (question.kind === 'should') {
    // Find rules ("X should Y") whose words cover the asked action, including rules inherited via categories.
    const want = new Set(T.tokens(question.action));
    const subjectsMentioned = [...memory.concepts.values()].filter(c => c.kind === 'entity' && want.has(T.stem(c.id.split(' ')[0]))).map(c => c.id);
    const inherited = new Set(subjectsMentioned.flatMap(sub => R.categories(memory, sub).flatMap(c => T.tokens(c.name))));
    const rules = memory.facts.filter(f => f.p === 'should' && f.wrong < 2).map(f => {
      const words = T.tokens(f.s + ' ' + f.o);
      const hit = words.filter(w => want.has(w) || inherited.has(w)).length;
      return { f, score: hit / Math.max(3, want.size) };
    }).filter(r => r.score >= 0.5).sort((x, y) => y.score - x.score);
    if (rules.length) return { text: `Yes. ${rules.slice(0, 2).map(r => phrase(r.f)).join('. ')}.`, confidence: 0.8, evidence: rules.slice(0, 2).map(r => r.f.id), via: 'reason' };
  }
  // 2b. Reverse lookup: "Who is a hot lead?" — only when the object is a known category, not a definition request.
  for (const [re, pred, loose] of WHO) {
    const m = question.raw.match(re);
    if (!m) continue;
    const who = R.whoIs(memory, pred, cleanSubject(m[1]), loose);
    if (who.subjects.length) return { text: `${who.subjects.map(T.titleCase).join(', ')}.`, confidence: 0.85, evidence: who.evidence, via: 'reason' };
  }
  // 2c. "Which state is Tosh in?" — walk the location chain.
  if (question.kind === 'where') {
    const hops = R.chain(memory, question.subject);
    if (hops.length > 1 || (hops.length === 1 && question.wantKind)) {
      const pick = question.wantKind ? hops.find(h => memory.factsAbout(h.o).some(f => /^(is a|is)$/.test(f.p) && f.o.toLowerCase().includes(question.wantKind))) || hops[hops.length - 1] : hops[hops.length - 1];
      const path = [T.titleCase(question.subject), ...hops.slice(0, hops.indexOf(pick) + 1).map(h => h.o)];
      return { text: `${path[0]} is in ${path.slice(1).join(', which is in ')}.`, confidence: 0.85, evidence: hops.map(h => h.id), via: 'reason' };
    }
  }

  const subj = question.subject;
  let facts = memory.factsAbout(subj);
  let matched = subj;
  if (!facts.length) {
    // try the longest noun-ish chunk of the subject
    const toks = T.tokens(subj);
    for (let n = toks.length; n >= 1 && !facts.length; n--) {
      for (let i = 0; i + n <= toks.length && !facts.length; i++) { const chunk = toks.slice(i, i + n).join(' '); facts = memory.factsAbout(chunk); if (facts.length) matched = chunk; }
    }
  }
  const byKind = {
    where: f => /^is (in|at)$/.test(f.p), when: f => /^(starts|takes|travels in|peaks in)$/.test(f.p), cost: f => f.p === 'costs',
    'what-does': f => /^(offers|has|likes|needs|goes to)$/.test(f.p), how: f => f.p === 'should',
    worry: f => f.p === 'worries about', tone: f => f.p === 'tone', pay: f => f.p === 'pays in', from: f => f.p === 'comes from', seats: f => f.p === 'seats',
  };
  let chosen = facts;
  const VERB_PRED = { offer: /^offers$/, provide: /^offers$/, sell: /^offers$/, have: /^has$/, like: /^likes$/, need: /^needs$/, want: /^(needs|likes)$/, refund: /^refunds$/, allow: /^allows$/, give: /^allows$/, seat: /^seats$/, filter: /^filters$/, drive: /^drives$/, outperform: /^outperforms$/ };
  if (question.verb && VERB_PRED[question.verb]) { const narrowed = facts.filter(f => VERB_PRED[question.verb].test(f.p)); if (narrowed.length) chosen = narrowed; }
  else if (byKind[question.kind]) { const narrowed = facts.filter(byKind[question.kind]); if (narrowed.length) chosen = narrowed; else if (question.kind === 'cost') { const numeric = facts.filter(f => /\d|percent|lakh|thousand|rupee|inr|usd|free/i.test(f.o)); if (numeric.length) chosen = numeric; } }
  chosen = chosen.filter(f => f.wrong < 2);
  // Prefer the facts whose wording matches the question's extra words ("per form lead", "in July").
  const extra = new Set(T.tokens(question.raw).filter(t => !T.tokens(matched).includes(t)));
  if (extra.size) {
    const score = (f) => T.tokens(f.s + ' ' + f.p + ' ' + f.o).filter(t => extra.has(t)).length;
    const best = Math.max(...chosen.map(score));
    if (best > 0) chosen = chosen.filter(f => score(f) === best).concat(chosen.filter(f => score(f) < best));
  }
  // Aggregate: many facts with the same predicate become one list ("X offers: a; b; c").
  const samePred = chosen.length > 2 && chosen.every(f => f.p === chosen[0].p && f.s === chosen[0].s);
  if (!samePred) chosen = chosen.slice(0, 4);
  if (chosen.length) {
    for (const f of chosen) f.uses++;
    const conf = Math.min(0.95, chosen.reduce((a, f) => a + f.confidence, 0) / chosen.length + 0.1 * (Math.min(chosen.length, 4) - 1));
    const lines = chosen.map(phrase);
    const text = samePred ? `${T.titleCase(chosen[0].s)} ${PRED_PHRASE[chosen[0].p] || chosen[0].p}: ${chosen.map(f => f.o).join('; ')}.` : lines.length === 1 ? lines[0] + '.' : lines.join('. ') + '.';
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

module.exports = { extractFacts, parseQuestion, detectCorrection, detectIdentity, answer, phrase, PRONOUN_Q };
