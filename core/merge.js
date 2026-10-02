'use strict';
/**
 * merge.js — combining two minds without losing either.
 *
 * OYE can be trained in several places at once: the cloud routine, a local server, a browser.
 * mergeMinds(base, other) returns a new state that keeps everything both learned:
 *  - episodes: union by id (deduplicated by text when ids differ), most-accessed wins
 *  - concepts: union; strength = max, count = sum, tau = max (the better-rehearsed trace survives)
 *  - synapses: union; weight = max, count = sum
 *  - facts: union; same triple → max confidence, summed uses; conflicting corrections keep `wrong`
 *  - skills: union of learned skills (tests already passed where they were learned)
 *  - evolution: the genome with the higher recorded fitness wins; history is interleaved by time
 *  - counters: summed; born = the earlier birth
 */

function byKey(list, key) { const m = new Map(); for (const x of list || []) m.set(key(x), x); return m; }

function mergeMinds(base, other) {
  if (!base) return other; if (!other) return base;
  const out = { version: base.version || other.version, born: Math.min(base.born || Infinity, other.born || Infinity) };
  out.interactions = (base.interactions || 0) + (other.interactions || 0);
  out.lessonsLearned = (base.lessonsLearned || 0) + (other.lessonsLearned || 0);
  const seenQ = new Set(); out.unknowns = [...(base.unknowns || []), ...(other.unknowns || [])].filter(u => !seenQ.has(u.q) && seenQ.add(u.q)).slice(-200);
  out.log = [...(base.log || []), ...(other.log || [])].sort((a, b) => a.t - b.t).slice(-100);

  const bm = base.memory || {}, om = other.memory || {};
  // Episodes
  const eps = byKey(bm.episodes, e => e.id);
  const texts = new Set((bm.episodes || []).map(e => e.role + '|' + e.text));
  for (const e of om.episodes || []) {
    if (eps.has(e.id)) { const k = eps.get(e.id); k.access = Math.max(k.access, e.access); k.consolidated = k.consolidated || e.consolidated; continue; }
    if (texts.has(e.role + '|' + e.text)) continue;
    eps.set(e.id, e); texts.add(e.role + '|' + e.text);
  }
  // Concepts
  const cons = byKey(bm.concepts, c => c.id);
  for (const c of om.concepts || []) {
    const k = cons.get(c.id);
    if (!k) { cons.set(c.id, c); continue; }
    k.strength = Math.max(k.strength, c.strength); k.count += c.count; k.tau = Math.max(k.tau, c.tau);
    k.created = Math.min(k.created, c.created); k.lastSeen = Math.max(k.lastSeen, c.lastSeen); k.activation = Math.max(k.activation, c.activation);
    if (c.kind === 'entity') k.kind = 'entity';
  }
  // Synapses
  const syn = byKey(bm.synapses, s => s.a + '|' + s.b);
  for (const s of om.synapses || []) {
    const k = syn.get(s.a + '|' + s.b);
    if (!k) { syn.set(s.a + '|' + s.b, s); continue; }
    k.w = Math.max(k.w, s.w); k.count += s.count; k.lastFired = Math.max(k.lastFired, s.lastFired);
  }
  // Facts
  const facts = byKey(bm.facts, f => f.s + '|' + f.p + '|' + f.o.toLowerCase());
  for (const f of om.facts || []) {
    const key = f.s + '|' + f.p + '|' + f.o.toLowerCase(); const k = facts.get(key);
    if (!k) { facts.set(key, f); continue; }
    k.confidence = Math.max(k.confidence, f.confidence); k.uses += f.uses; k.wrong = Math.max(k.wrong, f.wrong); k.t = Math.max(k.t, f.t);
  }
  out.memory = { episodes: [...eps.values()].sort((a, b) => a.t - b.t), concepts: [...cons.values()], synapses: [...syn.values()], facts: [...facts.values()],
    dopamine: ((bm.dopamine ?? 0.5) + (om.dopamine ?? 0.5)) / 2 };

  // Skills: keep every learned skill; ledgers summed.
  const skills = byKey(base.skills, s => s.name);
  for (const s of other.skills || []) { const k = skills.get(s.name); if (!k) skills.set(s.name, s); else { k.wins += s.wins || 0; k.losses += s.losses || 0; if (s.learned && !k.source) Object.assign(k, { learned: true, source: s.source, tests: s.tests }); } }
  out.skills = [...skills.values()];

  // Conversion model: counts add up.
  const bc = base.conversion || { counts: { booked: {}, lost: {} }, n: { booked: 0, lost: 0 }, vocab: [] }, oc = other.conversion || { counts: { booked: {}, lost: {} }, n: { booked: 0, lost: 0 }, vocab: [] };
  const counts = { booked: { ...bc.counts.booked }, lost: { ...bc.counts.lost } };
  for (const lab of ['booked', 'lost']) for (const [k, v] of Object.entries(oc.counts[lab] || {})) counts[lab][k] = (counts[lab][k] || 0) + v;
  out.conversion = { counts, n: { booked: (bc.n.booked || 0) + (oc.n.booked || 0), lost: (bc.n.lost || 0) + (oc.n.lost || 0) }, vocab: [...new Set([...(bc.vocab || []), ...(oc.vocab || [])])] };

  // Funnel model: counts add up.
  const bf2 = base.funnel || { stats: {}, losses: {}, drop: {}, n: 0 }, of2 = other.funnel || { stats: {}, losses: {}, drop: {}, n: 0 };
  const stats = JSON.parse(JSON.stringify(bf2.stats || {}));
  for (const [k, v] of Object.entries(of2.stats || {})) { const t = stats[k] || (stats[k] = { n: 0, booked: 0, done: 0, revenue: 0, referred: 0 }); for (const f of Object.keys(v)) t[f] = (t[f] || 0) + v[f]; }
  const addMaps = (a, b) => { const o = JSON.parse(JSON.stringify(a || {})); for (const [t, m] of Object.entries(b || {})) { o[t] = o[t] || {}; for (const [k, v] of Object.entries(m)) o[t][k] = (o[t][k] || 0) + v; } return o; };
  out.funnel = { stats, losses: addMaps(bf2.losses, of2.losses), drop: addMaps(bf2.drop, of2.drop), n: (bf2.n || 0) + (of2.n || 0) };

  // Risk desk: union of advisories.
  const br = base.risk || { items: [], updated: null }, orr = other.risk || { items: [], updated: null };
  const seenH = new Set(); out.risk = { items: [...(br.items || []), ...(orr.items || [])].filter(i => !seenH.has(i.headline) && seenH.add(i.headline)), updated: [br.updated, orr.updated].filter(Boolean).sort().pop() || null };

  // Evolution: fittest genome, longest lineage.
  const be = base.evolution || {}, oe = other.evolution || {};
  const bf = (be.history || []).slice(-1)[0]?.best ?? -1, of = (oe.history || []).slice(-1)[0]?.best ?? -1;
  const winner = of > bf ? oe : be;
  const hist = [...(be.history || []), ...(oe.history || [])].sort((a, b) => a.t - b.t);
  out.evolution = { generation: Math.max(be.generation || 0, oe.generation || 0), genome: winner.genome || be.genome || oe.genome,
    history: hist.slice(-500), feedback: { up: (be.feedback?.up || 0) + (oe.feedback?.up || 0), down: (be.feedback?.down || 0) + (oe.feedback?.down || 0) },
    populationSize: be.populationSize || oe.populationSize || 8 };
  return out;
}

function summary(state) {
  const m = state.memory || {};
  return { episodes: (m.episodes || []).length, concepts: (m.concepts || []).length, synapses: (m.synapses || []).length, facts: (m.facts || []).length,
    generation: state.evolution?.generation || 0, fitness: (state.evolution?.history || []).slice(-1)[0]?.best ?? null, skills: (state.skills || []).length };
}

module.exports = { mergeMinds, summary };
