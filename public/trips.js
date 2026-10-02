/* ATLAS live trips block for travelersclan.in. Put this where the trips should appear:
   <div id="atlas-trips"></div><script src="/atlas-chat/trips.js" data-base="/atlas-chat"></script>
   Cards come from Grow → Setup: fixed date, price, real seats left (holds included), WhatsApp button per trip. */
(function () {
  var s = document.currentScript, base = (s && s.getAttribute('data-base')) || '/atlas-chat';
  var host = document.getElementById(s && s.getAttribute('data-target') || 'atlas-trips'); if (!host) return;
  var css = '.atlas-trips{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;font:15px/1.4 system-ui,sans-serif}.atlas-trips .c{border:1px solid #e5e7eb;border-radius:14px;padding:16px;background:#fff;color:#111;display:flex;flex-direction:column;gap:6px;box-shadow:0 2px 10px rgba(0,0,0,.05)}.atlas-trips h3{margin:0;font-size:20px}.atlas-trips .d{color:#555}.atlas-trips .p{font-size:22px;font-weight:700}.atlas-trips .p small{font-size:12px;font-weight:400;color:#555}.atlas-trips .s{font-size:13px;font-weight:600;color:#b45309}.atlas-trips .s.few{color:#b91c1c}.atlas-trips .s.full{color:#6b7280}.atlas-trips a{margin-top:auto;display:block;text-align:center;background:#25D366;color:#fff;text-decoration:none;font-weight:600;padding:10px;border-radius:10px}.atlas-trips a.wl{background:#6b7280}.atlas-trips .inc{font-size:12px;color:#555}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  fetch(base + '/profile').then(function (r) { return r.json(); }).then(function (P) {
    var num = (P.waLink || '').split('?')[0];
    if (!P.trips || !P.trips.length) { host.innerHTML = '<p>New departures are announced every week. ' + (num ? '<a href="' + num + '">WhatsApp us</a> for the next one.' : '') + '</p>'; return; }
    host.className = 'atlas-trips';
    host.innerHTML = P.trips.map(function (t) {
      var date = t.date ? new Date(t.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Dates on request';
      var left = t.seatsLeft, full = t.seatsLeft === 0;
      var seat = full ? 'Batch full. Join the waitlist.' : left <= 3 ? 'Only ' + left + ' seat' + (left === 1 ? '' : 's') + ' left' : left + ' seats left';
      var msg = encodeURIComponent(full ? 'Hi, add me to the waitlist for ' + t.name + ' (' + date + ')' : 'Hi, I want to hold a seat on ' + t.name + ' (' + date + ')');
      return '<div class="c"><h3>' + esc(t.name) + '</h3><div class="d">' + esc(date) + (t.days ? ' · ' + t.days + ' days' : '') + (t.from ? ' · from ' + esc(t.from) : '') + '</div><div class="p">₹' + Number(t.price || 0).toLocaleString('en-IN') + ' <small>per person, all-inclusive</small></div><div class="inc">Stay, travel, meals and a trip captain. No hidden costs.</div><div class="s' + (full ? ' full' : left <= 3 ? ' few' : '') + '">' + seat + '</div>' + (num ? '<a class="' + (full ? 'wl' : '') + '" href="' + num + '?text=' + msg + '" target="_blank" rel="noopener">' + (full ? 'Join waitlist' : 'Hold my seat on WhatsApp') + '</a>' : '') + '</div>';
    }).join('');
  }).catch(function () { host.innerHTML = ''; });
})();
