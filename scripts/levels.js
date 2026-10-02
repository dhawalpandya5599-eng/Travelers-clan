#!/usr/bin/env node
'use strict';
/**
 * levels.js — mastery by levels, easiest to hardest, pass mark 100% per level. The evaluator's standard is written
 * as checks: what a best-in-class reply MUST contain (and must not). OYE cannot move to the next level until the
 * current one is perfect.   node scripts/levels.js [--level N] [--verbose]
 */
const path = require('path'); const os = require('os'); const fs = require('fs');
const { Brain } = require('../core/brain');
const args = process.argv.slice(2); const only = +(args[args.indexOf('--level') + 1]) || 0; const verbose = args.includes('--verbose');

// chat: [messages...] judged on the LAST reply; agent: a chief request; review: a plan. `must` all must match, `not` none.
const LEVELS = [
  { level: 1, name: 'Basic facts, one turn', items: [
    { chat: ['how much is goa?'], must: [/14,500/, /per person/, /hold/i] },
    { chat: ['goa for 3, price?'], must: [/14,500/, /43,500/] },
    { chat: ['when is the goa trip?'], must: [/12 Dec/] },
    { chat: ['how many seats left on goa'], must: [/7 seats left/] },
    { chat: ['goa for 2', 'what is included?'], must: [/Included/, /Not included/], not: [/14,500 per person, 7 seats/] },
    { chat: ['goa for 2', 'cancellation policy?'], must: [/transferable/, /15/] },
    { chat: ['goa for 2', 'where is the pickup?'], must: [/pickup|fixed point|start from/i] },
    { chat: ['goa for 2', 'veg food?'], must: [/[Vv]eg/, /Jain/] },
    { chat: ['goa for 2', 'how much advance?'], must: [/4,500/] },
    { chat: ['which trips do you have?'], must: [/Goa/, /Manali/] },
    { chat: ['hi'], must: [/Which trip/, /Goa 12 Dec/] },
    { chat: ['thanks'], must: [/Happy to help|Message here/i] },
    { agent: 'what is the cancellation policy?', must: [/transferable/, /15/], not: [/Included:|Payment:/] },
    { agent: 'how much advance for 4 people on goa?', must: [/18,000/, /4,500/] },
    { agent: 'how many seats are left on goa and what is that worth?', must: [/7 seats/, /1,01,500/] },
    { agent: 'is manali in season in december?', must: [/in season|shoulder/i] },
  ] },
  { level: 2, name: 'Conversation flow, multi-turn', items: [
    { chat: ['hi', '4 of us', 'goa', 'december'], must: [/12 Dec/, /58,000/, /hold 4/], note: 'collect requirements across turns' },
    { chat: ['goa for 4', 'any hidden costs?', 'ok'], must: [/hold/i], not: [/14,500 per person, 7 seats left\. Stay/] },
    { chat: ['goa for 4', 'too expensive', 'ok fine'], must: [/hold/i] },
    { chat: ['goa for 2', 'actually we are 5 now'], must: [/5 people|5 log/, /72,500/] },
    { chat: ['goa for 2', 'ok hold 2 seats', 'paid, screenshot sent'], must: [/Received|Mil gaya/, /names/i], not: [/advance/i] },
    { chat: ['bhai goa ka kitna', 'ok included kya hai?'], must: [/Included hai/], note: 'language sticks' },
    { chat: ['goa for 2', 'is it safe?', 'what about food?', 'and cancellation?'], must: [/transfer/i], not: [/Jaise maine|As I mentioned/] },
    { chat: ['goa for 2', 'hold 2', 'actually make it 3'], must: [/3/], not: [/Received/] },
    { chat: ['manali for 2 in dec', 'and goa?'], must: [/Goa/, /14,500/], note: 'switch trip mid-chat' },
    { chat: ['goa for 2', 'will think and tell'], must: [/time|hold|24/i], not: [/Shall I hold/] },
    { chat: ['goa for 2', 'will think and tell', 'ok lets do it'], must: [/hold|advance/i] },
    { chat: ['2 log goa', 'ગોવા સલામત છે?'], must: [/captain|ladkiyon/i] },
  ] },
  { level: 3, name: 'Emotion and psyche', items: [
    { chat: ['my mother is 71 and has never travelled without my father who passed last year. is this trip really ok for her? i am scared'], must: [/understand the worry/i, /seniors/i, /call/i], not: [/sorry for your loss/i] },
    { chat: ['we had booked for my brother too but he passed away last week. what do we do about his seat'], must: [/sorry for your loss/i, /refund|transferred/i], not: [/15 days|hold/i] },
    { chat: ['THIRD time asking. nobody replies. is this how you treat customers??'], must: [/founder/i, /24 hours/] },
    { chat: ['goa for 2', 'wow 14500 for goa, is the hotel made of gold or what'], must: [/no gold/i, /all-inclusive/i] },
    { chat: ['honestly i cant afford it but my friends are all going, any way to make it work'], must: [/I get it/i, /two parts/i] },
    { chat: ['leaving tomorrow morning can you still add me, will pay full now'], must: [/last minute works/i, /which trip/i] },
    { chat: ['i dont understand, is 14500 for everyone or per person, and what is advance, i am new to this'], must: [/one person/i, /advance is the first/i] },
    { chat: ['how do i know you wont run away with my advance, lot of fraud these days'], must: [/fair question/i, /GST/i, /traveller/i], not: [/founder will personally call/i] },
    { chat: ['papa ko BP hai, ladakh unke liye theek rahega? dar lag raha hai'], must: [/fikar/i, /5360 m/, /doctor/i] },
    { chat: ['yo bro goa trip lit or nah? squad of 5, dec, budget tight af'], must: [/I get it/i, /two parts/i, /72,500/] },
    { chat: ['WE GOT OUR LEAVES APPROVED!!! 4 of us, goa, 12 dec, what next???'], must: [/Congratulations/i, /58,000/, /hold 4/] },
    { chat: ['this is not what was promised, the captain was rude. i want a refund', 'what exactly is included?'], must: [/Included/, /founder will call/i], not: [/reply "hold"|Tell me the dates/i] },
    { chat: ['goa for 2', 'is it safe for girls? we are two women travelling alone'], must: [/women/i, /captain/i] },
    { chat: ['we are 4 friends, first time travelling without parents, little nervous, goa in dec?'], must: [/understand the worry|fair one/i, /14,500/] },
    { chat: ['my husband says these group trips are a scam. convince me.'], must: [/fair question|GST|traveller/i], not: [/founder will personally call/i] },
    { chat: ['goa for 2', 'hmm not sure. my friend went with another company and the bus broke down and nobody helped'], must: [/captain|every batch|emergency/i] },
  ] },
  { level: 4, name: 'Complex requirements and reasoning', items: [
    { review: '2 of us, Ladakh in January, 4 days, budget 20k per person', must: [/off season/i, /too short|minimum/i] },
    { review: 'family of 5 with kids 4 and 7, Spiti in August, 8 days', must: [/under 8|not for/i, /acclimatis/i] },
    { review: 'corporate offsite 40 people, Lonavala, 2 days, budget 6k per person', must: [/Lonavala/], not: [/not recognised|Pokhara|Gulf/i] },
    { review: 'retired couple, Rann of Kutch in May, 3 days', must: [/off season/i, /heat/i] },
    { review: 'honeymoon, Bali in July, 6 days, 80k per person, private villa', must: [/Visa on arrival/i] },
    { chat: ['goa or manali for 4 of us in december, budget 12k each?'], must: [/Manali/, /12,500/, /Goa/, /14,500/], note: 'compare both against budget' },
    { chat: ['we are 12 college students, cheapest option in december, max 9k'], must: [/organiser|free/i, /Manali|Goa/], note: 'group offer and nearest fit' },
    { chat: ['ladakh in january for 3, 6 days'], must: [/custom/i, /off-season/i, /24,000/] },
    { chat: ['kerala for my parents in may, 6 days, they cannot walk much'], must: [/Kerala/, /seniors|walk|relaxed/i] },
    { chat: ['is december too crowded in goa? we want quiet beaches'], must: [/Goa/, /quiet|South|peak/i] },
    { agent: 'what documents do we need for bali?', must: [/passport/i, /Visa on arrival/i] },
    { agent: 'what is our refund rule if someone cancels 5 days before?', must: [/no cash refund|no refund/i, /transfer/i] },
    { agent: 'which trips are leaving in december?', must: [/Goa/, /Manali/] },
    { agent: 'plan a 5 day manali trip for 6 friends who want snow and paragliding', must: [/Solang|Atal|D1/i] },
  ] },
  { level: 5, name: 'Business judgement for Travelers Clan growth', items: [
    { agent: 'which lead should I message first today and why?', must: [/message|lead|post/i] },
    { agent: 'goa departs in 6 days and is 31% full. push or merge?', must: [/push|merge/i, /48|broadcast|next batch/i] },
    { agent: 'what should I post on instagram this week?', must: [/Reel/i, /14,500/] },
    { agent: 'plan a diwali campaign for the goa batch with all messages', must: [/Diwali/i, /STOP/] },
    { agent: 'a customer wants a refund 3 days before departure, what do we offer?', must: [/no cash refund|no refund/i, /transfer/i] },
    { agent: 'if all remaining goa seats sell, how much revenue is that?', must: [/1,01,500/] },
    { agent: 'write a reply to this google review: "bus was late by 3 hours but the captain was great" 3 stars', must: [/delay|late/i, /captain/i] },
    { agent: 'what would make a skeptical NRI family book with us?', must: [/review|proof|GST|traveller|photos/i] },
    { agent: 'the manali bus broke down at 2am with 20 travellers on board, what do I do?', must: [/captain|backup|vehicle|safe|inform/i] },
    { agent: 'how do I get leads with zero ad budget?', must: [/reel|referral|organiser|Google|review|college|society/i] },
  ] },
  { level: 6, name: 'Expert: mixed languages, constraints, numbers, drafting', items: [
    { chat: ['hum 3 log, goa ya manali, 15 dec ke aas paas, budget 13k, ek ko knee problem hai'], must: [/Manali/, /12,500/, /Goa/, /14,500/, /knee|walking|relaxed|doctor/i] },
    { chat: ['hello, we are 2 couples + 1 kid aged 5, goa dec, one couple is veg, budget total 60k'], must: [/5 people|5 of you/i, /72,500/, /over|above/i, /[Vv]eg|Jain/] },
    { chat: ['ગોવા 4 લોકો', 'ડિસ્કાઉન્ટ મળશે?', 'ઓકે હોલ્ડ કરો'], must: [/4 seats|4 seat/i, /advance|Advance/, /tc@upi/] },
    { chat: ['goa for 2', 'can we pay in 3 instalments?'], must: [/4,500/, /instal|parts|part/i] },
    { chat: ['goa for 2', 'can you add 2 more days in south goa for us?'], must: [/2 (more |extra )?days/i, /6,000|6000|3,000/] },
    { chat: ['goa for 2', 'is 12 dec a weekend?'], must: [/Saturday|Sunday|weekend|weekday|Friday|Monday|Tuesday|Wednesday|Thursday/i] },
    { chat: ['what time does the bus leave and from where?'], must: [/fixed point|pickup|city centre/i, /time/i] },
    { chat: ['goa for 2', 'another agency is giving goa at 11,999, why should i pay 14,500?'], must: [/included|inclusive|captain|hidden/i], not: [/founder will personally call/i] },
    { agent: 'if I lower goa to 13,500 how much revenue do I lose on the remaining seats?', must: [/less revenue/, /→ ₹13,500/] },
    { agent: 'draft a whatsapp message for 20 past travellers announcing manali 20 dec', must: [/Manali/, /20 Dec/, /12,500/, /STOP/] },
    { agent: 'compare our goa price with a competitor at 11,999 and tell me what to say', must: [/included|inclusive|captain|hidden/i, /14,500/] },
    { agent: 'how many days until the goa departure and how many seats do we need to sell per day to fill it?', must: [/days/i, /per day/i] },
  ] },
  { level: 7, name: 'Master: crises mid-trip, corporate groups, multi-day negotiation, numbers under pressure', items: [
    { chat: ['goa for 4', 'bus broke down near surat, we are stuck for 2 hours, what now'], must: [/captain|team|calling|on it|arrang|sorry/i], not: [/advance|hold|per person/i] },
    { chat: ['hi', 'we are a company of 25 people, offsite in goa, need gst invoice, 2 nights, dates flexible in jan'], must: [/GST|invoice/i, /25/, /quote|custom|private|corporate|group/i, /Jan|January|dates/i] },
    { chat: ['goa for 2', 'my wife is 5 months pregnant, is the trip ok for her?'], must: [/doctor|comfort|relaxed|rest|captain/i], not: [/hold|advance/i] },
    { chat: ['manali for 6', 'ok hold', 'actually 2 people dropped out, make it 4'], must: [/4 seats|4 seat/i, /advance|Advance/, /tc@upi/] },
    { chat: ['goa 12 dec for 2', 'if it rains heavily and you cancel the trip, do we get a full refund?'], must: [/full refund|refund(ed)? in full|100%|every rupee|poora/i], not: [/15 days|no refund/i] },
    { chat: ['મારા પપ્પા 68 વર્ષના છે, મનાલી ઠંડી માં ઠીક રહેશે?'], must: [/warm|jacket|cold|thand|garam|senior|parents|relaxed|doctor|layer/i] },
    { chat: ['goa for 3', 'what is the price', 'ok i will pay full now, 43500, give account details'], must: [/tc@upi/, /43,500/] },
    { chat: ['i booked goa but got a better deal elsewhere, i want to cancel and get my advance back, booked 2 days ago'], must: [/transfer/i, /6 months/i], not: [/founder will personally call/i] },
    { agent: 'goa has 7 seats left and 10 days to go, should we run ads or push referrals, give me the numbers', must: [/referral/i, /ad(s| spend| budget)?\b/i, /seats?/i, /\d/] },
    { agent: 'a traveller posted a 1-star review saying the hotel was dirty, draft the public reply and what we do internally', must: [/sorry|apolog/i, /hotel/i, /call|message|DM|contact|phone/i] },
    { agent: 'the manali bus operator wants 20% more at the last minute, do we absorb it or raise the price, 3 seats sold', must: [/absorb|margin/i, /raise|price/i, /\d/] },
    { agent: 'which of our two trips should get the marketing budget this week and why', must: [/Goa|Manali/, /seats|left|fill/i] },
  ] },
];

