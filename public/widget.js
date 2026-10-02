/* OYE — the Travelers Clan trip buddy, as a floating assistant on travelersclan.in (think Myra on MakeMyTrip).
   One script tag on every page:
     <script src="/atlas-chat/widget.js" data-base="/atlas-chat"></script>
   Answers in seconds from the clan's mind, shows live trip cards with seats left, holds a seat, remembers the
   visitor across pages, and hands the conversation to WhatsApp (with context) the moment a human should take over.
   Optional attributes: data-name="OYE" data-greet="..." data-position="left" data-delay="6000" */
(function () {
  if (window.__oyeWidget) return; window.__oyeWidget = true;
  var s = document.currentScript, base = (s && s.getAttribute('data-base')) || '/atlas-chat';
  var NAME = (s && s.getAttribute('data-name')) || 'OYE', LEFT = s && s.getAttribute('data-position') === 'left';
  var DELAY = +((s && s.getAttribute('data-delay')) || 6000), GREET = s && s.getAttribute('data-greet');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var id = store.get('oye-chat-id') || store.get('atlas-chat-id');
  if (!id) { id = 'web-' + Math.random().toString(36).slice(2, 10); store.set('oye-chat-id', id); }
  var history = []; try { history = JSON.parse(store.get('oye-chat-log') || '[]'); } catch (e) {}
  var P = { trips: [] }, open = false, nudged = store.get('oye-nudged') === '1', busy = false;

  var css = [
    '.oye,.oye *{box-sizing:border-box}',
    '.oye{position:fixed;' + (LEFT ? 'left' : 'right') + ':18px;bottom:18px;z-index:2147483000;font:15px/1.45 Montserrat,"Segoe UI",system-ui,-apple-system,sans-serif;color:#0b1220;-webkit-font-smoothing:antialiased}',
    '.oye .fab{display:flex;align-items:center;gap:10px;background:#0b1220;color:#fff;border:0;border-radius:999px;padding:6px 18px 6px 6px;cursor:pointer;box-shadow:0 10px 30px rgba(11,18,32,.35);transition:transform .2s;font-weight:600;font-size:14px;letter-spacing:.2px}',
    '.oye .fab:hover{transform:translateY(-2px)}',
    '.oye .av{position:relative;width:44px;height:44px;border-radius:50%;background:#fff;display:grid;place-items:center;flex:none;overflow:visible}',
    '.oye .av img{width:34px;height:34px;object-fit:contain;border-radius:50%}',
    '.oye .av i{position:absolute;right:1px;bottom:1px;width:11px;height:11px;border-radius:50%;background:#2ecc71;border:2px solid #0b1220}',
    '.oye .fab .av i{animation:oyePulse 2s infinite}',
    '@keyframes oyePulse{0%{box-shadow:0 0 0 0 rgba(46,204,113,.6)}70%{box-shadow:0 0 0 8px rgba(46,204,113,0)}100%{box-shadow:0 0 0 0 rgba(46,204,113,0)}}',
    '.oye .fab b{font-family:"Playfair Display",Georgia,serif;font-weight:700;font-size:16px;letter-spacing:.5px}',
    '.oye .fab small{display:block;font-weight:500;font-size:11px;opacity:.75;margin-top:-2px}',
    '.oye .nudge{position:absolute;bottom:66px;' + (LEFT ? 'left' : 'right') + ':0;width:250px;background:#fff;border-radius:16px;padding:12px 14px;box-shadow:0 10px 30px rgba(11,18,32,.25);font-size:13.5px;line-height:1.4;display:none;animation:oyeIn .3s ease}',
    '.oye .nudge.on{display:block}.oye .nudge b{color:#c6684f}.oye .nudge .x{position:absolute;top:6px;right:8px;border:0;background:none;color:#8a93a3;font-size:16px;cursor:pointer}',
    '.oye .nudge:after{content:"";position:absolute;bottom:-7px;' + (LEFT ? 'left' : 'right') + ':26px;border:7px solid transparent;border-top-color:#fff;border-bottom:0}',
    '@keyframes oyeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
    '.oye .panel{display:none;position:absolute;bottom:0;' + (LEFT ? 'left' : 'right') + ':0;width:380px;max-width:calc(100vw - 36px);height:620px;max-height:calc(100vh - 36px);background:#fbf7f2;border-radius:22px;box-shadow:0 24px 70px rgba(11,18,32,.35);overflow:hidden;flex-direction:column;animation:oyeIn .25s ease}',
    '.oye .panel.on{display:flex}',
    '.oye .head{background:#0b1220;color:#fff;padding:12px 14px;display:flex;align-items:center;gap:10px}',
    '.oye .head .t b{display:block;font-family:"Playfair Display",Georgia,serif;font-size:17px;letter-spacing:.4px}.oye .head .t span{font-size:12px;opacity:.75}',
    '.oye .head .ic{margin-left:auto;display:flex;gap:4px}.oye .head button{border:0;background:rgba(255,255,255,.08);color:#fff;width:32px;height:32px;border-radius:10px;cursor:pointer;font-size:16px}',
    '.oye .msgs{flex:1;overflow-y:auto;padding:14px 14px 6px;display:flex;flex-direction:column;gap:8px;scroll-behavior:smooth}',
    '.oye .m{max-width:86%;padding:10px 13px;border-radius:16px;font-size:14px;white-space:pre-wrap;word-break:break-word}',
    '.oye .m.a{background:#fff;border-bottom-left-radius:6px;align-self:flex-start;box-shadow:0 1px 2px rgba(11,18,32,.08)}',
    '.oye .m.u{background:#c6684f;color:#fff;border-bottom-right-radius:6px;align-self:flex-end}',
    '.oye .m.sys{align-self:center;background:none;color:#8a93a3;font-size:12px;padding:2px}',
    '.oye .typing{align-self:flex-start;background:#fff;border-radius:16px;padding:10px 14px;display:flex;gap:4px}.oye .typing i{width:7px;height:7px;border-radius:50%;background:#c6684f;opacity:.4;animation:oyeDot 1.2s infinite}.oye .typing i:nth-child(2){animation-delay:.2s}.oye .typing i:nth-child(3){animation-delay:.4s}',
    '@keyframes oyeDot{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}',
    '.oye .cards{display:flex;gap:10px;overflow-x:auto;padding:2px 0 6px;scroll-snap-type:x mandatory;max-width:100%}.oye .cards::-webkit-scrollbar{height:4px}',
    '.oye .card{flex:0 0 200px;scroll-snap-align:start;background:#fff;border-radius:14px;padding:12px;box-shadow:0 1px 3px rgba(11,18,32,.1);border-top:3px solid #c6684f}',
    '.oye .card b{font-family:"Playfair Display",Georgia,serif;font-size:16px;display:block}.oye .card .d{font-size:12px;color:#5b6475;margin:2px 0 6px}',
    '.oye .card .p{font-weight:700;font-size:15px}.oye .card .p small{font-weight:500;color:#5b6475;font-size:11px}',
    '.oye .card .s{font-size:11.5px;color:#c6684f;font-weight:600;margin:4px 0 8px}.oye .card .s.ok{color:#2a9d5c}',
    '.oye .card button{width:100%;border:0;background:#0b1220;color:#fff;border-radius:10px;padding:8px;font-weight:600;cursor:pointer;font-size:13px}',
    '.oye .chips{display:flex;gap:6px;flex-wrap:wrap;padding:6px 14px 8px}.oye .chips button{border:1px solid #e3d9cf;background:#fff;color:#0b1220;border-radius:999px;padding:6px 12px;font-size:12.5px;cursor:pointer;font-weight:600}.oye .chips button:hover{border-color:#c6684f;color:#c6684f}',
    '.oye form{display:flex;gap:8px;padding:8px 12px 10px;background:#fff;border-top:1px solid #efe7df}',
    '.oye input{flex:1;border:1px solid #e3d9cf;border-radius:14px;padding:11px 14px;font:inherit;font-size:14px;outline:none;background:#fbf7f2}.oye input:focus{border-color:#c6684f}',
    '.oye form button{border:0;background:#c6684f;color:#fff;width:44px;border-radius:14px;cursor:pointer;font-size:18px}',
    '.oye .wa{display:flex;align-items:center;justify-content:center;gap:8px;background:#25D366;color:#fff;text-decoration:none;font-weight:700;font-size:13.5px;padding:10px;margin:0}',
    '.oye .foot{font-size:10.5px;color:#8a93a3;text-align:center;padding:4px 0 6px;background:#fff}',
    '@media (max-width:480px){.oye{right:12px;left:12px;bottom:12px}.oye .fab{margin-left:auto}.oye .panel{width:100%;max-width:100%;height:calc(100vh - 24px);height:calc(100dvh - 24px);max-height:none;border-radius:18px;left:0;right:0}.oye .nudge{right:0}}'
  ].join('');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var logo = base + '/logo-mark.png';
  var w = document.createElement('div'); w.className = 'oye';
  w.innerHTML =
    '<div class="nudge"><button class="x" aria-label="Close">×</button><b>' + NAME + ' here 👋</b> Planning a trip? Ask me about dates, price and seats; I reply in seconds.</div>' +
    '<div class="panel" role="dialog" aria-label="' + NAME + ' chat">' +
      '<div class="head"><div class="av"><img src="' + logo + '" alt=""><i></i></div><div class="t"><b>' + NAME + '</b><span>Travelers Clan trip buddy · online now</span></div>' +
      '<div class="ic"><button class="min" title="Minimise" aria-label="Minimise">—</button></div></div>' +
      '<div class="msgs"></div><div class="chips"></div>' +
      '<form><input placeholder="Ask about any trip, dates, price…" autocomplete="off" maxlength="600"><button type="submit" aria-label="Send">➤</button></form>' +
      '<a class="wa" target="_blank" rel="noopener"><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1s-.5-.1-.7.1-.8 1-.9 1.2-.3.2-.6.1a7.6 7.6 0 0 1-3.7-3.2c-.3-.5.3-.4.8-1.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 0 0-.8.4 3.4 3.4 0 0 0-1 2.5 5.9 5.9 0 0 0 1.2 3.1 13.5 13.5 0 0 0 5.2 4.6c1.9.8 2.7.9 3.7.8a3.1 3.1 0 0 0 2-1.5 2.5 2.5 0 0 0 .2-1.5c-.1-.1-.3-.2-.6-.3M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2m0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2"/></svg>Continue on WhatsApp</a>' +
      '<div class="foot">Replies come from ' + NAME + ', the clan\'s own assistant. A team member joins for bookings.</div>' +
    '</div>' +
    '<button class="fab" aria-label="Chat with ' + NAME + '"><span class="av"><img src="' + logo + '" alt=""><i></i></span><span><b>Ask ' + NAME + '</b><small>trips · dates · seats</small></span></button>';
  document.body.appendChild(w);
  var panel = w.querySelector('.panel'), msgs = w.querySelector('.msgs'), chips = w.querySelector('.chips'), form = w.querySelector('form'),
      inp = w.querySelector('input'), wa = w.querySelector('.wa'), fab = w.querySelector('.fab'), nudge = w.querySelector('.nudge');

  function money(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }
  function when(d) { if (!d) return ''; try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); } catch (e) { return d; } }
  function scroll() { msgs.scrollTop = msgs.scrollHeight; }
  function add(cls, text, save) { var d = document.createElement('div'); d.className = 'm ' + cls; d.textContent = text; msgs.appendChild(d); scroll(); if (save !== false) { history.push({ r: cls, t: text, at: Date.now() }); if (history.length > 40) history = history.slice(-40); store.set('oye-chat-log', JSON.stringify(history)); } return d; }
  function typing(on) { var t = msgs.querySelector('.typing'); if (!on) { if (t) t.remove(); return; } if (t) return; t = document.createElement('div'); t.className = 'typing'; t.innerHTML = '<i></i><i></i><i></i>'; msgs.appendChild(t); scroll(); }
  function cards(trips) {
    if (!trips || !trips.length) return; var box = document.createElement('div'); box.className = 'cards';
    trips.slice(0, 6).forEach(function (t) {
      var c = document.createElement('div'); c.className = 'card'; var left = t.seatsLeft, full = left != null && left <= 0;
      c.innerHTML = '<b></b><div class="d"></div><div class="p"></div><div class="s"></div><button></button>';
      c.querySelector('b').textContent = t.name; c.querySelector('.d').textContent = [when(t.date), t.days ? t.days + ' days' : ''].filter(Boolean).join(' · ');
      c.querySelector('.p').innerHTML = (t.price ? money(t.price) : '') + ' <small>per person, all-inclusive</small>';
      var sEl = c.querySelector('.s'); sEl.textContent = full ? 'Batch full · join the waiting list' : left != null ? (left <= 4 ? 'Only ' + left + ' seat' + (left > 1 ? 's' : '') + ' left' : left + ' seats left') : ''; if (left > 4) sEl.className = 's ok';
      var b = c.querySelector('button'); b.textContent = full ? 'Waiting list' : 'Hold a seat';
      b.onclick = function () { send(full ? 'Put me on the waiting list for ' + t.name : 'Hold 1 seat on ' + t.name + (t.date ? ' ' + when(t.date) : '')); };
      box.appendChild(c);
    });
    msgs.appendChild(box); scroll();
  }
  function chipSet(list) { chips.innerHTML = ''; list.forEach(function (c) { var b = document.createElement('button'); b.type = 'button'; b.textContent = c[0]; b.onclick = function () { send(c[1] || c[0]); }; chips.appendChild(b); }); }
  var CHIPS = [['Upcoming trips', 'Which trips are coming up?'], ['Price & what\'s included', 'What is the price and what is included?'], ['Hold a seat', 'I want to hold a seat'], ['Is it safe for solo women?', 'Is it safe for a girl travelling solo?'], ['Talk to a human', 'I want to talk to a team member']];
  function waContext() { var last = history.filter(function (h) { return h.r === 'u'; }).slice(-3).map(function (h) { return h.t; }); if (!P.waLink) return; wa.href = P.waLink.split('?')[0] + '?text=' + encodeURIComponent('Hi Travelers Clan, I was chatting with ' + NAME + ' on the website' + (last.length ? ': ' + last.join(' / ') : '') + '. Please continue here.'); }
  function greet() {
    var g = GREET || ('Namaste 🙏 I am ' + NAME + ', the Travelers Clan trip buddy. Tell me where you want to go and roughly when, and I will check dates, price and seats for you in seconds.');
    add('a', g); if (P.trips && P.trips.length) { add('a', 'Next departures:', false); cards(P.trips); }
    chipSet(CHIPS);
  }
  function restore() { history.forEach(function (h) { add(h.r, h.t, false); }); var d = document.createElement('div'); d.className = 'm sys'; d.textContent = 'Earlier chat restored · ' + NAME + ' remembers you'; msgs.appendChild(d); chipSet(CHIPS); }
  function openPanel() { open = true; panel.classList.add('on'); fab.style.display = 'none'; nudge.classList.remove('on'); if (!msgs.children.length) { if (history.length) restore(); else greet(); } setTimeout(function () { inp.focus(); scroll(); }, 50); }
  function closePanel() { open = false; panel.classList.remove('on'); fab.style.display = ''; }
  function send(text) {
    text = String(text || '').trim(); if (!text || busy) return; add('u', text); busy = true; typing(true); chips.innerHTML = '';
    fetch(base + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, text: text, page: location.pathname }) })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        typing(false); busy = false; var reply = r.reply || 'One moment, a team member will reply here.'; add('a', reply);
        var low = text.toLowerCase();
        if (/which trips|coming up|upcoming|next (batch|trip)|dates?\b/.test(low) && P.trips.length) cards(P.trips);
        if (r.handoff || /human|team member|call me|founder/.test(low)) { var d = document.createElement('div'); d.className = 'm sys'; d.textContent = 'A team member is looped in. Fastest on WhatsApp ↓'; msgs.appendChild(d); scroll(); wa.style.boxShadow = '0 0 0 3px rgba(37,211,102,.35) inset'; }
        chipSet(r.handoff ? [['Upcoming trips', 'Which trips are coming up?'], ['Payment details', 'How do I pay the advance?'], ['Talk to a human', 'I want to talk to a team member']] : CHIPS.filter(function (c) { return c[0] !== 'Upcoming trips' || P.trips.length; }));
        waContext();
      })
      .catch(function () { typing(false); busy = false; add('a', 'Network hiccup on my side. Tap "Continue on WhatsApp" and the team replies there.'); chipSet(CHIPS); });
  }
  fetch(base + '/profile').then(function (r) { return r.json(); }).then(function (p) { P = p || P; P.trips = P.trips || []; if (!P.waLink) wa.style.display = 'none'; else waContext(); }).catch(function () { wa.style.display = 'none'; });
  fab.onclick = openPanel; w.querySelector('.min').onclick = closePanel; nudge.querySelector('.x').onclick = function (e) { e.stopPropagation(); nudge.classList.remove('on'); store.set('oye-nudged', '1'); };
  nudge.onclick = openPanel;
  form.onsubmit = function (e) { e.preventDefault(); var t = inp.value; inp.value = ''; send(t); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) closePanel(); });
  if (!nudged && !reduce) setTimeout(function () { if (!open) { nudge.classList.add('on'); store.set('oye-nudged', '1'); setTimeout(function () { nudge.classList.remove('on'); }, 12000); } }, DELAY);
  // Any element on the site can open the chat with a message: <a href="#oye" data-oye="Goa in December for 4?">
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('[data-oye]'); if (!a) return; e.preventDefault(); openPanel(); var t = a.getAttribute('data-oye'); if (t) send(t); });
  window.OYE = { open: openPanel, close: closePanel, ask: function (t) { openPanel(); send(t); } };
})();
