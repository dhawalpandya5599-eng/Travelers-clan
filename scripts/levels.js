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
  { level: 8, name: 'Grandmaster: negotiations that keep changing, two customers in one chat, refund maths with dates, typos, cash flow', items: [
    { chat: ['goa for 4 in dec', 'actually manali, 20 dec', 'and we are 6 now not 4', 'ok hold'], must: [/6 seats/i, /Manali/, /tc@upi/], not: [/Goa/] },
    { chat: ['hi this is Priya, me and my friend Riya want goa, she will pay separately, can you hold 1 each?'], must: [/2 seats|two seats|1 each|one each|separately/i, /advance/i, /tc@upi/] },
    { chat: ['i paid 4500 advance on 1 nov for goa 12 dec, cancelling today 20 nov, how much do i get back?'], must: [/advance/i, /transfer/i, /6 months/i, /22 days|more than 15|15\+ days|before the 15/i] },
    { chat: ['goa ke liye 2 log 12 dec, 29000 total paid, ab 5 dec ko cancel kar rahe hain, kitna wapas milega?'], must: [/refund nahi|wapas nahi|no refund|nahi milega/i, /7 din|7 days|15 din|15 days/i, /transfer/i] },
    { chat: ['goa 2 ppl dec 12 kitna, veg khana milega, bus ya train, pickup ahm se?'], must: [/14,500/, /veg|Jain/i, /pickup|fixed point|city centre/i, /bus|train|Volvo|AC/i] },
    { chat: ['મનાલી ૨૦ ડિસેમ્બર ૪ જણ, ભાવ?'], must: [/12,500/, /50,000/, /4 (log|seats|people)/i] },
    { chat: ['we are 2 adults and 2 kids aged 4 and 7 for goa, kids price?'], must: [/free/i, /70%|10,150/, /under 5|below 5|4-year|age 4|aged 4/i] },
    { agent: 'cash flow: goa 12 dec and manali 20 dec, hotel advances due 1 dec 60000 total, do we have enough from advances collected?', must: [/advance/i, /\d{1,2},\d{3}/, /enough|short|shortfall|cover/i, /Goa/, /Manali/] },
    { agent: 'a customer says the captain was rude on the manali trip and wants 50% back, what do we offer', must: [/captain/i, /apolog|sorry/i, /credit|refund|offer/i, /%|₹/] },
    { agent: 'write the pre-departure message for goa 12 dec with pickup 6am from ahmedabad', must: [/Goa/, /12 Dec/, /6 ?am/i, /Ahmedabad/i, /ID|carry|bring/i, /captain/i] },
    { agent: 'if we add a kerala batch in feb at 18,500 for 6 days, what margin do we need and what should the advance be', must: [/advance/i, /\d{1,2},\d{3}/, /margin/i, /Kerala/] },
    { chat: ['hi', 'hello?', 'anyone there??'], must: [/here|yes|Hi|which trip|Which trip|right here|with you/i], not: [/founder|24 hours/i] },
  ] },
  { level: 9, name: 'Legend: accessibility, other pickup cities, hotel doubts after a hold, college groups, medical and altitude, honeymoon upgrades, hour-by-hour rescue, exact sequences', items: [
    { chat: ['goa 12 dec 2 log', 'ek ko wheelchair chahiye, possible?'], must: [/wheelchair/i, /ground floor|accessible|ramp|assist|saath/i, /captain|team|confirm|call/i] },
    { chat: ['we are 8 from mumbai, can pickup be from mumbai instead of ahmedabad for goa?'], must: [/Mumbai/, /join|meet|pickup|point|board/i, /price|adjust|same|less|minus|reduce/i] },
    { chat: ['goa for 2', 'ok hold', 'wait, my friend says the hotel in your plan has bad reviews, which hotel is it?'], must: [/hotel/i, /name|share|send|list/i, /change|option|upgrade|photos|reviews|switch/i], not: [/founder will personally/i] },
    { chat: ['our college group of 40 students, manali, budget 9000 each, teachers free?'], must: [/40/, /9,000/, /teacher/i, /free|complimentary/i, /custom|private|group|quote/i] },
    { chat: ['i am diabetic and my wife has bp, is manali ok, altitude?'], must: [/diabet|BP|blood pressure|medic/i, /altitude|height|doctor/i, /captain|first-aid|first aid/i] },
    { chat: ['honeymoon trip goa, want private room not sharing, extra cost?'], must: [/private|couple|double/i, /₹|extra|supplement/i, /honeymoon|congrat/i] },
    { chat: ['can you give me the itinerary day by day for goa'], must: [/D1|Day 1/i, /D2|Day 2/i] },
    { chat: ['मनाली में बर्फ मिलेगी 20 दिसंबर को? और बच्चा 3 साल का है'], must: [/snow|baraf|barf/i, /free|3 saal/i] },
    { agent: 'goa is 6 seats short with 5 days left, give me a rescue plan hour by hour for today', must: [/\b\d{1,2}\s*(am|pm)\b/i, /seats?/i, /referral|broadcast|reel|post|call/i, /6 seats/i] },
    { agent: 'a lead said yes on tuesday, paid nothing, went silent for 4 days, write the exact 3-message sequence with timing', must: [/Message 1|1\./, /Message 3|3\./, /hour|day|tomorrow|today/i, /hold|seat/i, /STOP|no pressure|no problem/i] },
    { agent: 'compare manali 20 dec and goa 12 dec on margin per seat if transport is 30% and stay 35% of price', must: [/Manali/, /Goa/, /margin/i, /4,375|5,075/] },
    { agent: 'draft the google business profile post for manali with a hook, body and CTA under 80 words', must: [/Manali/, /20 Dec/, /12,500/, /WhatsApp|DM|reply|call|link/i] },
  ] },
  { level: 10, name: 'Chief: terse six-turn chats, first-time women travellers, name changes, self-drive joins, flights, chat summaries, Gujarati date changes, merge-or-cancel with money, content calendars, weekly review, lost passport, press', items: [
    { chat: ['hi', 'goa', 'for 3', 'dec', 'hmm costly', 'ok ok hold 3'], must: [/3 seats/i, /tc@upi/, /Goa/] },
    { chat: ['My name is Hetal. 2 ladies, first time travelling without family, Manali 20 Dec, parents worried, what to tell them?'], must: [/Hetal/, /parents/i, /women|ladies|roomed/i, /captain/i, /call|number|photos|reviews/i] },
    { chat: ['I booked 2 seats goa, now my friend backed out, can my cousin take her place?'], must: [/name change|change the name|replace|take her place|transfer/i, /free|no charge|no cost|nothing extra/i, /ID/] },
    { chat: ['goa for 2', 'we will come by our own car and join at the hotel, discount?'], must: [/own car|self-drive|join at|drive/i, /₹|less|minus|reduce|adjust/i] },
    { chat: ['Manali for 4', 'can we get a flight option instead of bus? delhi to manali is 14 hours'], must: [/flight|fly/i, /Bhuntar|Kullu|Chandigarh|Delhi/i, /₹|extra|cost|price|own/i] },
    { chat: ['goa for 2 people, 12 dec', 'veg', 'ok hold', 'send me a summary of everything we discussed'], must: [/Goa/, /12 Dec/, /2 seats/i, /veg|Jain/i, /4,500|advance/i] },
    { chat: ['ઓકે ભાઈ, ૨ સીટ ગોવા, પણ મારી પત્ની જૈન છે અને ૧૨ ડિસેમ્બર ને બદલે જાન્યુઆરી માં છે?'], must: [/Jain/i, /Jan|January|agla|next batch|batch/i, /2 (seats|log|seat)/i] },
    { agent: 'the manali batch has 17 seats empty 18 days out, run the full decision: keep, merge with goa, or cancel, with the money', must: [/keep/i, /merge/i, /cancel/i, /17/, /₹/] },
    { agent: 'write a 7-day instagram content calendar for goa 12 dec with hooks', must: [/Day 1/i, /Day 7/i, /Goa/, /hook/i] },
    { agent: 'summarise this week: leads, holds, bookings, and what to do monday morning', must: [/leads?/i, /hold/i, /Monday/i] },
    { agent: 'a traveller lost her passport in goa on day 2, what does the captain do, step by step', must: [/police|FIR/i, /passport office|RPO|embassy|Passport Seva/i, /captain/i] },
    { agent: 'a journalist asks why a traveller got hurt on our trek, what is our statement', must: [/statement|safe|sorry|family|recover/i, /captain|first aid|insurance|hospital/i], not: [/(say|reply|respond|answer|give)[^.]{0,20}"?no comment/i, /^no comment/i] },
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
