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
// Absorb the mind shipped in the repo (trained elsewhere) once per version: git pull = smarter, never dumber.
const SEED = path.join(__dirname, 'mind', 'state.json');
const absorbed = brain.absorbSeed(SEED);
if (absorbed) console.log(`ATLAS absorbed mind/state.json: facts ${absorbed.before.facts}→${absorbed.after.facts}, generation ${absorbed.before.generation}→${absorbed.after.generation}.`);
// Snapshot the live mind back into the repo folder so it can be committed and shared (ATLAS_SNAPSHOT=0 disables).
function snapshot() {
  if (process.env.ATLAS_SNAPSHOT === '0') return;
  try { fs.mkdirSync(path.dirname(SEED), { recursive: true }); brain.saveNow(); fs.copyFileSync(brain.file, SEED); brain.absorbedSeeds.push(require('./core/text').hash(fs.readFileSync(SEED, 'utf8'))); } catch (e) { console.error('snapshot failed:', e.message); }
}
if (studied) console.log(`ATLAS studied ${studied} new curriculum sentences.`);
let lastUpbringing = Date.now();

// Heartbeat: a minute of wall-clock = a minute of brain time. Sleep every ~30 interactions or 20 min; evolve every hour.
let lastSleep = Date.now(), lastEvolve = Date.now(), sinceSleep = 0;
setInterval(async () => {
  brain.tick(1 / 60);
  if (sinceSleep >= 30 || Date.now() - lastSleep > 20 * 60e3) { sinceSleep = 0; lastSleep = Date.now(); await brain.sleep(); }
  if (Date.now() - lastEvolve > 60 * 60e3) { lastEvolve = Date.now(); brain.evolve(1); }
  if (Date.now() - (brain.autopilot.state.lastRun || 0) > 30 * 60e3) brain.autopilot.run().catch(() => {});
  // The growing loop: once a day the local server raises itself and snapshots the result (ATLAS_UPBRINGING_HOURS to tune).
  if (Date.now() - lastUpbringing > (+process.env.ATLAS_UPBRINGING_HOURS || 24) * 3600e3) { lastUpbringing = Date.now(); await brain.upbringing({ generations: 5 }); snapshot(); }
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
  'POST /api/council': async (q, body) => brain.council.handle({ conversation: String(body.conversation || body.message || ''), name: body.name || '' }),
  'POST /api/council/review': async (q, body) => brain.council.review({ message: String(body.text || body.message || '') }),
  'POST /api/council/ask': async (q, body) => brain.council.ask(String(body.agent || 'critic'), { conversation: String(body.text || ''), message: String(body.text || '') }),
  'POST /api/news': async (q, body) => { const added = brain.risk.ingest(String(body.text || ''), body.source || 'chief'); for (const i of added) brain.teach(`${i.where} has a ${i.severity} travel risk: ${i.headline}.`, { source: 'news', importance: 0.8 }); brain.save(); return { added }; },
  'GET /api/news': async () => ({ updated: brain.risk.updated, items: brain.risk.items.slice(-100) }),
  'POST /api/import/mind': async (q, body) => brain.absorb(body.state || body, { source: body.source || 'upload' }),
  'POST /api/upbringing': async (q, body) => { const r = await brain.upbringing({ generations: Math.min(50, +body.generations || 5) }); snapshot(); return r; },
  'POST /api/snapshot': async () => { snapshot(); return { ok: true, file: SEED }; },
  'POST /api/sleep': async () => brain.sleep(),
  'POST /api/evolve': async (q, body) => brain.evolve(Math.min(50, Math.max(1, +body.generations || 1))),
  'POST /api/grow': async () => (await brain.growSkill()) || { ok: false, reason: brain.mentor.enabled ? 'not enough unanswered questions yet' : 'mentor disabled: ' + brain.mentor.lastError },
  'GET /api/autopilot': async () => ({ pending: await brain.autopilot.run(), kpis: brain.autopilot.kpis(), auto: brain.autopilot.state.auto, outbox: brain.autopilot.outbox().length, recent: brain.autopilot.state.proposals.filter(p => p.status !== 'pending').slice(0, 20) }),
  'POST /api/autopilot/approve': async (q, body) => brain.autopilot.approve(body.id) || { error: 'no such proposal' },
  'POST /api/autopilot/dismiss': async (q, body) => brain.autopilot.dismiss(body.id, body.reason || '') || { error: 'no such proposal' },
  'POST /api/autopilot/auto': async (q, body) => brain.autopilot.setAuto(String(body.kind || 'follow_up'), !!body.on),
  'GET /api/outbox': async () => brain.autopilot.outbox(),
  'POST /api/outbox/sent': async (q, body) => brain.autopilot.sent(body.id, !!body.ok, body.error) || { error: 'no such message' },
  'POST /api/connections/leads-csv': async (q, body) => require('./core/connections').importLeadsCSV(brain.growth, String(body.text || ''), { source: body.source || 'csv' }),
  'GET /api/connections/leads.csv': async () => ({ __raw: require('./core/connections').leadsCSV(brain.growth), type: 'text/csv' }),
  'GET /api/connections/trips.ics': async () => ({ __raw: require('./core/connections').tripsICS(brain.growth), type: 'text/calendar' }),
  'POST /api/webhooks/lead': async (q, body) => require('./core/connections').webhookLead(brain.growth, body),
  'GET /api/universe': async () => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'synth', 'universe-report.json'), 'utf8')); } catch { return { error: 'not run yet: npm run universe' }; } },
  'POST /api/agent': async (q, body) => brain.agent.run(String(body.request || body.text || '')),
  'POST /api/agent/correct': async (q, body) => brain.agent.correct(body.id, body.correction) || { error: 'no such run' },
  'POST /api/agent/approve': async (q, body) => brain.agent.approve(body.id) || { error: 'no such run' },
  'GET /api/agent/log': async () => brain.agent.log.slice(-30),
  'GET /api/growth': async () => brain.growth.overview(),
  'POST /api/growth/profile': async (q, body) => brain.growth.setProfile(body || {}),
  'POST /api/growth/settings': async (q, body) => { Object.assign(brain.growth.state.settings, body || {}); brain.growth.save(); return brain.growth.state.settings; },
  'GET /api/growth/gbp': async () => ({ ...brain.growth.gbpAudit(), posts: await brain.growth.gbpPosts() }),
  'POST /api/growth/review': async (q, body) => brain.growth.reviewReply(String(body.text || ''), +body.stars || 5, body.name || ''),
  'POST /api/growth/chat': async (q, body) => brain.growth.chat({ id: body.id, name: body.name, text: String(body.text || body.message || ''), source: body.source || 'web' }),
  'GET /api/growth/leads': async () => brain.growth.state.leads.slice().sort((a, b) => a.next - b.next),
  'POST /api/growth/leads': async (q, body) => body.id && brain.growth.state.leads.some(l => l.id === body.id) ? brain.growth.updateLead(body.id, body) : brain.growth.addLead(body || {}),
  'GET /api/growth/today': async () => brain.growth.today(),
  'GET /api/growth/campaigns': async () => ({ campaigns: brain.growth.campaigns(), ...(await brain.growth.broadcasts()) }),
  'GET /api/growth/digest': async () => brain.growth.digest(),
  'GET /api/growth/content': async () => brain.growth.content(),
  'GET /api/growth/roi': async (q) => brain.growth.roi({ adSpend: +q.get('adSpend') || 0 }),
  'POST /atlas-chat/chat': async (q, body) => brain.growth.chat({ id: String(body.id || '').slice(0, 40), name: String(body.name || '').slice(0, 60), text: String(body.text || '').slice(0, 1000), source: 'web' }),
  'GET /atlas-chat/profile': async () => { const P = brain.growth.profile; return { name: P.name, phone: P.phone, waLink: brain.growth.waLink('Hi, I want to know about your upcoming trips'), trips: brain.growth.upcoming(6).map(t => ({ name: t.name, date: t.date, days: t.days, price: t.price, seatsLeft: brain.growth.seatsLeft(t), from: t.from })) }; },
  'GET /api/growth/thread': async (q) => brain.growth.thread(q.get('id') || ''),
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
    try { const out = await handler(url.searchParams, req.method === 'POST' ? await readBody(req) : {}); if (out && out.__raw != null) { res.writeHead(200, { 'Content-Type': out.type + '; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(out.__raw); } json(res, 200, out); }
    catch (e) { json(res, 400, { error: e.message }); }
    return;
  }
  if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'not found' });
  // Static files.
  let file = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/atlas-chat\//, '/')));
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
