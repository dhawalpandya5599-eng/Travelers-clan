'use strict';
/**
 * autopilot.js — initiative. ATLAS watches the business on its own and proposes concrete actions with the message or
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
    const e = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), key: k, status: 'pending', t: Date.now(), ...p };
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
    // 7. Weekly post.
    if (g.upcoming(1).length && now - (this.state.lastPostAt || 0) > 7 * DAY) { const posts = await g.gbpPosts(); this.propose({ kind: 'weekly_post', ref: new Date().toISOString().slice(0, 10), priority: 3, title: 'No Google post this week', why: 'Google posts expire after 7 days; a dead profile looks like a dead business.', message: posts[0] ? posts[0].title + '\n' + posts[0].body : '', action: 'post it on the Google Business Profile', repeatDays: 7 }); }
    this.state.lastRun = now;
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
  outbox() { return this.state.outbox.filter(m => !m.sent); }
  sent(id, ok, error) { const m = this.state.outbox.find(x => x.id === id); if (!m) return null; m.sent = Date.now(); m.ok = !!ok; if (error) m.error = error; this.save(); return m; }
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
