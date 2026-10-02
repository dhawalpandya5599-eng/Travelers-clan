#!/usr/bin/env node
'use strict';
/**
 * synth-customers.js — synthetic customers from around the globe, generated from the cohort model.
 *   node scripts/synth-customers.js [--count 600] [--seed 7]
 * Writes synth/customers.json (people, requirements, first messages, cohort labels) and
 * curriculum/06-customer-cohorts.md (what OYE should know about each cohort).
 */
const fs = require('fs');
const path = require('path');
const { COHORTS, lessons, get } = require('../core/cohorts');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? +process.argv[i + 1] : d; };
let seed = arg('seed', 7);
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = ([a, b]) => Math.round(a + rnd() * (b - a));

const NAMES = {
  india: ['Riya', 'Aman', 'Priya', 'Rahul', 'Sneha', 'Karan', 'Neha', 'Vikram', 'Pooja', 'Arjun', 'Divya', 'Rohan', 'Ananya', 'Siddharth', 'Kavya', 'Nikhil', 'Meera', 'Harsh', 'Ishita', 'Dev', 'Mehul', 'Jay', 'Krupa', 'Dhruv', 'Tanvi'],
  west: ['Lena', 'Tom', 'Sophie', 'Lucas', 'Emma', 'Noah', 'Julia', 'Felix', 'Mia', 'Jonas', 'Chloé', 'Mateo', 'Inês', 'Ben', 'Hanna'],
  gulf: ['Fatima', 'Omar', 'Aisha', 'Yusuf', 'Sara', 'Zayd', 'Hiba', 'Imran'],
  nomad: ['Alex', 'Sam', 'Jordan', 'Taylor', 'Nina', 'Max', 'Kai', 'Lou'],
};
const DEST = ['Ladakh', 'Spiti', 'Goa', 'Manali', 'Kasol', 'Meghalaya', 'Kerala', 'Bali', 'Dubai', 'Vietnam', 'Rajasthan', 'Andaman', 'Rishikesh', 'Sikkim', 'Bhutan', 'Thailand'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const TEMPLATES = {
  'metro-young-pros': ['Hi! {n} of us from office are planning a long weekend trip to {d} in {m}. Budget around {b}k each. Can you send an itinerary?', 'Hey, looking for a {d} trip over the {m} long weekend, {n} friends, mostly want cafes and good reels spots. Price?', '{d} in {m}? We can take 2 days leave, {n} people. Need something quick and fun.'],
  'college-groups': ['We are {n} college students planning {d} in {m} after exams. What is the cheapest package? Budget {b}k max per head.', 'Group of {n} from college, {d} trip, need bonfire and music, and a group discount please. Hostel is fine.', 'Hi, students here, {n} of us. {d} in {m}. Can we pay in two parts? Budget is tight, around {b}k.'],
  'indian-families': ['Hello, we are a family of {n} with two kids, planning {d} in {m}. We need safe comfortable hotels, veg food and a private cab. Please share full inclusions.', 'Namaste. Planning {d} for my parents, my wife and kids, {n} people, in {m}. Is it safe for elderly? Budget {b}k total.', 'Family trip to {d}, {n} people, Jain food needed, {m}. No hidden costs please, share the all-inclusive price.'],
  'honeymooners': ['Hi, we are getting married in {m} and want a honeymoon in {d}. Private villa, candlelight dinner, no group. Budget {b}k.', 'Just married! Looking for a romantic {d} trip, 2 people, {m}. Can you arrange a couple photoshoot?', 'Honeymoon in {d}, something private and special, dates fixed around {m}.'],
  'solo-women': ['Hi, I am a solo female traveler planning {d} in {m}. Is the group safe for girls? Any women-only departures? Budget {b}k.', 'First solo trip! Looking at {d}. Do you have a female trip leader and single room option?', 'Solo woman, {d} in {m}. Can I talk to past women travelers before booking?'],
  'nri-families': ['Hello, we are visiting India from {r} in {m} with {n} family members and would like a {d} tour. Premium hotels, airport pickup, and an invoice please. We will pay by international card.', 'NRI family from {r}, {n} people, {d} for about a week in {m}. Please email a written itinerary with hotel names and your refund policy.', 'Coming to India from {r} in {m}. Budget roughly {b}k. Can we do a video call to plan {d}?'],
  'european-backpackers': ['Hey! Backpacking India from {r}, want to trek around {d} in {m}, {n} of us. Looking for homestays and local food, not a touristy package. Budget about {b}k rupees.', 'Hi, we are from {r}, hostel vibe, flexible plan, {d}. English speaking guide? Can book a few days before.', 'Hiking in {d} in {m}, off the beaten path, {n} people. Price in euros ok?'],
  'gulf-expats': ['Hi, we live in {r} and are planning {d} during Eid holidays in {m}, {n} people. Need cool weather, halal or veg food, and airport pickup. Budget {b}k.', 'From {r}, summer vacation, {d} for {n} of us in {m}. AED pricing possible?', 'Family in {r} looking at {d} for {m}. Direct flight cities preferred. Share package.'],
  'corporate-offsites': ['Hello, we need a quote for a team offsite in {d} for {n} employees in {m}, 2 nights, with team building activities, a conference room and GST invoice.', 'HR here. Corporate outing to {d}, {n} people, {m}. Please send an itemised quotation and transport from our office.', 'Company offsite, {n} employees, {d}, budget around {b}k total. Need vendor onboarding documents and invoice.'],
  'seniors': ['Namaste, we are retired, {n} seniors planning a {d} pilgrimage in {m}. Need a relaxed pace, minimal walking, and a doctor on call. Knee issues.', 'My parents, aged 65 and 68, want {d} in {m}. Ground floor rooms and temple visits please. Budget {b}k.', 'Senior group of {n}, {d}, easy pace, no long drives. Can you call me?'],
  'adventure-junkies': ['Looking for a moderate to difficult trek in {d} in {m}, summit altitude and gear list please. {n} people, certified guides a must.', '{d} bike trip in {m}, {n} riders, want the high passes. Small batch? Budget {b}k.', 'Rafting plus paragliding near {d}, {n} of us, {m}. Safety record?'],
  'luxury-couples': ['Hi, looking for a bespoke {d} trip for 2 in {m}, five star stays, private guide, fine dining, no fixed group. Budget {b}k.', 'Premium {d} itinerary for a couple, {m}, business class and suites. Please curate.', 'Luxury resort in {d}, private transfers, {m}. Send named hotels.'],
  'digital-nomads': ['Hi, I work remotely and want a month-long stay near {d} starting {m}. Reliable wifi and a coworking space are must-haves. Monthly rate? Budget {b}k.', 'Workation in {d} for 3 weeks, quiet room with good wifi, weekend excursions. {n} of us.', 'Nomad here, laptop life. Long stay in {d} from {m}. Community events nearby?'],
};

const TYPE_TEMPLATES = {
  friends: ['{o} {n} friends planning {d} in {m}, budget about {b}k each. What do you have?', '{o} bachelor trip for {n} of us to {d} in {m}. Shared rooms fine, want nightlife.', '{o} reunion of {n} batchmates, {d}, {m}. Group discount?'],
  family: ['{o} family of {n} with kids, {d} in {m}. Need safe hotels, private vehicle and dietary options. Budget {b}k per person.', '{o} planning {d} for my parents and kids, {n} people, {m}. Is it child friendly? No hidden costs please.', '{o} family trip, {n} of us, {d}, {m}. Share all-inclusive price.'],
  couple: ['{o} my wife and I want a {d} trip in {m}, something private and scenic, budget {b}k.', '{o} anniversary trip for two, {d}, {m}. Candlelight dinner possible?', '{o} couple, {d} in {m}, no fixed group please.'],
  solo: ['{o} solo traveler, {d} in {m}. Is the group safe and is there a single room option? Budget {b}k.', '{o} travelling alone, first time, {d}, {m}. Reviews from past travelers?', '{o} by myself, {d} in {m}, small batch preferred.'],
  senior: ['{o} retired couple, {d} in {m}, easy pace and medical support please. Budget {b}k.', '{o} {n} seniors, {d}, {m}, minimal walking, ground floor rooms.', '{o} elderly group of {n}, {d} pilgrimage in {m}, doctor on call?'],
  corporate: ['{o} corporate offsite for {n} employees in {d}, {m}. Need itemised quote, invoice and team activities.', '{o} HR here, team outing to {d}, {n} people, {m}. Conference room needed.', '{o} company trip, {n} employees, {d}, budget {b}k per head, send a quote.'],
  adventure: ['{o} looking for a trek near {d} in {m}, {n} of us, certified guides and gear list please. Budget {b}k.', '{o} rafting and camping in {d}, {m}, {n} people. Difficulty grade?', '{o} {d} bike trip in {m}, {n} riders, high altitude ok.'],
  luxury: ['{o} bespoke {d} itinerary for {n} in {m}, five star stays, private guide. Budget {b}k.', '{o} premium {d} trip, {m}, suites and business class.', '{o} luxury resort in {d}, private transfers, {m}. Named hotels please.'],
  nomad: ['{o} remote worker, month-long stay near {d} from {m}, need reliable wifi and coworking. Budget {b}k.', '{o} workation in {d} for 3 weeks, quiet room, good wifi, {n} of us.', '{o} nomad, long stay in {d} from {m}, monthly rate?'],
  student: ['{o} {n} college students, cheapest {d} trip in {m} after exams, budget {b}k max.', '{o} students, group of {n}, {d}, bonfire and music, hostel fine, group discount?', '{o} semester break, {n} of us, {d} in {m}, can we pay in two parts?'],
};
const OPENERS = ['Hi from {r},', 'Hello, writing from {r}.', 'Hey! We are based in {r}.', 'Namaste from {r},', 'Greetings from {r},'];
const POOL = { 'in-west': 'india', 'in-north': 'india', 'in-south': 'india', 'in-east': 'india', gulf: 'gulf', 'uk-eu': 'west', na: 'west', apac: 'nomad', africa: 'nomad', latam: 'west', 'east-asia': 'nomad' };

function person(c) {
  if (c.generated) {
    const region = pick(c.regions);
    const n = between(c.groupSize), b = Math.round(between(c.budget) / 1000), d = pick(DEST), m = pick(c.months);
    const p = {}; for (const [k, v] of Object.entries(c.personality)) p[k] = Math.max(0, Math.min(1, +(v + (rnd() - 0.5) * 0.3).toFixed(2)));
    const msg = pick(TYPE_TEMPLATES[c.type]).replace('{o}', pick(OPENERS).replace('{r}', region)).replace(/{n}/g, n).replace(/{b}/g, b).replace(/{d}/g, d).replace(/{m}/g, m);
    return { name: pick(NAMES[POOL[c.region] || 'india']), region, age: between(c.ages), cohort: c.id, personality: p, requirements: { destination: d, month: m, groupSize: n, budgetPerPerson: b * 1000, days: between(c.tripDays), needs: c.needs, channel: c.channel, currency: c.currency }, message: msg };
  }
  const region = pick(c.regions);
  const pool = ['New Jersey', 'London', 'Toronto', 'Sydney', 'Singapore'].includes(region) ? 'india' : ['Berlin', 'Amsterdam', 'Barcelona', 'Lyon', 'Lisbon', 'Prague'].includes(region) ? 'west' : ['Dubai', 'Abu Dhabi', 'Doha', 'Riyadh', 'Muscat'].includes(region) && c.id === 'gulf-expats' ? pick([ 'india', 'gulf' ]) : ['Bali', 'Chiang Mai', 'Tbilisi', 'Lisbon'].includes(region) ? 'nomad' : 'india';
  const n = between(c.groupSize), b = Math.round(between(c.budget) / 1000), d = pick(DEST), m = pick(MONTHS);
  const p = {}; for (const [k, v] of Object.entries(c.personality)) p[k] = Math.max(0, Math.min(1, +(v + (rnd() - 0.5) * 0.3).toFixed(2)));
  const msg = pick(TEMPLATES[c.id]).replace(/{n}/g, n).replace(/{b}/g, b).replace(/{d}/g, d).replace(/{m}/g, m).replace(/{r}/g, region);
  return { name: pick(NAMES[pool]), region, age: between(c.ages), cohort: c.id, personality: p, requirements: { destination: d, month: m, groupSize: n, budgetPerPerson: b * 1000, days: between(c.tripDays), needs: c.needs, channel: c.channel }, message: msg };
}

const count = arg('count', 1200);
const customers = [];
for (let i = 0; i < count; i++) customers.push(person(COHORTS[i % COHORTS.length]));

// --- Conversations: how each enquiry played out. Outcomes follow the clan's own rules (reply speed, tone, triggers,
// objection handling, price vs budget, follow-ups, social proof) with noise, so the conversion model has something true to learn.
const OBJ_REPLIES = { 'price per person': 'We can split the advance and the balance, and the price includes stay, transport and food.', safety: 'Every departure has a trained leader, a doctor on call and verified reviews from past travelers.', food: 'Veg and Jain meals are arranged at every stop.', 'hidden costs': 'The price is all-inclusive; the only extras are personal shopping.', 'exam dates': 'We have departures right after the exam week.', 'parents permission': 'We can speak to parents on a call and share the safety plan.', 'leave approval': 'This departure is on a long weekend, two days of leave are enough.', 'crowded group trips': 'This is a private trip, no group.', 'international payment': 'We accept international cards and send an invoice.', 'time zones': 'We will do a video call at a time that suits you.', connectivity: 'The stay has 100 Mbps wifi, tested weekly.', 'approval cycle': 'The itemised quote and GST invoice are ready for your approval.', altitude: 'The itinerary includes acclimatisation days and a doctor on call.', health: 'The pace is easy with minimal walking and medical support.' };
function conversation(cu, i) {
  const c = get(cu.cohort);
  const firstReplyMinutes = pick([3, 6, 9, 15, 40, 90, 300, 1500, 3000]);
  const toneMatched = rnd() < 0.6;
  const triggerUsed = rnd() < 0.7 ? pick(c.triggers) : null;
  const objection = rnd() < 0.75 ? pick(c.objections) : null;
  const objectionAnswered = objection ? rnd() < 0.6 : true;
  const priceVsBudget = +(0.7 + rnd() * 0.8).toFixed(2);
  const followUps = pick([0, 0, 1, 1, 2, 3]);
  const socialProof = rnd() < 0.5;
  // The truth the model should discover:
  let p = 0.08;
  p += firstReplyMinutes <= 10 ? 0.25 : firstReplyMinutes <= 60 ? 0.12 : firstReplyMinutes <= 1440 ? 0.03 : -0.05;
  p += toneMatched ? 0.12 : -0.05;
  p += triggerUsed ? 0.08 : 0;
  p += objection ? (objectionAnswered ? 0.05 : -0.15) : 0.05;
  p += priceVsBudget < 0.9 ? 0.12 : priceVsBudget <= 1.1 ? 0.05 : priceVsBudget <= 1.3 ? -0.1 : -0.25;
  p += followUps === 1 ? 0.06 : followUps === 2 ? 0.08 : followUps === 3 ? 0.04 : 0;
  p += socialProof ? 0.1 : 0;
  p += { honeymooners: 0.08, 'luxury-couples': 0.05, 'college-groups': -0.06, 'corporate-offsites': -0.04 }[cu.cohort] || 0;
  const booked = rnd() < Math.max(0.02, Math.min(0.95, p));
  const outcome = booked ? 'booked' : objection && !objectionAnswered ? 'ghosted' : followUps === 0 ? 'ghosted' : 'lost';
  const turns = [{ who: 'lead', text: cu.message }];
  turns.push({ who: 'clan', minutesLater: firstReplyMinutes, text: `${toneMatched ? 'Great to hear from you!' : 'Hello.'} ${triggerUsed ? `Worth knowing: ${triggerUsed}. ` : ''}Could you share your dates and group size?` });
  turns.push({ who: 'lead', text: `${cu.requirements.month}, ${cu.requirements.groupSize} of us. What is the price?` });
  turns.push({ who: 'clan', text: `${Math.round(cu.requirements.budgetPerPerson * priceVsBudget / 100) * 100} per person, all inclusive.${socialProof ? ' Here are photos and reviews from last month\'s group.' : ''}` });
  if (objection) { turns.push({ who: 'lead', text: `Hmm, ${objection}?` }); turns.push({ who: 'clan', text: objectionAnswered ? (OBJ_REPLIES[objection] || `About ${objection}: we have it covered, here are the details.`) : 'Let me know if you want to book.' }); }
  for (let k = 0; k < followUps; k++) turns.push({ who: 'clan', minutesLater: [1440, 4320, 10080][k], text: ['Just checking if you had a chance to look at the plan.', 'Seats are filling for these dates, shall I hold two for you?', 'If the dates do not work, we have another departure the following week.'][k] });
  turns.push({ who: 'lead', text: booked ? 'Okay, sending the advance now.' : outcome === 'ghosted' ? '' : 'We decided to go with someone else, thanks.' });
  return { id: 'c' + i, name: cu.name, cohort: cu.cohort, type: c.type || cu.cohort, region: c.region || 'in', firstReplyMinutes, toneMatched, triggerUsed, objection, objectionAnswered, priceVsBudget, followUps, socialProof, outcome, turns };
}
const conversations = customers.map(conversation);
fs.mkdirSync(path.join(__dirname, '..', 'synth'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'synth', 'conversations.json'), JSON.stringify({ generated: new Date().toISOString(), conversations }));
const booked = conversations.filter(c => c.outcome === 'booked').length;
console.log(`${conversations.length} conversations, ${booked} booked (${Math.round(100 * booked / conversations.length)}%), ${conversations.filter(c => c.outcome === 'ghosted').length} ghosted`);
fs.mkdirSync(path.join(__dirname, '..', 'synth'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'synth', 'customers.json'), JSON.stringify({ generated: new Date().toISOString(), seed: arg('seed', 7), cohorts: COHORTS.map(c => c.id), customers }, null, 1));
fs.writeFileSync(path.join(__dirname, '..', 'curriculum', '06-customer-cohorts.md'), '# Lesson 6: Customer cohorts around the globe\n\n' + lessons().join('\n') + '\n');
console.log(`${customers.length} synthetic customers across ${COHORTS.length} cohorts → synth/customers.json; ${lessons().length} cohort facts → curriculum/06-customer-cohorts.md`);
