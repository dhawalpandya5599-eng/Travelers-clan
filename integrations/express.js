'use strict';
/**
 * integrations/express.js — mount ATLAS inside an existing Express site in two lines:
 *
 *   const atlas = require('./atlas/integrations/express');
 *   app.use('/admin/atlas', atlas({ dataDir: __dirname + '/data/atlas' }));
 *
 * Serves the dashboard UI, the JSON API and the live event stream under that prefix.
 * Protect the prefix with your admin auth middleware (e.g. app.use('/admin', requireAdmin)).
 * Requires only Express (any 4.x/5.x) and Node 18+.
 */
const fs = require('fs');
const path = require('path');
const { Brain } = require('../core/brain');
const { importWhatsApp } = require('../core/importers');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

module.exports = function atlasRouter({ dataDir = path.join(ROOT, 'data'), express = require('express'), seedFrom = path.join(ROOT, 'mind', 'state.json') } = {}) {
  // First boot: start from the mind the parent trained, if present.
  const stateFile = path.join(dataDir, 'state.json');
  if (!fs.existsSync(stateFile) && fs.existsSync(seedFrom)) { fs.mkdirSync(dataDir, { recursive: true }); fs.copyFileSync(seedFrom, stateFile); }
  const brain = new Brain({ dataDir });
  brain.studyCurriculum(path.join(ROOT, 'curriculum'));
  brain.absorbSeed(seedFrom); // a newer trained mind in the folder is merged in, never replacing local learning

  let sinceSleep = 0, lastSleep = Date.now(), lastEvolve = Date.now(), lastUp = Date.now();
  setInterval(async () => {
    brain.tick(1 / 60);
    if (sinceSleep >= 30 || Date.now() - lastSleep > 20 * 60e3) { sinceSleep = 0; lastSleep = Date.now(); await brain.sleep(); }
    if (Date.now() - lastEvolve > 60 * 60e3) { lastEvolve = Date.now(); brain.evolve(1); }
    if (Date.now() - lastUp > 24 * 3600e3) { lastUp = Date.now(); await brain.upbringing({ generations: 5 }); }
  }, 60e3).unref();

  const router = express.Router();
  router.use(express.json({ limit: '2mb' }));
  const clients = new Set();
  brain.on('event', e => { const msg = `data: ${JSON.stringify(e)}\n\n`; for (const res of clients) res.write(msg); });

  const wrap = fn => async (req, res) => { try { res.json(await fn(req)); } catch (e) { res.status(400).json({ error: e.message }); } };
  router.get('/api/snapshot', wrap(() => brain.snapshot()));
  router.get('/api/graph', wrap(req => brain.memory.graph(+req.query.limit || 120)));
  router.get('/api/facts', wrap(() => brain.memory.facts.slice().sort((a, b) => b.t - a.t).slice(0, 300)));
  router.get('/api/export', (req, res) => { brain.saveNow(); res.download(stateFile, 'atlas-mind.json'); });
  router.post('/api/chat', wrap(req => { sinceSleep++; return brain.respond(req.body.message, { user: req.body.user || 'admin' }); }));
  router.post('/api/feedback', wrap(req => { brain.feedback(!!req.body.good, req.body.note || ''); return { ok: true, dopamine: brain.memory.dopamine }; }));
  router.post('/api/teach', wrap(req => ({ facts: brain.teach(String(req.body.text || ''), { source: req.body.source || 'admin' }) })));
  router.post('/api/import/whatsapp', wrap(req => importWhatsApp(brain, String(req.body.text || ''), { staff: String(req.body.staff || '').split(',').map(s => s.trim()).filter(Boolean) })));
  router.post('/api/council', wrap(req => brain.council.handle({ conversation: String(req.body.conversation || req.body.message || ''), name: req.body.name || '' })));
  router.post('/api/council/review', wrap(req => brain.council.review({ message: String(req.body.text || req.body.message || '') })));
  router.post('/api/news', wrap(req => { const added = brain.risk.ingest(String(req.body.text || ''), 'admin'); for (const i of added) brain.teach(`${i.where} has a ${i.severity} travel risk: ${i.headline}.`, { source: 'news', importance: 0.8 }); return { added }; }));
  router.post('/api/import/mind', wrap(req => brain.absorb(req.body.state || req.body, { source: req.body.source || 'upload' })));
  router.post('/api/upbringing', wrap(req => brain.upbringing({ generations: Math.min(50, +req.body.generations || 5) })));
  router.post('/api/sleep', wrap(() => brain.sleep()));
  router.post('/api/evolve', wrap(req => brain.evolve(Math.min(50, Math.max(1, +req.body.generations || 1)))));
  router.post('/api/grow', wrap(async () => (await brain.growSkill()) || { ok: false, reason: brain.mentor.enabled ? 'not enough unanswered questions yet' : 'mentor disabled: ' + brain.mentor.lastError }));
  router.get('/api/growth', wrap(() => brain.growth.overview()));
  router.post('/api/growth/profile', wrap(req => brain.growth.setProfile(req.body || {})));
  router.post('/api/growth/settings', wrap(req => { Object.assign(brain.growth.state.settings, req.body || {}); brain.growth.save(); return brain.growth.state.settings; }));
  router.get('/api/growth/gbp', wrap(async () => ({ ...brain.growth.gbpAudit(), posts: await brain.growth.gbpPosts() })));
  router.post('/api/growth/review', wrap(req => brain.growth.reviewReply(String(req.body.text || ''), +req.body.stars || 5, req.body.name || '')));
  router.post('/api/growth/chat', wrap(req => brain.growth.chat({ id: req.body.id, name: req.body.name, text: String(req.body.text || req.body.message || ''), source: req.body.source || 'web' })));
  router.get('/api/growth/leads', wrap(() => brain.growth.state.leads.slice().sort((a, b) => a.next - b.next)));
  router.post('/api/growth/leads', wrap(req => req.body.id && brain.growth.state.leads.some(l => l.id === req.body.id) ? brain.growth.updateLead(req.body.id, req.body) : brain.growth.addLead(req.body || {})));
  router.get('/api/growth/today', wrap(() => brain.growth.today()));
  router.get('/api/growth/campaigns', wrap(async () => ({ campaigns: brain.growth.campaigns(), ...(await brain.growth.broadcasts()) })));
  router.get('/api/growth/roi', wrap(req => brain.growth.roi({ adSpend: +req.query.adSpend || 0 })));
  router.get('/api/growth/thread', wrap(req => brain.growth.thread(req.query.id || '')));
  // Public chat widget (no admin auth): mount `atlas.widget` on your site, e.g. app.use('/atlas-chat', atlas.widget)
  router.get('/api/events', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify({ t: Date.now(), kind: 'system', text: 'Connected to the mind of ATLAS.' })}\n\n`);
    clients.add(res); req.on('close', () => clients.delete(res));
  });

  // UI: the same dashboard, with asset paths rewritten to the mount prefix.
  router.get(['/', '/index.html'], (req, res) => {
    const base = req.baseUrl.replace(/\/$/, '');
    const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8')
      .replace('href="/style.css"', `href="${base}/style.css"`).replace('src="/app.js"', `src="${base}/app.js"`)
      .replace('href="/api/export"', `href="${base}/api/export"`)
      .replace('</head>', `<script>window.ATLAS_BASE=${JSON.stringify(base)};</script></head>`);
    res.type('html').send(html);
  });
  for (const f of ['style.css', 'app.js']) router.get('/' + f, (req, res) => res.type(MIME[path.extname(f)]).send(fs.readFileSync(path.join(ROOT, 'public', f), 'utf8')));

  router.brain = brain;
  // Public widget router: mount WITHOUT admin auth, e.g. app.use('/atlas-chat', atlas.widget).
  const pub = express.Router();
  pub.use(express.json({ limit: '64kb' }));
  pub.get('/widget.js', (req, res) => { res.type('text/javascript'); res.send(fs.readFileSync(path.join(ROOT, 'public', 'widget.js'), 'utf8')); });
  pub.post('/chat', wrap(req => brain.growth.chat({ id: String(req.body.id || '').slice(0, 40), name: String(req.body.name || '').slice(0, 60), text: String(req.body.text || '').slice(0, 1000), source: 'web' })));
  pub.get('/profile', wrap(() => { const P = brain.growth.profile; return { name: P.name, phone: P.phone, waLink: brain.growth.waLink('Hi, I want to know about your upcoming trips'), trips: brain.growth.upcoming(3) }; }));
  router.widget = pub;
  return router;
};
