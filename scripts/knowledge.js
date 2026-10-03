#!/usr/bin/env node
'use strict';
/** knowledge.js — what OYE knows per destination and where the gaps are. node scripts/knowledge.js */
const DEST = require('../core/destinations'); const RT = require('../core/routing'); const LC = require('../core/local'); const { VisaDesk } = require('../core/visa');
const V = new VisaDesk(null, { dataDir: require('os').tmpdir() });
const rows = Object.values(DEST.DESTINATIONS).map(d => { const acts = DEST.activitiesFor ? (DEST.activitiesFor(d.name) || []).length : 0; return { name: d.name, country: d.country, route: !!RT.route(d.name), local: !!LC.place(d.name), visa: !!V.rule(d.name), activities: acts, seniors: !!d.seniors }; });
const intl = rows.filter(r => r.country !== 'India'); const dom = rows.filter(r => r.country === 'India');
const pct = (arr, k) => arr.length ? Math.round(100 * arr.filter(r => r[k]).length / arr.length) : 0;
console.log(`Destinations: ${rows.length} (${dom.length} India, ${intl.length} international)`);
for (const [label, arr] of [['India', dom], ['International', intl]]) console.log(`${label}: route ${pct(arr, 'route')}% · local ${pct(arr, 'local')}% · visa/permit ${pct(arr, 'visa')}% · activities ${Math.round(100 * arr.filter(r => r.activities).length / arr.length)}%`);
const gaps = rows.filter(r => !r.route || !r.local || !r.activities).map(r => `${r.name}: ${[!r.route && 'route', !r.local && 'local', !r.activities && 'activities'].filter(Boolean).join(', ')}`);
console.log(`Gaps (${gaps.length}):`); for (const g of gaps) console.log('  ' + g);
console.log(`Routes ${Object.keys(RT.ROUTES).length} · local places ${Object.keys(LC.KB).length} · visa rules ${Object.keys(require('../core/visa').KB).length} · lessons ${require('fs').readdirSync(require('path').join(__dirname, '..', 'curriculum')).length}`);
