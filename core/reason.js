'use strict';
/**
 * reason.js — inference over semantic memory (the prefrontal cortex).
 *
 *  - chain(): transitive location ("Kasol is in Parvati valley", "Parvati valley is in Himachal" → Kasol is in Himachal)
 *  - inherits(): category inheritance ("Riya is a hot lead", "hot lead is a lead with ... a budget" → Riya has a budget)
 *  - season(): month-range logic ("Goa season is November to February" → in season in December, not in June)
 *  - prove(): a yes / no / not-sure verdict for a (subject, predicate, object) claim with the evidence used
 *  - whoIs(): reverse lookup ("Who is a hot lead?" → Riya, Aman)
 */
const T = require('./text');

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const monthIndex = (w) => MONTHS.findIndex(m => m.startsWith(String(w).toLowerCase().slice(0, 3)));

function overlap(a, b) {
  const ta = new Set(T.tokens(a)), tb = T.tokens(b);
  return tb.length ? tb.filter(t => ta.has(t)).length / tb.length : 0;
}

/** Follow "is in"/"is at" links upward from a subject. Returns [{s,p,o,fact}] hops. */
function chain(memory, subject, maxHops = 5) {
  const hops = []; const seen = new Set([subject.toLowerCase()]);
  let cur = subject;
  for (let i = 0; i < maxHops; i++) {
    const f = memory.factsAbout(cur).find(x => /^is (in|at)$/.test(x.p) && x.wrong < 2);
    if (!f) break;
    hops.push(f);
    const next = f.o.toLowerCase().replace(/^(the|a|an)\s+/, '');
    if (seen.has(next)) break;
    seen.add(next); cur = next;
  }
  return hops;
}

/** Categories a subject belongs to: "X is a Y" / "X is Y" objects, plus their definitions, one level deep. */
function categories(memory, subject) {
  return memory.factsAbout(subject).filter(f => /^(is a|is)$/.test(f.p) && f.wrong < 2)
    .map(f => ({ name: f.o.toLowerCase().replace(/^(the|a|an)\s+/, ''), fact: f }));
}

/** Facts the subject inherits from its categories (e.g. Riya → hot lead → "is a lead with a travel date, ... budget"). */
function inherits(memory, subject) {
  const out = [];
  for (const c of categories(memory, subject)) {
    for (const f of memory.factsAbout(c.name)) if (f.wrong < 2) out.push({ via: c.fact, fact: f });
    // "hot lead is a lead with X" also defines the category by its own object words.
    const def = c.fact.o;
    if (def.split(' ').length > 2) out.push({ via: c.fact, fact: { s: c.name, p: 'is', o: def, confidence: c.fact.confidence, id: c.fact.id } });
  }
  return out;
}

function season(memory, subject, month) {
  const m = monthIndex(month); if (m < 0) return null;
  const facts = [...memory.factsAbout(subject + ' season'), ...memory.factsAbout(subject).filter(f => /season/.test(f.p + ' ' + f.o))];
  for (const f of facts) {
    const r = f.o.match(/([a-z]+)\s+(?:to|-|–|until|till)\s+([a-z]+)/i);
    if (!r) continue;
    const a = monthIndex(r[1]), b = monthIndex(r[2]); if (a < 0 || b < 0) continue;
    const inRange = a <= b ? (m >= a && m <= b) : (m >= a || m <= b);
    return { yes: inRange, fact: f };
  }
  return null;
}

/**
 * Try to prove a claim. Returns {verdict:'yes'|'no'|'unknown', text, evidence}.
 * claim: {s, p, o}  where p ∈ {'is','is a','is in','has','likes','needs','offers', ...}
 */
function prove(memory, claim) {
  const s = claim.s.toLowerCase(), o = claim.o.toLowerCase();
  const sub = memory.factsAbout(s).filter(f => f.wrong < 2);
  if (!sub.length) return { verdict: 'unknown', text: `I do not know anything about ${T.titleCase(claim.s)} yet.`, evidence: [] };

  // 1. Direct: a fact with a compatible predicate whose object covers the claim's object.
  const compat = { 'is in': /^is (in|at)$/, 'is at': /^is (in|at)$/, 'has': /^(has|offers|needs)$/, 'is': /^(is|is a|is called)$/, 'is a': /^(is|is a)$/, 'offers': /^(offers|has)$/, 'likes': /^likes$/, 'needs': /^needs$/, 'goes to': /^goes to$/ };
  const re = compat[claim.p] || new RegExp('^' + claim.p + '$');
  for (const f of sub) if (re.test(f.p) && overlap(f.o, o) >= 0.6) return { verdict: 'yes', text: `Yes. ${T.titleCase(f.s)} ${f.p} ${f.o}.`, evidence: [f.id] };

  // 2. Transitive location.
  if (/^is (in|at)$/.test(claim.p)) {
    const hops = chain(memory, s);
    for (let i = 0; i < hops.length; i++) if (overlap(hops[i].o, o) >= 0.6) {
      const path = [T.titleCase(s), ...hops.slice(0, i + 1).map(h => h.o)].join(' → ');
      return { verdict: 'yes', text: `Yes. ${path}.`, evidence: hops.slice(0, i + 1).map(h => h.id) };
    }
  }

  // 3. Inheritance through categories (definitions carry properties).
  for (const inh of inherits(memory, s)) {
    const text = inh.fact.p + ' ' + inh.fact.o;
    if (overlap(text, o) >= 0.6) return { verdict: 'yes', text: `Yes. ${T.titleCase(s)} ${inh.via.p} ${inh.via.o}, and ${T.titleCase(inh.fact.s)} ${inh.fact.p} ${inh.fact.o}.`, evidence: [inh.via.id, inh.fact.id] };
  }

  // 4. Negative evidence: a "not" fact, or a single-valued predicate that holds a different value.
  for (const f of sub) if (f.p === claim.p + ' not' && overlap(f.o, o) >= 0.6) return { verdict: 'no', text: `No. ${T.titleCase(f.s)} ${f.p} ${f.o}.`, evidence: [f.id] };
  if (/^(is in|is at|costs|takes|starts)$/.test(claim.p)) {
    const other = sub.find(f => f.p === claim.p);
    if (other && !chain(memory, s).some(h => overlap(h.o, o) >= 0.6)) return { verdict: 'no', text: `No. ${T.titleCase(other.s)} ${other.p} ${other.o}.`, evidence: [other.id] };
  }
  const known = sub.slice(0, 2).map(f => `${T.titleCase(f.s)} ${f.p} ${f.o}`).join('; ');
  return { verdict: 'unknown', text: `I am not sure. What I know: ${known}.`, evidence: sub.slice(0, 2).map(f => f.id) };
}

/** Reverse lookup: subjects whose fact matches (predicate, object). */
function whoIs(memory, predicateRe, object, minBack = 0.6) {
  const o = object.toLowerCase().replace(/^(the|a|an)\s+/, '');
  const hits = memory.facts.filter(f => f.wrong < 2 && predicateRe.test(f.p) && overlap(f.o, o) >= 0.99 && overlap(o, f.o) >= minBack);
  const subjects = [...new Set(hits.map(f => f.s))];
  return { subjects, evidence: hits.map(f => f.id) };
}

module.exports = { chain, categories, inherits, season, prove, whoIs, monthIndex, overlap };
