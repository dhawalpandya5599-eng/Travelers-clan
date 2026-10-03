#!/usr/bin/env node
'use strict';
/**
 * release.js — the gate before anything goes live. Runs every check, rebuilds the web bundle, writes a release
 * archive, and prints the deploy steps. Nothing is pushed or uploaded by this script.
 *   npm run release        (add --quick to skip the slow suites)
 */
const { execSync } = require('child_process'); const path = require('path'); const fs = require('fs');
const root = path.join(__dirname, '..'); const quick = process.argv.includes('--quick');
const steps = [['Unit tests', 'npm test --silent'], ['Eval', 'node scripts/eval.js'], ['Levels 1 to 11', 'node scripts/levels.js'], ['Paraphrases', 'node scripts/paraphrase.js']].concat(quick ? [] : [['Stress', 'node scripts/stress.js --n 200'], ['Customer universe', 'node scripts/universe.js --n 300'], ['Browser smoke', 'node scripts/smoke.js']]).concat([['Web bundle', 'node scripts/build-web.js']]);
const t0 = Date.now(); const results = [];
for (const [name, cmd] of steps) {
  const s = Date.now(); let ok = true, out = '';
  try { out = execSync(cmd, { cwd: root, env: { ...process.env, ATLAS_NO_OLLAMA: '1' }, stdio: 'pipe', timeout: 900000 }).toString(); } catch (e) { ok = false; out = (e.stdout || '').toString() + (e.stderr || '').toString(); }
  const last = out.trim().split('\n').filter(l => !l.startsWith('[')).slice(-1)[0] || ''; results.push({ name, ok, last, ms: Date.now() - s });
  console.log(`${ok ? '✓' : '✗'} ${name} (${Math.round((Date.now() - s) / 1000)}s): ${last.slice(0, 120)}`);
  if (!ok) { console.log(out.split('\n').filter(l => /✗|FAIL|Error|not ok/.test(l)).slice(0, 12).join('\n')); }
}
const failed = results.filter(r => !r.ok);
let sha = ''; try { sha = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch { /* no git */ }
if (!failed.length) {
  try { fs.mkdirSync(path.join(root, 'dist'), { recursive: true }); execSync(`git archive --format=zip -o dist/oye-release${sha ? '-' + sha : ''}.zip HEAD`, { cwd: root }); console.log(`✓ Release archive: dist/oye-release${sha ? '-' + sha : ''}.zip`); } catch { console.log('  (no git archive: not a git checkout)'); }
}
fs.writeFileSync(path.join(root, 'synth', 'release.json'), JSON.stringify({ at: new Date().toISOString(), sha, ok: !failed.length, results }, null, 1));
console.log(`\n${failed.length ? 'RELEASE BLOCKED: ' + failed.map(f => f.name).join(', ') : 'RELEASE READY'} · ${Math.round((Date.now() - t0) / 1000)}s${sha ? ' · ' + sha : ''}`);
if (!failed.length) console.log('Deploy: git push, then on the PC with the site: node scripts\\integrate-site.js "C:\\Downloads\\tcnodedeploy" --zip --force, upload the zip in hPanel. Dashboard: /admin/atlas. Widget: <script src="/atlas-chat/widget.js" data-base="/atlas-chat"></script>');
process.exit(failed.length ? 2 : 0);
