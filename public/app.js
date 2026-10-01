/* ATLAS front-end: chat, live knowledge-graph (force layout), evolution chart, event stream. */
(() => {
  const $ = (id) => document.getElementById(id);
  const LOCAL = window.ATLAS_LOCAL || null; // set when the brain runs inside this page (no server)
  const BASE = window.ATLAS_BASE || '';     // set when mounted under a prefix inside another site
  const api = async (method, url, body) => {
    if (LOCAL) return LOCAL.request(method, url, body);
    const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return r.json();
  };
  const fmt = (n, d = 3) => (n == null ? '–' : typeof n === 'number' ? +n.toFixed(d) : n);

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
  async function action(btn, fn) { btn.disabled = true; busy(true); try { await fn(); } finally { btn.disabled = false; busy(false); refresh(); } }
  function busy(b) { $('pulse').classList.toggle('busy', b); }

  // ---------- Snapshot ----------
  async function refresh() {
    const s = await api('GET', '/api/snapshot');
    $('v-gen').textContent = s.generation;
    $('v-fit').textContent = fmt(s.fitness);
    $('v-facts').textContent = s.memory.facts;
    $('v-concepts').textContent = s.memory.concepts;
    $('v-syn').textContent = s.memory.synapses;
    $('v-ep').textContent = s.memory.episodes;
    $('v-appr').textContent = Math.round(s.approval * 100) + '%';
    $('v-mentor').textContent = s.mentor.enabled ? 'online' : 'offline';
    $('v-mentor').title = s.mentor.enabled ? s.mentor.model : (s.mentor.lastError || '');
    $('dopamine').style.setProperty('--d', s.memory.dopamine);
    $('wm').innerHTML = '<span class="label">working memory</span>' + (s.memory.workingMemory.map(w => `<span title="activation ${w.activation}">${esc(w.id)}</span>`).join('') || '<span class="label">∅</span>');
    $('genome').innerHTML = Object.entries(s.genome).map(([k, v]) => `<div>${k}<b>${fmt(v, 3)}</b></div>`).join('');
    const asks = [...(s.contradictions || []).map(c => `<li>Which is right? <b>${esc(c.s)} ${esc(c.p)}</b> ${c.options.map(esc).join(' <i>or</i> ')}<span>contradiction</span></li>`),
      ...s.unknowns.slice(-5).reverse().map(u => `<li>${esc(u.q)}<span>unanswered</span></li>`)];
    $('asks').innerHTML = asks.join('') || '<li class="hint">Nothing pending. Ask me something hard.</li>';
    $('facts').innerHTML = s.topFacts.map(f => `<li>${esc(f.text)}<span>${f.confidence} · ${esc(f.source)}</span></li>`).join('') || '<li class="hint">Nothing learned yet. Teach me.</li>';
    $('skills').innerHTML = s.skills.map(k => `<li class="${k.learned ? 'learned' : ''}" title="${esc(k.description)}">${esc(k.name)} ${k.wins || k.losses ? `+${k.wins}/−${k.losses}` : ''}</li>`).join('');
    if (!logSeeded) { logSeeded = true; for (const e of s.log) pushLog(e); }
    drawEvo(s.history);
    if (s.pendingQuestion && !askedPending) { askedPending = s.pendingQuestion.subject; }
    const g = await api('GET', '/api/graph?limit=110');
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
    if (LOCAL) { LOCAL.onEvent(e => { pushLog(e); if (['sleep', 'evolve', 'learn', 'reward'].includes(e.kind)) graph.flash(); }); return; }
    const es = new EventSource(BASE + '/api/events');
    es.onmessage = (m) => { const e = JSON.parse(m.data); pushLog(e); if (['sleep', 'evolve', 'learn', 'reward'].includes(e.kind)) graph.flash(); };
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

  // ---------- Knowledge graph (force-directed, canvas) ----------
  const graph = (() => {
    const canvas = $('graph'); const ctx = canvas.getContext('2d');
    let nodes = [], links = [], byId = new Map(), flashUntil = 0, hover = null, drag = null;
    function update(g) {
      const next = new Map();
      for (const n of g.nodes) {
        const old = byId.get(n.id);
        next.set(n.id, old ? Object.assign(old, n) : { ...n, x: canvas.clientWidth / 2 + (Math.random() - .5) * 200, y: canvas.clientHeight / 2 + (Math.random() - .5) * 200, vx: 0, vy: 0 });
      }
      byId = next; nodes = [...next.values()];
      links = g.links.map(l => ({ a: next.get(l.source), b: next.get(l.target), w: l.w })).filter(l => l.a && l.b);
    }
    function flash() { flashUntil = performance.now() + 900; }
    function step() {
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const cx = W / 2, cy = H / 2;
      const scale = Math.sqrt((W * H) / Math.max(1, nodes.length)); // mean area per node → natural spacing
      const spacing = Math.min(80, scale * 0.9);
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        a.vx += (cx - a.x) * 0.006; a.vy += (cy - a.y) * 0.006; // gravity to centre
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]; let dx = a.x - b.x, dy = a.y - b.y; const d2 = dx * dx + dy * dy + 0.01;
          if (d2 > spacing * spacing * 9) continue;
          const f = (spacing * spacing * 0.35) / d2; dx *= f / Math.sqrt(d2) ; dy *= f / Math.sqrt(d2); a.vx += dx; a.vy += dy; b.vx -= dx; b.vy -= dy;
        }
      }
      for (const l of links) {
        const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const target = spacing * (1.3 - 0.6 * l.w); const f = (d - target) * 0.01 * (0.3 + l.w);
        l.a.vx += dx / d * f; l.a.vy += dy / d * f; l.b.vx -= dx / d * f; l.b.vy -= dy / d * f;
      }
      for (const n of nodes) {
        if (n === drag) { n.vx = n.vy = 0; continue; }
        n.vx *= 0.7; n.vy *= 0.7; n.x += Math.max(-6, Math.min(6, n.vx)); n.y += Math.max(-6, Math.min(6, n.vy));
        n.x = Math.max(24, Math.min(W - 24, n.x)); n.y = Math.max(16, Math.min(H - 16, n.y));
      }
    }
    function draw() {
      const dpr = window.devicePixelRatio || 1; const W = canvas.clientWidth, H = canvas.clientHeight;
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const flashing = performance.now() < flashUntil;
      for (const l of links) {
        const hot = hover && (l.a === hover || l.b === hover);
        ctx.strokeStyle = hot ? 'rgba(94,225,194,.9)' : `rgba(139,124,255,${0.08 + l.w * 0.5})`; ctx.lineWidth = hot ? 1.5 : 0.5 + l.w * 2;
        ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke();
      }
      for (const n of nodes) {
        const r = 3 + n.strength * 9 + Math.log1p(n.count) * 0.8;
        const glow = n.activation + (flashing ? 0.3 : 0);
        if (glow > 0.05) { ctx.beginPath(); ctx.arc(n.x, n.y, r + 6 + glow * 10, 0, Math.PI * 2); ctx.fillStyle = `rgba(94,225,194,${Math.min(0.35, glow * 0.35)})`; ctx.fill(); }
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.kind === 'entity' ? '#5ee1c2' : '#8b7cff'; ctx.fill();
        if (n === hover) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
        if (n.strength > 0.35 || n === hover || n.activation > 0.4 || nodes.length < 25) {
          ctx.fillStyle = n === hover ? '#fff' : 'rgba(230,236,245,.85)'; ctx.font = `${n === hover ? 13 : 11}px system-ui, sans-serif`; ctx.fillText(n.label, n.x + r + 3, n.y + 4);
        }
      }
      if (!nodes.length) { ctx.fillStyle = '#8a9ab5'; ctx.font = '13px system-ui'; ctx.fillText('The cortex is empty. Teach me something.', 20, 30); }
    }
    function loop() { step(); draw(); requestAnimationFrame(loop); }
    const pick = (e) => { const r = canvas.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; return nodes.find(n => (n.x - x) ** 2 + (n.y - y) ** 2 < 144) || null; };
    canvas.addEventListener('mousemove', e => { if (drag) { const r = canvas.getBoundingClientRect(); drag.x = e.clientX - r.left; drag.y = e.clientY - r.top; } else hover = pick(e); canvas.style.cursor = hover ? 'pointer' : 'default'; });
    canvas.addEventListener('mousedown', e => { drag = pick(e); });
    window.addEventListener('mouseup', () => { drag = null; });
    canvas.addEventListener('click', e => { const n = pick(e); if (n && !drag) { $('chat-input').value = `What is ${n.label}?`; $('chat-input').focus(); } });
    loop();
    return { update, flash };
  })();

  if (LOCAL) { const ex = document.getElementById('btn-export'); if (ex) { ex.addEventListener('click', (e) => { e.preventDefault(); LOCAL.exportMind(); }); } }
  // ---------- Boot ----------
  addMsg('atlas', 'I am ATLAS. I was born knowing nothing. Teach me about the clan, ask me questions, correct me when I am wrong, and reward good answers. I sleep to consolidate and evolve to improve.');
  connect();
  refresh();
  setInterval(refresh, 15000);
  window.addEventListener('resize', () => refresh());
})();
