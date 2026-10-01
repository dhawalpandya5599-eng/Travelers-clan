#!/usr/bin/env node
'use strict';
/** node scripts/synth-journeys.js [--count 4000] [--seed 11]  → synth/journeys.json (people, transcripts, actions, outcomes). */
const fs = require('fs'); const path = require('path');
const J = require('../core/journeys'); const { COHORTS } = require('../core/cohorts');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? +process.argv[i + 1] : d; };
J.setSeed(arg('seed', 11));
const count = arg('count', 4000);
const journeys = [];
for (let i = 0; i < count; i++) journeys.push(J.journey(J.person(COHORTS[i % COHORTS.length])));
fs.mkdirSync(path.join(__dirname, '..', 'synth'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'synth', 'journeys.json'), JSON.stringify({ generated: new Date().toISOString(), count, journeys }));
const booked = journeys.filter(j => j.outcome === 'booked').length, trav = journeys.filter(j => j.travelled).length, ref = journeys.filter(j => j.referred).length;
console.log(`${count} journeys: ${booked} booked (${Math.round(100 * booked / count)}%), ${trav} travelled, ${journeys.filter(j => j.reviewed).length} reviewed, ${ref} referred, revenue ${journeys.reduce((a, j) => a + (j.currency === 'INR' ? j.revenue : 0), 0).toLocaleString('en-IN')} INR`);
