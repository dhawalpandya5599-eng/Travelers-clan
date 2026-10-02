#!/usr/bin/env node
'use strict';
/**
 * eval.js — measures OYE's intelligence on a fixed exam, so improvements are real, not felt.
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
  { q: 'What do high neuroticism customers need?', expect: /reassurance/i, kind: 'knowledge' },
  { q: 'What is the fix for no leads?', expect: /organiser/i, kind: 'knowledge' },
  { q: 'What is the price floor?', expect: /ten percent above ground cost/i, kind: 'knowledge' },
  { q: 'What do burnout trips look like?', expect: /coorg|munnar|wayanad/i, kind: 'knowledge' },
  { q: 'How long does the Dudhsagar jeep safari take?', expect: /six hours/i, kind: 'knowledge' },
  { q: 'things to do in goa', expect: /Water sports[\s\S]*09:00/i, kind: 'skill' },
  { q: 'tell me everything about ladakh in july for 4 people', expect: /WHAT:[\s\S]*HOW/i, kind: 'skill' },
  { q: 'personality: yo bro squad of 5 want to party in goa, just checking you are legit', expect: /extraversion high|Gen Z|anxious/i, kind: 'skill' },
  { q: 'i am burnt out and need a reset, where should i go', expect: /Coorg|Munnar|Wayanad/i, kind: 'skill' },
  { q: 'what should we do about no leads', expect: /Organiser offer/i, kind: 'skill' },
  { q: 'pricing strategy with cost 11000 price 14500 competitor at 11999 16 seats 9 booked 40 days out', expect: /Early bird[\s\S]*do not cut/i, kind: 'skill' },
  { q: 'understand: papa ko BP hai, ladakh unke liye theek rahega? dar lag raha hai', expect: /faq:medical[\s\S]*fear[\s\S]*right move/i, kind: 'skill' },
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
  // --- playbooks taught by the teacher ---
  { q: 'What should the safety objection be answered with?', expect: /trip leader|doctor|reviews/i, kind: 'playbook' },
  { q: 'How much is the advance?', expect: /twenty five percent/i, kind: 'playbook' },
  { q: 'What does cancellation within seven days of departure refund?', expect: /nothing/i, kind: 'playbook' },
  { q: 'Does Nepal need a visa for Indian citizens?', expect: /no|needs no visa/i, kind: 'playbook' },
  { q: 'How many people does an Innova seat?', expect: /six/i, kind: 'playbook' },
  { q: 'When is Diwali week?', expect: /biggest domestic travel week/i, kind: 'playbook' },
  { q: 'What is the follow up schedule?', expect: /24 hours, 3 days and 7 days/i, kind: 'playbook' },
  { q: 'When should the trip WhatsApp group be created?', expect: /seven days before departure/i, kind: 'playbook' },
  { q: 'Which is the main channel for travelers under thirty five?', expect: /instagram/i, kind: 'playbook' },
  { q: 'Is a discount the first answer to a price objection?', expect: /no/i, notExpect: /^yes/i, kind: 'playbook' },
  // --- council of agents ---
  { q: 'council: lead: family of 4, Kerala in May, 6 days, budget 30k per person, kids aged 6 and 10\nclan: 32000 per person\nlead: is it safe for kids? veg food?', expect: /Verdict: WARN[\s\S]*(unanswered|Draft reply does not answer)/i, kind: 'council' },
  { q: 'plan: 2 of us, Ladakh in January, 4 days, budget 20k per person', expect: /off season[\s\S]*too short|minimum/i, kind: 'council' },
  { q: 'plan: corporate offsite 40 people, Lonavala, 2 days, budget 6k per person', expect: /Lonavala[\s\S]*in season|Lonavala/i, notExpect: /not recognised|Pokhara|Gulf/i, kind: 'council' },
  { q: 'plan: retired couple, Rann of Kutch in May, 3 days', expect: /Rann of Kutch[\s\S]*off season/i, notExpect: /not recognised/i, kind: 'council' },
  { q: 'ops: 6 friends, Spiti in August, 9 days, budget 35k per person', expect: /in season[\s\S]*Itinerary: D1/i, kind: 'council' },
  { q: 'news: Curfew imposed in Srinagar after unrest, tourists advised to avoid Kashmir', expect: /Logged 1 advisory.*Kashmir \[high/i, kind: 'council' },
  { journeys: true, q: 'What is the most common reason a lead is lost?', expect: /no reply|ghosted|slow|price|objection|decide|quiet/i, kind: 'funnel' },
  // --- WhatsApp agent (growth): a fixed trip is set up, then a customer chats; the LAST reply is judged ---
  { growth: ['hi 4 of us want goa in december budget 15k'], expect: /14,500[\s\S]*58,000[\s\S]*hold/i, kind: 'whatsapp' },
  { growth: ['4 of us goa in dec', 'any hidden costs?'], expect: /no hidden costs[\s\S]*not included/i, notExpect: /14,500 per person/, kind: 'whatsapp' },
  { growth: ['goa for 2', 'what if we cancel?'], expect: /transferable|refund/i, kind: 'whatsapp' },
  { growth: ['goa for 2', 'is it safe for girls?'], expect: /women|captain/i, kind: 'whatsapp' },
  { growth: ['goa for 2', 'where is the pickup?'], expect: /pickup|start from|point/i, kind: 'whatsapp' },
  { growth: ['bhai goa ka kitna hoga 2 log ke liye'], expect: /14,500[\s\S]*29,000[\s\S]*hold karun/i, kind: 'whatsapp' },
  { growth: ['goa for 4', 'too expensive'], expect: /all-inclusive|separately/i, kind: 'whatsapp' },
  { growth: ['goa for 4', 'ok hold 4 seats'], expect: /advance[\s\S]*screenshot/i, kind: 'whatsapp', handoff: true },
  { growth: ['goa for 2', 'not too expensive, nice'], expect: /hold/i, notExpect: /separately|all-inclusive;/i, kind: 'whatsapp' },
  { growth: ['goa for 2', 'is the advance refundable if we cancel?'], expect: /transferable|refund/i, kind: 'whatsapp', handoff: false },
  { growth: ['ગોવા ૪ લોકો કિંમત કેટલી?'], expect: /14,500[\s\S]*58,000[\s\S]*hold karun/i, kind: 'whatsapp' },
  { growth: ['गोवा 2 लोगों के लिए कितना?', 'बुक करो'], expect: /advance[\s\S]*upi/i, kind: 'whatsapp', handoff: true },
  { growth: ['ladakh in january for 3, 6 days'], expect: /custom[\s\S]*24,000[\s\S]*72,000[\s\S]*off-season/i, kind: 'whatsapp' },
  { growth: ['સુરક્ષિત છે છોકરીઓ માટે?'], expect: /ladkiyon|captain/i, kind: 'whatsapp' },
  { growth: ['I want to cancel and want my refund, this is fraud'], expect: /founder[\s\S]*24 hours/i, kind: 'whatsapp', handoff: true },
  { growth: ['manali for 3 in jan'], expect: /do not have a fixed batch for Manali[\s\S]*Goa/i, kind: 'whatsapp' },
  { growth: ['hi'], expect: /which trip[\s\S]*Goa 12 Dec/i, kind: 'whatsapp' },
  { growth: ['goa for 2', 'veg food available?'], expect: /vegetarian|jain/i, kind: 'whatsapp' },
  // --- new knowledge (lessons 17-24) ---
  { q: 'When is Goa peak season?', expect: /november to february/i, kind: 'knowledge' },
  { q: 'Does Thailand need a visa for Indians?', expect: /^No\b|visa free|sixty days/i, kind: 'knowledge' },
  { q: 'What is the GST on domestic tour packages?', expect: /five percent/i, kind: 'knowledge' },
  { q: 'What is the emergency number in India?', expect: /112/, kind: 'knowledge' },
  { q: 'What do anxious customers need?', expect: /safety proof/i, kind: 'knowledge' },
  { q: 'How many people does a tempo traveller seat?', expect: /twelve to seventeen/i, kind: 'knowledge' },
  { q: 'When is Diwali 2026?', expect: /october 20/i, kind: 'knowledge' },
  { q: 'What is the cure for altitude sickness?', expect: /descent/i, kind: 'knowledge' },
  { q: 'What do high neuroticism customers need?', expect: /reassurance/i, kind: 'knowledge' },
  { q: 'What is the fix for no leads?', expect: /organiser/i, kind: 'knowledge' },
  { q: 'What is the price floor?', expect: /ten percent above ground cost/i, kind: 'knowledge' },
  { q: 'What do burnout trips look like?', expect: /coorg|munnar|wayanad/i, kind: 'knowledge' },
  { q: 'How long does the Dudhsagar jeep safari take?', expect: /six hours/i, kind: 'knowledge' },
  { q: 'things to do in goa', expect: /Water sports[\s\S]*09:00/i, kind: 'skill' },
  { q: 'tell me everything about ladakh in july for 4 people', expect: /WHAT:[\s\S]*HOW/i, kind: 'skill' },
  { q: 'personality: yo bro squad of 5 want to party in goa, just checking you are legit', expect: /extraversion high|Gen Z|anxious/i, kind: 'skill' },
  { q: 'i am burnt out and need a reset, where should i go', expect: /Coorg|Munnar|Wayanad/i, kind: 'skill' },
  { q: 'what should we do about no leads', expect: /Organiser offer/i, kind: 'skill' },
  { q: 'pricing strategy with cost 11000 price 14500 competitor at 11999 16 seats 9 booked 40 days out', expect: /Early bird[\s\S]*do not cut/i, kind: 'skill' },
  { q: 'understand: papa ko BP hai, ladakh unke liye theek rahega? dar lag raha hai', expect: /faq:medical[\s\S]*fear[\s\S]*right move/i, kind: 'skill' },
  // --- skills ---
  { q: '14500 plus gst', expect: /15,225/, kind: 'skill' },
  { q: 'tcs on 250000', expect: /12,500/, kind: 'skill' },
  { q: 'cost 11000 at 20% margin', expect: /13,750/, kind: 'skill' },
  { q: 'break even with fixed cost 60000 at price 14500 and variable 9000', expect: /11 seats/, kind: 'skill' },
  { q: '14500 in 3 instalments', expect: /4,500[\s\S]*5,000/, kind: 'skill' },
  { q: '500 usd in inr', expect: /42,000/, kind: 'skill' },
  { q: 'altitude in ladakh', expect: /5360 m[\s\S]*acclimatisation/i, kind: 'skill' },
  { q: 'what to pack for manali in december', expect: /thermal|fleece/i, kind: 'skill' },
  { q: 'invoice for Riya Shah 4 seats 14500 for the Goa trip', expect: /TAX INVOICE[\s\S]*58,000/, kind: 'skill' },
  { q: 'organiser offer for 12 seats at 14500', expect: /free seat/i, kind: 'skill' },
  { q: 'estimate custom spiti for 8 people 7 days', expect: /Spiti, 7 days[\s\S]*margin/i, kind: 'skill' },
  // --- expressions: emotion first, then the fact, then one step ---
  { growth: ['my mother is 71 and has never travelled without my father who passed last year. is this trip really ok for her? i am scared'], expect: /understand the worry[\s\S]*seniors[\s\S]*call/i, notExpect: /sorry for your loss|hold/i, kind: 'expression' },
  { growth: ['we had booked for my brother too but he passed away last week. what do we do about his seat'], expect: /sorry for your loss[\s\S]*refund|transferred/i, notExpect: /15 days|hold/i, kind: 'expression', handoff: false },
  { growth: ['THIRD time asking. nobody replies. is this how you treat customers??'], expect: /founder[\s\S]*24 hours/i, kind: 'expression', handoff: true },
  { growth: ['goa for 2', 'wow 14500 for goa, is the hotel made of gold or what'], expect: /no gold[\s\S]*all-inclusive/i, kind: 'expression' },
  { growth: ['honestly i cant afford it but my friends are all going, any way to make it work'], expect: /I get it[\s\S]*two parts/i, kind: 'expression' },
  { growth: ['leaving tomorrow morning can you still add me, will pay full now'], expect: /last minute works[\s\S]*which trip/i, kind: 'expression' },
  { growth: ['i dont understand, is 14500 for everyone or per person, and what is advance, i am new to this'], expect: /for one person[\s\S]*advance is the first/i, kind: 'expression' },
  { growth: ['how do i know you wont run away with my advance, lot of fraud these days'], expect: /fair question[\s\S]*GST invoice[\s\S]*traveller/i, notExpect: /founder will personally call/i, kind: 'expression', handoff: false },
  { growth: ['papa ko BP hai, ladakh unke liye theek rahega? dar lag raha hai'], expect: /fikar[\s\S]*5360 m[\s\S]*doctor/i, kind: 'expression' },
  { growth: ['yo bro goa trip lit or nah? squad of 5, dec, budget tight af'], expect: /I get it[\s\S]*two parts[\s\S]*72,500/i, kind: 'expression' },
  { growth: ['WE GOT OUR LEAVES APPROVED!!! 4 of us, goa, 12 dec, what next???'], expect: /Congratulations[\s\S]*58,000[\s\S]*hold 4/i, kind: 'expression' },
  { growth: ['this is not what was promised, the captain was rude. i want a refund', 'what exactly is included?'], expect: /Included[\s\S]*founder will call/i, notExpect: /reply "hold"|Tell me the dates/i, kind: 'expression' },
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
    let r;
    if (c.growth) {
      b.growth.setProfile({ city: 'Ahmedabad', phone: '9876543210', upi: 'travelersclan@upi', trips: [{ name: 'Goa', date: '2099-12-12', days: 4, price: 14500, seats: 16, booked: 9 }] });
      let last; for (const m of c.growth) last = await b.growth.chat({ id: 'exam', text: m });
      r = { text: last.reply, via: 'growth:' + last.intent }; if (c.handoff != null && last.handoff !== c.handoff) r.text = '';
      c.q = c.growth.join(' / ');
    } else r = await b.respond(c.q);
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
