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
    this.state = { profile: { name: 'Travelers Clan', city: '', phone: '', website: 'https://travelersclan.in', instagram: '', email: '', hours: '9am–9pm, 7 days', languages: ['English', 'Hindi'], usp: 'small group trips with a trip captain, fixed dates, no hidden costs', trips: [], policies: { included: 'travel from the start city, stay (sharing basis), breakfast and dinner, all sightseeing in the plan, a trip captain who travels with the group', excluded: 'lunches, personal shopping, entry tickets not in the plan, anything marked optional', payment: 'advance by UPI or bank transfer to hold the seat, balance 7 days before departure, GST invoice on request', cancellation: 'advance is transferable to any other batch within 6 months; cancellation 15+ days before departure refunds everything except the advance; under 15 days no refund because hotels and transport are already paid', pickup: 'we start from the city centre at a fixed point and time shared in the trip WhatsApp group 3 days before', safety: 'a trip captain travels with every group, we keep an emergency contact for every traveller, women travellers are roomed with women only, and we have run every batch with women travelling solo', food: 'vegetarian and Jain options on every meal, tell us allergies at booking', age: 'most travellers are 20 to 40; families and parents are welcome on the relaxed batches' } }, leads: [], threads: {}, log: [], settings: { autoReply: false, handoffKeywords: ['pay', 'payment', 'book', 'advance', 'upi', 'account', 'refund', 'cancel', 'complaint', 'angry', 'legal'] } };
    try { if (fs.existsSync(this.file)) Object.assign(this.state, JSON.parse(fs.readFileSync(this.file, 'utf8'))); } catch (e) { /* fresh */ }
  }
  save() { try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.state)); } catch (e) { /* read-only fs is fine */ } }
  get profile() { return this.state.profile; }
  setProfile(p) {
    const P = this.state.profile;
    for (const k of ['name', 'city', 'phone', 'website', 'instagram', 'email', 'hours', 'usp', 'upi']) if (p[k] != null) P[k] = String(p[k]).trim();
    if (p.policies && typeof p.policies === 'object') { P.policies = P.policies || {}; for (const [k, v] of Object.entries(p.policies)) if (v != null) P.policies[k] = String(v).trim(); }
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
  /** What the customer wants from this message. Order matters: an action (pay, cancel) beats a question about it. */
  intent(text) {
    const t = String(text).toLowerCase();
    if (/\b(i want to cancel|cancel my|cancel our|refund my|want refund|money back|complaint|cheated|fraud|legal|consumer court|worst|pathetic|angry)\b/.test(t)) return 'escalate';
    if (/\b(paid|payment done|transferred|sent the advance|screenshot|upi id|account number|bank details|how (do|to) (i |we )?pay|where (do|to) (i |we )?pay|payment link|pay now|hold (my|our|the|\d+) seats?|book (it|us|me|now|\d+)|confirm (my|our|the) (seats?|booking)|yes hold|haan hold|book karo|pay kaise)\b/.test(t)) return 'book';
    if (/\b(hidden|extra (cost|charge)|anything extra|all inclusive|total cost|any other charges)\b/.test(t)) return 'faq:hidden';
    if (/\b(included?|includes|inclusions|what (do|will) (i|we) get|covers?|kya kya milega|kya include)\b/.test(t)) return 'faq:included';
    if (/\b(not included|exclu|extra|lunch)\b/.test(t)) return 'faq:excluded';
    if (/\b(cancel|refund|postpone|reschedule|transfer)\b/.test(t)) return 'faq:cancellation';
    if (/\b(pickup|pick up|pick-up|boarding|start(ing)? point|where (do|will) we (meet|start)|departure point|kahan se)\b/.test(t)) return 'faq:pickup';
    if (/\b(safe|safety|security|girls?|women|ladies|female|solo girl|alone)\b/.test(t)) return 'faq:safety';
    if (/\b(veg|jain|food|meals?|khana|non-?veg|allerg)\b/.test(t)) return 'faq:food';
    if (/\b(age|kids?|children|parents|senior|old|years old|family)\b/.test(t) && /\b(allow|ok|fine|suitable|can|join|come)\b/.test(t)) return 'faq:age';
    if (/\b(payment|advance|instal|emi|gst|invoice|pay)\b/.test(t)) return 'faq:payment';
    if (/\b(stay|hotel|room|sharing|accommodation|resort|camp)\b/.test(t)) return 'faq:stay';
    if (/\b(itinerary|plan|details|schedule|day ?wise|day by day|send (me )?(the )?(plan|details|brochure|pdf)|more info|batao|bhejo)\b/.test(t)) return 'details';
    if (/\b(price|cost|rate|kitna|kitne|how much|budget|charges|per person|pp)\b/.test(t)) return 'price';
    if (/^\s*(ok|okay|k|yes|yeah|ya|haan|ha|sure|great|fine|cool|done|alright|theek|thik|hmm|okk+|yess+)\b[\s!.]*$/.test(t)) return 'affirm';
    if (/\b(expensive|costly|too much|mehenga|mehnga|discount|cheaper|less|negotiate|kam karo|best price)\b/.test(t)) return 'objection:price';
    if (/\b(think|later|will tell|let you know|discuss|ask (my|the)|baad mein|dekhte)\b/.test(t)) return 'objection:delay';
    if (/\b(thanks|thank you|thx|shukriya|dhanyavad)\b/.test(t)) return 'thanks';
    if (/^\s*(hi|hello|hey|namaste|hola|good (morning|evening|afternoon))\b/.test(t) && t.length < 40) return 'greet';
    return 'enquiry';
  }

  /** One incoming WhatsApp / web-chat message. Returns the reply, whether a human must take over, and the lead row. */
  async chat({ id, name = '', text, source = 'whatsapp' }) {
    id = String(id || 'web-' + Math.random().toString(36).slice(2, 8));
    const th = this.thread(id); th.said = th.said || {}; th.messages.push({ role: 'lead', text: String(text || ''), t: Date.now() });
    const lead = this.lead(id, name); lead.source = lead.source || source; lead.touches++; lead.updated = Date.now();
    const transcript = th.messages.slice(-12).map(m => `${m.role === 'lead' ? 'lead' : 'clan'}: ${m.text}`).join('\n');
    const leadText = th.messages.filter(m => m.role === 'lead').map(m => m.text).join('\n');
    const req = parseRequirements(leadText);
    if (!req.group) { const m = leadText.match(/\b(\d{1,2})\s*(log|logo|logon|bande|jan|janta|members?)\b/i); if (m) req.group = +m[1]; else if (/\b(hum dono|dono|couple)\b/i.test(leadText)) req.group = 2; }
    if (req.destination && !lead.trip) lead.trip = this.matchTrip(req.destination.name) || req.destination.name;
    const intent = this.intent(text);
    const handoff = intent === 'book' || intent === 'escalate';
    // The council still reviews every turn: it teaches the mind and its critic flags weak replies.
    const council = await this.brain.council.handle({ conversation: transcript, name: lead.name });
    const A = council.agents || {}; council.sales = A.sales; council.critic = A.critic; council.cx = A.cx;
    const draft = council.sales && council.sales.output.draft || '';
    let reply = this.composeGrounded({ text, req, lead, draft, intent, said: th.said, stage: council.sales && council.sales.output.stage });
    const stage = detectStage(transcript);
    if (intent === 'book') lead.stage = 'advance'; else if (intent === 'escalate') lead.stage = lead.stage === 'new' ? 'qualified' : lead.stage;
    else if (intent.startsWith('objection')) lead.stage = 'objection';
    else if (th.said.price && ['new', 'qualified'].includes(lead.stage)) lead.stage = 'quoted';
    else if (stage && stage !== 'enquiry' && STAGES.includes(stage) && lead.stage === 'new') lead.stage = stage; else if (lead.stage === 'new' && (req.destination || req.month)) lead.stage = 'qualified';
    lead.next = Date.now() + (handoff ? 2 * 3600e3 : DAY);
    th.messages.push({ role: 'clan', text: reply, t: Date.now(), auto: this.state.settings.autoReply && !handoff });
    this.state.log.push({ t: Date.now(), id, source, handoff, stage: lead.stage, intent }); if (this.state.log.length > 2000) this.state.log.splice(0, this.state.log.length - 2000);
    this.save();
    return { id, reply, intent, handoff, send: this.state.settings.autoReply && !handoff, lead, stage: lead.stage, verdict: council.critic && council.critic.verdict, issues: council.critic ? council.critic.findings.slice(0, 3) : [], language: isHinglish(text) ? 'hinglish' : 'english' };
  }

  tripFor(req, lead) { return this.profile.trips.find(x => slug(x.name) === slug(lead.trip) || (req.destination && slug(x.name).includes(slug(req.destination.name)))) || null; }
  priceLine(t, n, hi) {
    const left = Math.max(0, t.seats - t.booked); const adv = this.advance(t);
    const parts = [`${t.name}: ${t.date ? fmtDate(t.date) + ', ' : ''}${t.days ? t.days + ' days, ' : ''}${money(t.price)} per person${left ? `, ${left} seats left` : ''}.`];
    parts.push(hi ? 'Stay, travel, khana aur trip captain sab included, koi hidden cost nahi.' : 'Stay, travel, meals and a trip captain included, no hidden costs.');
    if (n > 1) parts.push(hi ? `${n} logon ka total ${money(n * t.price)}.` : `For ${n} people the total is ${money(n * t.price)}.`);
    if (left && n && left < n) parts.push(hi ? `Abhi ${left} hi seats hain; next batch mein ${n} ke liye jagah hai.` : `Only ${left} seats remain on this batch; the next batch has room for ${n}.`);
    parts.push(hi ? `${money(adv)} per person advance se seat hold ho jaati hai. Hold karun?` : `A ${money(adv)} per person advance holds the seats. Shall I hold ${n > 1 ? n + ' seats' : 'one'}?`);
    return parts.join(' ');
  }
  advance(t) { return Math.min(5000, Math.round((t.price || 10000) * 0.3 / 500) * 500) || 2000; }

  /** The reply: answers the intent from the real trip and the written policies, says the price once, always ends with one next step. */
  composeGrounded({ text, req, lead, draft, intent, said = {}, stage }) {
    const P = this.profile; const pol = P.policies || {}; const hi = isHinglish(text); const first = lead.name ? lead.name.split(' ')[0] + ', ' : '';
    const t = this.tripFor(req, lead); const n = req.group || 0;
    const nextStep = () => { if (!t) return hi ? 'Dates aur kitne log batao, ek ghante mein plan aur price bhejta hoon.' : 'Tell me the dates and how many of you, and I will send the plan and price within the hour.'; if (!said.price) { said.price = true; return this.priceLine(t, n, hi); } if (['advance', 'balance'].includes(lead.stage)) return hi ? 'Aapki seat hold hai; team confirm karegi.' : 'Your seats are on hold; the team will confirm shortly.'; return hi ? `Seat hold karne ke liye bas "hold" likho.` : `To hold ${n > 1 ? n + ' seats' : 'a seat'}, just reply "hold".`; };
    const ask = (key, fallback) => (pol[key] ? pol[key][0].toUpperCase() + pol[key].slice(1) + '.' : fallback);
    switch (intent) {
      case 'escalate': return `${first}${hi ? 'Main samajh gaya, aur yeh hamare liye serious hai. Founder khud aapko 24 ghante ke andar call karenge' : 'I hear you, and we take this seriously. The founder will personally call you within 24 hours'}${P.phone ? ` (${P.phone})` : ''}. ${hi ? 'Jo hua, yahan likh dijiye taaki call se pehle sab pata ho.' : 'Please write what happened here so nothing is missed before the call.'}`;
      case 'book': { said.price = true; const adv = t ? this.advance(t) : 2000; return `${first}${hi ? 'Badhiya!' : 'Great!'} ${t ? (hi ? `${t.name} ke ${n || ''} seat${n > 1 ? 's' : ''} hold kar rahe hain.` : `Holding ${n ? n + ' seats' : 'your seat'} on ${t.name}.`) : ''} ${hi ? `Advance ${money(adv)} per person${P.upi ? ' UPI ' + P.upi + ' par' : ''} bhejkar screenshot yahan bhejo, aur sabke poore naam (ID ke jaisa). Team ${P.name} ka member abhi confirm karega.` : `Send the ${money(adv)} per person advance${P.upi ? ' to UPI ' + P.upi : ''} and the screenshot here, with the full names as on ID. A ${P.name} team member will confirm it personally in a few minutes.`}`.replace(/\s+/g, ' '); }
      case 'faq:hidden': return `${first}${hi ? 'Koi hidden cost nahi.' : 'No hidden costs.'} ${ask('included', 'Travel, stay, meals and the captain are included.')} ${hi ? 'Jo included nahi hai:' : 'Not included:'} ${pol.excluded || 'personal expenses'}. ${nextStep()}`;
      case 'faq:included': return `${first}${hi ? 'Included hai:' : 'Included:'} ${pol.included || 'travel, stay, meals, captain'}. ${hi ? 'Included nahi:' : 'Not included:'} ${pol.excluded || 'personal expenses'}. ${nextStep()}`;
      case 'faq:excluded': return `${first}${hi ? 'Included nahi hai:' : 'Not included:'} ${pol.excluded || 'personal expenses'}. ${hi ? 'Baaki sab price mein hai.' : 'Everything else is in the price.'} ${nextStep()}`;
      case 'faq:cancellation': return `${first}${ask('cancellation', 'The advance is transferable to another batch; full refund minus advance up to 15 days before.')} ${nextStep()}`;
      case 'faq:pickup': return `${first}${ask('pickup', 'Pickup point and time are shared in the trip group 3 days before.')}${t && t.from ? (hi ? ` Shuruaat ${t.from} se.` : ` We start from ${t.from}.`) : ''} ${nextStep()}`;
      case 'faq:safety': return `${first}${ask('safety', 'A captain travels with every group and women are roomed with women only.')} ${nextStep()}`;
      case 'faq:food': return `${first}${ask('food', 'Veg and Jain options on every meal.')} ${nextStep()}`;
      case 'faq:age': return `${first}${ask('age', 'All ages are welcome.')} ${nextStep()}`;
      case 'faq:payment': return `${first}${ask('payment', 'Advance to hold the seat, balance 7 days before departure.')}${t ? (hi ? ` ${t.name} ka advance ${money(this.advance(t))} per person hai.` : ` For ${t.name} the advance is ${money(this.advance(t))} per person.`) : ''} ${nextStep()}`;
      case 'faq:stay': return `${first}${hi ? 'Stay sharing basis par hai (2-3 log per room), clean aur central; same-gender rooming.' : 'Stay is on sharing basis (2 to 3 per room), clean and central; same-gender rooming.'}${t ? (hi ? ' Pure trip ki price mein included.' : ' Included in the trip price.') : ''} ${nextStep()}`;
      case 'details': { if (!t) return `${first}${nextStep()}`; const d = DEST.find(t.name); const days = t.days || 3; const plan = Array.from({ length: Math.min(days, 6) }, (_, i) => `D${i + 1} ${i === 0 ? 'depart ' + (t.from || P.city || 'city') + ', check in, evening walk' : i === days - 1 ? 'breakfast, last stop, return' : d && d.highlights && d.highlights[i - 1] ? d.highlights[i - 1] : 'sightseeing + free time'}`).join('; '); said.price = true; return `${first}${t.name} ${hi ? 'plan' : 'plan'}: ${plan}. ${this.priceLine(t, n, hi)}`; }
      case 'price': { said.price = true; return `${first}${t ? this.priceLine(t, n, hi) : (hi ? 'Kaunsa trip aur kitne log? Price fixed aur all-inclusive hoti hai.' : 'Which trip and how many of you? Our prices are fixed and all-inclusive.') + (req.destination ? '' : ' ' + this.nextBatches(hi))}`; }
      case 'objection:price': { if (!t) return `${first}${nextStep()}`; return `${first}${hi ? `Price fixed hai aur sab included hai; alag se hotel + travel + khana jodoge to ${money(Math.round(t.price * 1.2 / 100) * 100)} se upar jaata hai.` : `The price is fixed and all-inclusive; booking the stay, travel and meals separately comes to over ${money(Math.round(t.price * 1.2 / 100) * 100)}.`} ${n >= 6 ? (hi ? `${n} log ho to organiser ki seat free: ek kam do.` : `For ${n} people the organiser travels free, so pay for ${n - 1}.`) : (hi ? 'Advance abhi, balance 7 din pehle, isse aasaan ho jaata hai.' : 'Advance now and balance 7 days before departure makes it easier.')} ${nextStep()}`; }
      case 'objection:delay': return `${first}${hi ? 'Bilkul, aaram se sochiye.' : 'Of course, take your time.'} ${t && t.seats - t.booked > 0 ? (hi ? `Bas yeh dhyaan rahe: ${t.name} mein ${t.seats - t.booked} seats bachi hain; 24 ghante ke liye bina advance hold kar sakta hoon, bolo to.` : `One thing to know: ${t.name} has ${t.seats - t.booked} seats left; I can hold yours for 24 hours without advance if you want.`) : ''}`.trim();
      case 'affirm': return `${first}${said.price ? (hi ? 'Badhiya. Seat hold karne ke liye "hold" likho, ya koi sawaal ho to poochho.' : 'Great. Reply "hold" to hold the seats, or ask me anything else.') : nextStep()}`;
      case 'thanks': return `${first}${hi ? 'Khushi hui! Koi bhi sawaal ho to yahan message karo.' : 'Happy to help! Message here any time.'}${t && !said.price ? ' ' + nextStep() : ''}`;
      case 'greet': return `${first}${hi ? 'Namaste! Kaunsa trip aur kaunsi dates dekh rahe ho, aur kitne log?' : 'Hi! Which trip and dates are you looking at, and how many of you?'} ${this.nextBatches(hi)}`.trim();
      default: {
        if (t) { said.price = true; let r = `${first}${this.priceLine(t, n, hi)}`; if (req.budget && req.budget < t.price * 0.9) r += ' ' + (hi ? `Aapka budget ${money(req.budget)} hai; ${money(t.price)} mein sab included hai, alag se kuch nahi lagega.` : `Your budget is ${money(req.budget)}; ${money(t.price)} is all-inclusive, nothing extra on the trip.`); return r; }
        if (req.destination) return `${first}${hi ? `${req.destination.name} ke liye abhi fixed batch nahi hai, custom plan bana dete hain.` : `We do not have a fixed batch for ${req.destination.name} right now; we can plan it custom.`} ${this.nextBatches(hi, 'Ya fir next batches', 'Or our next batches')} ${nextStep()}`.replace(/\s+/g, ' ');
        if (draft && stage && !['enquiry', 'qualified'].includes(stage)) return draft;
        return `${first}${hi ? 'Kaunsa trip aur kaunsi dates dekh rahe ho, aur kitne log?' : 'Which trip and dates are you looking at, and how many of you?'} ${this.nextBatches(hi)}`.trim();
      }
    }
  }
  nextBatches(hi, hiLabel = 'Next batches', enLabel = 'Next batches') { const next = this.upcoming(3).map(x => `${x.name}${x.date ? ' ' + fmtDate(x.date) : ''}${x.price ? ' ' + money(x.price) : ''}`).join(', '); return next ? `${hi ? hiLabel : enLabel}: ${next}.` : ''; }
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
  /** A week of Instagram content for the next trips: reels scripts, captions, story polls, and the bio. Copy-paste. */
  async content() {
    const P = this.profile; const trips = this.upcoming(3); const city = P.city || 'your city';
    const bio = `Group trips from ${city} · fixed dates, fixed price, no hidden costs\n${trips.map(t => `${t.name} ${t.date ? fmtDate(t.date) : ''} ${money(t.price)}`).join(' · ') || 'Next trips announced weekly'}\nWhatsApp ${P.phone || '[number]'} ↓`;
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const t0 = trips[0]; const left = t0 ? Math.max(0, t0.seats - t0.booked) : 0;
    const plan = [
      { day: days[0], format: 'Reel (15s)', idea: t0 ? `POV: your bus leaving ${city} at 6am for ${t0.name}` : 'POV: the 6am bus leaving for the hills', script: 'Shot 1 faces half asleep in the bus (2s). Shot 2 sunrise from the window (3s). Shot 3 first chai stop, everyone laughing (4s). Shot 4 the view on arrival (4s). Text on screen: date, price, seats left. Audio: trending Hindi indie.', caption: t0 ? `${t0.name} · ${t0.date ? fmtDate(t0.date) : ''} · ${money(t0.price)} all-inclusive · ${left ? left + ' seats left' : 'few seats left'}. WhatsApp ${P.phone || 'us'} to hold yours.` : 'Next batch dates in bio.' },
      { day: days[1], format: 'Story poll', idea: 'Beach or mountains for December?', script: 'Two-option poll. Reply to every voter with the matching trip and price. This is a lead list.', caption: '' },
      { day: days[2], format: 'Carousel (5 slides)', idea: `What ${money(t0 ? t0.price : 14500)} actually includes`, script: `Slide 1 the number big. Slides 2-4 one inclusion each with a real photo (${(P.policies || {}).included || 'stay, travel, meals, captain'}). Slide 5 what is not included, honestly. Last line: no hidden costs.`, caption: 'Price transparency is our whole pitch. Save this for when someone asks.' },
      { day: days[3], format: 'Reel (20s)', idea: 'A traveller tells it (testimonial)', script: 'Ask a past traveller for a 20-second selfie video: where they went, one moment, one line on the captain. Subtitles on. Do not script them.', caption: 'Real people, real trips. Tag the friend you would take.' },
      { day: days[4], format: 'Story countdown + seats', idea: t0 ? `${t0.name} departs in ${t0.date ? Math.max(0, Math.ceil((new Date(t0.date) - Date.now()) / DAY)) : '?'} days` : 'Countdown to the next batch', script: 'Countdown sticker to the departure date. Second story: handwritten seat count, crossed out as seats sell. Third story: link sticker to WhatsApp.', caption: '' },
      { day: days[5], format: 'Reel (30s)', idea: 'Day in the life of the trip captain', script: 'Captain checks the bus, counts heads, hands out water, sorts a room issue, leads the bonfire. Text: this is why the trip runs smooth. End with next date.', caption: 'A captain travels with every group. That is the difference between a package and a trip.' },
      { day: days[6], format: 'Post', idea: 'Photo dump from the last batch, 10 photos', script: 'Faces first, landscapes last. Tag every traveller (they repost = free reach). Comment the next batch date yourself.', caption: `Last batch. Next one: ${trips.map(t => `${t.name} ${t.date ? fmtDate(t.date) : ''}`).join(', ') || 'announcing this week'}.` },
    ];
    const hashtags = [`#${slug(city).replace(/-/g, '')}travel`, '#grouptrips', '#weekendgetaway', '#fixeddeparture', '#travelwithstrangers', '#backpackingindia', ...trips.map(t => '#' + slug(t.name).replace(/-/g, ''))].slice(0, 12);
    const llm = this.llm();
    if (llm) { const out = await llm.ask('You write Instagram captions for an Indian group-travel company. Keep every number and date, under 30 words each, casual, Hinglish is fine, no hashtags, max one emoji. Return captions separated by ===.', plan.filter(p => p.caption).map(p => p.caption).join('\n===\n'), { maxTokens: 400 }); if (out) { const caps = out.split('===').map(x => x.trim()).filter(Boolean); let i = 0; for (const p of plan) if (p.caption && caps[i]) p.caption = caps[i++]; } }
    return { bio, plan, hashtags, rules: ['Post the reel between 7pm and 9pm IST.', 'Reply to every comment and DM within the hour; a DM is a lead, log it in Today.', 'Faces outperform landscapes; your own footage outperforms stock every time.', 'Every post carries a date and a price. No "starting at".'] };
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
