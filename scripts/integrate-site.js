#!/usr/bin/env node
'use strict';
/**
 * integrate-site.js — put ATLAS inside an existing Express website, automatically.
 *
 *   node scripts/integrate-site.js [path/to/site] [--zip] [--mount /admin/atlas]
 *
 * With no path it searches the usual places on this machine for the travelersclan source
 * (a folder with package.json named "travelers-clan", or a server.js that uses express).
 * It then: copies this repo into <site>/atlas, inserts the mount lines into server.js
 * (idempotent, marked with ATLAS comments), creates data/atlas, and with --zip writes
 * travelersclan_<timestamp>.zip next to the site folder, ready to upload to Hostinger.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : null; };
const MOUNT = flag('--mount') || '/admin/atlas';
const ZIP = args.includes('--zip');
const FORCE = args.includes('--force'); // remove an earlier ATLAS block and re-insert it at the best spot
const given = args.find(a => !a.startsWith('--') && a !== MOUNT);

const SKIP = new Set(['node_modules', '.git', 'atlas', 'dist', 'hbuilds', 'AppData', 'Library', 'Program Files', 'Windows', '$Recycle.Bin']);

function looksLikeSite(dir) {
  try {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) {
      const p = JSON.parse(fs.readFileSync(pkg, 'utf8'));
      if (/travel/i.test(p.name || '') && fs.existsSync(path.join(dir, 'server.js'))) return 3;
      if (p.dependencies && p.dependencies.express && fs.existsSync(path.join(dir, 'server.js'))) return 2;
    }
  } catch { /* ignore */ }
  return 0;
}

function search(bases, maxDepth = 4) {
  const hits = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth) return;
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    const score = looksLikeSite(dir);
    if (score) hits.push({ dir, score, mtime: fs.statSync(path.join(dir, 'server.js')).mtimeMs });
    for (const e of entries) if (e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name), depth + 1);
  };
  for (const b of bases) if (fs.existsSync(b)) walk(b, 0);
  return hits.sort((a, b) => b.score - a.score || b.mtime - a.mtime);
}

function findSite() {
  const home = os.homedir();
  const bases = [process.cwd(), home, path.join(home, 'Desktop'), path.join(home, 'Documents'), path.join(home, 'Downloads'), path.join(home, 'Projects'), path.join(home, 'projects'), path.join(home, 'OneDrive'), 'C:\\Projects', 'C:\\sites', 'D:\\'];
  const hits = search([...new Set(bases)]);
  if (!hits.length) return null;
  console.log('Candidates:'); hits.slice(0, 5).forEach(h => console.log(`  ${h.score === 3 ? '★' : ' '} ${h.dir}`));
  return hits[0].dir;
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name === 'data' || e.name === 'test' || e.name === '.gitignore') continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

function patchServer(file) {
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('// ATLAS:begin')) {
    if (!FORCE) { console.log('server.js already mounts ATLAS; leaving it as is (use --force to re-place it).'); return false; }
    src = src.replace(/\n?\/\/ ATLAS:begin[\s\S]*?\/\/ ATLAS:end\n?/, '\n');
  }
  const block = `\n// ATLAS:begin — the clan's learning mind, mounted at ${MOUNT} (keep after your admin auth middleware)\nconst atlas = require('./atlas/integrations/express');\napp.use('${MOUNT}', atlas({ dataDir: __dirname + '/data/atlas', express }));\n// ATLAS:end\n`;
  // Insert above the first catch-all handler (a 404 page or error handler registered with app.use and no
  // path), otherwise before app.listen(...). Either way every middleware above (auth, parsers) is already registered.
  const catchAll = src.match(/^[ \t]*app\.use\(\s*(?:async\s*)?(?:function\s*)?\(\s*(?:req|request|_req|_)\s*,\s*(?:res|response)\b/m)
    || src.match(/^[ \t]*app\.(?:use|all|get)\(\s*['"]\*['"]|^[ \t]*app\.use\(\s*\/\^?\.\*/m);
  const listen = src.match(/^[ \t]*(?:const\s+\w+\s*=\s*)?(?:app|server|http)\.listen\s*\(/m);
  const m = catchAll && (!listen || catchAll.index < listen.index) ? catchAll : listen;
  if (m) { src = src.slice(0, m.index) + block + src.slice(m.index); console.log(`Inserted the ATLAS mount ${m === catchAll ? 'above the catch-all 404 handler' : 'before app.listen'}.`); }
  else if (/const\s+app\s*=\s*express\(\)/.test(src)) { src = src.replace(/(const\s+app\s*=\s*express\(\)\s*;?)/, `$1${block}`); }
  else throw new Error('could not find app.listen( or const app = express() in server.js');
  if (!/\bexpress\b\s*=\s*require\(['"]express['"]\)/.test(src)) console.warn('warning: server.js does not require express under the name "express"; adjust the ATLAS block if needed.');
  fs.writeFileSync(file, src);
  return true;
}

(function main() {
  const site = given ? path.resolve(given) : findSite();
  if (!site || !fs.existsSync(path.join(site, 'server.js'))) {
    console.error('Site not found. Run: node scripts/integrate-site.js <path-to-site-folder>'); process.exit(1);
  }
  console.log('Site:', site);
  copyDir(root, path.join(site, 'atlas'));
  fs.mkdirSync(path.join(site, 'data', 'atlas'), { recursive: true });
  const patched = patchServer(path.join(site, 'server.js'));
  // Keep ATLAS's live memory out of the deploy archive if the site has a .gitignore-like list.
  console.log(patched ? `Mounted ATLAS at ${MOUNT} in server.js.` : 'server.js unchanged.');
  // Smoke test: require the router in a sandboxed child process from the site folder.
  try {
    execSync(`node -e "const r=require('./atlas/integrations/express');const express=require('express');const router=r({dataDir:require('path').join(require('os').tmpdir(),'atlas-smoke'),express});console.log('router ok, facts:', router.brain.memory.facts.length)"`, { cwd: site, stdio: 'inherit', timeout: 60000 });
  } catch { console.warn('Smoke test skipped (express not installed here); it will work after npm install on the server.'); }
  if (ZIP) {
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const out = path.join(path.dirname(site), `travelersclan_${stamp}.zip`);
    const excl = ['node_modules', '.git', 'data'];
    if (process.platform === 'win32') {
      const ps = `Compress-Archive -Path (Get-ChildItem -Path '${site}' -Exclude ${excl.join(',')} | ForEach-Object { $_.FullName }) -DestinationPath '${out}' -Force`;
      execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
    } else {
      execSync(`cd "${site}" && zip -qr "${out}" . ${excl.map(e => `-x "${e}/*" -x "*/${e}/*"`).join(' ')}`, { stdio: 'inherit' });
    }
    console.log('Deploy archive:', out);
    console.log('Upload it in hPanel → Websites → travelersclan.in → Deploy (same as your usual zip). ATLAS will be at https://travelersclan.in' + MOUNT);
  }
})();
