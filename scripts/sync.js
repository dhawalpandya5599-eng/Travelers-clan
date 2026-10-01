#!/usr/bin/env node
'use strict';
/**
 * sync.js — fold every copy of the mind into one, and optionally commit it.
 *   node scripts/sync.js                 # merge data/state.json (+ any extra files given) into mind/state.json
 *   node scripts/sync.js --commit        # ...and git commit + push the result
 *   node scripts/sync.js exports/*.json  # merge exported minds from browsers or other servers too
 * Merging is a union: nothing any copy learned is lost.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { mergeMinds, summary } = require('../core/merge');

const root = path.join(__dirname, '..');
const target = path.join(root, 'mind', 'state.json');
const args = process.argv.slice(2);
const commit = args.includes('--commit');
const files = [path.join(root, 'data', 'state.json'), ...args.filter(a => !a.startsWith('--'))].filter(f => fs.existsSync(f));
let state = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : null;
console.log('mind/state.json:', state ? summary(state) : 'none yet');
for (const f of files) {
  const other = JSON.parse(fs.readFileSync(f, 'utf8'));
  state = mergeMinds(state, other);
  console.log('+', path.relative(root, f), summary(other));
}
if (!state) { console.log('nothing to merge'); process.exit(0); }
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(state));
console.log('= merged', summary(state));
if (commit) {
  const s = summary(state);
  execSync(`git add mind/state.json && git commit -m "Sync mind: generation ${s.generation}, ${s.facts} facts" && git push`, { cwd: root, stdio: 'inherit' });
}
