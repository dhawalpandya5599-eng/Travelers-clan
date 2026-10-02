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

test('importer: WhatsApp export becomes episodes and facts', () => {
  const { importWhatsApp } = require('../core/importers');
  const b = new Brain({ dataDir: tmp() });
  const chat = '12/03/24, 10:15 pm - Riya: Hi, is the Ladakh trip in June?\n12/03/24, 10:16 pm - Dhawal: The Ladakh trip starts on 10 June. The advance is 5000.\n12/03/24, 10:17 pm - Riya: <Media omitted>\n';
  const r = importWhatsApp(b, chat, { staff: ['Dhawal'] });
  assert.strictEqual(r.messages, 2);
  assert.ok(r.facts >= 1);
  assert.strictEqual(r.questions, 1);
  assert.ok(b.memory.factsAbout('advance').length >= 1);
});

test('skills: lead gate scores hot and cold leads', () => {
  const s = new Skills();
  assert.match(s.tryAll('score this lead: 4 friends, ladakh in june, budget 25k each, want to book').output, /HOT/);
  assert.match(s.tryAll('score lead: price?').output, /COLD|JUNK/);
});

test('sleep detects contradictions and dreams stale facts', async () => {
  const b = new Brain({ dataDir: tmp() });
  b.memory.learnFact('ladakh trip', 'costs', '24000', { confidence: 0.7 });
  b.memory.learnFact('ladakh trip', 'costs', '26000', { confidence: 0.7 });
  const r = await b.sleep();
  assert.strictEqual(r.contradictions.length, 1);
  assert.deepStrictEqual(r.contradictions[0].options.sort(), ['24000', '26000']);
  assert.ok(r.dreamed >= 2);
});

test('merge: two minds combine without losing either', async () => {
  const { mergeMinds, summary } = require('../core/merge');
  const a = new Brain({ dataDir: tmp() }); a.evolution.genome.curiosity = 0;
  const b = new Brain({ dataDir: tmp() }); b.evolution.genome.curiosity = 0;
  await a.respond('Manali is in Himachal Pradesh'); await a.respond('Goa is a beach state');
  await b.respond('Manali is in Himachal Pradesh'); await b.respond('Spiti is a cold desert');
  a.evolve(1); b.evolve(2);
  a.saveNow(); b.saveNow();
  const merged = mergeMinds(JSON.parse(fs.readFileSync(a.file, 'utf8')), JSON.parse(fs.readFileSync(b.file, 'utf8')));
  const s = summary(merged);
  assert.strictEqual(merged.memory.facts.filter(f => f.s === 'manali').length, 1);
  assert.ok(merged.memory.facts.some(f => f.s === 'goa') && merged.memory.facts.some(f => f.s === 'spiti'));
  assert.strictEqual(s.generation, 2);
  assert.strictEqual(merged.evolution.history.length, 3);
  const dir = tmp(); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(merged));
  const c = new Brain({ dataDir: dir }); c.evolution.genome.curiosity = 0;
  assert.match((await c.respond('Where is Spiti?')).text, /cold desert/i);
  assert.match((await c.respond('What is Goa?')).text, /beach state/i);
});

test('council: critic blocks an off-season, over-budget senior plan and proposes fixes', async () => {
  const b = new Brain({ dataDir: tmp() }); b.evolution.genome.curiosity = 0;
  const r = await b.council.handle({ conversation: 'lead: planning ladakh for my parents aged 65 in january, 5 days, budget 25k per person\nclan: 28000 per person\nlead: hmm is it safe for them?' });
  assert.strictEqual(r.verdict, 'block');
  assert.ok(r.agents.operations.findings.some(f => /off season/i.test(f)));
  assert.ok(r.agents.operations.findings.some(f => /too short|minimum/i.test(f)));
  assert.ok(r.agents.cx.findings.some(f => /unanswered|anxious|negative/i.test(f)));
  assert.ok(r.agents.critic.findings.length >= 2);
  assert.ok(r.fixes.length >= 3);
  assert.ok(r.taught >= 1, 'agents teach the mind');
});

