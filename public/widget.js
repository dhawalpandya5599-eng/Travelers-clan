/* ATLAS chat widget for travelersclan.in. One script tag:
   <script src="/atlas-chat/widget.js" data-base="/atlas-chat"></script>
   Answers in seconds from the clan's mind, keeps the lead, and hands off to WhatsApp for booking. */
(function () {
  var s = document.currentScript, base = (s && s.getAttribute('data-base')) || '/atlas-chat';
  var id; try { id = localStorage.getItem('atlas-chat-id'); } catch (e) {}
  if (!id) { id = 'web-' + Math.random().toString(36).slice(2, 10); try { localStorage.setItem('atlas-chat-id', id); } catch (e) {} }
  var css = '#atlasw{position:fixed;right:16px;bottom:16px;z-index:99999;font:15px/1.4 system-ui,sans-serif}#atlasw .b{background:#25D366;color:#fff;border:0;border-radius:28px;padding:12px 18px;font-weight:600;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.25)}#atlasw .p{display:none;position:absolute;right:0;bottom:60px;width:320px;max-width:calc(100vw - 32px);height:440px;background:#fff;color:#111;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.3);overflow:hidden;flex-direction:column}#atlasw .p.o{display:flex}#atlasw .h{background:#075E54;color:#fff;padding:12px 14px;font-weight:600}#atlasw .m{flex:1;overflow:auto;padding:10px;display:flex;flex-direction:column;gap:6px;background:#ECE5DD}#atlasw .m div{max-width:85%;padding:8px 10px;border-radius:10px;white-space:pre-wrap;word-break:break-word}#atlasw .u{align-self:flex-end;background:#DCF8C6}#atlasw .a{align-self:flex-start;background:#fff}#atlasw form{display:flex;gap:6px;padding:8px;border-top:1px solid #ddd}#atlasw input{flex:1;padding:9px;border:1px solid #ccc;border-radius:8px;font:inherit}#atlasw .wa{display:block;text-align:center;padding:8px;background:#25D366;color:#fff;text-decoration:none;font-weight:600}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var w = document.createElement('div'); w.id = 'atlasw';
  w.innerHTML = '<div class="p"><div class="h">Travelers Clan · ask about any trip</div><div class="m"></div><form><input placeholder="e.g. Goa in December for 4, budget?" autocomplete="off"><button type="submit">Send</button></form><a class="wa" target="_blank" rel="noopener">Continue on WhatsApp</a></div><button class="b">Chat with us</button>';
  document.body.appendChild(w);
  var p = w.querySelector('.p'), m = w.querySelector('.m'), f = w.querySelector('form'), inp = w.querySelector('input'), wa = w.querySelector('.wa');
  function add(cls, t) { var d = document.createElement('div'); d.className = cls; d.textContent = t; m.appendChild(d); m.scrollTop = m.scrollHeight; }
  fetch(base + '/profile').then(function (r) { return r.json(); }).then(function (P) {
    wa.href = P.waLink || '#'; if (!P.waLink) wa.style.display = 'none';
    add('a', 'Hi! Which trip and dates are you looking at?' + (P.trips && P.trips.length ? ' Next: ' + P.trips.map(function (t) { return t.name + (t.date ? ' (' + t.date + ')' : ''); }).join(', ') + '.' : ''));
  }).catch(function () { add('a', 'Hi! Which trip and dates are you looking at?'); });
  w.querySelector('.b').onclick = function () { p.classList.toggle('o'); if (p.classList.contains('o')) inp.focus(); };
  var history = [];
  f.onsubmit = function (e) {
    e.preventDefault(); var t = inp.value.trim(); if (!t) return; inp.value = ''; add('u', t); history.push(t);
    fetch(base + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, text: t }) })
      .then(function (r) { return r.json(); }).then(function (r) { add('a', r.reply || 'One moment, a team member will reply.'); if (wa.href && wa.href !== '#') wa.href = wa.href.split('?')[0] + '?text=' + encodeURIComponent('Hi, I was chatting on the website: ' + history.slice(-3).join(' / ')); })
      .catch(function () { add('a', 'Network hiccup. Tap "Continue on WhatsApp" and we will reply there.'); });
  };
})();