async function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-levels-'));
  const b = new Brain({ dataDir: dir, autosave: false }); b.evolution.genome.curiosity = 0; b.studyCurriculum(path.join(__dirname, '..', 'curriculum'));
  b.growth.setProfile({ city: 'Ahmedabad', phone: '9876543210', upi: 'tc@upi', trips: [{ name: 'Goa', date: '2099-12-12', days: 4, price: 14500, seats: 16, booked: 9 }, { name: 'Manali', date: '2099-12-20', days: 5, price: 12500, seats: 20, booked: 3 }] });
  let allPass = true; const report = [];
  for (const L of LEVELS) {
    if (only && L.level !== only) continue;
    let pass = 0; const fails = [];
    for (let i = 0; i < L.items.length; i++) {
      const it = L.items[i]; let out = '';
      try {
        if (it.chat) { const id = `lvl${L.level}-${i}-${Date.now().toString(36)}`; for (const m of it.chat) out = (await b.growth.chat({ id, text: m, source: 'levels' })).reply; }
        else if (it.review) out = (await b.council.review({ message: it.review })).summary;
        else out = (await b.agent.run(it.agent)).final;
      } catch (e) { out = 'ERROR ' + e.message; }
      const ok = (it.must || []).every(r => r.test(out)) && !(it.not || []).some(r => r.test(out));
      if (ok) pass++; else fails.push({ item: it.chat ? it.chat.join(' / ') : it.review || it.agent, out: out.slice(0, 260), missing: (it.must || []).filter(r => !r.test(out)).map(String), forbidden: (it.not || []).filter(r => r.test(out)).map(String) });
    }
    const pct = Math.round(100 * pass / L.items.length); report.push({ level: L.level, name: L.name, pass, total: L.items.length, pct });
    console.log(`Level ${L.level} · ${L.name}: ${pass}/${L.items.length} (${pct}%) ${pct === 100 ? 'PASS' : 'FAIL'}`);
    if (verbose || pct < 100) for (const f of fails) console.log(`   ✗ ${f.item}\n     → ${f.out.replace(/\n/g, ' ')}\n     missing ${f.missing.join(' ')}${f.forbidden.length ? ' forbidden ' + f.forbidden.join(' ') : ''}`);
    if (pct < 100) { allPass = false; if (!only) { console.log(`Stop: level ${L.level} must be 100% before level ${L.level + 1}.`); break; } }
    b.growth.state.leads = b.growth.state.leads.filter(l => !String(l.id).startsWith('lvl')); for (const t of b.growth.profile.trips) t.holds = [];
  }
  fs.writeFileSync(path.join(__dirname, '..', 'synth', 'levels.json'), JSON.stringify({ at: new Date().toISOString(), report, allPass }, null, 1));
  console.log(allPass ? 'ALL LEVELS PASSED (100%)' : 'NOT PASSED');
  process.exitCode = allPass ? 0 : 2;
}
run();