test('council: a good plan passes and the news desk learns headlines', async () => {
  const b = new Brain({ dataDir: tmp() }); b.evolution.genome.curiosity = 0;
  const r = await b.council.review({ message: '4 friends, Goa in December, 4 days, budget 15k per person, want nightlife' });
  assert.notStrictEqual(r.verdict, 'block');
  assert.strictEqual(r.agents.operations.output.season, 'in season');
  assert.strictEqual(r.agents.operations.output.itinerary.length, 4);
  const added = b.risk.ingest('Cyclone warning for Goa coast, beaches closed this week');
  assert.strictEqual(added.length, 1);
  const r2 = await b.council.review({ message: '4 friends, Goa in December, 4 days, budget 15k per person' });
  assert.strictEqual(r2.agents.news.verdict, 'block');
});

test('dialogue tester: conversations score well and replies answer objections', async () => {
  const b = new Brain({ dataDir: tmp() }); b.evolution.genome.curiosity = 0;
  b.studyCurriculum(path.join(__dirname, '..', 'curriculum'));
  const r = await b.council.ask('dialogue', { count: 6, seed: 3 });
  const d = r.agents.dialogue;
  assert.ok(d.output.average >= 80, 'average ' + d.output.average + '\n' + d.findings.join('\n'));
  const t = d.output.transcripts[0];
  assert.notStrictEqual(t.log[1].text, t.log[3].text, 'replies must not repeat');
});

