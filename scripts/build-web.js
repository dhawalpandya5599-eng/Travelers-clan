#!/usr/bin/env node
'use strict';
/**
 * build-web.js — bundles ATLAS into one self-contained HTML page that runs the whole brain
 * in the browser: no server, no install. The mind persists in the viewer's browser storage,
 * and when the page is published as a claude.ai artifact, Claude becomes the mentor through the
 * page's "sample" capability.
 *   node scripts/build-web.js  →  dist/atlas-web.html
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const modules = ['text', 'memory', 'learning', 'skills', 'evolution', 'mentor', 'merge', 'reason', 'cohorts', 'conversion', 'journeys', 'funnel', 'destinations', 'risk', 'agents', 'council', 'growth', 'agent', 'importers', 'brain'];
const curriculum = fs.readdirSync(path.join(root, 'curriculum')).filter(f => /\.(md|txt)$/.test(f)).sort()
  .map(f => [f, read('curriculum/' + f)]);

const stateFile = [process.env.ATLAS_DATA && path.join(process.env.ATLAS_DATA, 'state.json'), path.join(root, 'mind', 'state.json'), path.join(root, 'data', 'state.json')].filter(Boolean).find(f => fs.existsSync(f));
const pretrained = stateFile ? fs.readFileSync(stateFile, 'utf8') : null;
if (stateFile) console.log('embedding mind from', path.relative(root, stateFile));
const shims = `
var process = { env: {} };
var __modules = {};
var __cache = {};
function __require(name) {
  if (__cache[name]) return __cache[name].exports;
  var factory = __modules[name];
  if (!factory) throw new Error('module not found: ' + name);
  var module = { exports: {} };
  __cache[name] = module;
  factory(module, module.exports, __require, '/atlas/core');
  return module.exports;
}
// --- Node shims ---
__modules['path'] = function (m) { m.exports = { join: function () { return Array.prototype.slice.call(arguments).join('/').replace(/\\/+/g, '/'); }, extname: function (p) { var i = p.lastIndexOf('.'); return i < 0 ? '' : p.slice(i); }, basename: function (p) { return p.split('/').pop(); }, dirname: function (p) { return p.split('/').slice(0, -1).join('/') || '/'; } }; };
__modules['events'] = function (m) {
  function EE() { this._l = {}; }
  EE.prototype.on = function (k, f) { (this._l[k] = this._l[k] || []).push(f); return this; };
  EE.prototype.emit = function (k) { var a = Array.prototype.slice.call(arguments, 1); (this._l[k] || []).forEach(function (f) { try { f.apply(null, a); } catch (e) { console.error(e); } }); return true; };
  m.exports = EE;
};
__modules['vm'] = function (m) {
  function Script(code) { this.code = code; }
  Script.prototype.runInContext = function (ctx) { var keys = Object.keys(ctx); return new Function(keys.join(','), this.code).apply(null, keys.map(function (k) { return ctx[k]; })); };
  m.exports = { Script: Script, createContext: function (c) { return c; }, runInNewContext: function (code) { return new Function('"use strict"; return (' + code + ')')(); } };
};
__modules['@anthropic-ai/sdk'] = function () { throw new Error('no sdk in browser'); };
// A tiny file system over browser storage: state.json lives in localStorage, curriculum is embedded.
// PRETRAINED is the mind as raised by the parent at build time; a fresh browser starts from it.
var PRETRAINED = ${JSON.stringify(pretrained)};
var CURRICULUM = ${JSON.stringify(Object.fromEntries(curriculum))};
__modules['fs'] = function (m) {
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del: function (k) { try { localStorage.removeItem(k); } catch (e) {} } };
  var isCurr = function (p) { return /\\/curriculum\\b/.test(p); };
  m.exports = {
    existsSync: function (p) { if (isCurr(p)) return true; if (store.get(p) == null && PRETRAINED && /state\\.json$/.test(p)) store.set(p, PRETRAINED); return store.get(p) != null; },
    readFileSync: function (p) { if (isCurr(p)) { var f = p.split('/').pop(); if (!(f in CURRICULUM)) throw new Error('ENOENT'); return CURRICULUM[f]; } var v = store.get(p); if (v == null) throw new Error('ENOENT ' + p); return v; },
    writeFileSync: function (p, v) { store.set(p, String(v)); },
    renameSync: function (a, b) { var v = store.get(a); if (v != null) { store.set(b, v); store.del(a); } },
    unlinkSync: function (p) { store.del(p); },
    mkdirSync: function () {},
    readdirSync: function (p) { return isCurr(p) ? Object.keys(CURRICULUM) : []; },
  };
};
`;

const wrapped = modules.map(name => `__modules['./${name}'] = function (module, exports, require, __dirname) {\n${read('core/' + name + '.js')}\n};`).join('\n');

const glue = `
// --- Boot the brain inside the page and expose a request() that mirrors the server API ---
(function () {
  var Brain = __require('./brain').Brain;
  var importWhatsApp = __require('./importers').importWhatsApp;
  var brain = new Brain({ dataDir: '/atlas/data' });
  brain.studyCurriculum('/atlas/curriculum');
  var listeners = [];
  brain.on('event', function (e) { listeners.forEach(function (f) { f(e); }); });

  // Claude as mentor, through the artifact's "sample" capability (null outside claude.ai or when declined).
  var samplePromise = (window.claude && window.claude.use) ? window.claude.use('sample').catch(function () { return null; }) : Promise.resolve(null);
  var mentor = { enabled: false, model: 'Claude (via this page)', calls: 0, lastError: 'checking…',
    status: function () { return { enabled: this.enabled, model: this.model, calls: this.calls, lastError: this.lastError }; },
    ask: function (system, user) { var self = this; return samplePromise.then(function (sample) { if (!sample) return null; self.calls++; return sample([{ role: 'user', content: system + '\\n\\n' + user }], { modelTier: 'default', cache: false }).then(function (r) { return r.text; }).catch(function (e) { self.lastError = e && e.message || 'declined'; return null; }); }); },
    answer: function (question, context) {
      var sys = 'You are the mentor of ATLAS, a young learning agent that serves the Travelers Clan, a travel company. Answer the question briefly (max 3 sentences) using the provided memories when relevant. If the memories do not cover it and it is clan-specific, say you do not know yet and suggest what to ask the chief. Then on a new line write FACTS: followed by up to 3 short declarative sentences ATLAS should memorise, each of the form "<subject> is/has/offers <object>".';
      return this.ask(sys, 'Memories:\\n' + context + '\\n\\nQuestion: ' + question).then(function (out) {
        if (!out) return null; var parts = out.split(/\\nFACTS:\\s*/i);
        return { text: parts[0].trim(), facts: parts[1] ? parts[1].split(/\\n+/).map(function (s) { return s.replace(/^[-*\\d.\\s]+/, '').trim(); }).filter(Boolean) : [] };
      });
    },
    reflect: function (eps) {
      var sys = 'You are the mentor of ATLAS, a learning agent for the Travelers Clan. Read the recent conversation log and extract the durable knowledge in it as 3-8 short declarative sentences ("X is Y", "X offers Y"). Skip pleasantries. Output one sentence per line, nothing else.';
      return this.ask(sys, eps.map(function (e) { return '[' + e.role + '] ' + e.text; }).join('\\n')).then(function (out) { return out ? out.split(/\\n+/).map(function (s) { return s.replace(/^[-*\\d.\\s]+/, '').trim(); }).filter(function (s) { return s.length > 8; }) : []; });
    },
    synthesizeSkill: function (need, examples) {
      var sys = 'You write small JavaScript skills for ATLAS. A skill is a CommonJS module that sets module.exports = { match, run }. match(input) returns null when the skill does not apply, else an args value. run(args, input) returns a string. No require, no IO, no async, pure functions only. Respond with JSON only: {"name": "kebab-case", "description": "...", "source": "<module code>", "tests": [{"input": "...", "expect": "<substring of expected output>"}]} with at least 2 tests.';
      return this.ask(sys, 'Need: ' + need + '\\nExample inputs:\\n' + examples.join('\\n')).then(function (out) { if (!out) return null; var m = out.match(/\\{[\\s\\S]*\\}/); try { return m ? JSON.parse(m[0]) : null; } catch (e) { return null; } });
    } };
  samplePromise.then(function (s) { mentor.enabled = !!s; mentor.lastError = s ? null : 'No model yet: open this page on claude.ai, or load the open-source model below.'; });
  // Optional in-browser open-source model (WebLLM, runs on your GPU/CPU, no server, no key). Loaded on demand because the
  // weights are ~0.7 GB; it only works where the page may fetch from the web (your website or a local file, not inside claude.ai).
  var webllmEngine = null;
  mentor.loadOpenModel = function (onProgress) {
    var modelId = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
    return import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/+esm').then(function (webllm) {
      return webllm.CreateMLCEngine(modelId, { initProgressCallback: function (p) { if (onProgress) onProgress(p.text || ''); } }).then(function (engine) {
        webllmEngine = engine; mentor.enabled = true; mentor.model = 'webllm/' + modelId; mentor.lastError = null;
        mentor.ask = function (system, user) { mentor.calls++; return engine.chat.completions.create({ messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.3, max_tokens: 400 }).then(function (r) { return (r.choices[0].message.content || '').trim() || null; }).catch(function (e) { mentor.lastError = e.message; return null; }); };
        return mentor.model;
      });
    });
  };
  mentor.json = function (system, user, opts) { return mentor.ask(system + ' Respond with JSON only, no prose, no code fences.', user, opts).then(function (out) { if (!out) return null; var m = out.match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch (e) { return null; } }); };
  brain.mentor = mentor;

  var sinceSleep = 0, lastSleep = Date.now(), lastEvolve = Date.now();
  setInterval(function () { brain.tick(1 / 60); if (sinceSleep >= 30 || Date.now() - lastSleep > 20 * 60e3) { sinceSleep = 0; lastSleep = Date.now(); brain.sleep(); } if (Date.now() - lastEvolve > 60 * 60e3) { lastEvolve = Date.now(); brain.evolve(1); } }, 60e3);

  window.ATLAS_LOCAL = {
    brain: brain,
    onEvent: function (f) { listeners.push(f); f({ t: Date.now(), kind: 'system', text: 'The mind of ATLAS is running inside this page. It remembers in this browser.' }); },
    request: function (method, url, body) {
      body = body || {};
      var u = new URL(url, 'http://local'); var key = method + ' ' + u.pathname;
      return Promise.resolve().then(function () {
        switch (key) {
          case 'GET /api/snapshot': return brain.snapshot();
          case 'GET /api/graph': return brain.memory.graph(+u.searchParams.get('limit') || 120);
          case 'POST /api/chat': sinceSleep++; return brain.respond(body.message, { user: body.user || 'chief' });
          case 'POST /api/feedback': brain.feedback(!!body.good, body.note || ''); return { ok: true, dopamine: brain.memory.dopamine };
          case 'POST /api/teach': return { facts: brain.teach(String(body.text || ''), { source: body.source || 'chief' }) };
          case 'POST /api/import/whatsapp': return importWhatsApp(brain, String(body.text || ''), { staff: String(body.staff || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean) });
          case 'POST /api/council': return brain.council.handle({ conversation: String(body.conversation || body.message || ''), name: body.name || '' });
          case 'POST /api/council/review': return brain.council.review({ message: String(body.text || body.message || '') });
          case 'POST /api/news': { var added = brain.risk.ingest(String(body.text || ''), 'chief'); return { added: added }; }
          case 'POST /api/import/mind': return brain.absorb(body.state || body, { source: body.source || 'upload' });
          case 'POST /api/upbringing': return brain.upbringing({ generations: Math.min(50, +body.generations || 5) });
          case 'POST /api/sleep': return brain.sleep();
          case 'POST /api/evolve': return brain.evolve(Math.min(50, Math.max(1, +body.generations || 1)));
          case 'POST /api/agent': return brain.agent.run(String(body.request || body.text || ''));
          case 'POST /api/agent/correct': return brain.agent.correct(body.id, body.correction) || { error: 'no such run' };
          case 'POST /api/agent/approve': return brain.agent.approve(body.id) || { error: 'no such run' };
          case 'GET /api/growth': return brain.growth.overview();
          case 'POST /api/growth/profile': return brain.growth.setProfile(body || {});
          case 'POST /api/growth/settings': Object.assign(brain.growth.state.settings, body || {}); brain.growth.save(); return brain.growth.state.settings;
          case 'GET /api/growth/gbp': return brain.growth.gbpPosts().then(function (posts) { var a = brain.growth.gbpAudit(); a.posts = posts; return a; });
          case 'POST /api/growth/review': return brain.growth.reviewReply(String(body.text || ''), +body.stars || 5, body.name || '');
          case 'POST /api/growth/chat': return brain.growth.chat({ id: body.id, name: body.name, text: String(body.text || ''), source: body.source || 'web' });
          case 'GET /api/growth/leads': return brain.growth.state.leads.slice().sort(function (a, b) { return a.next - b.next; });
          case 'POST /api/growth/leads': return body.id && brain.growth.state.leads.some(function (l) { return l.id === body.id; }) ? brain.growth.updateLead(body.id, body) : brain.growth.addLead(body || {});
          case 'GET /api/growth/today': return brain.growth.today();
          case 'GET /api/growth/campaigns': return brain.growth.broadcasts().then(function (b) { b.campaigns = brain.growth.campaigns(); return b; });
          case 'GET /api/growth/digest': return brain.growth.digest();
          case 'GET /api/growth/content': return brain.growth.content();
          case 'GET /api/growth/roi': return brain.growth.roi({ adSpend: +u.searchParams.get('adSpend') || 0 });
          case 'POST /api/grow': return brain.growSkill().then(function (s) { return s || { ok: false, reason: brain.mentor.enabled ? 'not enough unanswered questions yet' : brain.mentor.lastError }; });
          default: throw new Error('not found: ' + key);
        }
      }).catch(function (e) { return { error: e.message }; });
    },
    loadOpenModel: function (onProgress) { return mentor.loadOpenModel(onProgress); },
    exportMind: function () {
      brain.saveNow();
      var data = __require('fs').readFileSync('/atlas/data/state.json');
      var dl = (window.claude && window.claude.use) ? window.claude.use('downloads').catch(function () { return null; }) : Promise.resolve(null);
      dl.then(function (d) { if (d) return d.save({ filename: 'atlas-mind.json', data: data }); try { navigator.clipboard.writeText(data); } catch (e) {} });
    },
  };
})();
`;

const html = read('public/index.html');
const body = html.replace(/^[\s\S]*<body>/, '').replace(/<\/body>[\s\S]*$/, '').replace(/<script src="\/app.js"><\/script>/, '')
  .replace(/src="\/logo-mark.png"/g, 'src="data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'public', 'logo-mark.png')).toString('base64') + '"').replace('src="/vendor/three.min.js"', 'src="https://unpkg.com/three@0.160.0/build/three.min.js"').replace('src="/vendor/three-spritetext.min.js"', 'src="https://unpkg.com/three-spritetext@1.8.2/dist/three-spritetext.min.js"').replace('src="/vendor/3d-force-graph.min.js"', 'src="https://unpkg.com/3d-force-graph@1.73.4/dist/3d-force-graph.min.js"');
const css = read('public/style.css').replace(':root {', ':root { color-scheme: dark;');
const page = `<title>ATLAS Clan Mind</title>
<style>${css}
html, body { height: 100%; }
body { padding: 0; }
</style>
${body}
<script>
${shims}
${wrapped}
${glue}
</script>
<script>
${read('public/app.js')}
</script>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'atlas-web.html'), page);
// Standalone build: a complete document you can upload to any website or admin panel as-is.
const standalone = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="robots" content="noindex">\n</head>\n<body>\n${page}\n</body>\n</html>\n`;
fs.writeFileSync(path.join(root, 'dist', 'atlas-standalone.html'), standalone);
console.log(`dist/atlas-web.html: ${(page.length / 1024).toFixed(0)} KB · dist/atlas-standalone.html: ${(standalone.length / 1024).toFixed(0)} KB`);
