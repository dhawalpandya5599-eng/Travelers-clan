'use strict';
/**
 * autopilot.js — initiative. OYE watches the business on its own and proposes concrete actions with the message or
 * post already written. The chief approves with one tap; approved messages go to the outbox the WhatsApp connector
 * sends, posts and decisions are marked done when the chief does them. Everything proposed is explained, nothing is
 * sent without approval unless the chief turns auto-send on for a kind.
 *
 * Kinds: follow_up (a due lead), hold_expiring, seat_push (few seats left: post it), fill_decision (departure near,
 * batch under half full), campaign (festival window open), risk (news affecting an upcoming trip), review_ask
 * (travelled lead), referral_ask, weekly_post (no post this week), setup (missing basics).
 */
const fs = require('fs');
const path = require('path');
const DAY = 86400e3;
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const money = (n) => '₹' + Math.round(+n || 0).toLocaleString('en-IN');

class Autopilot {
  constructor(brain) {
    this.brain = brain; this.file = path.join(brain.dataDir, 'autopilot.json');
    this.state = { proposals: [], outbox: [], auto: { follow_up: false }, lastRun: 0, lastPostAt: 0, done: {} };
    try { if (fs.existsSync(this.file)) Object.assign(this.state, JSON.parse(fs.readFileSync(this.file, 'utf8'))); } catch { /* fresh */ }
  }
  save() { try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.state)); } catch { /* ok */ } }
  get g() { return this.brain.growth; }
  key(kind, ref) { return `${kind}:${ref}`; }
  propose(p) {
    const k = this.key(p.kind, p.ref); const existing = this.state.proposals.find(x => x.key === k && x.status === 'pending');
    if (existing) { Object.assign(existing, p, { key: k }); return existing; }
    if (this.state.done[k] && Date.now() - this.state.done[k] < (p.repeatDays || 3) * DAY) return null;
    this.state.seq = (this.state.seq || 0) + 1; const e = { id: Date.now().toString(36) + '-' + this.state.seq.toString(36), key: k, status: 'pending', t: Date.now(), ...p };
    this.state.proposals.unshift(e); return e;
  }

  /** Look at everything once; returns the new proposals. Safe to call often. */
  async run() {
    const g = this.g; const P = g.profile; const now = Date.now(); const before = this.state.proposals.filter(p => p.status === 'pending').length;
    // 0. Basics missing: the system cannot sell without them.
    if (!P.phone) this.propose({ kind: 'setup', ref: 'phone', priority: 1, title: 'Add the company WhatsApp number', why: 'Every reply, post and website button points to it. Without it nothing can convert.', action: 'open Set up', repeatDays: 1 });
    if (!g.upcoming(1).length) this.propose({ kind: 'setup', ref: 'trips', priority: 1, title: 'Add at least one trip with a date, price and seats', why: 'Fixed dates sell. The website cards and the agent stay dark until one exists.', action: 'open Set up', repeatDays: 1 });
    // 1. Follow-ups due, message ready.
    const today = await g.today();
    for (const d of today.due) this.propose({ kind: 'follow_up', ref: d.lead.id, priority: 2, title: `Message ${d.lead.name || d.lead.id}${d.lead.trip ? ' about ' + d.lead.trip : ''} (${d.step.name})`, why: d.step.rule, message: d.message, to: d.lead.phone || d.lead.id, lead: d.lead.id, repeatDays: 1 });
    // 2. Holds expiring within 4 hours.
    g.releaseHolds();
    for (const t of g.upcoming(6)) for (const h of t.holds || []) if (h.until - now < 4 * 3600e3) { const l = g.state.leads.find(x => x.id === h.lead) || {}; this.propose({ kind: 'hold_expiring', ref: h.lead, priority: 1, title: `${l.name || h.lead}'s hold on ${t.name} expires at ${new Date(h.until).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`, why: `${h.n} seat${h.n > 1 ? 's' : ''} held, advance not received.`, message: `${l.name ? l.name.split(' ')[0] + ', ' : ''}your ${h.n} seat${h.n > 1 ? 's' : ''} on ${t.name} ${t.date ? '(' + fmtDate(t.date) + ')' : ''} are held till ${new Date(h.until).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}. Send the ${money(g.advance(t))} per person advance${P.upi ? ' to ' + P.upi : ''} and the screenshot here, or tell me if you need more time.`, to: l.phone || h.lead, lead: h.lead, repeatDays: 0.5 }); }
    // 3. Seats: push or decide.
    for (const t of g.upcoming(6)) {
      const left = g.seatsLeft(t); const days = t.date ? Math.ceil((new Date(t.date) - now) / DAY) : null;
      if (t.seats && left > 0 && left <= 3) this.propose({ kind: 'seat_push', ref: t.name, priority: 2, title: `Only ${left} seat${left > 1 ? 's' : ''} left on ${t.name}: post it`, why: 'Real scarcity converts the people who have been thinking.', message: `${left} seat${left > 1 ? 's' : ''} left on ${t.name}${t.date ? ', ' + fmtDate(t.date) : ''}, ${money(t.price)} all-inclusive. WhatsApp ${P.phone || 'us'} to hold yours.`, action: 'post as a story and a Google update', repeatDays: 2 });
      if (t.seats && days != null && days <= 10 && days >= 0 && t.booked / t.seats < 0.5) this.propose({ kind: 'fill_decision', ref: t.name, priority: 1, title: `${t.name} departs in ${days} day${days === 1 ? '' : 's'} at ${Math.round(100 * t.booked / t.seats)}% full: decide`, why: 'Under half full this close costs money either way. Push hard for 48 hours or merge into the next batch and tell the booked travellers today.', options: ['Push: run the past-traveller broadcast now and a 24h seat-hold offer', 'Merge: move booked travellers to the next batch with a free upgrade'], repeatDays: 2 });
    }
    // 4. Campaign windows open.
    for (const c of g.campaigns().filter(c => c.status === 'run now')) { let b = null; try { b = await g.broadcasts(); } catch { /* no trips */ } this.propose({ kind: 'campaign', ref: c.name, priority: 2, title: `Campaign window open: ${c.name} (${c.date})`, why: c.pitch, message: b && b.drafts ? b.drafts[1].text : '', action: 'send the warm-lead broadcast; post the campaign reel', repeatDays: 7 }); }
    // 5. Risk news touching upcoming trips.
    for (const t of g.upcoming(6)) { const items = this.brain.risk.relevant(t.name, '', { maxAgeDays: 30 }); for (const i of items.slice(0, 1)) this.propose({ kind: 'risk', ref: t.name + ':' + i.headline.slice(0, 30), priority: 1, title: `Risk for ${t.name}: ${i.headline}`, why: i.advice || 'Check with the ground partner before anything is sent.', message: `Quick update on ${t.name}${t.date ? ' (' + fmtDate(t.date) + ')' : ''}: ${i.headline}. We are watching it with our ground team and will confirm the plan 72 hours before departure. Your advance is safe and transferable.`, action: 'message every booked traveller', repeatDays: 5 }); }
    // 6. After the trip: review and referral.
    for (const l of g.state.leads.filter(l => l.stage === 'travelled')) {
      this.propose({ kind: 'review_ask', ref: l.id, priority: 3, title: `Ask ${l.name || l.id} for a Google review`, why: 'The day after return is the best day. Reviews are the strongest local ranking signal.', message: `${l.name ? l.name.split(' ')[0] + ', ' : ''}thank you for travelling with us${l.trip ? ' to ' + l.trip : ''}! One favour: a 30-second Google review helps a small team like ours more than any ad. ${P.website || ''} Thank you from the whole ${P.name} crew.`, to: l.phone || l.id, lead: l.id, repeatDays: 30 });
      const t = g.upcoming(1)[0]; if (t) this.propose({ kind: 'referral_ask', ref: l.id, priority: 3, title: `Referral offer to ${l.name || l.id}`, why: 'A happy traveller fills more seats than an ad.', message: `${l.name ? l.name.split(' ')[0] + ', ' : ''}if a friend books ${t.name} (${t.date ? fmtDate(t.date) : ''}) through you, you both get ${money(Math.round(t.price * 0.05 / 100) * 100)} off. Share ${g.waLink('Hi, ' + (l.name || 'a friend') + ' referred me') || P.phone}.`, to: l.phone || l.id, lead: l.id, repeatDays: 30 });
    }
    // 6b. Money and operations: balances due, pre-departure brief, waiting list when a seat opens, humans owed a reply.
    { const R = g.rules; const board = g.tripBoard();
      for (const row of board.trips) { const t = g.upcoming(8).find(x => x.name === row.name); if (!t) continue;
        for (const b of row.balancePending) { const l = g.state.leads.find(x => x.id === b.id) || {}; this.propose({ kind: 'balance_due', ref: b.id, priority: 1, repeatDays: 2, title: `Balance ${money(b.due)} due from ${b.name} for ${t.name}`, why: `Balance is due ${R.balanceDaysBefore} days before departure; hotels and transport are paid from it.`, message: `${l.name ? l.name.split(' ')[0] + ', ' : ''}${t.name} is on ${fmtDate(t.date)}, ${row.days} days away. The balance of ${money(b.due)} (${b.seats} seat${b.seats > 1 ? 's' : ''}) is due now${P.upi ? ' to UPI ' + P.upi : ''}; send the screenshot here and I will send the pickup point and the trip group link right after.`, to: l.phone || b.id, lead: b.id }); }
        if (row.days != null && row.days >= 0 && row.days <= R.pickupShareDays && (t.booked || 0) > 0) this.propose({ kind: 'pre_departure', ref: t.name, priority: 1, repeatDays: 7, title: `Send the pre-departure brief for ${t.name} (${row.days} day${row.days === 1 ? '' : 's'} to go)`, why: 'Pickup point, time, what to carry and the captain number, to every booked traveller, in one message, from one source.', message: `Hi {name}, ${P.name} here with your ${t.name} departure details. Date: ${fmtDate(t.date)}${t.days ? `, ${t.days} days` : ''}. Pickup: ${t.pickup || '{point and time}'}; please be there 15 minutes early. Carry: original photo ID for everyone, the booking screenshot, your medicines, a water bottle, one warm layer. Trip captain: ${t.captain || '{name and number}'}. Meals: breakfast and dinner included, veg and Jain available. Emergency: ${P.phone || '{office number}'}. Trip group: ${t.groupLink || '{link}'}. See you on ${fmtDate(t.date)}!`, to: 'all booked', lead: null });
        if (row.left > 0 && row.waitlist) for (const l of g.state.leads.filter(l => l.waitlist && l.waitlist === t.name && !['lost', 'travelled'].includes(l.stage)).slice(0, row.left)) this.propose({ kind: 'waitlist_seat', ref: l.id, priority: 1, repeatDays: 1, title: `A seat opened on ${t.name}: tell ${l.name || l.id} first`, why: 'They asked for the waiting list; first right to the seat, for 4 hours, then the next person.', message: `${l.name ? l.name.split(' ')[0] + ', ' : ''}good news: a seat opened on ${t.name} (${fmtDate(t.date)}, ${money(t.price)} per person). It is yours for the next 4 hours; reply "hold" and I will hold it, then the ${money(g.advance(t))} advance confirms it.`, to: l.phone || l.id, lead: l.id }); }
      for (const w of board.humanWait) this.propose({ kind: 'human_wait', ref: w.id, priority: 1, repeatDays: 1, title: `${w.name} has waited ${w.minutes >= 60 ? Math.round(w.minutes / 60) + ' h' : w.minutes + ' min'} for a human${w.trip ? ' (' + w.trip + ')' : ''}`, why: 'OYE handed this chat to the team (booking, complaint, incident or "talk to a person"). A hand-off nobody picks up is the fastest way to lose a sale.', message: `${w.name && w.name !== w.id ? w.name.split(' ')[0] + ', ' : ''}this is ${P.name}'s team taking over from OYE, sorry for the wait. I have the whole chat in front of me; tell me what you need and I will sort it right now.`, to: w.id, lead: w.id }); }
    // 7. Weekly post.
    if (g.upcoming(1).length && now - (this.state.lastPostAt || 0) > 7 * DAY) { const posts = await g.gbpPosts(); this.propose({ kind: 'weekly_post', ref: new Date().toISOString().slice(0, 10), priority: 3, title: 'No Google post this week', why: 'Google posts expire after 7 days; a dead profile looks like a dead business.', message: posts[0] ? posts[0].title + '\n' + posts[0].body : '', action: 'post it on the Google Business Profile', repeatDays: 7 }); }
    this.state.lastRun = now;
    // Prune: keep 30 days of decided proposals, 30 days of sent outbox, and done keys for 60 days.
    this.state.proposals = this.state.proposals.filter(p => p.status === 'pending' || now - (p.at || p.t) < 30 * DAY).slice(0, 500);
    this.state.outbox = this.state.outbox.filter(m => !m.sent || now - m.sent < 30 * DAY);
    for (const [k, t] of Object.entries(this.state.done)) if (now - t > 60 * DAY) delete this.state.done[k];
    // Auto-send kinds the chief switched on.
    for (const p of this.state.proposals) if (p.status === 'pending' && p.message && p.to && this.state.auto[p.kind]) this.approve(p.id, { silent: true });
    this.save();
    const added = this.state.proposals.filter(p => p.status === 'pending').length - before;
    if (added > 0) this.brain.event('autopilot', `proposed ${added} action(s)`);
    return this.pending();
  }
  pending() { return this.state.proposals.filter(p => p.status === 'pending').sort((a, b) => a.priority - b.priority || b.t - a.t).slice(0, 40); }
  approve(id, { silent = false } = {}) {
    const p = this.state.proposals.find(x => x.id === id); if (!p) return null;
    p.status = 'approved'; p.at = Date.now(); this.state.done[p.key] = Date.now();
    if (p.message && p.to) { this.state.outbox.push({ id: p.id, to: String(p.to), text: p.message, kind: p.kind, t: Date.now(), lead: p.lead || null }); }
    if (p.lead) this.g.updateLead(p.lead, { done: true });
    if (p.kind === 'weekly_post') this.state.lastPostAt = Date.now();
    this.save(); if (!silent) this.brain.event('autopilot', `approved: ${p.title}`);
    return p;
  }
  dismiss(id, reason = '') { const p = this.state.proposals.find(x => x.id === id); if (!p) return null; p.status = 'dismissed'; p.reason = reason; p.at = Date.now(); this.state.done[p.key] = Date.now(); if (reason) this.brain.teach(`The chief dismissed "${p.title}" because: ${reason}.`, { source: 'chief', importance: 0.7 }); this.save(); return p; }
  /** The connector takes what is approved and reports back. */
  outbox() { return this.state.outbox.filter(m => !m.sent && (m.attempts || 0) < 3); }
  sent(id, ok, error) { const m = this.state.outbox.find(x => x.id === id); if (!m) return null; if (ok) { m.sent = Date.now(); m.ok = true; } else { m.attempts = (m.attempts || 0) + 1; m.error = error || 'send failed'; if (m.attempts >= 3) { m.sent = Date.now(); m.ok = false; const p = this.state.proposals.find(x => x.id === id); if (p) { p.status = 'pending'; p.why = (p.why || '') + ' (automatic send failed 3 times: ' + m.error + '; send by hand)'; } this.brain.event('autopilot', `send failed 3 times for ${id}: ${m.error}`); } } this.save(); return m; }
  setAuto(kind, on) { this.state.auto[kind] = !!on; this.save(); return this.state.auto; }
  /** Live numbers for mission control. */
  kpis() {
    const g = this.g; const now = Date.now(); const trips = g.upcoming(6);
    const seatsLeft = trips.reduce((n, t) => n + g.seatsLeft(t), 0); const seats = trips.reduce((n, t) => n + (t.seats || 0), 0); const booked = trips.reduce((n, t) => n + (t.booked || 0), 0);
    const revenueBooked = trips.reduce((n, t) => n + (t.booked || 0) * (t.price || 0), 0); const revenueOpen = trips.reduce((n, t) => n + g.seatsLeft(t) * (t.price || 0), 0);
    const leads = g.state.leads; const open = leads.filter(l => !['lost', 'reviewed', 'travelled'].includes(l.stage));
    const next = trips.find(t => t.date); const days = next ? Math.ceil((new Date(next.date) - now) / DAY) : null;
    const replies24 = g.state.log.filter(x => now - x.t < DAY).length;
    return { seats, booked, seatsLeft, fill: seats ? Math.round(100 * booked / seats) : 0, revenueBooked, revenueOpen, leadsOpen: open.length, leadsTotal: leads.length, holds: trips.reduce((n, t) => n + (t.holds || []).length, 0), nextTrip: next ? { name: next.name, date: next.date, days, left: g.seatsLeft(next) } : null, replies24, pending: this.pending().length, sentToday: this.state.outbox.filter(m => m.sent && now - m.sent < DAY).length };
  }
}
module.exports = { Autopilot };
