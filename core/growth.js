'use strict';
/**
 * growth.js — the local-growth engine: our own version of the three agents a "Grexa" sells, with no subscription.
 *
 *   1. Google profile agent  — audit of the Google Business Profile, weekly posts, keyword set, review replies.
 *   2. WhatsApp chat agent   — answers an enquiry in the customer's language within seconds, qualifies it,
 *                              keeps a lead sheet (name, trip, stage, next follow-up) and hands off to a human
 *                              the moment money or a booking is on the table.
 *   3. Marketing agent       — a festival/season campaign calendar for India, broadcast drafts per segment,
 *                              review reminders, a 4-touch follow-up sequence, and ROI from the lead sheet.
 *
 * Rules first, so everything works offline and for free; an open model (Ollama / any OpenAI-compatible endpoint)
 * or Claude, when present, polishes the text in the customer's own register. State lives in growth.json next to the mind.
 */
const fs = require('fs');
const path = require('path');
const DEST = require('./destinations');
const { parseRequirements } = require('./agents');
const { detectStage } = require('./funnel');

const DAY = 86400e3;
const STAGES = ['new', 'qualified', 'quoted', 'objection', 'advance', 'balance', 'travelled', 'reviewed', 'lost'];
/** Indian retail calendar: when people decide to travel. Month is 1-12; `lead` is how many days before to start campaigns. */
const CALENDAR = [
  { name: 'Republic Day long weekend', month: 1, day: 26, lead: 25, pitch: '3-day escape, no leave needed' },
  { name: 'Valentine\'s week', month: 2, day: 14, lead: 20, pitch: 'couple trips, candlelight dinner included' },
  { name: 'Holi', month: 3, day: 4, lead: 20, pitch: 'Holi in the hills, colours and bonfire' },
  { name: 'Summer vacation (schools close)', month: 4, day: 20, lead: 45, pitch: 'family hill-station trips, kids go free below 5' },
  { name: 'Monsoon season', month: 7, day: 1, lead: 30, pitch: 'Western Ghats treks and waterfalls' },
  { name: 'Independence Day long weekend', month: 8, day: 15, lead: 25, pitch: 'tricolour trek, 3-day batch' },
  { name: 'Ganesh Chaturthi', month: 8, day: 27, lead: 15, pitch: 'post-visarjan getaway' },
  { name: 'Navratri / Dussehra', month: 10, day: 2, lead: 25, pitch: 'festive-week departures, early-bird price' },
  { name: 'Diwali', month: 10, day: 20, lead: 35, pitch: 'Diwali-week family batches, gift a trip' },
  { name: 'Christmas and New Year', month: 12, day: 25, lead: 50, pitch: 'NYE batches sell out first, seats release early' },
  { name: 'Year-end college exams finish', month: 12, day: 10, lead: 30, pitch: 'student batches, 8k–12k' },
];
const SEQUENCE = [
  { day: 0, name: 'instant reply', rule: 'answer every point, give one price and one next step' },
  { day: 1, name: 'value nudge', rule: 'send the day-by-day plan or 3 photos from the last batch, ask one question' },
  { day: 3, name: 'social proof', rule: 'one review screenshot or a traveller voice note, mention seats left' },
  { day: 7, name: 'last call', rule: 'honest deadline: price or seats change on a date; offer to hold a seat for 24h' },
  { day: 21, name: 'next batch', rule: 'no pressure: share the next departure that fits them' },
];

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const money = (n) => '₹' + Math.round(+n || 0).toLocaleString('en-IN');
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const isHinglish = (t) => /\b(hai|kya|kitna|kitne|bhai|bhaiya|didi|batao|chahiye|karna|karenge|nahi|haan|ji|kab|kaise|paise|rupay|mein|ka|ki|ke|ho|hoga|hogi|milega|plz|pls)\b/i.test(t);

