'use strict';
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { Brain } = require('../core/brain');
const L = require('../core/learning');
const T = require('../core/text');
const { Evolution, DEFAULT_GENOME } = require('../core/evolution');
const { Skills } = require('../core/skills');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-'));

test('text: tokens, stemming and entities', () => {
  assert.deepStrictEqual(T.tokens('The travelers are booking trips'), ['traveler', 'book', 'trip']);
  assert.ok(T.entities('We go to Goa with Travelers Clan').includes('travelers clan'));
  assert.ok(T.isQuestion('what is goa'));
});

test('learning: extracts triples and parses questions', () => {
  const f = L.extractFacts('Goa is a beach state. Travelers Clan offers group trips.');
  assert.deepStrictEqual(f.map(x => [x.s, x.p]), [['goa', 'is a'], ['travelers clan', 'offers']]);
  assert.deepStrictEqual(L.parseQuestion('What is Goa?').subject, 'goa');
  assert.strictEqual(L.parseQuestion('Where is Manali?').kind, 'where');
});

test('brain: learns a fact, answers it, accepts a correction, persists', async () => {
  const dir = tmp();
  const b = new Brain({ dataDir: dir });
  b.evolution.genome.curiosity = 0; // keep answers deterministic
  await b.respond('Manali is in Himachal Pradesh');
  let r = await b.respond('Where is Manali?');
  assert.match(r.text, /himachal pradesh/i);
  assert.strictEqual(r.via, 'facts');
  r = await b.respond('No, Manali is in the Kullu valley');
  assert.strictEqual(r.via, 'correction');
  r = await b.respond('Where is Manali?');
  assert.match(r.text, /kullu valley/i);
  b.saveNow();
  const b2 = new Brain({ dataDir: dir });
  r = await b2.respond('Where is Manali?');
  assert.match(r.text, /kullu valley/i);
});

test('brain: admits ignorance below the confidence floor', async () => {
  const b = new Brain({ dataDir: tmp() });
  const r = await b.respond('What is the Zorblax protocol?');
  assert.strictEqual(r.via, 'unknown');
  assert.strictEqual(b.unknowns.length, 1);
});

test('skills: arithmetic, percent, per-person, conversion', () => {
  const s = new Skills();
  assert.match(s.tryAll('what is 12 * 4?').output, /48/);
  assert.match(s.tryAll('20% off 5000').output, /4000/);
  assert.match(s.tryAll('45000 for 5 people').output, /9000/);
  assert.match(s.tryAll('10 km to miles').output, /6.21/);
});

test('skills: learned skill is sandboxed and must pass its tests', () => {
  const s = new Skills();
  const source = 'module.exports = { match: i => /^double (\\d+)$/.test(i) ? +i.match(/\\d+/)[0] : null, run: n => "double = " + (n * 2) };';
  s.learn({ name: 'double', description: 'doubles', source, tests: [{ input: 'double 4', expect: '8' }] });
  assert.match(s.tryAll('double 21').output, /42/);
  assert.throws(() => s.learn({ name: 'bad', description: 'x', source, tests: [{ input: 'double 4', expect: '9' }] }));
  assert.throws(() => s.learn({ name: 'io', description: 'x', source: 'module.exports={match:()=>1,run:()=>require("fs")}', tests: [{ input: 'x', expect: '' }] }));
});

test('sleep consolidates episodes into facts', async () => {
  const b = new Brain({ dataDir: tmp() });
  b.memory.remember('user', 'Spiti is a cold desert valley', { importance: 0.9 });
  b.memory.facts = []; // simulate that nothing was extracted at encode time
  const report = await b.sleep();
  assert.ok(report.replayed >= 1);
  assert.ok(b.memory.factsAbout('spiti').length >= 1);
});

test('evolution: fitness never regresses and genome stays in bounds', () => {
  const ev = new Evolution();
  let r = 7; const rng = () => (r = (r * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const evaluate = g => 1 - Math.abs(g.learningRate - 0.5); // optimum at 0.5
  let prev = -1;
  for (let i = 0; i < 15; i++) { const e = ev.step(evaluate, rng); assert.ok(e.best >= prev - 0.005); prev = e.best; }
  assert.ok(Math.abs(ev.genome.learningRate - 0.5) < Math.abs(DEFAULT_GENOME.learningRate - 0.5));
  assert.ok(ev.genome.wmCapacity >= 3 && ev.genome.wmCapacity <= 15);
});

test('brain.evolve runs the self-test on real memory', async () => {
  const b = new Brain({ dataDir: tmp() });
  b.studyCurriculum(path.join(__dirname, '..', 'curriculum'));
  const e = b.evolve(2);
  assert.strictEqual(e.generation, 2);
  assert.ok(e.best > 0 && e.best <= 1);
});
