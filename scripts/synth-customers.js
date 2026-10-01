#!/usr/bin/env node
'use strict';
/**
 * synth-customers.js — synthetic customers from around the globe, generated from the cohort model.
 *   node scripts/synth-customers.js [--count 600] [--seed 7]
 * Writes synth/customers.json (people, requirements, first messages, cohort labels) and
 * curriculum/06-customer-cohorts.md (what ATLAS should know about each cohort).
 */
const fs = require('fs');
const path = require('path');
const { COHORTS, lessons } = require('../core/cohorts');

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

function person(c) {
  const region = pick(c.regions);
  const pool = ['New Jersey', 'London', 'Toronto', 'Sydney', 'Singapore'].includes(region) ? 'india' : ['Berlin', 'Amsterdam', 'Barcelona', 'Lyon', 'Lisbon', 'Prague'].includes(region) ? 'west' : ['Dubai', 'Abu Dhabi', 'Doha', 'Riyadh', 'Muscat'].includes(region) && c.id === 'gulf-expats' ? pick([ 'india', 'gulf' ]) : ['Bali', 'Chiang Mai', 'Tbilisi', 'Lisbon'].includes(region) ? 'nomad' : 'india';
  const n = between(c.groupSize), b = Math.round(between(c.budget) / 1000), d = pick(DEST), m = pick(MONTHS);
  const p = {}; for (const [k, v] of Object.entries(c.personality)) p[k] = Math.max(0, Math.min(1, +(v + (rnd() - 0.5) * 0.3).toFixed(2)));
  const msg = pick(TEMPLATES[c.id]).replace(/{n}/g, n).replace(/{b}/g, b).replace(/{d}/g, d).replace(/{m}/g, m).replace(/{r}/g, region);
  return { name: pick(NAMES[pool]), region, age: between(c.ages), cohort: c.id, personality: p, requirements: { destination: d, month: m, groupSize: n, budgetPerPerson: b * 1000, days: between(c.tripDays), needs: c.needs, channel: c.channel }, message: msg };
}

const count = arg('count', 600);
const customers = [];
for (let i = 0; i < count; i++) customers.push(person(COHORTS[i % COHORTS.length]));
fs.mkdirSync(path.join(__dirname, '..', 'synth'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'synth', 'customers.json'), JSON.stringify({ generated: new Date().toISOString(), seed: arg('seed', 7), cohorts: COHORTS.map(c => c.id), customers }, null, 1));
fs.writeFileSync(path.join(__dirname, '..', 'curriculum', '06-customer-cohorts.md'), '# Lesson 6: Customer cohorts around the globe\n\n' + lessons().join('\n') + '\n');
console.log(`${customers.length} synthetic customers across ${COHORTS.length} cohorts → synth/customers.json; ${lessons().length} cohort facts → curriculum/06-customer-cohorts.md`);
