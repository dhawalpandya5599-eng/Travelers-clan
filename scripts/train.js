#!/usr/bin/env node
'use strict';
/**
 * train.js — accelerated upbringing.
 * Studies the curriculum, runs a self-dialogue to exercise memory, sleeps, and evolves N generations.
 *   node scripts/train.js --generations 20 --cycles 3
 */
const path = require('path');
const { Brain } = require('../core/brain');
const L = require('../core/learning');
const fs = require('fs');
const cohorts = require('../core/cohorts');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? +process.argv[i + 1] : d; };
const generations = arg('generations', 10);
const cycles = arg('cycles', 2);

(async () => {
  const brain = new Brain({ dataDir: process.env.ATLAS_DATA || path.join(__dirname, '..', 'data') });
  brain.on('event', e => { if (['evolve', 'sleep', 'learn', 'error'].includes(e.kind)) console.log(`[${e.kind}] ${e.text}`); });
  const n = brain.studyCurriculum(path.join(__dirname, '..', 'curriculum'));
  console.log(`Curriculum: ${n} new sentences.`);

  for (let c = 0; c < cycles; c++) {
    // Self-quiz: ask about every known fact, reward itself when correct (self-supervised rehearsal).
    let hit = 0, total = 0;
    const ask = (f) => ({ 'is in': `where is ${f.s}?`, 'is at': `where is ${f.s}?`, costs: `how much is ${f.s}?`, takes: `how long is ${f.s}?`, starts: `when does ${f.s} start?`,
      has: `what does ${f.s} have?`, offers: `what does ${f.s} offer?`, likes: `what does ${f.s} like?`, needs: `what does ${f.s} need?`, 'goes to': `where does ${f.s} go?`,
      'worries about': `what do ${f.s} worry about?`, tone: `what tone should ${f.s} be spoken to in?`, should: `how should ${f.s}?`, means: `what does ${f.s} mean?` }[f.p] || `what is ${f.s}?`);
    for (const f of brain.memory.facts.slice()) {
      const r = await brain.respond(ask(f));
      total++;
      if (r.text && r.text.toLowerCase().includes(f.o.toLowerCase().slice(0, 12))) { hit++; brain.memory.reward(0.02); }
      brain.pendingQuestion = null;
    }
    console.log(`Cycle ${c + 1}: self-quiz ${hit}/${total} (${total ? Math.round(100 * hit / total) : 0}%).`);
    // Customer practice: meet synthetic customers from around the globe, recognise their cohort, reward correct reads,
    // and remember each enquiry as experience (so "what do families ask for?" has real episodes behind it).
    const synthFile = path.join(__dirname, '..', 'synth', 'customers.json');
    if (fs.existsSync(synthFile)) {
      const { customers } = JSON.parse(fs.readFileSync(synthFile, 'utf8'));
      let right = 0; const sample = customers.filter((_, i) => i % Math.max(1, Math.floor(customers.length / 52)) === 0);
      for (const cu of sample) {
        const r = await brain.respond(`which cohort is this lead: ${cu.message}`);
        const top = cohorts.classify(cu.message)[0];
        const ok = r.text.startsWith(cohorts.get(cu.cohort).name) || (top && top.type && top.type === cohorts.get(cu.cohort).type);
        if (ok) { right++; brain.memory.reward(0.02); brain.skills.feedback('cohort', true); } else brain.skills.feedback('cohort', false);
        brain.memory.remember('experience', `${cu.name} from ${cu.region} (${cohorts.get(cu.cohort).name}) asked: ${cu.message}`, { importance: 0.3, meta: { source: 'synthetic', cohort: cu.cohort, skip: true }, encode: false });
        brain.pendingQuestion = null;
      }
      console.log(`Cycle ${c + 1}: cohort practice ${right}/${sample.length} customers recognised.`);
    }
    if (c === 0) {
      const jFile = path.join(__dirname, '..', 'synth', 'journeys.json');
      if (fs.existsSync(jFile)) { const { journeys } = JSON.parse(fs.readFileSync(jFile, 'utf8')); const n = brain.learnJourneys(journeys, { source: 'synthetic-journeys' }); console.log(`Journeys: ${journeys.length} studied, ${n} funnel facts.`); }
      const convFile = path.join(__dirname, '..', 'synth', 'conversations.json');
      if (fs.existsSync(convFile)) { const { conversations } = JSON.parse(fs.readFileSync(convFile, 'utf8')); const n = brain.learnConversions(conversations, { source: 'synthetic-conversations' }); console.log(`Conversations: ${conversations.length} studied, ${n} conversion facts.`); }
    }
    const exam = await brain.council.ask('tester', { message: 'routine examination' });
    console.log(`Cycle ${c + 1}: tester ${exam.agents.tester.output.pass}/${exam.agents.tester.output.probes} probes, taught ${exam.taught} fact(s)${exam.agents.tester.findings.length ? ' · ' + exam.agents.tester.findings[0].slice(0, 90) : ''}.`);
    await brain.sleep();
    brain.evolve(Math.ceil(generations / cycles));
  }
  const s = brain.snapshot();
  console.log(`\nGeneration ${s.generation} · fitness ${s.fitness} · facts ${s.memory.facts} · concepts ${s.memory.concepts} · synapses ${s.memory.synapses}`);
  console.log('Genome:', JSON.stringify(s.genome));
  brain.saveNow();
})();
