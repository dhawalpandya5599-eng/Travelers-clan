'use strict';
/**
 * memory.js — hippocampus + neocortex of OYE.
 *
 * Three stores, modelled on the neuroscience of memory:
 *  - Episodic memory: every experience, time-stamped, with emotional valence and importance.
 *  - Semantic memory: a concept graph with Hebbian synapses ("cells that fire together wire together")
 *    and a forgetting curve whose time constant grows with rehearsal (the spacing effect).
 *  - Working memory: a small, capacity-limited buffer (Miller's 7±2) with spreading activation.
 *
 * Consolidation ("sleep") replays strong episodes into semantic facts and prunes weak synapses,
 * which is how the agent moves from remembering to knowing.
 */

const T = require('./text');

const HOUR = 3600e3;

class Memory {
  constructor(genome, state) {
    this.genome = genome;
    this.episodes = [];          // {id,t,role,text,tokens,valence,importance,access,lastAccess,consolidated}
    this.concepts = new Map();   // id -> {id,label,strength,activation,tau,count,created,lastSeen,kind}
    this.synapses = new Map();   // "a|b" -> {a,b,w,count,lastFired}
    this.facts = [];             // {id,s,p,o,confidence,source,t,uses,wrong}
    this.working = [];           // [{id,activation}]
    this.dopamine = 0.5;         // reward signal 0..1
    this.simOffset = 0;
    this.contradictions = [];       // unresolved conflicting facts, refreshed at each sleep          // ms of simulated time (used by self-tests to age a scratch brain)
    if (state) this.load(state);
  }

  now() { return Date.now() + this.simOffset; }
  /** Advance simulated time (hours). Real brains never call this; scratch brains live fast. */
  advance(hours) { this.simOffset += hours * HOUR; }

  // ---------- Episodic ----------
  remember(role, text, { valence = 0, importance = 0.5, meta = {}, encode = true } = {}) {
    const ep = {
      id: 'e' + T.hash(text + this.now() + Math.random()), t: this.now(), role, text: String(text).slice(0, 2000),
      tokens: T.tokens(text), valence, importance, access: 0, lastAccess: this.now(), consolidated: false, meta,
    };
    this.episodes.push(ep);
    if (this.episodes.length > 5000) this.forgetWeakestEpisodes(500);
    if (encode) this.encode(text, importance);
    return ep;
  }

  forgetWeakestEpisodes(n) {
    this.episodes.sort((a, b) => this.episodeSalience(b) - this.episodeSalience(a));
    this.episodes.length = Math.max(0, this.episodes.length - n);
    this.episodes.sort((a, b) => a.t - b.t);
  }

  episodeSalience(ep) {
    const age = Math.max(0, (this.now() - ep.lastAccess) / HOUR);
    const retention = Math.exp(-age / (this.genome.decayTau * (1 + ep.access)));
    return retention * (0.4 + ep.importance) * (1 + Math.abs(ep.valence)) * (1 + Math.log1p(ep.access));
  }

  // ---------- Semantic graph ----------
  concept(label, kind = 'concept') {
    const id = label.toLowerCase();
    let c = this.concepts.get(id);
    if (!c) {
      c = { id, label, strength: 0.1, activation: 0, tau: this.genome.decayTau, count: 0, created: this.now(), lastSeen: this.now(), kind };
      this.concepts.set(id, c);
    }
    return c;
  }

