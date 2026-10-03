#!/usr/bin/env node
'use strict';
/**
 * ladder.js — procedural exam ladder, levels 12 to 100. Every level has 12 generated conversations; difficulty rises
 * with the level: more turns, mixed languages and scripts, typos, mid-chat group changes, trip switches, objections,
 * desk questions (visa, route, local), hand-off requests. Each check is derived from ground truth (the trip data and
 * the rules), never from a hand-written answer. Pass mark 100% per level; the ladder stops at the first level that fails.
 *   node scripts/ladder.js [--from 12] [--to 100] [--level N] [--verbose] [--require N]   (exit 2 when maxPassed < require)
 */
const path = require('path'); const os = require('os'); const fs = require('fs');
const { Brain } = require('../core/brain');
const args = process.argv.slice(2); const arg = (k, d) => { const i = args.indexOf(k); return i > -1 ? +args[i + 1] : d; };
const FROM = arg('--level', 0) || arg('--from', 12), TO = arg('--level', 0) || arg('--to', 100), verbose = args.includes('--verbose'), REQUIRE = arg('--require', 0);
const money = (n) => '₹' + Math.round(+n || 0).toLocaleString('en-IN');
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const TRIPS = [{ name: 'Goa', date: '2099-12-12', days: 4, price: 14500, seats: 16, booked: 9, mon: 'december', gu: 'ગોવા', hi: 'गोवा', guMon: 'ડિસેમ્બર', hiMon: 'दिसंबर', intl: false }, { name: 'Manali', date: '2099-12-20', days: 5, price: 12500, seats: 20, booked: 3, mon: 'december', gu: 'મનાલી', hi: 'मनाली', guMon: 'ડિસેમ્બર', hiMon: 'दिसंबर', intl: false }, { name: 'Thailand', date: '2099-11-20', days: 6, price: 42000, seats: 20, booked: 5, mon: 'november', gu: 'થાઈલેન્ડ', hi: 'थाईलैंड', guMon: 'નવેમ્બર', hiMon: 'नवंबर', intl: true }];
const PROTECT = /^(goa|manali|thailand|december|november|hold|book|veg|jain|upi|visa|ok|haan|yes|kids|aged|make|it|actually|seats?|people|log|ppl|for|in|me|and|my|friend|bus|safe|pickup|cancel|included|discount|cold|weekend|person|talk|agency|gives|price)$/i;
function typo(r, text) { const words = text.split(' '); const idx = words.map((w, i) => [w, i]).filter(([w]) => w.length >= 6 && /^[a-z]+$/i.test(w) && !PROTECT.test(w)).map(([, i]) => i); if (!idx.length) return text; const i = pick(r, idx); const w = words[i]; const p = 1 + Math.floor(r() * (w.length - 3)); words[i] = w.slice(0, p) + w[p + 1] + w[p] + w.slice(p + 2); return words.join(' '); }
// Turn makers: each returns [text, check(reply, state) → true/false, label]. Language: en | hi | gu | dv (devanagari).
const OPEN = { en: (t, n) => pick(rng(n * 7 + t.price), [`${t.name} for ${n} in ${t.mon}`, `hi, we are ${n} people planning ${t.name} in ${t.mon}`, `${t.name} ${t.mon} ${n} ppl price?`, `looking at ${t.name}, ${n} of us, ${t.mon}, what is the price`]), hi: (t, n) => pick(rng(n * 3 + t.price), [`${t.name} ke liye ${n} log, ${t.mon} mein, kitna?`, `hum ${n} log ${t.name} jana chahte hain ${t.mon} mein`, `${t.name} ${t.mon} ${n} log price batao`]), gu: (t, n) => `${t.gu} ${n} જણ ${t.guMon}, ભાવ?`, dv: (t, n) => `${t.hi} ${n} लोग ${t.hiMon}, कीमत?` };
const FAQ = [
  { key: 'veg', min: 12, en: 'is veg food available?', hi: 'veg khana milega?', gu: 'શાકાહારી જમવાનું મળશે?', dv: 'खाना शाकाहारी मिलेगा?', check: /veg|jain/i },
  { key: 'safety', min: 12, en: 'is it safe for girls?', hi: 'ladkiyon ke liye safe hai?', gu: 'છોકરીઓ માટે સેફ છે?', dv: 'लड़कियों के लिए सेफ है?', check: /captain|women|ladkiyon|roomed/i },
  { key: 'included', min: 12, en: 'what is included?', hi: 'kya kya included hai?', gu: 'કિંમત માં શું સમાવેશ છે?', dv: 'किंमत में क्या शामिल है?', check: /included|include/i },
  { key: 'cancel', min: 14, en: 'what if we cancel?', hi: 'cancel karna pade to?', gu: 'રદ કરીએ તો?', dv: 'कैंसिल किया तो?', check: /transfer|refund/i },
  { key: 'pickup', min: 14, en: 'pickup point?', hi: 'kahan se nikloge?', gu: 'પિકઅપ ક્યાંથી?', dv: 'पिकअप कहाँ से?', check: /pickup|point|centre|start/i },
  { key: 'weather', min: 16, en: 'how cold will it be?', hi: 'kitni thand hogi?', gu: 'ઠંડી કેટલી હશે?', dv: 'ठंड कितनी होगी?', check: /cold|jacket|warm|pleasant|thand|garam|snow/i },
  { key: 'kids', min: 18, en: 'kids aged 4 and 7, price?', hi: 'bachche 4 aur 7 saal ke, kitna?', gu: 'બાળકો 4 અને 7 વર્ષના, કિંમત?', dv: 'बच्चे 4 और 7 साल के, रेट?', check: /free|%/ },
  { key: 'route', min: 22, en: 'how many hours by bus?', hi: 'bus se kitne ghante?', gu: 'બસ થી કેટલા કલાક?', dv: 'बस से कितने घंटे?', check: /\d+(\.\d)? h|hours|flight|ghante|km/i },
  { key: 'objection', min: 24, en: 'too expensive, any discount?', hi: 'bahut mehenga hai, discount?', gu: 'મોંઘું છે, ડિસ્કાઉન્ટ મળશે?', dv: 'महंगा है, डिस्काउंट?', check: /included|inclusive|captain|fixed|hidden|value|discount|price/i, not: /founder will personally/i },
  { key: 'visa', min: 26, intl: true, en: 'do we need a visa?', hi: 'visa lagega?', gu: 'વિઝા લાગશે?', dv: 'वीज़ा लगेगा?', check: /visa|arrival card|passport/i },
  { key: 'local', min: 30, intl: true, en: 'will upi work there?', hi: 'upi chalega wahan?', gu: 'upi ચાલશે?', dv: 'upi चलेगा?', check: /Money:|UPI/i },
  { key: 'competitor', min: 32, en: 'another agency gives it cheaper', hi: 'doosri agency sasta de rahi hai', gu: 'બીજી એજન્સી સસ્તું આપે છે', dv: 'दूसरी एजेंसी सस्ता दे रही है', check: /included|captain|hidden|inclusive|same|compare/i, not: /founder will personally/i },
  { key: 'weekend', min: 36, en: (t) => `is ${+t.date.slice(8)} ${t.mon.slice(0, 3)} a weekend?`, hi: (t) => `${+t.date.slice(8)} ${t.mon.slice(0, 3)} weekend hai?`, gu: (t) => `${+t.date.slice(8)} ${t.guMon} weekend છે?`, dv: (t) => `${+t.date.slice(8)} ${t.hiMon} weekend है?`, check: /Saturday|Sunday|weekend|weekday|Friday|Monday|Tuesday|Wednesday|Thursday/i },
  { key: 'human', min: 50, en: 'can i talk to a person?', hi: 'kisi insaan se baat ho sakti hai?', gu: 'કોઈ વ્યક્તિ સાથે વાત કરી શકું?', dv: 'किसी से बात करनी है', check: /team|call|number|WhatsApp|person/i },
  { key: 'medical', min: 44, en: 'my father has bp, is it ok?', hi: 'papa ko bp hai, theek rahega?', gu: 'પપ્પા ને bp છે, ઠીક રહેશે?', dv: 'पापा को bp है, ठीक रहेगा?', check: /doctor|captain|altitude|medicine|clearance|first-aid|first aid/i },
  { key: 'payment', min: 40, en: 'how do we pay?', hi: 'payment kaise karna hai?', gu: 'ચુકવણી કેવી રીતે?', dv: 'भुगतान कैसे करें?', check: /advance|upi/i },
];
const HOLD = { en: (n) => pick(rng(n), ['ok hold', 'book it', `hold ${n} seats`, 'yes please book']), hi: (n) => pick(rng(n + 1), ['hold karo', 'ok hold kar do', `${n} seats hold karo`]), gu: () => 'ઓકે હોલ્ડ કરો', dv: () => 'हाँ होल्ड करो' };
function scenario(level, i) {
  const r = rng(level * 1000 + i); const trips = level < 26 ? TRIPS.filter(t => !t.intl) : TRIPS; let t = pick(r, trips); let n = 1 + Math.floor(r() * Math.min(6, level < 20 ? 4 : 6));
  const langs = level < 20 ? ['en', 'hi'] : level < 30 ? ['en', 'hi', 'gu'] : ['en', 'hi', 'gu', 'dv']; const switcher = level >= 20; let lang = pick(r, langs);
  const turns = []; const nTurns = Math.min(8, 2 + Math.floor(level / 9)); const typoRate = level < 10 ? 0 : Math.min(0.35, level / 250);
  const L = () => (switcher ? pick(r, langs) : lang);
  { const t0 = t, n0 = n; turns.push({ text: OPEN[L()](t0, n0), check: (reply) => reply.includes(money(t0.price)) && (n0 === 1 || reply.includes(money(t0.price * n0))), label: `quote ${t0.name} x${n0}` }); }
  const pool = FAQ.filter(f => f.min <= level && (!f.intl || t.intl)); const used = new Set();
  let changed = false, switched = false;
  for (let k = 1; k < nTurns - 1; k++) {
    const roll = r();
    if (level >= 20 && !changed && roll < 0.18) { const n2 = Math.max(1, Math.min(6, n + (r() < 0.5 ? 1 : -1) || 1)); if (n2 !== n) { const l = L(); const tc = t; turns.push({ text: l === 'en' ? `actually make it ${n2}` : l === 'hi' ? `ab ${n2} log hain, make it ${n2}` : l === 'gu' ? `હવે ${n2} જણ છે, make it ${n2}` : `अब ${n2} लोग हैं, make it ${n2}`, check: (reply) => reply.includes(`${n2} seat`) || reply.includes(`${n2} people`) || reply.includes(`${n2} log`) || reply.includes(money(tc.price * n2)), label: `regroup → ${n2}` }); n = n2; changed = true; continue; } }
    if (level >= 40 && !switched && roll < 0.3) { const t2 = pick(r, trips.filter(x => x !== t)); const l = L(); turns.push({ text: l === 'en' ? `actually ${t2.name}, ${t2.mon}` : l === 'hi' ? `actually ${t2.name} chahiye, ${t2.mon} mein` : l === 'gu' ? `ના, ${t2.gu} ${t2.guMon}` : `नहीं, ${t2.hi} ${t2.hiMon}`, check: (reply) => reply.includes(t2.name) && reply.includes(money(t2.price)), label: `switch → ${t2.name}` }); t = t2; switched = true; continue; }
    const f = pick(r, pool.filter(x => !used.has(x.key) && (!x.intl || t.intl))) || pick(r, pool.filter(x => !x.intl || t.intl)); if (!f) break; used.add(f.key); const l = L(); const raw = typeof f[l] === 'function' ? f[l](t) : f[l]; turns.push({ text: typoRate && l === 'en' && r() < typoRate ? typo(r, raw) : raw, check: (reply) => f.check.test(reply) && !(f.not && f.not.test(reply)), label: f.key });
  }
  const adv = Math.min(5000, Math.round(t.price * 0.3 / 500) * 500);
  turns.push({ text: HOLD[L()](n), check: (reply) => /tc@upi/.test(reply) && reply.includes(money(adv)) && (n > 1 ? reply.includes(`${n} seats`) : /your seat|ek seat|1 seat|a seat|seat hold|holding/i.test(reply)) && reply.includes(t.name), label: `hold ${t.name} x${n}` });
  return { turns, trip: t, n };
}
async function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oye-ladder-'));
  const b = new Brain({ dataDir: dir, autosave: false }); b.evolution.genome.curiosity = 0; b.studyCurriculum(path.join(__dirname, '..', 'curriculum'));
  b.growth.setProfile({ city: 'Ahmedabad', phone: '9876543210', upi: 'tc@upi', trips: JSON.parse(JSON.stringify(TRIPS.map(({ name, date, days, price, seats, booked }) => ({ name, date, days, price, seats, booked })))) });
  const g = b.growth; let maxPassed = FROM - 1; const report = [];
  for (let level = FROM; level <= TO; level++) {
    let pass = 0; const fails = [];
    for (let i = 0; i < 12; i++) {
      const sc = scenario(level, i); const id = `L${level}-${i}`; let ok = true; const log = [];
      for (const turn of sc.turns) { let reply = ''; try { reply = (await g.chat({ id, text: turn.text, source: 'ladder' })).reply || ''; } catch (e) { reply = 'ERROR ' + e.message; } log.push([turn.text, reply]); if (!turn.check(reply)) { ok = false; fails.push({ i, label: turn.label, text: turn.text, reply: reply.slice(0, 220), log }); break; } }
      if (ok) pass++; for (const t of g.profile.trips) t.holds = [];
    }
    const pct = Math.round(100 * pass / 12); report.push({ level, pass, pct });
    console.log(`Level ${level}: ${pass}/12 (${pct}%) ${pct === 100 ? 'PASS' : 'FAIL'}`);
    if (pct < 100) { for (const f of fails.slice(0, verbose ? 12 : 3)) { console.log(`   ✗ item ${f.i} at "${f.label}"`); for (const [q, a] of f.log) console.log(`     > ${q}\n       ${a.slice(0, 200).replace(/\n/g, ' ')}`); } break; }
    maxPassed = level;
  }
  fs.writeFileSync(path.join(__dirname, '..', 'synth', 'ladder.json'), JSON.stringify({ at: new Date().toISOString(), from: FROM, to: TO, maxPassed, report }, null, 1));
  console.log(`Ladder: highest level passed at 100% = ${maxPassed}${REQUIRE ? ` (required ${REQUIRE})` : ''}`);
  process.exitCode = REQUIRE && maxPassed < REQUIRE ? 2 : 0;
}
run();