class Growth {
  constructor(brain, { dataDir } = {}) {
    this.brain = brain;
    this.file = path.join(dataDir || brain.dataDir, 'growth.json');
    this.state = { profile: { name: 'Travelers Clan', city: '', phone: '', website: 'https://travelersclan.in', instagram: '', email: '', hours: '9am–9pm, 7 days', languages: ['English', 'Hindi'], usp: 'small group trips with a trip captain, fixed dates, no hidden costs', trips: [] }, leads: [], threads: {}, log: [], settings: { autoReply: false, handoffKeywords: ['pay', 'payment', 'book', 'advance', 'upi', 'account', 'refund', 'cancel', 'complaint', 'angry', 'legal'] } };
    try { if (fs.existsSync(this.file)) Object.assign(this.state, JSON.parse(fs.readFileSync(this.file, 'utf8'))); } catch (e) { /* fresh */ }
  }
  save() { try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.state)); } catch (e) { /* read-only fs is fine */ } }
  get profile() { return this.state.profile; }
  setProfile(p) {
    const P = this.state.profile;
    for (const k of ['name', 'city', 'phone', 'website', 'instagram', 'email', 'hours', 'usp']) if (p[k] != null) P[k] = String(p[k]).trim();
    if (p.languages) P.languages = Array.isArray(p.languages) ? p.languages : String(p.languages).split(',').map(s => s.trim()).filter(Boolean);
    if (Array.isArray(p.trips)) P.trips = p.trips.map(t => ({ name: String(t.name || '').trim(), date: t.date || '', days: +t.days || 0, price: +t.price || 0, seats: +t.seats || 0, booked: +t.booked || 0, from: t.from || P.city })).filter(t => t.name);
    this.save();
    this.brain.teach(this.profileFacts().join(' '), { source: 'growth', importance: 0.9 });
    return P;
  }
  /** The profile as teachable sentences so the mind answers "what is the phone number" correctly. */
  profileFacts() {
    const P = this.profile; const f = [];
    if (P.phone) f.push(`${P.name} phone number is ${P.phone}.`);
    if (P.city) f.push(`${P.name} is based in ${P.city}.`);
    for (const t of P.trips) { if (t.price) f.push(`The ${t.name} trip costs ${t.price} per person.`); if (t.date) f.push(`The ${t.name} trip departs on ${t.date}.`); if (t.seats) f.push(`The ${t.name} trip has ${Math.max(0, t.seats - t.booked)} seats left.`); }
    return f;
  }
  upcoming(n = 5) { const now = Date.now() - DAY; return this.profile.trips.filter(t => !t.date || new Date(t.date).getTime() >= now).sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0)).slice(0, n); }
  waLink(text) { const num = (this.profile.phone || '').replace(/\D/g, ''); const n = num.length === 10 ? '91' + num : num; return n ? `https://wa.me/${n}${text ? '?text=' + encodeURIComponent(text) : ''}` : ''; }

  // ------------------------------------------------------------------ 1. Google profile agent
  gbpAudit() {
    const P = this.profile; const items = [];
    const add = (ok, what, why) => items.push({ ok, what, why });
    add(!!P.phone, 'One business phone number on the listing', 'Google ranks listings with a verified phone higher and customers call from Maps directly.');
    add(!!P.city, 'Exact city and service area set', 'Local search is "trip from Pune", not "trip".');
    add(P.trips.length >= 3, 'At least 3 upcoming trips listed as Products or Services with prices', 'Prices on the profile remove the biggest reason people do not call.');
    add(!!P.website, 'Website link and booking link', 'The link should land on a page with dates and a WhatsApp button, not the home page.');
    add(true, 'Primary category: Travel agency; secondary: Tour operator, Adventure sports', 'Categories decide which searches you appear in.');
    add(true, '10+ photos of real travellers (faces, bus, meals, sunrise), new photo every week', 'Profiles with weekly photos get far more direction requests than static ones.');
    add(true, 'One Google post every week (next departure, price, seats left)', 'Posts expire after 7 days; a dead profile looks like a dead business.');
    add(true, '20 reviews in 30 days, reply to every review within 24h', 'Reviews are the single strongest local ranking factor and the strongest trust signal.');
    add(true, 'Q&A section seeded with your 5 most common questions', 'You can post the questions yourself and answer them.');
    add(!!P.hours, 'Hours set, including "open" on weekends', 'A listing that shows "closed" on Sunday evening loses the weekend planners.');
    const score = Math.round(100 * items.filter(i => i.ok).length / items.length);
    return { score, items, keywords: this.keywords() };
  }
  keywords() {
    const P = this.profile; const city = P.city || 'your city'; const ks = new Set();
    for (const base of ['group trips from', 'weekend trips from', 'tour packages from', 'budget trips from', 'college trip from', 'corporate outing near']) ks.add(`${base} ${city}`);
    for (const t of this.upcoming(6)) { ks.add(`${t.name} trip from ${city}`); ks.add(`${t.name} package ${t.price ? 'under ' + money(Math.ceil(t.price / 5000) * 5000) : 'price'}`); ks.add(`${t.name} group tour ${new Date(t.date || Date.now()).toLocaleDateString('en-IN', { month: 'long' })}`); }
    ks.add(`travel agency ${city}`); ks.add(`fixed departure trips ${city}`);
    return [...ks].slice(0, 20);
  }
  async gbpPosts() {
    const P = this.profile; const posts = [];
    for (const t of this.upcoming(3)) {
      const left = Math.max(0, t.seats - t.booked);
      posts.push({ type: 'offer', title: `${t.name} · ${t.date ? fmtDate(t.date) : 'dates on request'} · ${money(t.price)} per person`, body: `${t.days ? t.days + ' days' : 'Fixed departure'} from ${t.from || P.city}. Stay, travel, meals and a trip captain included. No hidden costs.${left ? ` ${left} of ${t.seats} seats left.` : ''} WhatsApp ${P.phone || 'us'} to hold a seat.`, cta: 'Book', link: this.waLink(`Hi, I want to know about ${t.name} on ${t.date}`) || P.website });
    }
    posts.push({ type: 'update', title: `How a ${P.name} trip works`, body: `Pick a date, pay a small advance, and we handle the rest: transport, stay, food, and a captain who travels with you. Small groups, real people, ${P.usp}.`, cta: 'Learn more', link: P.website });
    posts.push({ type: 'update', title: 'From last week\'s batch', body: `Add 3 photos of travellers' faces and one of the meal. Caption: "${(this.upcoming(1)[0] || {}).name || 'Next batch'} crew, ${new Date().toLocaleDateString('en-IN', { month: 'long' })}. Next departure ${(this.upcoming(1)[0] || {}).date || 'soon'}."`, cta: 'Call', link: this.waLink() });
    const llm = this.llm();
    if (llm) for (const p of posts.slice(0, 2)) { const out = await llm.ask('You write Google Business Profile posts for an Indian travel company. Keep every fact and number. Max 60 words, plain, no hashtags, no emojis.', `Title: ${p.title}\nBody: ${p.body}`, { maxTokens: 150 }); if (out) p.body = out; }
    return posts;
  }
  async reviewReply(text, stars = 5, name = '') {
    const P = this.profile; const first = name ? name.split(' ')[0] : 'there';
    const t = String(text || '');
    let draft;
    if (stars >= 4) draft = `Thank you ${first}! ${/captain|guide|driver|food|stay|hotel/i.test(t) ? 'Glad the ' + (t.match(/captain|guide|driver|food|stay|hotel/i)[0].toLowerCase()) + ' made the trip for you. ' : ''}It was a pleasure travelling with you. Our next departures are up on the profile; seats go first to past travellers, so message us on WhatsApp before they open publicly. See you on the next one, team ${P.name}.`;
    else if (stars === 3) draft = `Thank you for the honest feedback, ${first}. ${/late|delay|wait/i.test(t) ? 'The delay should not have happened and we have changed how we schedule that leg. ' : 'We have noted exactly what fell short. '}Please message ${P.phone || 'us on WhatsApp'} so we can make the next trip right for you. Team ${P.name}.`;
    else draft = `${first}, we are sorry. This is not the experience we promise and we are not going to argue with it here. Please message ${P.phone || 'us on WhatsApp'} or email ${P.email || 'us'} today; the founder will call you back personally within 24 hours, hear the full story, and set it right. Team ${P.name}.`;
    const llm = this.llm();
    if (llm) { const out = await llm.ask(`You reply to Google reviews for ${P.name}, an Indian travel company. Match the reviewer's language (Hinglish if they wrote Hinglish). Keep the draft's commitments and phone/email, under 70 words, warm, no emojis, never defensive.`, `Review (${stars} stars):\n${t}\n\nDraft:\n${draft}`, { maxTokens: 160 }); if (out) draft = out; }
    return { reply: draft, escalate: stars <= 2, language: isHinglish(t) ? 'hinglish' : 'english' };
  }

  // ------------------------------------------------------------------ 2. WhatsApp chat agent
  llm() { const m = this.brain.mentor; return m && m.enabled ? m : null; }
  thread(id) { return this.state.threads[id] || (this.state.threads[id] = { id, messages: [], created: Date.now() }); }
  lead(id, name) {
    let l = this.state.leads.find(x => x.id === id);
    if (!l) { l = { id, name: name || '', phone: /^\d{10,13}$/.test(id) ? id : '', trip: '', stage: 'new', value: 0, source: 'whatsapp', created: Date.now(), updated: Date.now(), next: Date.now() + DAY, touches: 0, notes: '' }; this.state.leads.push(l); }
    if (name && !l.name) l.name = name;
    return l;
  }
  /** One incoming WhatsApp / web-chat message. Returns the reply, whether a human must take over, and the lead row. */
  async chat({ id, name = '', text, source = 'whatsapp' }) {
    id = String(id || 'web-' + Math.random().toString(36).slice(2, 8));
    const th = this.thread(id); th.messages.push({ role: 'lead', text: String(text || ''), t: Date.now() });
    const lead = this.lead(id, name); lead.source = lead.source || source; lead.touches++; lead.updated = Date.now();
    const transcript = th.messages.slice(-12).map(m => `${m.role === 'lead' ? 'lead' : 'clan'}: ${m.text}`).join('\n');
    const req = parseRequirements(transcript);
    if (!req.group) { const m = transcript.match(/\b(\d{1,2})\s*(log|logo|logon|bande|jan|janta|members?)\b/i); if (m) req.group = +m[1]; else if (/\b(hum dono|dono|couple)\b/i.test(transcript)) req.group = 2; }
    if (req.destination && !lead.trip) lead.trip = this.matchTrip(req.destination.name) || req.destination.name;
    const handoff = this.state.settings.handoffKeywords.some(k => new RegExp('\\b' + k + '\\b', 'i').test(text));
    const council = await this.brain.council.handle({ conversation: transcript, name: lead.name });
    const A = council.agents || {}; council.sales = A.sales; council.critic = A.critic; council.cx = A.cx;
    const draft = council.sales && council.sales.output.draft || '';
    let reply = this.composeGrounded({ text, req, lead, draft, stage: council.sales && council.sales.output.stage });
    const stage = detectStage(transcript);
    if (stage && stage !== 'enquiry' && STAGES.includes(stage)) lead.stage = stage; else if (lead.stage === 'new' && (req.destination || req.month)) lead.stage = 'qualified';
    const P = this.profile; const isOpen = this.isOpen();
    if (handoff) { reply = (isHinglish(text) ? `Samjha. Payment aur booking ke liye ${P.name} team ka member abhi aapko call karega` : `Understood. For booking and payment a ${P.name} team member will message you personally`) + (isOpen ? (isHinglish(text) ? ' kuch hi minute mein.' : ' within a few minutes.') : (isHinglish(text) ? ' kal subah 9 baje tak.' : ' by 9am tomorrow.')); lead.stage = lead.stage === 'new' ? 'qualified' : lead.stage; }
    lead.next = Date.now() + (handoff ? 2 * 3600e3 : DAY);
    th.messages.push({ role: 'clan', text: reply, t: Date.now(), auto: this.state.settings.autoReply && !handoff });
    this.state.log.push({ t: Date.now(), id, source, handoff, stage: lead.stage }); if (this.state.log.length > 2000) this.state.log.splice(0, this.state.log.length - 2000);
    this.save();
    return { id, reply, handoff, send: this.state.settings.autoReply && !handoff, lead, stage: lead.stage, verdict: council.critic && council.critic.verdict, issues: council.critic ? council.critic.findings.slice(0, 3) : [], language: isHinglish(text) ? 'hinglish' : 'english' };
  }
  /** The reply, grounded on the real trip (date, price, seats), answering what was asked, one next step. */
  composeGrounded({ text, req, lead, draft, stage }) {
    const P = this.profile; const hi = isHinglish(text); const first = lead.name ? lead.name.split(' ')[0] + ', ' : '';
    const t = this.profile.trips.find(x => slug(x.name) === slug(lead.trip) || (req.destination && slug(x.name).includes(slug(req.destination.name))));
    const n = req.group || 0;
    if (t) {
      const left = Math.max(0, t.seats - t.booked); const adv = Math.min(5000, Math.round(t.price * 0.3 / 500) * 500);
      const parts = [`${first}${t.name}: ${t.date ? fmtDate(t.date) + ', ' : ''}${t.days ? t.days + ' days, ' : ''}${money(t.price)} ${hi ? 'per person' : 'per person'}${left ? `, ${left} seats left` : ''}.`];
      parts.push(hi ? 'Stay, travel, khana aur trip captain sab included, koi hidden cost nahi.' : 'Stay, travel, meals and a trip captain included, no hidden costs.');
      if (n > 1) parts.push(hi ? `${n} logon ka total ${money(n * t.price)}.` : `For ${n} people the total is ${money(n * t.price)}.`);
      if (req.budget && req.budget < t.price * 0.9) parts.push(hi ? `Aapka budget ${money(req.budget)} hai; ${money(t.price)} mein sab included hai, alag se kuch nahi lagega.` : `Your budget is ${money(req.budget)}; ${money(t.price)} is all-inclusive, nothing extra on the trip.`);
      if (/(safe|safety|hidden|refund|cancel)/i.test(text) && draft) parts.push(draft.split(/(?<=[.!?])\s/).find(s => /safe|hidden|refund|cancel|policy/i.test(s)) || '');
      if (left && n && left < n) parts.push(hi ? `Abhi ${left} hi seats hain; next batch mein ${n} ke liye jagah hai.` : `Only ${left} seats remain on this batch; the next batch has room for ${n}.`);
      parts.push(hi ? `${money(adv)} per person advance se seat hold ho jaati hai. Hold karun?` : `A ${money(adv)} per person advance holds the seats. Shall I hold ${n > 1 ? n + ' seats' : 'one'}?`);
      return parts.filter(Boolean).join(' ');
    }
    if (req.destination) {
      const near = this.upcoming(2).map(x => `${x.name}${x.date ? ' (' + fmtDate(x.date) + ', ' + money(x.price) + ')' : ''}`).join(' and ');
      return `${first}${hi ? `${req.destination.name} ke liye abhi fixed batch nahi hai, custom plan bana dete hain.` : `We do not have a fixed batch for ${req.destination.name} right now; we can plan it custom.`} ${near ? (hi ? `Ya fir next batches: ${near}.` : `Or our next batches: ${near}.`) : ''} ${hi ? 'Dates aur kitne log, batao, ek ghante mein plan aur price bhejta hoon.' : 'Tell me dates and how many of you, and I will send the plan and price within the hour.'}`.replace(/\s+/g, ' ');
    }
    if (draft && stage && !['enquiry', 'qualified'].includes(stage)) return draft;
    const next = this.upcoming(3).map(x => `${x.name}${x.date ? ' ' + fmtDate(x.date) : ''}${x.price ? ' ' + money(x.price) : ''}`).join(', ');
    return `${first}${hi ? 'Namaste! Kaunsa trip aur kaunsi dates dekh rahe ho, aur kitne log?' : 'Hi! Which trip and dates are you looking at, and how many of you?'}${next ? (hi ? ` Next batches: ${next}.` : ` Next batches: ${next}.`) : ''}`;
  }
  matchTrip(dest) { const t = this.profile.trips.find(x => slug(x.name).includes(slug(dest))); return t ? t.name : ''; }
  isOpen() { const h = new Date().getUTCHours() + 5.5; const hr = ((h % 24) + 24) % 24; return hr >= 9 && hr < 21; }
  updateLead(id, patch) { const l = this.state.leads.find(x => x.id === id); if (!l) return null; for (const k of ['name', 'phone', 'trip', 'stage', 'value', 'notes', 'source']) if (patch[k] != null) l[k] = k === 'value' ? +patch[k] : String(patch[k]); if (patch.next) l.next = new Date(patch.next).getTime(); if (patch.done) l.next = Date.now() + SEQUENCE[Math.min(SEQUENCE.length - 1, Math.max(1, l.touches))].day * DAY; l.updated = Date.now(); this.save(); return l; }
  addLead(row) { const id = String(row.id || row.phone || slug(row.name) + '-' + Date.now().toString(36)); const l = this.lead(id, row.name); return this.updateLead(id, row) || l; }
  /** Today's work: every lead whose follow-up is due, with the message to send, drafted by sequence step and stage. */
  async today() {
    const now = Date.now(); const due = this.state.leads.filter(l => !['lost', 'reviewed'].includes(l.stage) && l.next <= now).sort((a, b) => a.next - b.next);
    const out = [];
    for (const l of due.slice(0, 30)) out.push({ lead: l, step: SEQUENCE[Math.min(SEQUENCE.length - 1, l.touches)], message: this.followUp(l) });
    const seatAlerts = this.upcoming(5).filter(t => t.seats && t.seats - t.booked <= 3 && t.seats - t.booked > 0).map(t => `${t.name} on ${t.date}: only ${t.seats - t.booked} seat${t.seats - t.booked === 1 ? '' : 's'} left, post it today.`);
    const stale = this.upcoming(5).filter(t => t.date && (new Date(t.date) - now) < 10 * DAY && t.seats && t.booked / t.seats < 0.5).map(t => `${t.name} departs in ${Math.ceil((new Date(t.date) - now) / DAY)} days at ${Math.round(100 * t.booked / t.seats)}% full: decide today, push hard or merge with the next batch.`);
    return { date: new Date().toISOString().slice(0, 10), due: out, alerts: [...seatAlerts, ...stale], counts: this.counts() };
  }
  followUp(l) {
    const P = this.profile; const t = this.profile.trips.find(x => slug(x.name) === slug(l.trip)) || this.upcoming(1)[0];
    const first = l.name ? l.name.split(' ')[0] : 'Hi';
    const step = SEQUENCE[Math.min(SEQUENCE.length - 1, l.touches)];
    const tripLine = t ? `${t.name}${t.date ? ' on ' + fmtDate(t.date) : ''} at ${money(t.price)} per person` : 'the trip';
    const left = t && t.seats ? Math.max(0, t.seats - t.booked) : 0;
    switch (step.name) {
      case 'value nudge': return `${first}, sharing the day-by-day plan for ${tripLine} so you can picture it. Which part matters most to you: the stay, the travel, or the activities?`;
      case 'social proof': return `${first}, last batch's traveller wrote: "best weekend of the year, the captain handled everything." ${left ? left + ' seats left on ' + tripLine + '.' : tripLine + ' is filling up.'} Want me to hold one for you?`;
      case 'last call': return `${first}, honest update: ${left ? 'only ' + left + ' seats remain' : 'the price moves after this week'} for ${tripLine}. I can hold your seat for 24 hours with a ${money(Math.min(5000, (t && t.price || 10000) * 0.3))} advance. Shall I?`;
      case 'next batch': return `${first}, no pressure at all. The next departure that fits you is ${tripLine}. If the dates ever work, just reply here and I will sort it. Team ${P.name}.`;
      default: return `${first}, thanks for the enquiry about ${tripLine}. How many of you, and which dates work? I will send the exact plan and price within the hour.`;
    }
  }
  counts() { const c = {}; for (const l of this.state.leads) c[l.stage] = (c[l.stage] || 0) + 1; return c; }

  // ------------------------------------------------------------------ 3. Marketing agent
  campaigns(now = Date.now()) {
    const y = new Date(now).getFullYear(); const out = [];
    for (const c of CALENDAR) for (const yy of [y, y + 1]) {
      const when = new Date(yy, c.month - 1, c.day).getTime(); const start = when - c.lead * DAY;
      if (when < now - 2 * DAY) continue;
      out.push({ name: c.name, date: new Date(when).toISOString().slice(0, 10), startBy: new Date(start).toISOString().slice(0, 10), daysToStart: Math.ceil((start - now) / DAY), pitch: c.pitch, status: start <= now ? 'run now' : 'upcoming', trip: this.bestTripFor(when) });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  }
  bestTripFor(when) { const t = this.profile.trips.filter(x => x.date && Math.abs(new Date(x.date) - when) < 20 * DAY).sort((a, b) => Math.abs(new Date(a.date) - when) - Math.abs(new Date(b.date) - when))[0]; return t ? t.name : ''; }
  /** Broadcast drafts for the three lists every small business has. Keep under WhatsApp's 24-h rule by only messaging opted-in contacts. */
  async broadcasts() {
    const P = this.profile; const t = this.upcoming(1)[0]; const c = this.campaigns()[0];
    if (!t) return { error: 'Add at least one upcoming trip in Setup first.' };
    const left = Math.max(0, t.seats - t.booked);
    const line = `${t.name}, ${t.date ? fmtDate(t.date) : 'dates on request'}, ${t.days ? t.days + ' days, ' : ''}${money(t.price)} per person${left ? ', ' + left + ' seats left' : ''}`;
    const drafts = [
      { segment: 'past travellers', when: 'first, 3 days before anyone else', text: `Hi {name}, {captain} here from ${P.name}. You travelled with us to {lastTrip}; seats for ${line} open to past travellers first. Reply YES to hold yours at the old price before it goes public. Reply STOP to opt out.` },
      { segment: 'warm leads (asked, did not book)', when: 'day 2', text: `Hi {name}, you asked about ${t.name} earlier. The ${c ? c.name + ' ' : ''}batch is confirmed: ${line}. Want the day-by-day plan? Reply PLAN. Reply STOP to opt out.` },
      { segment: 'referral ask (travelled, happy)', when: 'the day they return', text: `{name}, thank you for travelling with us. If a friend books ${t.name} through you, you both get ${money(Math.round(t.price * 0.05 / 100) * 100)} off. Just share ${this.waLink('Hi, {name} referred me') || P.phone}.` },
      { segment: 'review ask (travelled, day 1 after)', when: 'day after return', text: `{name}, one favour: a 30-second Google review helps a small team like ours more than any ad. {reviewLink}. Thank you from the whole ${P.name} crew.` },
      { segment: 'organisers (college, office, society)', when: 'weekly, 10 new', text: `Hi {name}, ${P.name} runs ${line}. For a group of 10 or more from {org}, the organiser travels free and we handle every logistics headache. Can I send a one-page plan?` },
    ];
    const llm = this.llm();
    if (llm) { const out = await llm.ask('You rewrite WhatsApp broadcast drafts for an Indian travel company. Keep every placeholder in braces, every number and the STOP line. Under 60 words each, friendly, no emojis. Return the drafts separated by ===.', drafts.slice(0, 2).map(d => d.text).join('\n===\n'), { maxTokens: 400 }); if (out) out.split('===').map(s => s.trim()).filter(Boolean).forEach((s, i) => { if (drafts[i] && /\{name\}/.test(s)) drafts[i].text = s; }); }
    return { trip: t, campaign: c, drafts, rules: ['Only message people who gave you their number for travel updates; include "Reply STOP".', 'Max one broadcast per list per week.', 'WhatsApp Business app: Broadcast lists hold 256 contacts; make one list per segment.', 'Log every reply in the lead sheet the same hour.'] };
  }
  roi({ adSpend = 0 } = {}) {
    const L = this.state.leads; const booked = L.filter(l => ['advance', 'balance', 'travelled', 'reviewed'].includes(l.stage));
    const revenue = booked.reduce((s, l) => s + (l.value || 0), 0);
    const bySource = {};
    for (const l of L) { const s = bySource[l.source || 'unknown'] || (bySource[l.source || 'unknown'] = { leads: 0, booked: 0, revenue: 0 }); s.leads++; if (booked.includes(l)) { s.booked++; s.revenue += l.value || 0; } }
    const replies = this.state.log.length; const median = (a) => a.length ? a.sort((x, y) => x - y)[Math.floor(a.length / 2)] : null;
    return { leads: L.length, booked: booked.length, conversion: L.length ? +(booked.length / L.length).toFixed(3) : 0, revenue, adSpend, roas: adSpend ? +(revenue / adSpend).toFixed(2) : null, costPerLead: adSpend && L.length ? Math.round(adSpend / L.length) : null, bySource, repliesHandled: replies, medianTouchesToBook: median(booked.map(l => l.touches)), lostReasons: this.counts().lost || 0 };
  }
  /** Everything the Grow tab needs in one call. */
  async overview() { return { profile: this.profile, upcoming: this.upcoming(), gbp: this.gbpAudit(), campaigns: this.campaigns(), counts: this.counts(), roi: this.roi(), waLink: this.waLink('Hi, I want to know about your upcoming trips'), settings: this.state.settings, mentor: this.brain.mentor.status() }; }
}

module.exports = { Growth, CALENDAR, SEQUENCE, STAGES };
