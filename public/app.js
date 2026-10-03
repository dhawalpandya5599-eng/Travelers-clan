/* OYE front-end: chat, live knowledge-graph (force layout), evolution chart, event stream. */
(() => {
  const $ = (id) => document.getElementById(id);
  const LOCAL = (window.OYE_LOCAL || window.ATLAS_LOCAL) || null; // set when the brain runs inside this page (no server)
  const BASE = (window.OYE_BASE || window.ATLAS_BASE) || '';     // set when mounted under a prefix inside another site
  const api = async (method, url, body) => {
    if (LOCAL) return LOCAL.request(method, url, body);
    const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return r.json();
  };
  const fmt = (n, d = 3) => (n == null ? '–' : typeof n === 'number' ? +n.toFixed(d) : n);

  // ---------- Tabs ----------
  const showTab = (name) => { document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name)); document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + name)); try { localStorage.setItem('atlas-tab', name); } catch (e) {} if (name === 'mind') setTimeout(() => { window.dispatchEvent(new Event('resize')); const h = document.getElementById('graph3d'); if (h && h.__refit) h.__refit(); }, 50); window.scrollTo(0, 0); if (typeof loadPage === 'function') loadPage(name); };
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) showTab(b.dataset.go); });
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
  try { const t = localStorage.getItem('atlas-tab'); if (t && document.getElementById('page-' + t)) showTab(t); } catch (e) {}
  document.querySelectorAll('[data-fill]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); $('council-text').value = a.dataset.fill; }));
  document.querySelectorAll('[data-fill-plan]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); $('plan-text').value = a.dataset.fillPlan; }));

  // ---------- Chat ----------
  const messages = $('messages');
  function addMsg(role, text, meta) {
    const el = document.createElement('div');
    el.className = `msg ${role}`;
    el.textContent = text;
    if (meta) { const m = document.createElement('span'); m.className = 'meta'; m.textContent = meta; el.appendChild(m); }
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }
  $('chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMsg('user', text);
    busy(true);
    try {
      const r = await api('POST', '/api/chat', { message: text });
      addMsg('atlas', r.text || r.error || '…', `via ${r.via} · confidence ${fmt(r.confidence, 2)} · ${r.ms}ms · WM: ${(r.workingMemory || []).join(', ') || '∅'}`);
    } catch (err) { addMsg('atlas', 'Connection lost: ' + err.message); }
    busy(false);
    refresh();
  });
  $('fb-up').onclick = () => api('POST', '/api/feedback', { good: true }).then(refresh);
  $('fb-down').onclick = () => api('POST', '/api/feedback', { good: false }).then(refresh);
  $('btn-sleep').onclick = () => action($('btn-sleep'), () => api('POST', '/api/sleep'));
  $('btn-evolve').onclick = () => action($('btn-evolve'), () => api('POST', '/api/evolve', { generations: 5 }));
  $('btn-grow').onclick = () => action($('btn-grow'), () => api('POST', '/api/grow').then(r => { if (r.reason) addMsg('atlas', 'Cannot grow a skill yet: ' + r.reason); }));
  $('btn-teach').onclick = () => action($('btn-teach'), async () => {
    const text = $('teach-text').value.trim(); if (!text) return;
    const r = await api('POST', '/api/teach', { text });
    $('teach-result').textContent = `extracted ${r.facts} fact(s)`; $('teach-text').value = '';
  });
  $('btn-wa').onclick = () => action($('btn-wa'), async () => {
    const text = $('wa-text').value.trim(); if (!text) return;
    const r = await api('POST', '/api/import/whatsapp', { text, staff: $('wa-staff').value });
    $('wa-result').textContent = r.error || `${r.messages} messages from ${r.people.length} people · ${r.facts} facts · ${r.questions} questions`;
    if (r.faq && r.faq.length) addMsg('atlas', 'Most asked topics in that chat: ' + r.faq.map(f => `${f.topic} (${f.count})`).join(', '));
    $('wa-text').value = '';
  });
  $('mind-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    busy(true);
    try {
      const state = JSON.parse(await file.text());
      const r = await api('POST', '/api/import/mind', { state, source: file.name });
      addMsg('atlas', r.error ? 'Could not merge that file: ' + r.error : `Merged ${file.name}: facts ${r.before.facts} → ${r.after.facts}, concepts ${r.before.concepts} → ${r.after.concepts}, generation ${r.before.generation} → ${r.after.generation}. Nothing was lost.`);
    } catch (err) { addMsg('atlas', 'That file is not a mind export: ' + err.message); }
    e.target.value = ''; busy(false); refresh();
  });
  const AGENT_NAMES = { sales: 'Sales', operations: 'Operations', cx: 'Customer experience', news: 'News & risk', critic: 'Critic', marketing: 'Marketing', tester: 'Tester & teacher' };
  const VERDICT_WORDS = { ok: 'Looks good', warn: 'Fix a few things first', block: 'Do not send yet' };
  function renderCouncil(r, outId, verdictId) {
    $(verdictId).textContent = `${VERDICT_WORDS[r.verdict] || r.verdict} · it learned ${r.taught} new fact(s) from this`;
    const order = ['sales', 'operations', 'cx', 'news', 'critic', 'marketing', 'tester', 'dialogue'];
    const agents = order.map(k => r.agents[k]).filter(Boolean);
    const sales = r.agents.sales;
    const replyCard = sales && sales.output.draft ? `<div class="agent reply"><h4>Reply to send<button class="copy" data-copy="${esc(sales.output.draft)}">Copy</button></h4><div class="draft">${esc(sales.output.draft)}</div><div class="hint" style="margin-top:6px">${esc(sales.output.cohort || 'Unknown customer type')} · stage: ${esc(sales.output.stage)} · next: ${esc(String(sales.output.nextAction).replace(/_/g, ' '))} (${esc(sales.output.evidence)})${sales.output.polishedBy ? ' · polished by ' + esc(sales.output.polishedBy) : ''}</div></div>` : '';
    $(outId).innerHTML = replyCard + agents.map(a => {
      const o = a.output || {};
      const extra = a.agent === 'operations' && o.itinerary ? `<div class="itin">${o.itinerary.map(x => `Day ${x.day}: ${esc(x.plan)}`).join('<br>')}<br><b>About ${o.perPerson} per person${o.total ? `, ${o.total} for the group` : ''} · ${esc(o.season)}</b></div>` : a.agent === 'sales' ? `<div class="hint">${o.score ? esc(o.score) : ''}</div>` : '';
      return `<div class="agent"><h4>${AGENT_NAMES[a.agent] || a.agent}<span class="v ${a.verdict}">${esc(VERDICT_WORDS[a.verdict] || a.verdict)}</span></h4>${a.findings.length ? '<ul>' + a.findings.map(f => `<li>${esc(f)}</li>`).join('') + '</ul>' : '<div class="hint">No issues found.</div>'}${a.suggestions.length ? '<ul>' + a.suggestions.map(f => `<li class="fix">Fix: ${esc(f)}</li>`).join('') + '</ul>' : ''}${extra}</div>`;
    }).join('');
    $(outId).querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => { const t = b.dataset.copy; (navigator.clipboard && navigator.clipboard.writeText(t) || Promise.reject()).then(() => { b.textContent = 'Copied'; }).catch(() => { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); b.textContent = 'Copied'; } catch (e) {} ta.remove(); }); }));
  }
  $('btn-council').onclick = () => action($('btn-council'), async () => { const text = $('council-text').value.trim(); if (!text) return; const r = await api('POST', '/api/council', { conversation: text, name: $('council-name').value.trim() }); if (r.error) { $('council-verdict').textContent = r.error; return; } renderCouncil(r, 'council-out', 'council-verdict'); });
  $('btn-review').onclick = () => action($('btn-review'), async () => { const text = $('plan-text').value.trim(); if (!text) return; const r = await api('POST', '/api/council/review', { text }); if (r.error) { $('plan-verdict').textContent = r.error; return; } renderCouncil(r, 'plan-out', 'plan-verdict'); });
  $('btn-news').onclick = () => action($('btn-news'), async () => { const text = $('news-text').value.trim(); if (!text) return; const r = await api('POST', '/api/news', { text }); $('news-result').textContent = r.error || (r.added && r.added.length ? `Kept ${r.added.length}: ${r.added.map(i => `${i.where} (${i.severity} ${i.kind})`).join(', ')}` : 'No place recognised in those lines.'); if (!r.error) $('news-text').value = ''; });
  async function action(btn, fn) { btn.disabled = true; busy(true); try { await fn(); } finally { btn.disabled = false; busy(false); refresh(); } }
  function busy(b) { $('pulse').classList.toggle('busy', b); }

  // ---------- Snapshot ----------
  async function refresh() {
    const s = await api('GET', '/api/snapshot');
    $('v-gen').textContent = s.generation;
    $('v-facts').textContent = s.memory.facts;
    $('v-mentor').textContent = s.mentor.enabled ? (s.mentor.model || 'on') : 'rules only';
    $('v-mentor').title = s.mentor.enabled ? s.mentor.model : (s.mentor.lastError || '');
    $('dopamine').style.setProperty('--d', s.memory.dopamine);
    $('wm').innerHTML = '<span class="label">working memory</span>' + (s.memory.workingMemory.map(w => `<span title="activation ${w.activation}">${esc(w.id)}</span>`).join('') || '<span class="label">∅</span>');
    $('genome').innerHTML = Object.entries(s.genome).map(([k, v]) => `<div>${k}<b>${fmt(v, 3)}</b></div>`).join('');
    const asks = [...(s.contradictions || []).map(c => `<li>Which is right? <b>${esc(c.s)} ${esc(c.p)}</b> ${c.options.map(esc).join(' <i>or</i> ')}<span>contradiction</span></li>`),
      ...s.unknowns.slice(-5).reverse().map(u => `<li>${esc(u.q)}<span>unanswered</span></li>`)];
    $('asks').innerHTML = asks.join('') || '<li class="hint">Nothing pending. Ask me something hard.</li>';
    $('facts').innerHTML = s.topFacts.map(f => `<li>${esc(f.text)}<span>${esc(f.source)}</span></li>`).join('') || '<li class="hint">Nothing learned yet. Teach me.</li>';
    $('skills').innerHTML = s.skills.map(k => `<li class="${k.learned ? 'learned' : ''}" title="${esc(k.description)}">${esc(k.name)} ${k.wins || k.losses ? `+${k.wins}/−${k.losses}` : ''}</li>`).join('');
    if (!logSeeded) { logSeeded = true; for (const e of s.log) pushLog(e); }
    drawEvo(s.history);
    if (s.pendingQuestion && !askedPending) { askedPending = s.pendingQuestion.subject; }
    const g = await api('GET', '/api/graph?limit=180');
    graph.update(g);
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let logSeeded = false, askedPending = null;

  // ---------- Event stream ----------
  const log = $('log');
  function pushLog(e) {
    const li = document.createElement('li');
    li.className = e.kind;
    li.innerHTML = `<span class="k">${esc(e.kind)}</span><span>${esc(e.text)}</span>`;
    log.prepend(li);
    while (log.children.length > 80) log.lastChild.remove();
  }
  function connect() {
    if (LOCAL) { LOCAL.onEvent(e => { pushLog(e); teamPulse(e); if (['sleep', 'evolve', 'learn', 'reward'].includes(e.kind)) graph.flash(); }); return; }
    const es = new EventSource(BASE + '/api/events');
    es.onmessage = (m) => { const e = JSON.parse(m.data); pushLog(e); teamPulse(e); if (['sleep', 'evolve', 'learn', 'reward'].includes(e.kind)) graph.flash(); };
    es.onerror = () => { es.close(); setTimeout(connect, 3000); };
  }

  // ---------- Evolution chart ----------
  function drawEvo(hist) {
    const c = $('evo'); const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = 140; c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);
    const pad = { l: 34, r: 10, t: 10, b: 18 };
    ctx.strokeStyle = '#22304a'; ctx.fillStyle = '#8a9ab5'; ctx.font = '10px ui-monospace, monospace'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const y = pad.t + (H - pad.t - pad.b) * (1 - i / 4); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); ctx.fillText((i / 4).toFixed(2), 4, y + 3); }
    if (!hist.length) { ctx.fillText('no generations yet — press Evolve', pad.l + 8, H / 2); return; }
    const x = (i) => pad.l + (W - pad.l - pad.r) * (hist.length === 1 ? 0.5 : i / (hist.length - 1));
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - Math.max(0, Math.min(1, v)));
    const line = (key, color, width) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); hist.forEach((h, i) => i ? ctx.lineTo(x(i), y(h[key])) : ctx.moveTo(x(i), y(h[key]))); ctx.stroke(); };
    line('mean', '#8b7cff', 1.2); line('best', '#5ee1c2', 2);
    ctx.fillStyle = '#8a9ab5'; ctx.fillText(`gen ${hist[0].generation}`, pad.l, H - 4); ctx.fillText(`gen ${hist[hist.length - 1].generation}`, W - pad.r - 44, H - 4);
    ctx.fillStyle = '#5ee1c2'; ctx.fillText('best', W - pad.r - 70, pad.t + 8); ctx.fillStyle = '#8b7cff'; ctx.fillText('mean', W - pad.r - 36, pad.t + 8);
  }

  // ---------- Knowledge graph: god's-eye 3D view (3d-force-graph + three), 2D canvas fallback ----------
  const PALETTE = ['#d47a60', '#5fb3a1', '#e0b35a', '#7c9cf2', '#c585d4', '#6fcf97', '#f28c8c', '#58c4dd', '#b8a06a', '#9ad46b', '#e59ad2', '#8fa3c8'];
  const graph = (() => {
    const host = $('graph3d'); const canvas = $('graph');
    let data = { nodes: [], links: [], clusters: [] }, byId = new Map(), fg = null, rotating = true, angle = 0, hoverNode = null, flashUntil = 0;
    const color = (n) => n.group < 0 ? '#8a94a8' : PALETTE[n.group % PALETTE.length];
    function legend(cl) { $('legend').innerHTML = cl.slice(0, 8).map(c => `<span class="lg" data-hub="${esc(c.name)}" title="Fly to this cluster"><i style="background:${PALETTE[c.id % PALETTE.length]}"></i>${esc(c.name)} <b>${c.size}</b></span>`).join('') || '<span class="muted">The map fills as OYE learns. Teach it something or ask a question.</span>'; }
    // Click a cluster in the legend: fly the camera to its hub and dim everything else for a moment.
    $('legend').addEventListener('click', (e) => { const el = e.target.closest('[data-hub]'); if (!el || !fg) return; const n = data.nodes.find(x => x.label === el.dataset.hub); if (!n || n.x == null) return; rotating = false; $('btn-rotate').textContent = 'Resume orbit'; const d = 90, r = d / Math.max(1, Math.hypot(n.x, n.y, n.z)); fg.cameraPosition({ x: n.x * r, y: n.y * r + 10, z: n.z * r }, n, 1000); hoverNode = n; fg.nodeColor(fg.nodeColor()).linkColor(fg.linkColor()); setTimeout(() => { hoverNode = null; fg.nodeColor(fg.nodeColor()).linkColor(fg.linkColor()); }, 2500); });
    function sprite(n) {
      const s = new SpriteText(n.label); s.color = n.activation > 0.3 ? '#ffffff' : 'rgba(238,241,247,.85)'; s.textHeight = n.hub ? 5.5 : n.strength > 0.6 || n.activation > 0.3 ? 4 : 3; s.fontFace = 'Montserrat, sans-serif'; s.fontWeight = n.strength > 0.5 ? '600' : '400';
      s.backgroundColor = n.activation > 0.3 ? 'rgba(212,122,96,.55)' : 'rgba(11,18,32,.55)'; s.padding = 1.2; s.borderRadius = 2; s.position.set(0, 3 + n.strength * 3, 0); return s;
    }
    let fitted = false;
    function init3d() {
      if (!window.ForceGraph3D || !window.SpriteText) return false;
      try {
        fg = ForceGraph3D({ controlType: 'orbit' })(host)
          .backgroundColor('rgba(0,0,0,0)').showNavInfo(false)
          .nodeId('id').nodeLabel(n => `${n.label} · strength ${n.strength} · seen ${n.count}×`)
          .nodeVal(n => 0.6 + n.strength * 2.5 + n.activation * 3).nodeRelSize(3)
          .nodeColor(n => hoverNode && hoverNode !== n && !neighbors(hoverNode).has(n.id) ? 'rgba(120,130,150,.25)' : color(n))
          .nodeOpacity(0.95).nodeResolution(16)
          .nodeThreeObjectExtend(true).nodeThreeObject(n => (n.strength > 0.6 || n.activation > 0.3 || n.hub || data.nodes.length < 50) ? sprite(n) : null)
          .linkColor(l => hoverNode && l.source !== hoverNode && l.target !== hoverNode ? 'rgba(120,130,150,.08)' : `rgba(238,241,247,${0.08 + l.w * 0.5})`)
          .linkWidth(l => l.w * 1.6).linkOpacity(0.6)
          .linkDirectionalParticles(l => l.w > 0.6 ? 2 : 0).linkDirectionalParticleWidth(1.2).linkDirectionalParticleSpeed(0.004).linkDirectionalParticleColor(() => '#d47a60')
          .onNodeHover(n => { hoverNode = n || null; host.style.cursor = n ? 'pointer' : 'grab'; fg.nodeColor(fg.nodeColor()).linkColor(fg.linkColor()); })
          .onNodeClick(n => { const dist = 60; const r = dist / Math.hypot(n.x, n.y, n.z); fg.cameraPosition({ x: n.x * r, y: n.y * r, z: n.z * r }, n, 900); $('chat-input').value = `What is ${n.label}?`; })
          .onBackgroundClick(() => {}).warmupTicks(60).cooldownTicks(200);
        fg.d3Force('charge').strength(-55); fg.d3Force('link').distance(l => 22 + (1 - l.w) * 50);
        let dist = 420; fg.cameraPosition({ x: 0, y: 60, z: dist });
        const refit = (ms) => { fg.zoomToFit(ms || 600, 50); setTimeout(() => { const c = fg.cameraPosition(); dist = Math.max(200, Math.hypot(c.x, c.y, c.z)); angle = Math.atan2(c.x, c.z); }, (ms || 600) + 100); };
        fg.onEngineStop(() => { if (fitted || !data.nodes.length) return; fitted = true; refit(600); });
        // The map is drawn inside a tab that may be hidden (zero size) when the data arrives: refit whenever it is shown.
        host.__refit = () => { if (host.__resize) host.__resize(); if (data.nodes.length) setTimeout(() => refit(500), 80); };
        const resize = () => { const w = host.getBoundingClientRect().width || host.parentElement.clientWidth - 24; if (w > 50) fg.width(w).height(host.clientHeight || 620); }; resize(); window.addEventListener('resize', resize); host.__resize = resize;
        (function orbit() { if (rotating && !hoverNode && fitted) { angle += 0.0015; const d = dist; fg.cameraPosition({ x: d * Math.sin(angle), y: d * 0.22 + d * 0.08 * Math.sin(angle * 0.5), z: d * Math.cos(angle) }); } requestAnimationFrame(orbit); })();
        $('btn-rotate').onclick = () => { rotating = !rotating; $('btn-rotate').textContent = rotating ? 'Pause orbit' : 'Resume orbit'; };
        $('btn-fit').onclick = () => refit(800);
        return true;
      } catch (e) { console.warn('3D view unavailable, using 2D', e); fg = null; return false; }
    }
    function neighbors(n) { const s = new Set([n.id]); for (const l of data.links) { const a = typeof l.source === 'object' ? l.source.id : l.source, b = typeof l.target === 'object' ? l.target.id : l.target; if (a === n.id) s.add(b); if (b === n.id) s.add(a); } return s; }
    function update(g) {
      legend(g.clusters || []);
      if (fg) {
        // keep positions of nodes we already have, so the map breathes instead of jumping
        const prev = new Map(data.nodes.map(n => [n.id, n]));
        const hubNames = new Set((g.clusters || []).map(c => c.name)); const deg = new Map(); for (const l of g.links) { deg.set(l.source, (deg.get(l.source) || 0) + 1); deg.set(l.target, (deg.get(l.target) || 0) + 1); }
        // Ideas with no connection yet would fly to the edges and shrink the real map: keep them off the 3D view until they link up.
        // Small islands (a pair of ideas linked only to each other) would drift to the edges too: show the main continent and any island of 5+ ideas.
        const parent = new Map(); const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
        for (const n of g.nodes) parent.set(n.id, n.id); for (const l of g.links) if (parent.has(l.source) && parent.has(l.target)) parent.set(find(l.source), find(l.target));
        const compSize = new Map(); for (const n of g.nodes) { const r = find(n.id); compSize.set(r, (compSize.get(r) || 0) + 1); }
        const biggest = Math.max(0, ...compSize.values());
        const nodes = g.nodes.filter(n => g.nodes.length < 40 || (deg.get(n.id) && (compSize.get(find(n.id)) >= Math.min(5, biggest))) || hubNames.has(n.label)).map(n => Object.assign(prev.get(n.id) || {}, n, { hub: hubNames.has(n.label) }));
        if (host.__resize) host.__resize();
        const keep = new Set(nodes.map(n => n.id)); const links = g.links.filter(l => keep.has(l.source) && keep.has(l.target)).map(l => ({ source: l.source, target: l.target, w: l.w }));
        data = { nodes, links, clusters: g.clusters || [] }; byId = new Map(nodes.map(n => [n.id, n]));
        // graphData() restarts the layout by itself; in the web bundle the data arrives before the engine's first frame, so
        // nothing else may touch the engine here (an early reheat threw and left the scene empty).
        const hadData = fitted; try { fg.graphData({ nodes, links }); } catch (e) { console.warn('3D update failed, using 2D', e); fg = null; return draw2d(g); }
        if (!hadData && nodes.length) fitted = false;
      } else draw2d(g);
    }
    function flash() { flashUntil = performance.now() + 900; }
    // --- 2D fallback (no WebGL or the library did not load) ---
    let nodes2 = [], links2 = [], by2 = new Map();
    function draw2d(g) {
      canvas.hidden = false; host.hidden = true; const ctx = canvas.getContext('2d');
      const next = new Map(); for (const n of g.nodes) { const old = by2.get(n.id); next.set(n.id, old ? Object.assign(old, n) : { ...n, x: canvas.clientWidth / 2 + (Math.random() - .5) * 300, y: canvas.clientHeight / 2 + (Math.random() - .5) * 300, vx: 0, vy: 0 }); }
      by2 = next; nodes2 = [...next.values()]; links2 = g.links.map(l => ({ a: next.get(l.source), b: next.get(l.target), w: l.w })).filter(l => l.a && l.b);
      if (!draw2d.loop) { draw2d.loop = true; (function loop() { step2d(ctx); requestAnimationFrame(loop); })(); canvas.addEventListener('click', e => { const r = canvas.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; const n = nodes2.find(n => (n.x - x) ** 2 + (n.y - y) ** 2 < 144); if (n) { $('chat-input').value = `What is ${n.label}?`; } }); }
    }
    function step2d(ctx) {
      const W = canvas.clientWidth, H = canvas.clientHeight; if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      const k = Math.sqrt((W * H) / Math.max(1, nodes2.length)) * 0.9;
      for (let i = 0; i < nodes2.length; i++) { const a = nodes2[i]; a.vx += (W / 2 - a.x) * 0.002; a.vy += (H / 2 - a.y) * 0.002; for (let j = i + 1; j < nodes2.length; j++) { const b = nodes2[j]; let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 0.01, d = Math.sqrt(d2); const f = (k * k) / d2 * 0.5 * (a.group === b.group ? 0.7 : 1.3); dx /= d; dy /= d; a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f; } }
      for (const l of links2) { const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, d = Math.hypot(dx, dy) + 0.01; const f = (d - k * (1.2 - l.w * 0.6)) * 0.02 * l.w; l.a.vx += dx / d * f; l.a.vy += dy / d * f; l.b.vx -= dx / d * f; l.b.vy -= dy / d * f; }
      for (const n of nodes2) { n.vx *= 0.8; n.vy *= 0.8; n.x = Math.max(16, Math.min(W - 16, n.x + n.vx)); n.y = Math.max(16, Math.min(H - 16, n.y + n.vy)); }
      ctx.clearRect(0, 0, W, H);
      for (const l of links2) { ctx.strokeStyle = `rgba(238,241,247,${0.06 + l.w * 0.4})`; ctx.lineWidth = 0.5 + l.w * 2; ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke(); }
      for (const n of nodes2) { const r = 3 + n.strength * 7 + n.activation * 6; ctx.fillStyle = color(n); ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill(); if (n.strength > 0.45 || n.activation > 0.3 || nodes2.length < 60) { ctx.fillStyle = 'rgba(238,241,247,.9)'; ctx.font = `${n.strength > 0.5 ? '600 ' : ''}11px Montserrat, sans-serif`; ctx.fillText(n.label, n.x + r + 4, n.y + 4); } }
    }
    if (!init3d()) draw2d({ nodes: [], links: [], clusters: [] });
    return { update, flash };
  })();

  if (LOCAL && LOCAL.loadOpenModel) { const bm = $('btn-openmodel'); bm.hidden = false; bm.onclick = async () => { bm.disabled = true; bm.textContent = 'Loading model…'; try { const m = await LOCAL.loadOpenModel(t => { bm.textContent = t.slice(0, 40); }); bm.textContent = '✓ ' + m; addMsg('atlas', 'Open-source model loaded in this browser. I now understand free-form messages and polish replies with it.'); refresh(); } catch (e) { bm.textContent = '🧠 Load open model'; bm.disabled = false; addMsg('atlas', 'Could not load the open model here: ' + (e.message || e) + '. It works when this page is served from your website or opened as a local file with WebGPU.'); } }; }
  if (LOCAL) { const ex = document.getElementById('btn-export'); if (ex) { ex.addEventListener('click', (e) => { e.preventDefault(); LOCAL.exportMind(); }); } }
  // ---------- Boot ----------
  addMsg('atlas', 'Hi, I am OYE. Ask me anything about the clan, our trips, prices, policies or customers. Tell me a fact and I will remember it. If I am wrong, start your message with "No," and I will correct myself.');
  connect();
  refresh();
  setInterval(refresh, 15000);
  window.addEventListener('resize', () => refresh());

  // ---------- Grow tab ----------
  const G = {};
  const copyBtn = (text) => `<button class="copy" data-copy="${esc(text)}">Copy</button>`;
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-copy]'); if (b) { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1200); } });
  async function loadUniverse() { try { const u = await api('GET', '/api/universe'); if (!u || u.error) { $('uni-score').textContent = u && u.error ? '' : ''; return; } $('uni-score').textContent = `${u.ok}/${u.n} handled well · space of ${Number(u.space).toLocaleString('en-IN')} kinds`; const rows = []; for (const [k, list] of Object.entries(u.table || {})) { const w = list[0]; if (w && w.rate < 0.95) rows.push(`<span title="${esc(k)}">${esc(w.value)} <b>${Math.round(w.rate * 100)}%</b></span>`); } $('uni-table').innerHTML = rows.join('') || '<span>No weak segment below 95%.</span>'; $('uni-lessons').innerHTML = (u.lessons || []).slice(0, 8).map(l => `<li>${esc(l)}</li>`).join(''); } catch (e) {} }
  function loadPage(name) { if (name === 'customers') loadUniverse(); if (name === 'today') loadSub('today'); else if (name === 'marketing') { loadSub('gbp'); loadSub('mkt'); loadSub('ig'); } else if (name === 'home') { loadGrow(); loadAutopilot(); } else if (name === 'setup') loadGrow(); }
  const tripRow = (t = {}) => { const tr = document.createElement('tr'); tr.innerHTML = `<td><input class="t-name" value="${esc(t.name || '')}" placeholder="Goa"></td><td><input class="t-date" type="date" value="${esc(t.date || '')}"></td><td><input class="t-days" type="number" value="${t.days || ''}" style="width:60px"></td><td><input class="t-price" type="number" value="${t.price || ''}" style="width:90px"></td><td><input class="t-seats" type="number" value="${t.seats || ''}" style="width:60px"></td><td><input class="t-booked" type="number" value="${t.booked || ''}" style="width:60px"></td><td><button class="t-del">×</button></td>`; tr.querySelector('.t-del').onclick = () => tr.remove(); return tr; };
  $('btn-trip-add').onclick = () => $('trips').querySelector('tbody').appendChild(tripRow());
  function readTrips() { return [...$('trips').querySelectorAll('tbody tr')].map(tr => ({ name: tr.querySelector('.t-name').value, date: tr.querySelector('.t-date').value, days: tr.querySelector('.t-days').value, price: tr.querySelector('.t-price').value, seats: tr.querySelector('.t-seats').value, booked: tr.querySelector('.t-booked').value })); }
  const POL = ['included', 'excluded', 'payment', 'cancellation', 'pickup', 'safety', 'food', 'age'];
  let ruleKeys = [];
  function renderRules(P) { const box = $('rules'); if (!box || box.children.length) return; const labels = P.ruleLabels || {}; ruleKeys = Object.keys(labels); box.innerHTML = ruleKeys.map(k => `<label>${esc(labels[k])}<input type="number" id="rule-${k}" placeholder="${(P.rules || {})[k]}" step="any"></label>`).join(''); }
  function fillProfile(P) { renderRules(P); for (const k of ruleKeys) { const el = $('rule-' + k); if (el) { el.placeholder = (P.rules || {})[k]; el.value = (P.rulesSet || {})[k] != null ? (P.rulesSet || {})[k] : ''; } } for (const k of ['name', 'city', 'phone', 'email', 'website', 'instagram', 'hours', 'usp', 'upi']) $('p-' + k).value = P[k] || ''; for (const k of POL) $('pol-' + k).value = (P.policies || {})[k] || ''; $('p-languages').value = (P.languages || []).join(', '); const tb = $('trips').querySelector('tbody'); tb.innerHTML = ''; (P.trips || []).forEach(t => tb.appendChild(tripRow(t))); if (!P.trips || !P.trips.length) tb.appendChild(tripRow()); }
  $('btn-profile').onclick = () => action($('btn-profile'), async () => { const body = { trips: readTrips(), policies: {}, rules: {} }; for (const k of ruleKeys) { const el = $('rule-' + k); if (el) body.rules[k] = el.value; } for (const k of ['name', 'city', 'phone', 'email', 'website', 'instagram', 'hours', 'usp', 'languages', 'upi']) body[k] = $('p-' + k).value; for (const k of POL) body.policies[k] = $('pol-' + k).value; const P = await api('POST', '/api/growth/profile', body); $('profile-result').textContent = P.error || `saved · ${(P.trips || []).length} trips · the mind learned the facts`; loadGrow(); });
  async function loadGrow() {
    try { G.ov = await api('GET', '/api/growth'); } catch (e) { return; }
    const ov = G.ov; if (!ov || ov.error) return;
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#page-setup')) {} else fillProfile(ov.profile);
    homeSteps(ov);
    $('s-auto').checked = !!(ov.settings && ov.settings.autoReply);
    $('wa-link').innerHTML = ov.waLink ? `<a href="${esc(ov.waLink)}" target="_blank">${esc(ov.waLink)}</a> ${copyBtn(ov.waLink)}` : 'Add the WhatsApp number in Setup to get the link.';
    if (ov.waLink) { $('wa-qr').src = 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=' + encodeURIComponent(ov.waLink); $('wa-qr').hidden = false; }
    $('widget-snippet').textContent = `<script src="/atlas-chat/widget.js" data-base="/atlas-chat"><\/script>`;
    $('trips-snippet').textContent = `<div id="atlas-trips"></div>\n<script src="/atlas-chat/trips.js" data-base="/atlas-chat"><\/script>`;
    if (LOCAL) { $('demo-link').hidden = true; }
  }
  function homeSteps(ov) {
    const P = ov.profile || {}; const done = { phone: !!(P.phone && P.city), trips: (P.trips || []).length >= 1, site: false, today: Object.keys(ov.counts || {}).length > 0 };
    try { done.site = localStorage.getItem('atlas-site-done') === '1'; } catch (e) {}
    document.querySelectorAll('#home-steps li').forEach(li => li.classList.toggle('done', !!done[li.dataset.step]));
  }
  document.querySelectorAll('[data-copy]').forEach(() => {});
  document.addEventListener('click', (e) => { if (e.target.closest('#trips-snippet, #widget-snippet')) { try { localStorage.setItem('atlas-site-done', '1'); } catch (x) {} } });
  // Light / dark, same as the website's sun/moon toggle. Remembered per browser.
  const setTheme = (t) => { document.documentElement.setAttribute('data-theme', t); $('theme-toggle').textContent = t === 'dark' ? '☀' : '☾'; try { localStorage.setItem('atlas-theme', t); } catch (e) {} };
  try { setTheme(localStorage.getItem('atlas-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')); } catch (e) { setTheme('light'); }
  $('theme-toggle').onclick = () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  if ($('btn-visa')) { const look = async () => { const q = $('visa-q').value.trim(); if (!q) return; const r = await api('GET', '/api/visa?country=' + encodeURIComponent(q)); $('visa-card').hidden = false; $('visa-card').textContent = r.card || r.error || 'no rule'; }; $('btn-visa').onclick = look; $('visa-q').addEventListener('keydown', e => { if (e.key === 'Enter') look(); }); }
  async function loadSub(name) {
    if (name === 'today') {
      const t = await api('GET', '/api/growth/today'); if (t.error) return;
      $('today-list').innerHTML = t.due.length ? t.due.map(d => `<div class="agent"><h4>${esc(d.lead.name || d.lead.id)} · ${esc(d.lead.trip || 'no trip yet')} · ${esc(d.lead.stage)} <span class="v">${esc(d.step.name)}</span></h4><div class="draft">${esc(d.message)}${copyBtn(d.message)}</div><div class="meta">${esc(d.step.rule)}</div><div class="actions"><button data-done="${esc(d.lead.id)}">Done, sent</button><select data-stage="${esc(d.lead.id)}"><option value="">change stage…</option>${['qualified', 'quoted', 'objection', 'hold', 'advance', 'balance', 'travelled', 'reviewed', 'lost'].map(s => `<option>${s}</option>`).join('')}</select><input data-value="${esc(d.lead.id)}" type="number" placeholder="booking value ₹" style="max-width:140px"></div></div>`).join('') : '<div class="empty">Nothing due right now. Good: go post a reel.</div>';
      try { const B = await api('GET', '/api/growth/board'); if (B && !B.error) { const money = (n) => '₹' + Math.round(+n || 0).toLocaleString('en-IN');
        const wait = B.humanWait.map(w => `<div class="wait"><b>${esc(w.name)}</b> has waited ${w.minutes >= 60 ? Math.round(w.minutes / 60) + ' h' : w.minutes + ' min'} for a human${w.trip ? ' · ' + esc(w.trip) : ''} · ${esc(w.stage)}. Open Reply to a customer and answer now.</div>`).join('');
        const trips = B.trips.map(r => `<div class="trip"><h4>${esc(r.name)} <span>${r.date ? esc(new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })) : ''}${r.days != null ? ' · ' + (r.days < 0 ? 'departed' : r.days > 365 ? 'date far out' : r.days + ' days to go') : ''}</span></h4><div class="bar"><i style="width:${Math.min(100, r.fill)}%"></i></div><div class="kv2"><span>booked <b>${r.booked}/${r.seats || '?'}</b></span><span>held <b>${r.held}</b></span><span>left <b>${r.left}</b></span>${r.needPerDay ? `<span>need <b>${r.needPerDay}/day</b></span>` : ''}<span>leads open <b>${r.leads.open}</b></span><span>holds <b>${r.leads.hold}</b></span><span>advance paid <b>${r.leads.advance}</b></span><span>lost <b>${r.leads.lost}</b>${Object.keys(r.lostReasons).length ? ' (' + esc(Object.entries(r.lostReasons).map(([k, v]) => k + ' ' + v).join(', ')) + ')' : ''}</span><span>booked <b>${money(r.revenue)}</b></span><span>open <b>${money(r.open)}</b></span>${r.waitlist ? `<span>waiting list <b>${r.waitlist}</b></span>` : ''}</div>${r.flags.map(f => `<div class="flag">⚑ ${esc(f)}</div>`).join('')}<div class="actions" style="margin-top:8px"><a class="btn" href="${(window.OYE_BASE || window.ATLAS_BASE || '')}/api/pack?trip=${encodeURIComponent(r.name)}" target="_blank" rel="noopener">Trip pack</a></div></div>`).join('');
        const w = B.widget || {}; $('today-board').innerHTML = wait + (trips || '<div class="empty">Add a trip in Set up to see the board.</div>') + (B.totals.leads ? `<div class="kv2 muted">Sources: ${esc(Object.entries(B.sources).map(([k, v]) => k + ' ' + v).join(' · '))}</div>` : '') + (w.open ? `<div class="kv2 muted">Website OYE, last 7 days: opened <b>${w.open}</b> · messages <b>${w.message}</b> · holds <b>${w.hold}</b> · WhatsApp <b>${w.whatsapp}</b> · asked for a human <b>${w.human}</b> · hold rate <b>${Math.round(w.holdRate * 100)}%</b></div>` : ''); } } catch (e) { /* board is optional */ }
      try { const V = await api('GET', '/api/visa'); if (V && !V.error) { $('visa-desk').innerHTML = V.trips.length ? V.trips.map(s => `<div class="trip"><h4>${esc(s.trip)} <span>${esc(s.country)} · ${esc(s.typeText)}${s.applyBy ? ' · apply by ' + esc(new Date(s.applyBy).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })) + (s.urgency === 'late' ? ' (late)' : '') : ''}</span></h4><div class="kv2">${Object.entries(s.byStatus).map(([k, v]) => `<span>${esc(k.replace('_', ' '))} <b>${v}</b></span>`).join('') || '<span>no booked travellers yet</span>'}</div>${s.pending.map(p => `<div class="kv2" style="margin-top:6px"><span><b>${esc(p.name)}</b> ${p.seats > 1 ? '· ' + p.seats + ' seats ' : ''}</span><select data-visa="${esc(p.id)}">${['not_started', 'documents', 'applied', 'approved', 'rejected', 'not_needed'].map(x => `<option value="${x}" ${x === p.status ? 'selected' : ''}>${x.replace('_', ' ')}</option>`).join('')}</select></div>`).join('')}${s.pending.length === 0 && s.cases ? '<div class="kv2 muted">all approved</div>' : ''}</div>`).join('') : '<div class="empty">No upcoming trip needs a visa or permit, or nobody is booked on one yet. Look up any country above.</div>';
        $('visa-desk').querySelectorAll('[data-visa]').forEach(sel => sel.onchange = () => api('POST', '/api/visa/cases', { id: sel.dataset.visa, status: sel.value }).then(() => loadSub('today'))); } } catch (e) { /* desk optional */ }
      $('today-alerts').innerHTML = t.alerts.map(a => `<li class="bad">${esc(a)}</li>`).join('') || '<li>No seat alerts.</li>';
      $('today-counts').innerHTML = Object.entries(t.counts).map(([k, v]) => `<span>${esc(k)} <b>${v}</b></span>`).join('') || '<span>no leads yet</span>';
      $('today-list').querySelectorAll('[data-done]').forEach(b => b.onclick = () => api('POST', '/api/growth/leads', { id: b.dataset.done, done: true }).then(() => loadSub('today')));
      $('today-list').querySelectorAll('[data-stage]').forEach(sel => sel.onchange = () => { const v = $('today-list').querySelector(`[data-value="${sel.dataset.stage}"]`); api('POST', '/api/growth/leads', { id: sel.dataset.stage, stage: sel.value, value: v && v.value ? +v.value : undefined }).then(() => loadSub('today')); });
      const leads = await api('GET', '/api/growth/leads');
      $('lead-list').innerHTML = (leads || []).slice(0, 100).map(l => `<li>${esc(l.name || l.id)} · ${esc(l.trip || '–')} · ${esc(l.stage)}<span>${esc(l.source)} · next ${new Date(l.next).toLocaleDateString()}</span></li>`).join('') || '<li>No leads yet.</li>';
    } else if (name === 'gbp') {
      const g = await api('GET', '/api/growth/gbp'); if (g.error) return;
      $('gbp-score').textContent = `${g.score}/100`;
      $('gbp-audit').innerHTML = g.items.map(i => `<li class="${i.ok ? 'ok' : 'bad'}" title="${esc(i.why)}">${esc(i.what)}</li>`).join('');
      $('gbp-keywords').innerHTML = g.keywords.map(k => `<span>${esc(k)}</span>`).join('');
      $('gbp-posts').innerHTML = g.posts.map(p => `<div class="agent"><h4>${esc(p.title)} <span class="v">${esc(p.type)}</span></h4><div class="draft">${esc(p.body)}${copyBtn(p.title + '\n' + p.body)}</div><div class="meta">Button: ${esc(p.cta)} → ${esc(p.link)}</div></div>`).join('');
    } else if (name === 'ig') {
      const c = await api('GET', '/api/growth/content'); if (c.error) return;
      $('ig-bio').innerHTML = `<div class="draft">${esc(c.bio)}${copyBtn(c.bio)}</div>`;
      $('ig-tags').innerHTML = c.hashtags.map(h => `<span>${esc(h)}</span>`).join('') + copyBtn(c.hashtags.join(' '));
      $('ig-rules').innerHTML = c.rules.map(r => `<li>${esc(r)}</li>`).join('');
      $('ig-plan').innerHTML = c.plan.map(p => `<div class="agent"><h4>${esc(p.day)} · ${esc(p.idea)} <span class="v">${esc(p.format)}</span></h4><div class="meta">${esc(p.script)}</div>${p.caption ? `<div class="draft">${esc(p.caption)}${copyBtn(p.caption)}</div>` : ''}</div>`).join('');
    } else if (name === 'mkt') {
      const m = await api('GET', '/api/growth/campaigns'); if (m.error && !m.campaigns) { $('mkt-drafts').innerHTML = `<div class="empty">${esc(m.error)}</div>`; }
      $('mkt-cal').innerHTML = (m.campaigns || []).map(c => `<li class="${c.status === 'run now' ? 'bad' : ''}">${esc(c.name)} (${esc(c.date)}): ${esc(c.pitch)}${c.trip ? ' → ' + esc(c.trip) : ''}<span>${c.status === 'run now' ? 'RUN NOW' : 'start ' + esc(c.startBy)}</span></li>`).join('');
      if (m.drafts) { $('mkt-drafts').innerHTML = m.drafts.map(d => `<div class="agent"><h4>${esc(d.segment)} <span class="v">${esc(d.when)}</span></h4><div class="draft">${esc(d.text)}${copyBtn(d.text)}</div></div>`).join(''); $('mkt-rules').innerHTML = (m.rules || []).map(r => `<li>${esc(r)}</li>`).join(''); }
      roi();
    }
  }
  async function roi() { const r = await api('GET', '/api/growth/roi?adSpend=' + (+$('roi-spend').value || 0)); if (r.error) return; $('roi-out').innerHTML = [['leads', r.leads], ['booked', r.booked], ['conversion', Math.round(r.conversion * 100) + '%'], ['revenue', '₹' + r.revenue.toLocaleString('en-IN')], ['cost per lead', r.costPerLead == null ? '–' : '₹' + r.costPerLead], ['return on ad spend', r.roas == null ? '–' : r.roas + '×'], ['replies handled', r.repliesHandled], ['touches to book', r.medianTouchesToBook == null ? '–' : r.medianTouchesToBook]].map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('') + Object.entries(r.bySource).map(([k, v]) => `<span>${esc(k)}: ${v.leads} leads <b>${v.booked} booked</b></span>`).join(''); }
  $('btn-roi').onclick = roi;
  $('btn-lead').onclick = () => action($('btn-lead'), async () => { await api('POST', '/api/growth/leads', { name: $('lead-name').value, phone: $('lead-phone').value, trip: $('lead-trip').value, source: $('lead-source').value || 'manual', next: new Date().toISOString() }); ['lead-name', 'lead-phone', 'lead-trip'].forEach(i => $(i).value = ''); loadSub('today'); });
  $('btn-review-reply').onclick = () => action($('btn-review-reply'), async () => { const r = await api('POST', '/api/growth/review', { text: $('rev-text').value, stars: +$('rev-stars').value, name: $('rev-name').value }); $('rev-out').innerHTML = `<div class="agent ${r.escalate ? '' : 'reply'}"><h4>Reply <span class="v ${r.escalate ? 'block' : 'ok'}">${r.escalate ? 'call them first' : 'post it'}</span></h4><div class="draft">${esc(r.reply)}${copyBtn(r.reply)}</div></div>`; });
  $('btn-csv').onclick = () => action($('btn-csv'), async () => { const r = await api('POST', '/api/connections/leads-csv', { text: $('csv-text').value, source: $('csv-source').value }); $('csv-result').textContent = r.error || `imported ${r.imported}, updated or skipped ${r.skipped}, total ${r.total}`; if (!r.error) $('csv-text').value = ''; });
  if (LOCAL) { $('dl-leads').hidden = true; $('dl-ics').hidden = true; }
  $('s-auto').onchange = () => api('POST', '/api/growth/settings', { autoReply: $('s-auto').checked });
  const waId = 'test-' + Math.random().toString(36).slice(2, 8);
  $('wa-form').addEventListener('submit', async (e) => { e.preventDefault(); const t = $('wa-input').value.trim(); if (!t) return; $('wa-input').value = ''; const m = $('wa-messages'); const add = (c, x, meta) => { const d = document.createElement('div'); d.className = 'msg ' + c; d.textContent = x; if (meta) { const s = document.createElement('span'); s.className = 'meta'; s.textContent = meta; d.appendChild(s); } m.appendChild(d); m.scrollTop = m.scrollHeight; }; add('user', t); busy(true); const r = await api('POST', '/api/growth/chat', { id: waId, text: t, source: 'test' }); busy(false); add('atlas', r.reply || r.error || '…', `stage ${r.stage} · ${r.language}${r.handoff ? ' · HANDOFF to human' : ''}${r.issues && r.issues.length ? ' · critic: ' + r.issues[0] : ''}`); });
  // ---------- Mission control: KPIs, proposals, the team ----------
  const TEAM = [['sales', 'Sales', 'qualifies and drafts replies'], ['operations', 'Operations', 'feasibility, routes, prices'], ['cx', 'Customer experience', 'tone and open questions'], ['news', 'Risk desk', 'news affecting trips'], ['critic', 'Critic', 'finds every loophole'], ['marketing', 'Marketing', 'campaigns and posts'], ['autopilot', 'Autopilot', 'proposes the next actions'], ['agent', 'Reasoning', 'thinks with the model'], ['learn', 'Memory', 'learns from every exchange'], ['sleep', 'Sleep', 'consolidates into facts']];
  $('team').innerHTML = TEAM.map(([k, n, d]) => `<div class="member" data-member="${k}"><i></i><div><b>${n}</b><span>${d}</span></div></div>`).join('');
  function teamPulse(e) { const txt = String(e.text || ''); const keys = []; if (e.kind === 'council') for (const [k] of TEAM) if (new RegExp('\\b' + k + '\\b').test(txt)) keys.push(k); if (['autopilot', 'agent', 'learn', 'sleep'].includes(e.kind)) keys.push(e.kind); for (const k of keys) { const el = document.querySelector(`.member[data-member="${k}"]`); if (!el) continue; el.classList.add('on'); el.querySelector('span').textContent = txt.slice(0, 70); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 4000); } }
  async function loadAutopilot() {
    let a; try { a = await api('GET', '/api/autopilot'); } catch (e) { return; } if (!a || a.error) return;
    const k = a.kpis; const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
    $('kpis').innerHTML = [['Seats left', k.seatsLeft, `${k.booked}/${k.seats} booked · ${k.fill}% full`], ['Booked revenue', inr(k.revenueBooked), `${inr(k.revenueOpen)} still open`], ['Open leads', k.leadsOpen, `${k.holds} on hold · ${k.leadsTotal} total`], ['Next departure', k.nextTrip ? k.nextTrip.days + ' days' : '–', k.nextTrip ? `${k.nextTrip.name} · ${k.nextTrip.left} left` : 'add a trip'], ['Replies 24h', k.replies24, `${k.sentToday} sent today`], ['To approve', k.pending, 'proposals waiting']].map(([t, v, s]) => `<div class="kpi"><div class="k">${t}</div><b>${v}</b><small>${esc(s)}</small></div>`).join('');
    $('ap-count').textContent = a.pending.length ? `${a.pending.length} waiting` : ''; $('ap-auto').checked = !!(a.auto && a.auto.follow_up);
    $('ap-list').innerHTML = a.pending.length ? a.pending.map(p => `<div class="prop p${p.priority}"><h4>${esc(p.title)}</h4><div class="why">${esc(p.why || '')}</div>${p.message ? `<div class="msg">${esc(p.message)}</div>` : ''}${p.options ? `<ul class="opts">${p.options.map(o => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}<div class="actions"><button class="btn primary" data-ap="${p.id}">${p.to && p.message ? 'Approve & send' : p.action ? 'Done: ' + esc(p.action) : 'Approve'}</button>${p.message ? copyBtn(p.message) : ''}<button class="btn" data-apx="${p.id}">Dismiss</button></div></div>`).join('') : '<div class="empty">Nothing to propose right now. OYE checks again every 30 minutes.</div>';
    $('ap-recent').innerHTML = (a.recent || []).map(r => `<li>${esc(r.title)}<span>${r.status}${r.reason ? ': ' + esc(r.reason) : ''}</span></li>`).join('') || '<li>Nothing yet.</li>';
    $('ap-list').querySelectorAll('[data-ap]').forEach(b => b.onclick = () => api('POST', '/api/autopilot/approve', { id: b.dataset.ap }).then(loadAutopilot));
    $('ap-list').querySelectorAll('[data-apx]').forEach(b => b.onclick = () => { const reason = prompt('Why not? (optional, OYE learns from it)') || ''; api('POST', '/api/autopilot/dismiss', { id: b.dataset.apx, reason }).then(loadAutopilot); });
  }
  $('ap-auto').onchange = () => api('POST', '/api/autopilot/auto', { kind: 'follow_up', on: $('ap-auto').checked });
  // ---------- The agent: ask OYE to do anything ----------
  let lastRun = null;
  $('agent-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const q = $('agent-input').value.trim(); if (!q) return;
    $('btn-agent').disabled = true; $('agent-status').textContent = 'thinking…'; busy(true);
    try {
      const r = await api('POST', '/api/agent', { request: q }); lastRun = r;
      $('agent-out').hidden = false; $('agent-final').textContent = r.final || r.error || '…'; $('agent-model').textContent = r.model || '';
      $('agent-todo').innerHTML = (r.todo || []).map(t => `<li>→ ${esc(t)}</li>`).join('');
      $('agent-steps').innerHTML = (r.steps || []).map(s => `<li><b>${esc(s.tool)}</b> ${esc(JSON.stringify(s.args || {}))}${s.thought ? ' · ' + esc(s.thought) : ''}<code>${esc(JSON.stringify(s.result)).slice(0, 700)}</code></li>`).join('') || '<li>Answered directly.</li>';
      $('agent-status').textContent = `${(r.steps || []).length} step(s) · ${r.ms} ms${(r.facts || []).length ? ' · learned ' + r.facts.length + ' fact(s)' : ''}`;
      $('agent-correct').hidden = true;
    } catch (err) { $('agent-status').textContent = 'Error: ' + err.message; }
    $('btn-agent').disabled = false; busy(false); refresh();
  });
  $('agent-copy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText($('agent-final').textContent); $('agent-copy').textContent = 'Copied'; setTimeout(() => $('agent-copy').textContent = 'Copy', 1200); };
  $('agent-good').onclick = () => lastRun && api('POST', '/api/agent/approve', { id: lastRun.id }).then(() => { $('agent-status').textContent = 'Thanks. Remembered as a good answer.'; refresh(); });
  $('agent-bad').onclick = () => { $('agent-correct').hidden = false; $('agent-correction').focus(); };
  $('agent-correct-send').onclick = () => { const c = $('agent-correction').value.trim(); if (!c || !lastRun) return; api('POST', '/api/agent/correct', { id: lastRun.id, correction: c }).then(() => { $('agent-status').textContent = 'Learned. Next time it answers this way.'; $('agent-correct').hidden = true; $('agent-correction').value = ''; refresh(); }); };
  loadGrow(); loadAutopilot();
})();