test('open-source model backend: understanding, polishing, critique and learning via an OpenAI-compatible server', async () => {
  const http = require('http');
  const srv = http.createServer((req, res) => { let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const j = JSON.parse(body); const sys = j.messages[0].content; let content;
    if (/extract travel requirements/i.test(sys)) content = '{"destination":"Spiti","month":"August","days":8,"group":5,"budgetPerPerson":28000,"needs":["adventure"],"language":"hinglish","mood":"excited"}';
    else if (/strict quality critic/i.test(sys)) content = '{"problems":["No acclimatisation mentioned"],"fixes":["Add acclimatisation line"]}';
    else if (/turn a message into simple facts/i.test(sys)) content = '{"facts":["Spiti trip costs 28000 per person."]}';
    else if (/salesperson/i.test(sys)) content = 'Arre bhai, August mein Spiti best hai! Plan bhej raha hoon.';
    else content = 'ok';
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  }); });
  await new Promise(r => srv.listen(0, r));
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${srv.address().port}/v1`; process.env.OPENAI_MODEL = 'mock-open-model';
  delete require.cache[require.resolve('../core/mentor')]; delete require.cache[require.resolve('../core/brain')];
  const { Brain: B2 } = require('../core/brain');
  try {
    const b = new B2({ dataDir: tmp() }); b.evolution.genome.curiosity = 0;
    assert.strictEqual(b.mentor.status().backend, 'openai-compatible');
    const r = await b.council.handle({ conversation: 'lead: bhai 5 log hain, spiti jaana hai august mein 8 din, 28k budget per head, trek bhi' });
    assert.strictEqual(r.agents.operations.output.requirements.destination, 'Spiti');
    assert.match(r.agents.sales.output.draft, /Arre bhai/);
    assert.ok(r.agents.critic.findings.some(f => /\(model\)/.test(f)));
    const s = await b.respond('Honestly the Spiti departure we are running is priced at twenty eight thousand a head.');
    assert.strictEqual(s.via, 'model');
    assert.ok(b.memory.factsAbout('spiti trip').some(f => f.p === 'costs'));
  } finally { delete process.env.OPENAI_BASE_URL; delete process.env.OPENAI_MODEL; srv.close(); delete require.cache[require.resolve('../core/mentor')]; delete require.cache[require.resolve('../core/brain')]; }
});

test('growth engine: grounded WhatsApp replies, handoff, follow-ups, campaigns, ROI', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-growth-'));
  const b = new Brain({ dataDir: dir, autosave: false });
  const g = b.growth;
  g.setProfile({ city: 'Ahmedabad', phone: '9876543210', trips: [{ name: 'Goa', date: '2099-12-12', days: 4, price: 14500, seats: 16, booked: 9 }] });
  assert.ok(g.gbpAudit().score >= 50);
  assert.ok(g.keywords().some(k => /ahmedabad/i.test(k)));
  const r1 = await g.chat({ id: '919999900001', text: 'hi, 4 of us want goa in december, budget 15k each' });
  assert.match(r1.reply, /14,500/); assert.match(r1.reply, /58,000/); assert.equal(r1.handoff, false);
  const r2 = await g.chat({ id: '919999900001', text: 'ok how do I pay the advance?' });
  assert.equal(r2.handoff, true); assert.equal(r2.send, false); assert.equal(r2.stage, 'hold');
  assert.equal(g.seatsLeft(g.profile.trips[0]), 3); // 16 - 9 - 4 held
  g.updateLead('919999900001', { stage: 'advance', value: 58000 }); assert.equal(g.profile.trips[0].booked, 13); assert.equal(g.seatsLeft(g.profile.trips[0]), 3);
  const { latinise, snapToHours } = require('../core/growth'); assert.match(latinise('ગોવા ૪ લોકો કિંમત'), /goa 4 log price/); const snapped = new Date(snapToHours(Date.UTC(2026, 0, 1, 21, 0)) + 5.5 * 3600e3); assert.equal(snapped.getUTCHours(), 10);
  const r3 = await g.chat({ id: '919999900002', text: 'bhai goa ka kitna hoga 2 log ke liye' });
  assert.equal(r3.language, 'hinglish'); assert.match(r3.reply, /29,000/);
  g.state.leads[0].next = Date.now() - 1;
  const t = await g.today(); assert.equal(t.due.length, 1); assert.ok(t.due[0].message.length > 20);
  assert.ok(g.campaigns().length >= 3);
  const bc = await g.broadcasts(); assert.ok(bc.drafts.every(d => /\{name\}/.test(d.text)));
  const roi = g.roi({ adSpend: 5000 }); assert.equal(roi.booked, 1); assert.equal(roi.roas, 11.6);
  const rr = await g.reviewReply('worst trip ever, bus broke down', 1, 'Amit'); assert.equal(rr.escalate, true); assert.match(rr.reply, /9876543210/);
  assert.match((await b.respond('what is the phone number of travelers clan')).text, /9876543210/);
});

test('agent: tool loop with a scripted model, fallback without one, correction becomes a lesson', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-agent-'));
  const b = new Brain({ dataDir: dir, autosave: false });
  b.growth.setProfile({ city: 'Ahmedabad', phone: '9876543210', trips: [{ name: 'Goa', date: '2099-12-12', days: 4, price: 14500, seats: 16, booked: 9 }] });
  const r0 = await b.agent.run('how many seats left on goa'); assert.match(r0.final, /7 seats left/); assert.equal(r0.model, 'rules only');
  const script = [{ thought: 'need trips', tool: 'trips', args: {} }, { thought: 'compute', tool: 'calc', args: { expression: '7*14500' } }, { thought: 'done', final: 'Goa has 7 seats left, worth 1,01,500 if all sell.', facts: ['The Goa batch has 7 seats left.'], todo: ['Post the seat count today.'] }];
  b.mentor = { enabled: true, status: () => ({ model: 'scripted' }), json: async () => script.shift(), ask: async () => null };
  b._agent = null; const r = await b.agent.run('how many seats left on goa and what are they worth?');
  assert.equal(r.steps.length, 2); assert.equal(r.steps[1].result.result, 101500); assert.match(r.final, /7 seats/); assert.equal(r.facts.length, 1);
  assert.ok(b.memory.facts.some(f => /goa batch/i.test(f.s || '') && /7/.test(String(f.o || ''))) || b.memory.episodes.some(e => /7 seats left/.test(e.text)));
  const c = b.agent.correct(r.id, 'Goa has 7 seats left but 2 are on hold, so 5 are sellable.'); assert.ok(c.correction);
  assert.ok(b.memory.facts.some(f => /sellable|on hold/i.test(f.text || f.o || '')));
});
