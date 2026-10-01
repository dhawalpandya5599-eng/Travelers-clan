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
    for (const f of brain.memory.facts.slice()) {
      const r = await brain.respond(`what is ${f.s}?`);
      total++;
      if (r.text && r.text.toLowerCase().includes(f.o.toLowerCase().slice(0, 12))) { hit++; brain.memory.reward(0.02); }
      brain.pendingQuestion = null;
    }
    console.log(`Cycle ${c + 1}: self-quiz ${hit}/${total} (${total ? Math.round(100 * hit / total) : 0}%).`);
    await brain.sleep();
    brain.evolve(Math.ceil(generations / cycles));
  }
  const s = brain.snapshot();
  console.log(`\nGeneration ${s.generation} · fitness ${s.fitness} · facts ${s.memory.facts} · concepts ${s.memory.concepts} · synapses ${s.memory.synapses}`);
  console.log('Genome:', JSON.stringify(s.genome));
  brain.saveNow();
})();