  /** Hebbian encoding: strengthen every concept in a sentence and the synapses between them. */
  encode(text, importance = 0.5) {
    const lr = this.genome.learningRate;
    for (const sentence of T.sentences(text)) {
      const toks = [...new Set(T.tokens(sentence))].slice(0, 24);
      const ents = T.entities(sentence);
      const all = [...new Set([...toks, ...ents])];
      for (const label of all) {
        const c = this.concept(label, ents.includes(label) ? 'entity' : 'concept');
        c.count++;
        c.lastSeen = this.now();
        c.strength = Math.min(1, c.strength + lr * (0.5 + importance));
        c.tau *= 1 + lr * 0.5; // rehearsal stretches the forgetting curve (spacing effect)
        c.activation = Math.min(1, c.activation + 0.6);
      }
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) this.wire(all[i], all[j], lr * (0.5 + importance));
      }
    }
  }

  wire(a, b, dw) {
    if (a === b) return;
    const key = a < b ? a + '|' + b : b + '|' + a;
    let s = this.synapses.get(key);
    if (!s) { s = { a: a < b ? a : b, b: a < b ? b : a, w: 0, count: 0, lastFired: this.now() }; this.synapses.set(key, s); }
    s.w = Math.min(1, s.w + dw * (1 - s.w)); // bounded Hebbian growth
    s.count++;
    s.lastFired = this.now();
  }

  neighbors(id) {
    const out = [];
    for (const s of this.synapses.values()) {
      if (s.a === id) out.push({ id: s.b, w: s.w });
      else if (s.b === id) out.push({ id: s.a, w: s.w });
    }
    return out.sort((x, y) => y.w - x.w);
  }

  /** Spreading activation from cue concepts, two hops, capacity limited. */
  activate(cues) {
    const act = new Map();
    for (const cue of cues) if (this.concepts.has(cue)) act.set(cue, 1);
    for (let hop = 0; hop < 2; hop++) {
      const frontier = [...act.entries()];
      for (const [id, a] of frontier) {
        for (const n of this.neighbors(id).slice(0, 12)) {
          const v = a * n.w * 0.7;
          if (v > this.genome.associationThreshold) act.set(n.id, Math.max(act.get(n.id) || 0, v));
        }
      }
    }
    for (const [id, a] of act) { const c = this.concepts.get(id); if (c) c.activation = Math.min(1, c.activation + a); }
    this.working = [...act.entries()].map(([id, activation]) => ({ id, activation }))
      .sort((x, y) => y.activation - x.activation).slice(0, this.genome.wmCapacity);
    return this.working;
  }

  /** Retrieve episodes relevant to text by lexical similarity + association + recency + salience. */
  recall(text, k = 5) {
    const q = T.bag(text);
    const cues = Object.keys(q);
    const wm = new Map(this.activate(cues).map(w => [w.id, w.activation]));
    const scored = this.episodes.map(ep => {
      const sim = T.cosine(q, Object.fromEntries(ep.tokens.map(t => [t, 1])));
      let assoc = 0;
      for (const t of ep.tokens) assoc += wm.get(t) || 0;
      assoc = Math.min(1, assoc / 4);
      const score = sim * 0.6 + assoc * 0.25 + this.episodeSalience(ep) * 0.15;
      return { ep, score };
    }).filter(x => x.score > 0.08).sort((a, b) => b.score - a.score).slice(0, k);
    for (const { ep } of scored) { ep.access++; ep.lastAccess = this.now(); }
    return scored;
  }

  // ---------- Facts (semantic triples) ----------
  learnFact(s, p, o, { confidence = 0.6, source = 'user' } = {}) {
    s = s.trim().toLowerCase(); p = p.trim().toLowerCase(); o = o.trim();
    if (!s || !o || s.length > 80 || o.length > 200) return null;
    const existing = this.facts.find(f => f.s === s && f.p === p && f.o.toLowerCase() === o.toLowerCase());
    if (existing) { existing.confidence = Math.min(1, existing.confidence + 0.15); existing.t = this.now(); return existing; }
    const f = { id: 'f' + T.hash(s + p + o), s, p, o, confidence, source, t: this.now(), uses: 0, wrong: 0 };
    this.facts.push(f);
    this.concept(s, 'entity');
    for (const tok of T.tokens(o)) this.wire(s, tok, 0.4);
    return f;
  }

  factsAbout(subject) {
    const s = subject.toLowerCase();
    const st = T.tokens(subject).join(' ');
    return this.facts.filter(f => f.s === s || f.s.includes(s) || (st && T.tokens(f.s).join(' ') === st))
      .sort((a, b) => (b.confidence - b.wrong * 0.3) - (a.confidence - a.wrong * 0.3));
  }

  // ---------- Homeostasis ----------
  /** Forgetting curve step: decay activation fast, strength slowly, synapses by disuse. */
  decay(dtHours = 1) {
    for (const c of this.concepts.values()) {
      c.activation *= Math.exp(-dtHours * 4);
      c.strength *= Math.exp(-dtHours / (c.tau * 24));
    }
    for (const [k, s] of this.synapses) {
      s.w *= Math.exp(-dtHours / (this.genome.decayTau * 24 * (1 + Math.log1p(s.count))));
      if (s.w < 0.01) this.synapses.delete(k);
    }
    // Forgetting: unconsolidated episodes whose trace has faded are gone. Consolidated ones
    // live on as facts, so dropping the episode loses nothing the brain still uses.
    const before = this.episodes.length;
    this.episodes = this.episodes.filter(ep => this.episodeSalience(ep) > 0.02 || (ep.consolidated && ep.access > 0));
    this.dopamine += (0.5 - this.dopamine) * 0.1; // reward baseline recovers
    return { forgotten: before - this.episodes.length };
  }

  reward(delta) {
    this.dopamine = Math.max(0, Math.min(1, this.dopamine + delta));
    // Reward-modulated plasticity: recently active synapses are potentiated or depressed.
    const cutoff = this.now() - 10 * 60e3;
    for (const s of this.synapses.values()) if (s.lastFired > cutoff) s.w = Math.max(0, Math.min(1, s.w + delta * 0.2 * s.w));
    for (const w of this.working) { const c = this.concepts.get(w.id); if (c) c.strength = Math.max(0.01, Math.min(1, c.strength + delta * 0.1)); }
  }

  /**
   * Sleep: consolidate. Replays salient, unconsolidated episodes into facts, prunes weak concepts,
   * and returns a report of what was integrated.
   */
  consolidate(extractFacts) {
    const report = { replayed: 0, newFacts: 0, pruned: 0, merged: 0 };
    const threshold = this.genome.consolidationThreshold;
    const candidates = this.episodes.filter(e => !e.consolidated && this.episodeSalience(e) > threshold * 0.3);
    for (const ep of candidates) {
      report.replayed++;
      ep.consolidated = true;
      if ((ep.role !== 'user' && ep.role !== 'lesson') || (ep.meta && ep.meta.skip)) continue;
      for (const f of extractFacts(ep.text)) {
        const before = this.facts.length;
        this.learnFact(f.s, f.p, f.o, { confidence: 0.55 + ep.importance * 0.3, source: 'consolidation' });
        if (this.facts.length > before) report.newFacts++;
      }
      this.encode(ep.text, ep.importance * 0.5); // replay strengthens traces
    }
    for (const [id, c] of this.concepts) {
      if (c.strength < 0.02 && c.count < 2 && this.now() - c.created > 6 * HOUR) { this.concepts.delete(id); report.pruned++; }
    }
    // Merge singular/plural duplicate concepts.
    for (const [id, c] of this.concepts) {
      const stemmed = T.stem(id);
      if (stemmed !== id && this.concepts.has(stemmed)) {
        const keep = this.concepts.get(stemmed);
        keep.strength = Math.min(1, keep.strength + c.strength * 0.5); keep.count += c.count;
        this.concepts.delete(id); report.merged++;
      }
    }
    // Contradictions: same subject and predicate, different objects. Keep both, lower the loser's
    // confidence, and surface the pair so the chief can settle it.
    report.contradictions = [];
    const byKey = new Map();
    for (const f of this.facts) { if (f.wrong >= 2 || / not$/.test(f.p)) continue; const k = f.s + '|' + f.p; (byKey.get(k) || byKey.set(k, []).get(k)).push(f); }
    for (const group of byKey.values()) {
      if (group.length < 2 || !/^(is in|is at|costs|takes|starts|is called)$/.test(group[0].p)) continue;
      const distinct = group.filter((f, i) => group.findIndex(g => g.o.toLowerCase() === f.o.toLowerCase()) === i);
      if (distinct.length < 2) continue;
      distinct.sort((a, b) => (b.confidence - b.wrong * 0.3 + b.t / 1e15) - (a.confidence - a.wrong * 0.3 + a.t / 1e15));
      for (const f of distinct.slice(1)) f.confidence = Math.max(0.2, f.confidence - 0.1);
      report.contradictions.push({ s: distinct[0].s, p: distinct[0].p, options: distinct.map(f => f.o) });
    }
    this.contradictions = report.contradictions;
    return report;
  }

  // ---------- Views ----------
  stats() {
    return {
      episodes: this.episodes.length, concepts: this.concepts.size, synapses: this.synapses.size,
      facts: this.facts.length, dopamine: +this.dopamine.toFixed(3),
      workingMemory: this.working.map(w => ({ id: w.id, activation: +w.activation.toFixed(2) })),
    };
  }

  graph(limit = 120) {
    const nodes = [...this.concepts.values()].sort((a, b) => (b.strength + b.activation) - (a.strength + a.activation)).slice(0, limit);
    const ids = new Set(nodes.map(n => n.id));
    const links = [...this.synapses.values()].filter(s => ids.has(s.a) && ids.has(s.b) && s.w > 0.05)
      .sort((a, b) => b.w - a.w).slice(0, limit * 3);
    // Clusters around hubs: the strongest well-connected ideas become centres; every other idea joins the centre
    // it is most strongly tied to (directly, else through a neighbour). Named after the hub, so the legend reads well.
    const nb = new Map(); for (const l of links) { (nb.get(l.a) || nb.set(l.a, []).get(l.a)).push([l.b, l.w]); (nb.get(l.b) || nb.set(l.b, []).get(l.b)).push([l.a, l.w]); }
    const degree = (id) => (nb.get(id) || []).reduce((n, [, w]) => n + w, 0);
    const K = Math.max(4, Math.min(10, Math.round(nodes.length / 18)));
    const hubs = []; for (const n of nodes.slice().sort((a, b) => (degree(b.id) * (0.5 + b.strength)) - (degree(a.id) * (0.5 + a.strength)))) { if (hubs.length >= K) break; if (n.label.length < 4 || /^(per|the|and|for|with|from|this|that|have|will|your|our|you)$/.test(n.label)) continue; if (hubs.some(h => (nb.get(h.id) || []).some(([m, w]) => m === n.id && w > 0.5))) continue; hubs.push(n); }
    const hubIndex = new Map(hubs.map((h, i) => [h.id, i]));
    const label = new Map(); for (const h of hubs) label.set(h.id, hubIndex.get(h.id));
    for (let pass = 0; pass < 3; pass++) for (const n of nodes) { if (label.has(n.id) && pass === 0) continue; const votes = new Map(); for (const [m, w] of nb.get(n.id) || []) if (label.has(m)) votes.set(label.get(m), (votes.get(label.get(m)) || 0) + w * (hubIndex.has(m) ? 2 : 1)); if (votes.size) label.set(n.id, [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0]); }
    const groups = new Map(hubs.map((h, i) => [i, { id: i, hub: h, members: [] }])); for (const n of nodes) if (label.has(n.id)) groups.get(label.get(n.id)).members.push(n);
    const clusters = [...groups.values()].map(g => ({ id: g.id, size: g.members.length, name: g.hub.label })).filter(c => c.size > 1).sort((a, b) => b.size - a.size);
    const small = new Set(clusters.map(c => c.id));
    return {
      nodes: nodes.map(n => ({ id: n.id, label: n.label, strength: +n.strength.toFixed(3), activation: +n.activation.toFixed(3), kind: n.kind, count: n.count, group: label.has(n.id) && small.has(label.get(n.id)) ? label.get(n.id) : -1 })),
      links: links.map(l => ({ source: l.a, target: l.b, w: +l.w.toFixed(3) })),
      clusters,
    };
  }

  dump() {
    return {
      episodes: this.episodes, concepts: [...this.concepts.values()], synapses: [...this.synapses.values()],
      facts: this.facts, dopamine: this.dopamine,
    };
  }

  load(state) {
    this.episodes = state.episodes || [];
    this.concepts = new Map((state.concepts || []).map(c => [c.id, c]));
    this.synapses = new Map((state.synapses || []).map(s => [s.a + '|' + s.b, s]));
    this.facts = state.facts || [];
    this.dopamine = state.dopamine ?? 0.5;
  }
}

module.exports = { Memory };
