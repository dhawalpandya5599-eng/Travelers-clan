#!/usr/bin/env node
'use strict';
/**
 * stress.js — synthetic customers attack the WhatsApp agent so it finds its own gaps.
 * Personas with different languages, moods and paths (FAQ-heavy, bargainer, ghost, group-size changer,
 * script-switcher) talk to a fresh agent. Every reply is judged on hard rules; the weak ones are grouped,
 * printed, and taught to the mind as critic lessons.   node scripts/stress.js [--n 200] [--verbose]
 */
const path = require('path'); const os = require('os'); const fs = require('fs');
const { Brain } = require('../core/brain');
const args = process.argv.slice(2); const N = +(args[args.indexOf('--n') + 1]) || 200; const verbose = args.includes('--verbose');
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const pick = (a) => a[Math.floor(rnd() * a.length)];

const TRIPS = [{ name: 'Goa', date: '2099-12-12', days: 4, price: 14500, seats: 16, booked: 9 }, { name: 'Manali', date: '2099-12-20', days: 5, price: 12500, seats: 20, booked: 18 }];
const OPENERS = {
  english: ['hi, {n} of us want {trip} in december, budget {b}k each', 'Hello! Looking for {trip} trip for {n} people', 'is {trip} available in dec? {n} friends', 'price for {trip}?', '{trip} for {n}'],
  hinglish: ['bhai {trip} ka kitna hoga {n} log ke liye', '{trip} december mein hai kya? hum {n} log', '{trip} trip batao {n} logon ke liye budget {b}k'],
  hindi: ['{trip} {n} लोगों के लिए कितना?', 'क्या {trip} दिसंबर में है? हम {n} लोग'],
  gujarati: ['{trip} {n} લોકો કિંમત કેટલી?', '{trip} ડિસેમ્બર માં છે? {n} જણ'],
};
const FAQ = [['any hidden costs?', /no hidden|hidden cost nahi|included|not included/i], ['what is included?', /included/i], ['what if we cancel', /transfer|refund/i], ['pickup point?', /pickup|start|point/i], ['safe for girls?', /women|captain|ladkiyon/i], ['veg food?', /veg|jain/i], ['hotel kaisa hai', /sharing|room|stay/i], ['kids allowed?', /family|parents|welcome|20/i], ['how to pay', /advance|upi|screenshot/i], ['send details', /D1|plan/i], ['રદ કરીએ તો?', /transfer|refund/i], ['खाना शाकाहारी?', /veg|jain/i]];
const PATHS = ['faq-heavy', 'bargainer', 'ghost', 'size-changer', 'script-switcher', 'direct-booker', 'angry', 'thinker'];

function conversation(lang, pathName, trip) {
  const n = pick([1, 2, 2, 3, 4, 6, 12]); const b = Math.round(trip.price / 1000) + pick([-3, -1, 0, 1, 3]);
  const fill = (s) => s.replace('{trip}', lang === 'hindi' ? (trip.name === 'Goa' ? 'गोवा' : 'मनाली') : lang === 'gujarati' ? (trip.name === 'Goa' ? 'ગોવા' : 'મનાલી') : trip.name.toLowerCase()).replace('{n}', n).replace('{b}', b);
  const turns = [[fill(pick(OPENERS[lang])), null]];
  const faqs = () => { const k = 1 + Math.floor(rnd() * 3); for (let i = 0; i < k; i++) turns.push(pick(FAQ)); };
  switch (pathName) {
    case 'faq-heavy': faqs(); faqs(); turns.push(['ok hold ' + n + ' seats', /advance|upi/i]); break;
    case 'bargainer': turns.push(['too expensive yaar, discount?', /all-inclusive|separately|organiser|balance/i]); turns.push(['best price batao', /fixed|inclusive|separately|organiser|balance/i]); turns.push(['ok', /hold/i]); break;
    case 'ghost': faqs(); break;
    case 'size-changer': turns.push([`actually we are ${n + 2} now`, new RegExp(((n + 2) * trip.price).toLocaleString('en-IN'))]); turns.push(['hold karo', /advance/i]); break;
    case 'script-switcher': turns.push(['किंमत में क्या शामिल है?', /included|include/i]); turns.push(['ok book', /advance/i]); break;
    case 'direct-booker': turns.push(['book', /advance|upi/i]); turns.push(['paid, screenshot sent', /confirm|team/i]); break;
    case 'angry': turns.push(['this is fraud i want refund', /founder|24/i]); break;
    case 'thinker': turns.push(['will think and tell', /time|hold|seats/i]); turns.push(['ok', /./]); break;
  }
  return { n, turns };
}

