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
  // --- customers: cohorts, personalities, requirements ---
  { q: 'which cohort is this lead: Hi, 4 of us from office want a long weekend trip to Goa, budget 15k each', expect: /metro young professionals/i, kind: 'cohort' },
  { q: 'which cohort is this lead: We are 12 college students looking for the cheapest Manali trip', expect: /college groups/i, kind: 'cohort' },
  { q: 'who is this customer: Planning our honeymoon in Bali in December, private villa please', expect: /honeymoon/i, kind: 'cohort' },
  { q: 'which cohort: I am a solo female traveler, is Spiti safe for girls?', expect: /solo women/i, kind: 'cohort' },
  { q: 'classify this lead: Need a quote for a team offsite for 40 employees with GST invoice', expect: /corporate/i, kind: 'cohort' },
  { q: 'which cohort is this lead: We live in Dubai, planning Kashmir during Eid, 5 people, halal food', expect: /gulf/i, kind: 'cohort' },
  { q: 'reply to this lead from Riya: 4 of us from office want a long weekend trip to Goa', expect: /^\[.*\] Hi Riya!.*(dates|budget)/i, kind: 'reply' },
  { q: 'draft reply: My parents aged 65 want Kerala in January, relaxed pace', expect: /doctor on call|easy pace/i, kind: 'reply' },
  { q: 'What do Indian families with kids need?', expect: /safe comfortable stay|veg/i, kind: 'cohort-fact' },
  { q: 'What tone should solo women travelers be spoken to in?', expect: /respectful and transparent/i, kind: 'cohort-fact' },
  { q: 'What do European backpackers worry about?', expect: /touristy/i, kind: 'cohort-fact' },
  { q: 'Which channel do senior citizens prefer?', expect: /phone call/i, kind: 'cohort-fact' },
  { q: 'What is the budget of luxury couples?', expect: /150000 to 600000/, kind: 'cohort-fact' },
  { q: 'Are adventure junkies high in openness?', expect: /yes/i, kind: 'cohort-fact' },
  // --- world cohorts and conversion learning ---
  { q: 'which cohort is this lead: Hi from Tokyo, my wife and I want a 7 day Kerala trip in April, premium hotels', expect: /East Asia/i, kind: 'world' },
  { q: 'who is this customer: Bachelor trip, 6 friends from Nairobi, Goa in December, dollars ok?', expect: /friend groups from Africa/i, kind: 'world' },
  { q: 'When do customers from the Gulf usually travel?', expect: /june|july|august/i, kind: 'world' },
  { q: 'What do customers from North America pay in?', expect: /usd/i, kind: 'world' },
  { conversions: true, q: 'predict: a honeymoon couple, we replied in 5 minutes with reviews and a private villa offer, price within budget', expect: /Booking chance ([5-9]\d|100)%/, kind: 'conversion' },
  { conversions: true, q: 'predict: college group asked price, we replied next day, ignored the budget objection, no follow up', expect: /Booking chance ([0-9]|[1-3]\d)%/, kind: 'conversion' },
  { conversions: true, q: 'What raises the booking rate?', expect: /first reply within ten minutes|social proof|right tone/i, kind: 'conversion' },
  { conversions: true, q: 'Does ignoring the objection lower the booking rate?', expect: /yes/i, kind: 'conversion' },
  // --- end-to-end funnel learned from journeys ---
  { journeys: true, q: 'next step: hi we are 4 friends planning goa in december, budget 15k each. what packages do you have', expect: /Stage: qualified.*Do: (send social proof then price|send itinerary pdf|call)/i, kind: 'funnel' },
  { journeys: true, q: 'next step: hi, saw your ad. do you do spiti trips?', expect: /Stage: enquiry.*Do: reply fast/i, kind: 'funnel' },
  { journeys: true, q: 'next step:\nlead: family of 4, kerala in may, budget 30k pp\nclan: 32,000 per person all inclusive\nlead: hmm is it safe for kids? and what about veg food', expect: /Stage: objection.*Do: (answer with proof|call)/i, kind: 'funnel' },
  { journeys: true, q: 'next step:\nclan: 24,000 per person\nlead: any discount possible? we are many', expect: /Stage: negotiation.*Do: (hold price add value|split payment|small discount)/i, kind: 'funnel' },
  { journeys: true, q: 'next step:\nlead: ok lets do it. how do we pay', expect: /Stage: advance.*Do: send payment link now/i, kind: 'funnel' },
  { journeys: true, q: 'why do we lose leads?', expect: /lost mostly because/i, kind: 'funnel' },
  { journeys: true, q: 'What is the best action when they object?', expect: /answer with proof|call/i, kind: 'funnel' },
  // --- council of agents ---
  { q: 'council: lead: family of 4, Kerala in May, 6 days, budget 30k per person, kids aged 6 and 10\nclan: 32000 per person\nlead: is it safe for kids? veg food?', expect: /Verdict: WARN[\s\S]*(unanswered|Draft reply does not answer)/i, kind: 'council' },
  { q: 'plan: 2 of us, Ladakh in January, 4 days, budget 20k per person', expect: /off season[\s\S]*too short|minimum/i, kind: 'council' },
  { q: 'ops: 6 friends, Spiti in August, 9 days, budget 35k per person', expect: /in season[\s\S]*Itinerary: D1/i, kind: 'council' },
  { q: 'news: Curfew imposed in Srinagar after unrest, tourists advised to avoid Kashmir', expect: /Logged 1 advisory.*Kashmir \[high/i, kind: 'council' },
  { journeys: true, q: 'What is the most common reason a lead is lost?', expect: /no reply|ghosted|slow|price|objection|decide|quiet/i, kind: 'funnel' },
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
    if (c.journeys) { const f = path.join(__dirname, '..', 'synth', 'journeys.json'); if (fs.existsSync(f)) b.learnJourneys(JSON.parse(fs.readFileSync(f, 'utf8')).journeys, { source: 'synthetic' }); }
    if (c.conversions) { const f = path.join(__dirname, '..', 'synth', 'conversations.json'); if (fs.existsSync(f)) b.learnConversions(JSON.parse(fs.readFileSync(f, 'utf8')).conversations, { source: 'synthetic' }); }
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
