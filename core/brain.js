'use strict';
/**
 * brain.js — OYE: Adaptive Traveler Learning & Awareness System.
 *
 * The cognitive loop, modelled on a cortical "perceive → recall → reason → act → learn" cycle
 * with a reward system (dopamine) and a sleep cycle (consolidation), wrapped in an evolutionary
 * outer loop that tunes the brain's own neuro-parameters.
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const T = require('./text');
const { Memory } = require('./memory');
const L = require('./learning');
const { Skills } = require('./skills');
const { Evolution } = require('./evolution');
const { Mentor } = require('./mentor');
const { mergeMinds, summary } = require('./merge');
const { Conversion } = require('./conversion');
const { Funnel } = require('./funnel');
const { RiskDesk } = require('./risk');

const VERSION = '0.1.0';

class Brain extends EventEmitter {
  constructor({ dataDir = path.join(__dirname, '..', 'data'), name = 'OYE', autosave = true } = {}) {
    super();
    this.name = name;
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'state.json');
    this.born = Date.now();
    this.interactions = 0;
    this.lessonsLearned = 0;
    this.log = [];                   // recent cognitive events for the UI
    this.pendingQuestion = null;     // curiosity question awaiting an answer
    this.unknowns = [];              // questions it could not answer -> training signal
    this.absorbedSeeds = [];         // hashes of seed minds already merged in
    this.mentor = new Mentor();
    this.evolution = new Evolution();
    this.memory = new Memory(this.evolution.genome);
    this.skills = new Skills(); this.skills.ctx = { brain: this };
    this.conversion = new Conversion();
    this.funnel = new Funnel();
    this.risk = new RiskDesk();
    this.skills.context = { conversion: this.conversion, funnel: this.funnel, brain: this };
    this.autosave = autosave;
    this.lastResponse = null;
    this.lastSubject = null;         // discourse focus for pronouns and fragments
    this._saveTimer = null;
    this.load();
  }

  // ---------- Persistence ----------
  load() {
    try {
      if (!fs.existsSync(this.file)) return false;
      const s = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.evolution = new Evolution(s.evolution);
      this.memory = new Memory(this.evolution.genome, s.memory);
      this.skills = new Skills(s.skills); this.skills.ctx = { brain: this };
      this.conversion = new Conversion(s.conversion);
      this.funnel = new Funnel(s.funnel);
      this.risk = new RiskDesk(s.risk);
      this.skills.context = { conversion: this.conversion, funnel: this.funnel, brain: this };
      this.born = s.born || this.born;
      this.interactions = s.interactions || 0;
      this.lessonsLearned = s.lessonsLearned || 0;
      this.unknowns = s.unknowns || [];
      this.absorbedSeeds = s.absorbedSeeds || [];
      this.log = (s.log || []).slice(-100);
      this.event('system', `State restored: ${this.memory.episodes.length} episodes, ${this.memory.concepts.size} concepts, generation ${this.evolution.generation}.`);
      return true;
    } catch (e) { this.event('error', 'Could not load state: ' + e.message); return false; }
  }

  save() {
    if (!this.autosave) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveNow(), 500);
  }

  saveNow() {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.current()));
      fs.renameSync(tmp, this.file);
    } catch (e) { this.event('error', 'Could not save state: ' + e.message); }
  }

  event(kind, text, data = {}) {
    const e = { t: Date.now(), kind, text, ...data };
    this.log.push(e);
    if (this.log.length > 300) this.log.shift();
    this.emit('event', e);
    return e;
  }

  /** Merge another mind's state into this one. Nothing already known is lost. */
  absorb(state, { source = 'import' } = {}) {
    if (!state || typeof state !== 'object' || !state.memory) throw new Error('not a mind: expected {memory, evolution, skills}');
    const before = summary(this.current());
    const merged = mergeMinds(this.current(), state);
    this.evolution = new Evolution(merged.evolution);
    this.memory = new Memory(this.evolution.genome, merged.memory);
    this.skills = new Skills(merged.skills); this.skills.ctx = { brain: this };
    this.conversion = new Conversion(merged.conversion);
    this.funnel = new Funnel(merged.funnel);
    this.risk = new RiskDesk(merged.risk);
    this.skills.context = { conversion: this.conversion, funnel: this.funnel, brain: this };
    this.born = merged.born; this.interactions = merged.interactions; this.lessonsLearned = merged.lessonsLearned; this.unknowns = merged.unknowns;
    const after = summary(merged);
    this.event('learn', `Absorbed a mind from ${source}: facts ${before.facts}→${after.facts}, concepts ${before.concepts}→${after.concepts}, generation ${before.generation}→${after.generation}.`);
    this.saveNow();
    return { before, after };
  }

  /** Absorb a seed file (e.g. mind/state.json from git) once per distinct version. */
  absorbSeed(file) {
    try {
      if (!fs.existsSync(file)) return null;
      const text = fs.readFileSync(file, 'utf8');
      const key = T.hash(text);
      if (this.absorbedSeeds.includes(key)) return null;
      const r = this.absorb(JSON.parse(text), { source: path.basename(path.dirname(file)) + '/' + path.basename(file) });
      this.absorbedSeeds.push(key); this.absorbedSeeds = this.absorbedSeeds.slice(-50); this.saveNow();
      return r;
    } catch (e) { this.event('error', 'Could not absorb seed: ' + e.message); return null; }
  }

  /** The full state as it would be saved. */
  current() {
    return { version: VERSION, born: this.born, interactions: this.interactions, lessonsLearned: this.lessonsLearned,
      unknowns: this.unknowns.slice(-200), log: this.log.slice(-100), absorbedSeeds: this.absorbedSeeds,
      evolution: this.evolution.dump(), memory: this.memory.dump(), skills: this.skills.dump(), conversion: this.conversion.dump(), funnel: this.funnel.dump(), risk: this.risk.dump() };
  }

  // ---------- Teaching ----------
  /** Teach a block of text (lesson). Facts are extracted immediately; episodes stay for replay. */
  teach(text, { source = 'lesson', importance = 0.8 } = {}) {
    let facts = 0;
    for (const sentence of T.sentences(text)) {
      if (sentence.length < 4) continue;
      this.memory.remember('lesson', sentence, { importance, meta: { source } });
      for (const f of L.extractFacts(sentence)) { if (this.memory.learnFact(f.s, f.p, f.o, { confidence: 0.75, source })) facts++; }
      this.lessonsLearned++;
    }
    this.event('learn', `Studied ${T.sentences(text).length} sentences from ${source}; extracted ${facts} facts.`, { facts });
    this.save();
    return facts;
  }

  /** Load every .md/.txt file in a curriculum directory, once per file hash. */
  studyCurriculum(dir) {
    if (!fs.existsSync(dir)) return 0;
    const studied = new Set(this.memory.episodes.filter(e => e.meta && e.meta.curriculum).map(e => e.meta.curriculum));
    let total = 0;
    for (const f of fs.readdirSync(dir).filter(f => /\.(md|txt)$/i.test(f)).sort()) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      const key = f + ':' + T.hash(text);
      if (studied.has(key)) continue;
      const clean = text.replace(/^#+\s.*$/gm, '').replace(/^\s*[-*]\s+/gm, '').replace(/\*\*/g, '');
      for (const sentence of T.sentences(clean)) {
        if (sentence.length < 4) continue;
        this.memory.remember('lesson', sentence, { importance: 0.85, meta: { source: f, curriculum: key } });
        for (const fact of L.extractFacts(sentence)) this.memory.learnFact(fact.s, fact.p, fact.o, { confidence: 0.8, source: f });
        total++;
      }
      this.lessonsLearned += total;
      this.event('learn', `Read lesson file ${f}.`);
    }
    if (total) this.save();
    return total;
  }

  // ---------- The cognitive loop ----------
  async respond(input, { user = 'chief' } = {}) {
    input = String(input || '').trim();
    if (!input) return { text: 'Say something and I will learn from it.', confidence: 1, via: 'reflex' };
    this.interactions++;
    const t0 = Date.now();

    // 1. Perceive & encode (episodic + Hebbian).
    const valence = /thank|great|love|awesome|good job|well done|perfect/i.test(input) ? 0.6 : /wrong|bad|stupid|useless|no\b/i.test(input) ? -0.4 : 0;
    const isCommand = !!this.skills.peek(input);
    const ep = this.memory.remember('user', input, { valence, importance: isCommand ? 0.15 : T.isQuestion(input) ? 0.4 : 0.7, meta: { user, skip: isCommand || T.isQuestion(input) || undefined } });
    const recalled = this.memory.recall(input, 6).filter(r => r.ep.id !== ep.id);
    this.event('perceive', `Encoded "${input.slice(0, 60)}"; working memory: ${this.memory.working.slice(0, 5).map(w => w.id).join(', ') || '∅'}.`);

    let result;
    // 2. Answer to a curiosity question?
    if (this.pendingQuestion && !T.isQuestion(input)) {
      const subj = this.pendingQuestion.subject;
      const facts = L.extractFacts(input);
      const learned = facts.length ? facts : [{ s: subj, p: 'is', o: input.replace(/^(it'?s|it is|they are|that is)\s+/i, '') }];
      for (const f of learned) this.memory.learnFact(f.s, f.p, f.o, { confidence: 0.8, source: 'curiosity' });
      this.memory.reward(+0.15);
      this.event('learn', `Curiosity satisfied: learned ${learned.length} fact(s) about "${subj}".`);
      this.pendingQuestion = null;
      result = { text: `Got it. ${L.phrase(learned[0])}. ${this.curiosityPrompt() || ''}`.trim(), confidence: 0.9, via: 'curiosity' };
    }

    // 3. Correction?
    if (!result) {
      const corr = L.detectCorrection(input);
      if (corr) {
        for (const f of corr) {
          for (const old of this.memory.factsAbout(f.s).filter(o => o.p === f.p && o.o.toLowerCase() !== f.o.toLowerCase())) old.wrong += 2;
          this.memory.learnFact(f.s, f.p, f.o, { confidence: 0.9, source: 'correction' });
        }
        this.memory.reward(-0.1); // mild punishment, then relearn
        if (this.lastResponse && this.lastResponse.via === 'skill') this.skills.feedback(this.lastResponse.evidence[0].replace('skill:', ''), false);
        this.event('learn', `Correction accepted: ${corr.map(L.phrase).join('; ')}.`);
        result = { text: `Understood, I was wrong. Updated: ${corr.map(L.phrase).join('; ')}.`, confidence: 0.9, via: 'correction' };
      }
    }

    // 4. Identity / social reflexes.
    if (!result) {
      const who = L.detectIdentity(input);
      if (who) { this.memory.learnFact(who, 'is', 'a person I talk to', { confidence: 0.9 }); result = { text: `Nice to meet you, ${T.titleCase(who)}. I am ${this.name}, the mind of the Travelers Clan. I remember everything you teach me.`, confidence: 1, via: 'social' }; }
      else if (/^(hi|hello|hey|yo|namaste|good (morning|evening|afternoon))\b/i.test(input) && input.length < 40) {
        result = { text: `Hello. I am ${this.name}, generation ${this.evolution.generation}. I know ${this.memory.facts.length} facts and ${this.memory.concepts.size} concepts so far. Teach me, ask me, or correct me.`, confidence: 1, via: 'social' };
      } else if (/^(who|what) are you\b/i.test(input)) {
        result = { text: `I am ${this.name}: a learning mind built for the Travelers Clan. I keep episodic and semantic memory, learn Hebbian associations, sleep to consolidate, and evolve my own parameters. Generation ${this.evolution.generation}, ${this.memory.facts.length} facts.`, confidence: 1, via: 'social' };
      } else if (/^(what do you know|what have you learned|status|report)\b/i.test(input)) {
        const top = [...this.memory.concepts.values()].sort((a, b) => b.strength - a.strength).slice(0, 8).map(c => c.label);
        result = { text: `I hold ${this.memory.facts.length} facts, ${this.memory.episodes.length} memories, ${this.memory.concepts.size} concepts and ${this.memory.synapses.size} synapses. Strongest concepts: ${top.join(', ')}. ${this.unknowns.length ? `I still could not answer ${this.unknowns.length} questions.` : ''}`, confidence: 1, via: 'social' };
      }
    }

    // 5. Question → reason. Fragments and pronouns refer to the last subject ("and the duration?", "where is she from?").
    let q = L.parseQuestion(input);
    if (this.lastSubject) {
      const frag = input.match(/^(?:and|what about|how about|also)?\s*(?:the|its|his|her|their)?\s*(duration|length|price|cost|start date|start|location|season|group size|advance|dates?)\??$/i);
      if (frag) {
        const map = { duration: 'how long is', length: 'how long is', price: 'how much is', cost: 'how much is', start: 'when does', 'start date': 'when does', location: 'where is', season: 'when is', 'group size': 'what is the group size of', advance: 'how much advance for', date: 'when does', dates: 'when does' };
        const lead = map[frag[1].toLowerCase()] || 'what is';
        q = L.parseQuestion(`${lead} ${this.lastSubject}${/^when does/.test(lead) ? ' start' : ''}?`) || q;
        if (q) q.raw = input;
      } else if (q && q.subject && L.PRONOUN_Q.test(q.subject)) { q.subject = this.lastSubject; if (q.claim) q.claim.s = this.lastSubject; }
      else if (!q) {
        const pron = input.match(/\b(it|she|he|they|its|her|his|their)\b/i);
        if (pron && T.isQuestion(input)) { q = L.parseQuestion(input.replace(new RegExp('\\b' + pron[1] + '\\b', 'i'), this.lastSubject)); if (q) q.raw = input; }
      }
    }
    if (!result && q) {
      let a = L.answer(q, this.memory, this.skills, recalled);
      const floor = this.evolution.genome.confidenceFloor;
      if (a.confidence < floor || !a.text) {
        // Ask the mentor; distil the answer into memory.
        const ctx = [...this.memory.factsAbout(q.subject).slice(0, 8).map(L.phrase), ...recalled.slice(0, 4).map(r => r.ep.text)].join('\n') || '(none)';
        const m = await this.mentor.answer(input, ctx);
        if (m && m.text) {
          let n = 0;
          for (const s of m.facts) for (const f of L.extractFacts(s)) if (this.memory.learnFact(f.s, f.p, f.o, { confidence: 0.7, source: 'mentor' })) n++;
          this.event('mentor', `Mentor answered; distilled ${n} fact(s).`);
          a = { text: m.text, confidence: 0.8, evidence: ['mentor'], via: 'mentor' };
        } else if (!a.text || a.confidence < floor * 0.6) {
          this.unknowns.push({ t: Date.now(), q: input, subject: q.subject });
          this.event('reason', `No confident answer for "${q.subject}" (confidence ${a.confidence.toFixed(2)}).`);
          a = { text: `I do not know about "${q.subject}" yet. Tell me, for example: "${T.titleCase(q.subject)} is ..." and I will remember it.`, confidence: 0, evidence: [], via: 'unknown' };
        }
      }
      result = a;
      if (q.subject && !L.PRONOUN_Q.test(q.subject) && q.subject.length > 2 && a.via !== 'unknown') this.lastSubject = q.subject;
      this.event('reason', `Answered via ${a.via} (confidence ${a.confidence.toFixed(2)}).`);
    }

    // 6. Statement → learn.
    if (!result) {
      const skill = this.skills.tryAll(input);
      if (skill) result = { text: skill.output, confidence: 0.95, evidence: ['skill:' + skill.name], via: 'skill' };
      else {
        let facts = L.extractFacts(input);
        // Rambling sentences produce junk subjects ("honestly the spiti departure we"); with a model present, let it restate instead.
        if (this.mentor.enabled && facts.some(f => f.s.split(' ').length > 4 || /\b(we|i|you|honestly|basically|actually)\b/.test(f.s))) facts = [];
        for (const f of facts) this.memory.learnFact(f.s, f.p, f.o, { confidence: 0.7, source: user });
        if (facts.length) {
          this.lastSubject = facts[facts.length - 1].s;
          this.memory.reward(+0.1);
          this.event('learn', `Learned ${facts.length} fact(s): ${facts.map(L.phrase).join('; ')}.`);
          result = { text: `Learned: ${facts.map(L.phrase).join('; ')}. ${this.curiosityPrompt() || ''}`.trim(), confidence: 0.85, via: 'learn' };
        } else if (this.mentor.enabled && input.split(' ').length >= 4) {
          // The rules could not read this statement; ask the model to restate it as simple facts, then learn them.
          const got = await this.mentor.json('You turn a message into simple facts for a memory system.', `Message: "${input}"\nReturn {"facts": [up to 4 short sentences of the form "<subject> is/has/costs/needs/should <object>" that this message states as true]}`, { maxTokens: 200 });
          const learned = []; for (const sent of (got && got.facts) || []) for (const f of L.extractFacts(sent)) if (this.memory.learnFact(f.s, f.p, f.o, { confidence: 0.6, source: 'model:' + user })) learned.push(f);
          if (learned.length) { this.event('learn', `Model restated the message; learned ${learned.length} fact(s).`); result = { text: `Learned: ${learned.map(L.phrase).join('; ')}.`, confidence: 0.75, via: 'model' }; }
          else result = { text: `Noted. I will keep that in mind. ${this.curiosityPrompt() || ''}`.trim(), confidence: 0.6, via: 'note' };
        } else if (recalled.length && recalled[0].score > 0.3) {
          result = { text: `That reminds me of something: "${recalled[0].ep.text.slice(0, 160)}". I have noted what you said.`, confidence: 0.5, via: 'episodic' };
        } else {
          result = { text: `Noted. I will keep that in mind${this.memory.working.length ? ` (linked to ${this.memory.working.slice(0, 3).map(w => w.id).join(', ')})` : ''}. ${this.curiosityPrompt() || ''}`.trim(), confidence: 0.6, via: 'note' };
        }
      }
    }

    // 7. Act: remember own response, update stats.
    if (result.via !== 'skill') this.memory.remember('atlas', result.text, { importance: 0.3, meta: { via: result.via, skip: true } });
    result.ms = Date.now() - t0;
    result.generation = this.evolution.generation;
    result.workingMemory = this.memory.working.slice(0, 7).map(w => w.id);
    this.lastResponse = result;
    this.save();
    return result;
  }

  /** Curiosity: ask about the weakest well-connected entity, at a rate set by the genome. */
  curiosityPrompt() {
    if (Math.random() > this.evolution.genome.curiosity * 0.5) return '';
    const known = new Set(this.memory.facts.map(f => f.s));
    const cands = [...this.memory.concepts.values()].filter(c => c.kind === 'entity' && !known.has(c.id) && c.count >= 2 && c.id.length > 2)
      .sort((a, b) => b.count - a.count).slice(0, 5);
    if (!cands.length) {
      if (this.unknowns.length) { const u = this.unknowns[this.unknowns.length - 1]; this.pendingQuestion = { subject: u.subject }; return `Earlier I could not answer "${u.q}". Can you teach me?`; }
      return '';
    }
    const c = cands[Math.floor(Math.random() * cands.length)];
    this.pendingQuestion = { subject: c.id };
    this.event('curiosity', `Curious about "${c.label}".`);
    return `I keep noticing "${T.titleCase(c.label)}". What is it?`;
  }

  // ---------- Reward ----------
  feedback(good, note = '') {
    this.evolution.recordFeedback(good);
    this.memory.reward(good ? +0.25 : -0.25);
    if (this.lastResponse) {
      if (this.lastResponse.via === 'skill') this.skills.feedback(String(this.lastResponse.evidence[0]).replace('skill:', ''), good);
      if (this.lastResponse.via === 'facts') for (const id of this.lastResponse.evidence) { const f = this.memory.facts.find(x => x.id === id); if (f) good ? (f.confidence = Math.min(1, f.confidence + 0.1)) : f.wrong++; }
    }
    this.event('reward', `${good ? 'Positive' : 'Negative'} feedback${note ? ': ' + note : ''}. Dopamine ${this.memory.dopamine.toFixed(2)}.`);
    this.save();
  }

  // ---------- Sleep & evolution ----------
  async sleep() {
    const report = this.memory.consolidate(L.extractFacts);
    this.memory.decay(1);
    // Dreaming: rehearse the facts that are least used, so rarely-asked knowledge does not fade.
    const stale = this.memory.facts.filter(f => f.wrong < 2).sort((a, b) => a.uses - b.uses).slice(0, 12);
    for (const f of stale) this.memory.encode(L.phrase(f), 0.3);
    report.dreamed = stale.length;
    // Mentor reflection on the last stretch of conversation.
    const recent = this.memory.episodes.slice(-30).filter(e => e.role === 'user' || e.role === 'atlas');
    if (this.mentor.enabled && recent.length >= 4) {
      const lessons = await this.mentor.reflect(recent);
      let n = 0;
      for (const s of lessons) for (const f of L.extractFacts(s)) if (this.memory.learnFact(f.s, f.p, f.o, { confidence: 0.7, source: 'reflection' })) n++;
      report.reflected = n;
    }
    this.event('sleep', `Slept: replayed ${report.replayed} episodes, formed ${report.newFacts} facts, pruned ${report.pruned}, merged ${report.merged}, dreamed ${report.dreamed}${report.contradictions.length ? `, found ${report.contradictions.length} contradiction(s)` : ''}${report.reflected != null ? `, reflected ${report.reflected}` : ''}.`, report);
    this.save();
    return report;
  }

  /**
   * Self-test used as the evolutionary fitness: rebuild a scratch brain with a candidate genome,
   * teach it a sample of this brain's lessons, then probe recall of held-out facts.
   */
  selfTest(genome, { sample = 60, seed = 1 } = {}) {
    const lessons = this.memory.episodes.filter(e => e.role === 'lesson' || e.role === 'user');
    const facts = this.memory.facts.filter(f => f.wrong < 2 && f.o.length < 120);
    if (facts.length < 4) return 0.5;
    let r = seed;
    const rng = () => (r = (r * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const shuffled = facts.slice().sort(() => rng() - 0.5);
    const probes = shuffled.slice(0, Math.min(25, shuffled.length));
    // A scratch brain lives a simulated week: it experiences the lessons as episodes only (no
    // direct fact injection), so everything it "knows" at probe time must have survived the
    // genome's forgetting curve and been consolidated by its sleep threshold.
    const scratch = new Memory(genome);
    const t0 = Date.now();
    scratch.remember('lesson', 'the clan teaches me', { importance: 0.5 });
    for (const ep of lessons.slice(-sample)) scratch.remember(ep.role, ep.text, { importance: ep.importance * (0.6 + rng() * 0.6) });
    for (const f of probes) scratch.remember('lesson', L.phrase(f) + '.', { importance: 0.4 + rng() * 0.5 });
    // Half the probes get rehearsed once (spacing effect); the rest must survive on salience alone.
    for (const f of probes.slice(0, Math.ceil(probes.length / 2))) scratch.encode(L.phrase(f), 0.4);
    scratch.advance(36); scratch.decay(36);  // a day and a half of forgetting
    scratch.consolidate(L.extractFacts);     // sleep
    scratch.advance(48); scratch.decay(48);  // two more days
    scratch.consolidate(L.extractFacts);
    let hit = 0, noise = 0;
    for (const f of probes) {
      const q = { kind: 'define', subject: f.s, raw: `what is ${f.s}?` };
      let a = L.answer(q, scratch, this.skills, scratch.recall(f.s, 3));
      if (a.confidence < genome.confidenceFloor) a = { text: null, via: 'unknown', confidence: 0 }; // same rule the live brain applies
      if (a.text && a.text.toLowerCase().includes(f.o.toLowerCase().slice(0, 12))) hit++;
      else if (a.text && a.via === 'facts') noise++;            // confidently wrong is worse than silent
      if (scratch.working.length > genome.wmCapacity) noise++;
    }
    // Economy: a brain that keeps every weak synapse is slower, noisier and costlier to search.
    const economy = 1 / (1 + scratch.synapses.size / 3000);
    const speed = 1 / (1 + (Date.now() - t0) / 800);
    return Math.max(0, (hit / probes.length) * 0.75 - (noise / probes.length) * 0.2 + economy * 0.15 + speed * 0.1);
  }

  evolve(generations = 1) {
    let entry;
    for (let i = 0; i < generations; i++) {
      entry = this.evolution.step(g => this.selfTest(g, { seed: this.evolution.generation + 1 }));
      this.memory.genome = this.evolution.genome;
      this.event('evolve', `Generation ${entry.generation}: fitness ${entry.best.toFixed(3)} (mean ${entry.mean.toFixed(3)})${entry.accepted ? '' : ', champion kept'}.`, entry);
    }
    this.save();
    return entry;
  }

  /** Learn from conversation outcomes (synthetic or real) and turn the findings into facts. */
  learnConversions(convs, { source = 'conversations' } = {}) {
    this.conversion.train(convs);
    let n = 0;
    for (const sentence of this.conversion.lessons()) for (const f of L.extractFacts(sentence)) if (this.memory.learnFact(f.s, f.p, f.o, { confidence: 0.75, source })) n++;
    this.event('learn', `Studied ${convs.length} conversations; ${n} new facts about what converts.`);
    this.save();
    return n;
  }

  /** The council of agents (lazy, so core modules stay independent). */
  get visa() { if (!this._visa) { const { VisaDesk } = require('./visa'); this._visa = new VisaDesk(this); } return this._visa; }
  get autopilot() { if (!this._autopilot) { const { Autopilot } = require('./autopilot'); this._autopilot = new Autopilot(this); } return this._autopilot; }
  get agent() { if (!this._agent) { const { Agent } = require('./agent'); this._agent = new Agent(this); } return this._agent; }
  get growth() { if (!this._growth) { const { Growth } = require('./growth'); this._growth = new Growth(this); } return this._growth; }
  get council() { if (!this._council) { const { Council } = require('./council'); this._council = new Council(this); } return this._council; }

  /** Learn the funnel policy from end-to-end journeys (synthetic or real) and keep the findings as facts. */
  learnJourneys(journeys, { source = 'journeys' } = {}) {
    this.funnel.train(journeys);
    let n = 0;
    for (const sentence of this.funnel.lessons()) for (const f of L.extractFacts(sentence)) if (this.memory.learnFact(f.s, f.p, f.o, { confidence: 0.75, source })) n++;
    for (const j of journeys.filter((_, i) => i % 25 === 0).slice(0, 160)) this.memory.remember('experience', `${j.person.name} (${j.person.type}) wrote: ${j.log[0].text.slice(0, 160)} → ${j.outcome}${j.lostWhy ? ' (' + j.lostWhy + ')' : ''}`, { importance: 0.25, meta: { source, skip: true }, encode: false });
    this.event('learn', `Studied ${journeys.length} customer journeys; ${n} new facts about the funnel.`);
    this.save();
    return n;
  }

  /** Try to grow a new skill for a class of questions OYE keeps failing. */
  async growSkill() {
    if (!this.mentor.enabled || this.unknowns.length < 3) return null;
    const examples = this.unknowns.slice(-6).map(u => u.q);
    const spec = await this.mentor.synthesizeSkill('Answer questions like these deterministically if they are computable; otherwise return null from match.', examples);
    if (!spec) return null;
    try {
      const s = this.skills.learn(spec);
      this.event('evolve', `Grew a new skill: ${s.name} — ${s.description}`);
      this.save();
      return s;
    } catch (e) { this.event('error', `Rejected synthesized skill: ${e.message}`); return null; }
  }

  /** One self-directed upbringing round: self-quiz with self-reward, sleep, evolve. Used by hosts that train on their own. */
  async upbringing({ generations = 5 } = {}) {
    let hit = 0, total = 0;
    const saved = this.pendingQuestion; this.pendingQuestion = null;
    for (const f of this.memory.facts.slice(0, 150)) {
      const r = await this.respond(`what is ${f.s}?`); total++;
      if (r.text && r.text.toLowerCase().includes(f.o.toLowerCase().slice(0, 12))) { hit++; this.memory.reward(0.02); }
      this.pendingQuestion = null;
    }
    this.pendingQuestion = saved;
    await this.council.ask('dialogue', { count: 6 });
    const exam = await this.council.ask('tester', { message: 'routine examination' });
    const sleep = await this.sleep();
    const evo = this.evolve(generations);
    this.event('evolve', `Upbringing round: self-quiz ${hit}/${total}, generation ${evo ? evo.generation : this.evolution.generation}.`);
    return { quiz: { hit, total }, exam: exam.agents.tester.output, sleep, evolution: evo };
  }

  /** Background heartbeat: decay, occasional sleep and evolution. */
  tick(hoursElapsed = 1 / 60) {
    this.memory.decay(hoursElapsed);
  }

  // ---------- Snapshot for the UI ----------
  snapshot() {
    const h = this.evolution.history;
    return {
      name: this.name, version: VERSION, born: this.born, uptimeMs: Date.now() - this.born, interactions: this.interactions,
      lessonsLearned: this.lessonsLearned, generation: this.evolution.generation, genome: this.evolution.genome,
      fitness: h.length ? h[h.length - 1].best : null, approval: +this.evolution.humanScore().toFixed(3), feedback: this.evolution.feedback,
      memory: this.memory.stats(), skills: this.skills.list(), mentor: this.mentor.status(), unknowns: this.unknowns.slice(-10),
      pendingQuestion: this.pendingQuestion, contradictions: this.memory.contradictions || [], history: h.slice(-120).map(e => ({ generation: e.generation, best: e.best, mean: e.mean })),
      topFacts: this.memory.facts.slice().sort((a, b) => b.confidence - a.confidence).slice(0, 12).map(f => ({ text: L.phrase(f), confidence: +f.confidence.toFixed(2), source: f.source })),
      log: this.log.slice(-40),
    };
  }
}

module.exports = { Brain, VERSION };