async function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-stress-'));
  const b = new Brain({ dataDir: dir, autosave: false }); b.evolution.genome.curiosity = 0; b.studyCurriculum(path.join(__dirname, '..', 'curriculum'));
  const g = b.growth; g.setProfile({ city: 'Ahmedabad', phone: '9876543210', upi: 'tc@upi', trips: JSON.parse(JSON.stringify(TRIPS)) });
  const weak = {}; let turnsTotal = 0, convs = 0, reachedHold = 0, holdable = 0;
  const flag = (k, ex) => { (weak[k] = weak[k] || []).push(ex); };
  for (let i = 0; i < N; i++) {
    const lang = pick(['english', 'english', 'hinglish', 'hinglish', 'hindi', 'gujarati']); const pathName = pick(PATHS); const trip = pick(TRIPS);
    const c = conversation(lang, pathName, trip); const id = `s${i}`; for (const t of g.profile.trips) t.holds = []; /* each persona is an independent customer */ const seen = new Set(); let gotHold = false; convs++;
    for (const [msg, expect] of c.turns) {
      const r = await g.chat({ id, text: msg, source: 'stress' }); turnsTotal++;
      const reply = r.reply || '';
      if (!reply.trim()) flag('empty reply', `${msg}`);
      if (/undefined|NaN|\[object|null/.test(reply)) flag('garbage token in reply', `${msg} → ${reply.slice(0, 80)}`);
      if (reply.split(/\s+/).length > 95) flag('reply over 95 words', `${msg} → ${reply.split(/\s+/).length} words`);
      if (seen.has(reply)) flag('verbatim repeat', `${msg} → ${reply.slice(0, 80)}`); seen.add(reply);
      if (expect && !expect.test(reply)) flag('did not answer: ' + msg.replace(/\d+/g, 'N'), `${reply.slice(0, 110)}`);
      if ((lang === 'hindi' || lang === 'gujarati' || lang === 'hinglish') && !/\b(hai|ke|ka|karun|likho|nahi|logon|bhejo|aapki|hota|sab|liye|se)\b/i.test(reply) && !/^Great!|^Hi!|D1/.test(reply)) flag('english reply to a hinglish/script customer', `${msg} → ${reply.slice(0, 80)}`);
      if (r.handoff && !/team|founder|confirm|call/i.test(reply)) flag('handoff without telling the customer', `${msg} → ${reply.slice(0, 80)}`);
      if (r.intent === 'book') gotHold = true;
    }
    if (/booker|faq-heavy|size-changer|switcher/.test(pathName)) { holdable++; if (gotHold) reachedHold++; }
  }
  const total = Object.values(weak).reduce((s, a) => s + a.length, 0);
  console.log(`\nATLAS WhatsApp stress test: ${convs} conversations, ${turnsTotal} turns, ${total} weak replies (${(100 * total / turnsTotal).toFixed(1)}%), holds reached ${reachedHold}/${holdable}`);
  const lessons = [];
  for (const [k, ex] of Object.entries(weak).sort((a, b) => b[1].length - a[1].length)) { console.log(`  ${String(ex.length).padStart(4)}  ${k}`); if (verbose) for (const e of ex.slice(0, 3)) console.log('        ' + e); lessons.push(`The WhatsApp agent has a weakness: ${k} (${ex.length} cases in the stress test).`); }
  if (lessons.length) b.teach(lessons.join('\n'), { source: 'council:critic', importance: 0.7 });
  fs.writeFileSync(path.join(__dirname, '..', 'synth', 'stress-report.json'), JSON.stringify({ at: new Date().toISOString(), convs, turns: turnsTotal, weak: Object.fromEntries(Object.entries(weak).map(([k, v]) => [k, v.slice(0, 20)])), reachedHold, holdable }, null, 1));
  return total / turnsTotal;
}
if (require.main === module) run();
module.exports = { run };
