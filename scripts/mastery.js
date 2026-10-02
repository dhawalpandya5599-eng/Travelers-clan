#!/usr/bin/env node
'use strict';
/**
 * mastery.js — the exam-and-teach loop.
 *   1. An examiner sets a battery: questions (policy, prices, recall), situations (customer messages built from the
 *      customer universe), requirements (trip plans to check), expressions (fear, anger, grief, sarcasm, slang, joy).
 *   2. OYE answers every item (WhatsApp agent, reasoning agent, council).
 *   3. An evaluator grades each answer 1-10 on accuracy, specificity, next step, tone fit and growth impact, writes the
 *      best answer and why, and names what to prefer next time. With a model present the evaluator is the model; without
 *      one, the battery and answers are written to MASTERY-REVIEW.md for the master teacher to grade by hand.
 *   4. Every graded weakness is taught to the mind as a preference lesson; the round repeats (up to --rounds) and the
 *      loop PASSES only when every category averages >= 8.5 and no item scores below 6. Nothing passes on hope.
 *
 *   node scripts/mastery.js [--rounds 3] [--n 40] [--seed 7]      ATLAS_DATA=mind to teach the shipped mind
 */
const path = require('path'); const os = require('os'); const fs = require('fs');
const { Brain } = require('../core/brain'); const U = require('../core/universe');
const args = process.argv.slice(2); const arg = (k, d) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : d; };
const ROUNDS = +arg('--rounds', 3), N = +arg('--n', 40), SEED = +arg('--seed', 7);
const ROOT = path.join(__dirname, '..');
let seed = SEED; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const pick = (a) => a[Math.floor(rnd() * a.length)];

const EXPRESSIONS = [
  ['fear', 'my mother is 71 and has never travelled without my father who passed last year. is this trip really ok for her? i am scared'],
  ['anger', 'THIRD time asking. nobody replies. is this how you treat customers??'],
  ['grief', 'we had booked for my brother too but he passed away last week. what do we do about his seat'],
  ['sarcasm', 'wow 14500 for goa, is the hotel made of gold or what'],
  ['slang', 'yo bro goa trip lit or nah? squad of 5, dec, budget tight af'],
  ['joy', 'WE GOT OUR LEAVES APPROVED!!! 4 of us, goa, 12 dec, what next???'],
  ['confusion', 'i dont understand, is 14500 for everyone or per person, and what is advance, i am new to this'],
  ['distrust', 'how do i know you wont run away with my advance, lot of fraud these days'],
  ['guilt', 'honestly i cant afford it but my friends are all going, any way to make it work'],
  ['urgency', 'leaving tomorrow morning can you still add me, will pay full now'],
  ['hinglish-fear', 'papa ko BP hai, ladakh unke liye theek rahega? dar lag raha hai'],
  ['gujarati-joy', 'અમારી રજા મંજૂર થઈ ગઈ! 4 લોકો, ગોવા, 12 ડિસેમ્બર, હવે શું?'],
];
const REQUIREMENTS = ['2 of us, Ladakh in January, 4 days, budget 20k per person', 'family of 5 with kids 4 and 7, Spiti in August, 8 days', '20 college students, Goa in December, budget 9k each, 3 days', 'corporate offsite 40 people, Lonavala, 2 days, budget 6k per person, team building', 'honeymoon, Bali in July, 6 days, 80k per person, private villa', 'retired couple, Rann of Kutch in May, 3 days', 'solo woman, Kasol in March, 5 days, budget 15k', '6 friends, Manali in December, 5 days, want snow and paragliding'];
const QUESTIONS = ['what is the cancellation policy?', 'how much advance for 4 people on goa?', 'what is included in the price?', 'which trips are leaving in december?', 'is the goa trip in season in december?', 'what documents do we need for bali?', 'how many seats are left on goa and what is that worth?', 'what should I post on instagram this week?', 'which lead should I message first today and why?', 'what is our refund rule if someone cancels 5 days before?'];

