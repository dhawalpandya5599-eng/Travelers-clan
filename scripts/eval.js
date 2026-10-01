#!/usr/bin/env node
'use strict';
/**
 * eval.js — measures ATLAS's intelligence on a fixed exam, so improvements are real, not felt.
 * Each case: a fresh mind studies the curriculum (+ optional extra lessons), then answers.
 *   node scripts/eval.js            # run the exam
 *   node scripts/eval.js --verbose  # show every failure
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { Brain } = require('../core/brain');

const CASES = [
  // --- recall (curriculum) ---
  { q: 'What is a hot lead?', expect: /travel date.*budget|date.*destination.*budget/i, kind: 'recall' },
  { q: 'When is Ladakh season?', expect: /june to september/i, kind: 'recall' },
  { q: 'When should the first follow-up go out?', expect: /24 hours/i, kind: 'recall' },
  { q: 'What is cost per booking?', expect: /ad spend divided by bookings|key metric/i, kind: 'recall' },
  { q: 'Which creative is best?', expect: /real video/i, kind: 'recall' },
  { q: 'What is a fixed departure?', expect: /fixed date/i, kind: 'recall' },
  { q: 'What does a package price include?', expect: /transport.*stay.*food/i, kind: 'recall' },
  { q: 'Who is the trip leader?', expect: /guides a group trip/i, kind: 'recall' },
  // --- taught in conversation ---
  { teach: ['The Ladakh trip costs 24000 per person.', 'The Ladakh trip starts on 10 June.', 'The Ladakh trip takes 7 days.'], q: 'How much is the Ladakh trip?', expect: /24000/, kind: 'taught' },
  { teach: ['The Ladakh trip costs 24000 per person.', 'The Ladakh trip starts on 10 June.'], q: 'When does the Ladakh trip start?', expect: /10 june/i, kind: 'taught' },
  { teach: ['Riya is a lead from Mumbai.', 'Riya wants Goa in December.'], q: 'What does Riya want?', expect: /goa/i, kind: 'taught' },
  { teach: ['Spiti Valley is in Himachal Pradesh.'], q: 'Where is Spiti Valley?', expect: /himachal/i, kind: 'taught' },
  { teach: ['Our office is in Ahmedabad.'], q: 'Where is our office?', expect: /ahmedabad/i, kind: 'taught' },
  { teach: ['Kasol is famous for cafes and the Parvati river.'], q: 'What is Kasol famous for?', expect: /cafes/i, kind: 'taught' },
  { teach: ['The Bali package includes flights, villa stay and a sunrise trek.'], q: 'What does the Bali package include?', expect: /flights.*villa|villa/i, kind: 'taught' },
  { teach: ['Travelers Clan offers Ladakh, Spiti and Bali trips.'], q: 'What does Travelers Clan offer?', expect: /ladakh|spiti|bali/i, kind: 'taught' },
  { teach: ['The Manali trip costs 9,500 rupees.'], q: 'How much does the Manali trip cost?', expect: /9,?500/, kind: 'taught' },
  { teach: ['Meghalaya trip is 6 days and 5 nights.'], q: 'How long is the Meghalaya trip?', expect: /6 days/i, kind: 'taught' },
  // --- compound sentences ---
  { teach: ['Goa is a beach state and Goa season is November to February.'], q: 'When is Goa season?', expect: /november to february/i, kind: 'compound' },
  { teach: ['Rohan is a trip leader, and Rohan likes trekking.'], q: 'What does Rohan like?', expect: /trekking/i, kind: 'compound' },
  // --- corrections ---
  { teach: ['The Ladakh trip costs 24000.', 'No, the Ladakh trip costs 26000.'], q: 'How much is the Ladakh trip?', expect: /26000/, notExpect: /24000/, kind: 'correction' },
  // --- inference ---
  { teach: ['Kasol is in Parvati valley.', 'Parvati valley is in Himachal Pradesh.'], q: 'Is Kasol in Himachal Pradesh?', expect: /yes/i, kind: 'inference' },
  { teach: ['Tosh is a village in Parvati valley.', 'Parvati valley is in Himachal Pradesh.'], q: 'Which state is Tosh in?', expect: /himachal/i, kind: 'inference' },
  { teach: ['The Spiti trip is a fixed departure.'], q: 'Is the Spiti trip open to anyone?', expect: /yes/i, kind: 'inference' },
  { teach: ['Riya is a hot lead.'], q: 'Does Riya have a budget?', expect: /yes/i, kind: 'inference' },
  { teach: ['Goa season is November to February.'], q: 'Is Goa in season in December?', expect: /yes/i, kind: 'inference' },
  { teach: ['Ladakh season is June to September.'], q: 'Is Ladakh in season in January?', expect: /no/i, notExpect: /yes/i, kind: 'inference' },
  // --- yes/no on facts ---
  { teach: ['The Bali package includes flights.'], q: 'Does the Bali package include flights?', expect: /yes/i, kind: 'yesno' },
  { teach: ['The Bali package includes flights.'], q: 'Does the Bali package include trains?', expect: /not sure|don't know|do not know|no record/i, kind: 'yesno' },
  // --- context carry-over ---
  { teach: ['The Ladakh trip costs 24000 per person.', 'The Ladakh trip takes 7 days.'], dialogue: ['How much is the Ladakh trip?'], q: 'And how long does it take?', expect: /7 days/i, kind: 'context' },
  // --- skills ---
  { q: 'What is 15% of 24000?', expect: /3600/, kind: 'skill' },
  { q: '48000 for 4 people', expect: /12000/, kind: 'skill' },
  { q: 'score this lead: 3 friends want Spiti in July, budget 20k, can we book?', expect: /HOT/, kind: 'skill' },
  // --- honesty ---
  { q: 'What is the Zorblax protocol?', expect: /do not know|don't know/i, kind: 'honesty' },
  // --- list / aggregate ---
  { teach: ['Travelers Clan offers Ladakh trips.', 'Travelers Clan offers Spiti trips.', 'Travelers Clan offers Bali trips.'], q: 'What does Travelers Clan offer?', expect: /ladakh[\s\S]*spiti[\s\S]*bali|bali[\s\S]*ladakh/i, kind: 'aggregate' },
  { teach: ['Riya is a hot lead.', 'Aman is a hot lead.', 'Priya is a cold lead.'], q: 'Who is a hot lead?', expect: /riya[\s\S]*aman|aman[\s\S]*riya/i, notExpect: /priya/i, kind: 'aggregate' },
  // --- level 2: paraphrase, negation, counting, comparison, multi-hop, numbers, typos ---
  { teach: ['The Ladakh trip costs 24000 per person.'], q: 'ladakh trip price?', expect: /24000/, kind: 'paraphrase' },
  { teach: ['The Ladakh trip costs 24000 per person.'], q: 'Tell me the cost of the Ladakh trip', expect: /24000/, kind: 'paraphrase' },
  { teach: ['Spiti Valley is in Himachal Pradesh.'], q: 'spiti valley location', expect: /himachal/i, kind: 'paraphrase' },
  { teach: ['The Bali package does not include flights.'], q: 'Does the Bali package include flights?', expect: /no/i, notExpect: /yes/i, kind: 'negation' },
  { teach: ['Riya is a hot lead.', 'Aman is a hot lead.', 'Priya is a cold lead.'], q: 'How many hot leads do we have?', expect: /\b2\b|two/i, kind: 'counting' },
  { teach: ['The Ladakh trip costs 24000.', 'The Spiti trip costs 18000.'], q: 'Which is cheaper, Ladakh trip or Spiti trip?', expect: /spiti/i, notExpect: /ladakh trip is cheaper/i, kind: 'comparison' },
  { teach: ['The Ladakh trip costs 24000.', 'The Spiti trip costs 18000.'], q: 'Which trip is more expensive?', expect: /ladakh/i, kind: 'comparison' },
  { teach: ['The Ladakh trip costs 24000.', 'The Spiti trip costs 18000.'], q: 'How much more does the Ladakh trip cost than the Spiti trip?', expect: /6000/, kind: 'comparison' },
  { teach: ['Tosh is in Parvati valley.', 'Parvati valley is in Kullu district.', 'Kullu district is in Himachal Pradesh.'], q: 'Is Tosh in Himachal Pradesh?', expect: /yes/i, kind: 'multihop' },
  { teach: ['Riya is a hot lead.'], q: 'Should we reply to Riya within ten minutes?', expect: /yes/i, kind: 'multihop' },
  { teach: ['The Ladakh trip costs 24000 per person.'], q: 'What is the total for 3 people on the Ladakh trip?', expect: /72000/, kind: 'numeric' },
  { teach: ['The Ladakh trip costs 24000 per person.', 'The advance is twenty percent.'], q: 'How much advance for the Ladakh trip?', expect: /4800/, kind: 'numeric' },
  { teach: ['The Ladakh trip costs 24000 per person.'], q: 'How much is the Ladkh trip?', expect: /24000/, kind: 'typo' },
  { teach: ['Riya wants Goa in December.'], q: 'What does riya want', expect: /goa/i, kind: 'typo' },
  { teach: ['The Ladakh trip costs 24000 per person.', 'The Ladakh trip takes 7 days.'], dialogue: ['How much is the Ladakh trip?'], q: 'and the duration?', expect: /7 days/i, kind: 'context' },
  { teach: ['Riya is a lead from Mumbai.', 'Riya wants Goa in December.'], dialogue: ['Who is Riya?'], q: 'Where is she from?', expect: /mumbai/i, kind: 'context' },
  { q: 'What do we know about ghosting and how do we handle it?', expect: /stops replying/i, kind: 'open' },
  { teach: ['The Ladakh trip costs 24000.', 'The Ladakh trip costs 24000.', 'The Ladakh trip costs 24000.'], q: 'How much is the Ladakh trip?', expect: /^Ladakh Trip costs 24000\.$/i, kind: 'dedupe' },
];

async function run() {
  const verbose = process.argv.includes('--verbose');
  const results = {};
  let pass = 0;
  for (const c of CASES) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-eval-'));
    const b = new Brain({ dataDir: dir, autosave: false });
    b.evolution.genome.curiosity = 0;
    b.studyCurriculum(path.join(__dirname, '..', 'curriculum'));
    for (const t of c.teach || []) await b.respond(t);
    for (const d of c.dialogue || []) await b.respond(d);
    const r = await b.respond(c.q);
    const ok = c.expect.test(r.text || '') && !(c.notExpect && c.notExpect.test(r.text || ''));
    results[c.kind] = results[c.kind] || { pass: 0, total: 0 };
    results[c.kind].total++;
    if (ok) { pass++; results[c.kind].pass++; } else if (verbose) console.log(`✗ [${c.kind}] ${c.q}\n   → ${(r.text || '').slice(0, 160)}  (via ${r.via})`);
  }
  console.log('\nATLAS exam');
  for (const [k, v] of Object.entries(results)) console.log(`  ${k.padEnd(11)} ${v.pass}/${v.total}`);
  console.log(`  ${'TOTAL'.padEnd(11)} ${pass}/${CASES.length}  (${Math.round(100 * pass / CASES.length)}%)`);
  return pass / CASES.length;
}
if (require.main === module) run();
module.exports = { run, CASES };
