'use strict';
/**
 * server.js — ATLAS web app. Zero dependencies: Node's http module serves the UI and a JSON API,
 * and streams the brain's cognitive events over Server-Sent Events.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Brain } = require('./core/brain');
const { importWhatsApp } = require('./core/importers');

const PORT = +(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');
const brain = new Brain({ dataDir: process.env.ATLAS_DATA || path.join(__dirname, 'data') });
const studied = brain.studyCurriculum(path.join(__dirname, 'curriculum'));
if (studied) console.log(`ATLAS studied ${studied} new curriculum sentences.`);

// Heartbeat: a minute of wall-clock = a minute of brain time. Sleep every ~30 interactions or 20 min; evolve every hour.
let lastSleep = Date.now(), lastEvolve = Date.now(), sinceSleep = 0;
setInterval(async () => {
  brain.tick(1 / 60);
  if (sinceSleep >= 30 || Date.now() - lastSleep > 20 * 60e3) { sinceSleep = 0; lastSleep = Date.now(); await brain.sleep(); }
  if (Date.now() - lastEvolve > 60 * 60e3) { lastEvolve = Date.now(); brain.evolve(1); }
}, 60e3).unref();

const clients = new Set();
brain.on('event', e => { const msg = `data: ${JSON.stringify(e)}\n\n`; for (const res of clients) res.write(msg); });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const routes = {
  'GET /api/snapshot': async () => brain.snapshot(),
  'GET /api/graph': async (q) => brain.memory.graph(+q.get('limit') || 120),
  'GET /api/facts': async () => brain.memory.facts.slice().sort((a, b) => b.t - a.t).slice(0, 300),
  'GET /api/export': async () => JSON.parse(fs.readFileSync(brain.file, 'utf8')),
  'POST /api/chat': async (q, body) => { sinceSleep++; return brain.respond(body.message, { user: body.user || 'chief' }); },
  'POST /api/feedback': async (q, body) => { brain.feedback(!!body.good, body.note || ''); return { ok: true, dopamine: brain.memory.dopamine }; },
  'POST /api/teach': async (q, body) => ({ facts: brain.teach(String(body.text || ''), { source: body.source || 'chief' }) }),
  'POST /api/import/whatsapp': async (q, body) => importWhatsApp(brain, String(body.text || ''), { staff: Array.isArray(body.staff) ? body.staff : String(body.staff || '').split(',').map(x => x.trim()).filter(Boolean) }),
  'POST /api/sleep': async () => brain.sleep(),
  'POST /api/evolve': async (q, body) => brain.evolve(Math.min(50, Math.max(1, +body.generations || 1))),
  'POST /api/grow': async () => (await brain.growSkill()) || { ok: false, reason: brain.mentor.enabled ? 'not enough unanswered questions yet' : 'mentor disabled: ' + brain.mentor.lastError },
  'POST /api/reset': async (q, body) => {
    if (body.confirm !== 'RESET') return { ok: false, reason: 'send {"confirm":"RESET"}' };
    try { fs.unlinkSync(brain.file); } catch { /* none */ }
    const fresh = new Brain({ dataDir: brain.dataDir });
    Object.assign(brain, { memory: fresh.memory, evolution: fresh.evolution, skills: fresh.skills, born: Date.now(), interactions: 0, lessonsLearned: 0, unknowns: [], pendingQuestion: null, log: [] });
    brain.studyCurriculum(path.join(__dirname, 'curriculum'));
    brain.event('system', 'Mind reset to a newborn state and curriculum re-read.');
    return { ok: true };
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify({ t: Date.now(), kind: 'system', text: 'Connected to the mind of ATLAS.' })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  const handler = routes[`${req.method} ${url.pathname}`];
  if (handler) {
    try { json(res, 200, await handler(url.searchParams, req.method === 'POST' ? await readBody(req) : {})); }
    catch (e) { json(res, 400, { error: e.message }); }
    return;
  }
  if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'not found' });
  // Static files.
  let file = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`ATLAS is awake at http://localhost:${PORT}  (mentor: ${brain.mentor.enabled ? brain.mentor.status().model : 'offline — ' + brain.mentor.lastError})`));
  const bye = () => { brain.saveNow(); process.exit(0); };
  process.on('SIGINT', bye); process.on('SIGTERM', bye);
}

module.exports = { server, brain };