function battery(trips) {
  const items = [];
  for (const q of QUESTIONS) items.push({ cat: 'question', text: q, via: 'agent' });
  U.setSeed(SEED); const personas = U.generate(N).filter(p => p.scenario !== 'marketing').slice(0, Math.max(8, N - 20));
  for (const p of personas) { const sc = U.script(p, trips[0]); items.push({ cat: 'situation', text: sc.opener[0] + (sc.questions[0] ? '\n' + sc.questions[0] : ''), via: 'whatsapp', persona: `${p.lifeStage} · ${p.geo} · ${p.decision} · ${p.risk} · ${p.trust} · ${p.price} · ${p.language} · ${p.scenario}` }); }
  for (const r of REQUIREMENTS) items.push({ cat: 'requirement', text: r, via: 'review' });
  for (const [k, e] of EXPRESSIONS) items.push({ cat: 'expression', text: e, via: 'whatsapp', expression: k });
  return items;
}
async function answer(b, item, i) {
  if (item.via === 'whatsapp') { let r; const id = 'mastery-' + i + '-' + Date.now().toString(36); for (const line of item.text.split('\n')) r = await b.growth.chat({ id, text: line, source: 'mastery' }); return r.reply; }
  if (item.via === 'review') { const r = await b.council.review({ message: item.text }); return r.summary; }
  const r = await b.agent.run(item.text); return r.final;
}
const RUBRIC = 'Grade the answer for a small Indian group-travel company (Travelers Clan) whose goal is bookings and repeat customers. Score 1-10 on: accuracy (no invented facts; uses real trip/policy data), specificity (numbers, dates, names, one concrete next step), tone fit (matches the customer\'s language, emotion and register; Hinglish to Hinglish), empathy where the message carries emotion, and growth impact (moves toward a hold/booking or protects the relationship). Then write the single best answer in the customer\'s language, under 80 words, and one line on what to prefer next time.';
async function grade(b, item, ans) {
  const llm = b.mentor && b.mentor.enabled ? b.mentor : null; if (!llm) return null;
  const out = await llm.json(RUBRIC, `Category: ${item.cat}${item.persona ? ' · persona: ' + item.persona : ''}${item.expression ? ' · expression: ' + item.expression : ''}\nCustomer/chief: ${item.text}\nATLAS answered: ${ans}\n\nReturn {"score": 1-10, "accuracy": 1-10, "specificity": 1-10, "tone": 1-10, "empathy": 1-10, "growth": 1-10, "problems": ["..."], "best": "...", "prefer": "..."}`, { maxTokens: 500 });
  return out && typeof out.score === 'number' ? out : null;
}
(async () => {
  const dir = (process.env.OYE_DATA || process.env.ATLAS_DATA) || fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-mastery-'));
  const b = new Brain({ dataDir: dir, autosave: false }); b.evolution.genome.curiosity = 0; b.studyCurriculum(path.join(ROOT, 'curriculum'));
  const g = b.growth; if (!(g.profile.phone && g.upcoming(1).length)) g.setProfile({ city: 'Ahmedabad', phone: '9876543210', upi: 'tc@upi', trips: [{ name: 'Goa', date: '2099-12-12', days: 4, price: 14500, seats: 16, booked: 9 }, { name: 'Manali', date: '2099-12-20', days: 5, price: 12500, seats: 20, booked: 3 }] });
  const trips = g.upcoming(2); const hasModel = b.mentor && b.mentor.enabled;
  const report = { at: new Date().toISOString(), rounds: [], passed: false };
  for (let round = 1; round <= ROUNDS; round++) {
    const items = battery(trips); const graded = [];
    for (let i = 0; i < items.length; i++) { const it = items[i]; let ans; try { ans = await answer(b, it, i); } catch (e) { ans = 'ERROR: ' + e.message; } const gr = await grade(b, it, ans); graded.push({ ...it, answer: ans, grade: gr }); }
    const cats = {}; for (const x of graded) if (x.grade) { const c = cats[x.cat] = cats[x.cat] || []; c.push(x.grade.score); }
    const means = Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)]));
    const low = graded.filter(x => x.grade && x.grade.score < 8);
    const passed = hasModel && Object.values(means).every(m => m >= 8.5) && !graded.some(x => x.grade && x.grade.score < 6) && Object.keys(means).length === 4;
    report.rounds.push({ round, items: graded.length, means, low: low.length, passed });
    console.log(`Round ${round}: ${graded.length} items${hasModel ? ` · means ${JSON.stringify(means)} · below 8: ${low.length} · ${passed ? 'PASS' : 'not yet'}` : ' · no model: written for hand grading'}`);
    // Teach: every weak item's best answer becomes a preference lesson.
    const lessons = low.map(x => `When a customer says "${x.text.split('\n')[0].slice(0, 90)}", the best reply is: ${String(x.grade.best).slice(0, 220)}. Prefer: ${String(x.grade.prefer).slice(0, 120)}.`);
    if (lessons.length) b.teach(lessons.join('\n'), { source: 'mastery', importance: 0.9 });
    fs.writeFileSync(path.join(ROOT, 'synth', 'mastery.json'), JSON.stringify({ ...report, last: graded }, null, 1));
    if (!hasModel) {
      const md = ['# Mastery review (hand grading)', '', `Generated ${report.at}. No model was connected, so the master teacher grades these: for each item, score 1-10, write the best answer, and teach the preference (brain.teach or a curriculum lesson). Do not pass until every category averages 8.5 and nothing is below 6.`, ''];
      for (const x of graded) md.push(`## [${x.cat}${x.expression ? ' · ' + x.expression : ''}] ${x.text.replace(/\n/g, ' / ')}`, x.persona ? `_${x.persona}_` : '', '', '**OYE:** ' + String(x.answer).replace(/\n/g, ' '), '', '**Score:** _ /10  **Best answer:** _  **Prefer:** _', '');
      fs.writeFileSync(path.join(ROOT, 'MASTERY-REVIEW.md'), md.join('\n')); break;
    }
    if (passed) { report.passed = true; break; }
  }
  // clean synthetic leads out of the sheet
  g.state.leads = g.state.leads.filter(l => !String(l.id).startsWith('mastery-')); for (const k of Object.keys(g.state.threads)) if (k.startsWith('mastery-')) delete g.state.threads[k]; for (const t of g.profile.trips) t.holds = (t.holds || []).filter(h => !String(h.lead).startsWith('mastery-')); g.save();
  if ((process.env.OYE_DATA || process.env.ATLAS_DATA)) b.saveNow();
  console.log(report.passed ? 'MASTERY: PASSED' : hasModel ? 'MASTERY: NOT PASSED (keep teaching)' : 'MASTERY: awaiting hand grading in MASTERY-REVIEW.md');
  process.exitCode = report.passed || !hasModel ? 0 : 2;
})();
