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
const { detect: detectTraits } = require('./universe');
const { parseRequirements } = require('./agents');
const { detectStage } = require('./funnel');

const DAY = 86400e3;
const STAGES = ['new', 'qualified', 'quoted', 'objection', 'hold', 'advance', 'balance', 'travelled', 'reviewed', 'lost'];
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

/** Never schedule a message at 2am: snap to 10:00–20:00 IST. */
function snapToHours(ts) { const ist = new Date(ts + 5.5 * 3600e3); const h = ist.getUTCHours(); if (h >= 10 && h < 20) return ts; const d = new Date(ist); if (h >= 20) d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(10, 0, 0, 0); return d.getTime() - 5.5 * 3600e3; }
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const money = (n) => '₹' + Math.round(+n || 0).toLocaleString('en-IN');
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const GUJ = /[\u0A80-\u0AFF]/, DEV = /[\u0900-\u097F]/;
/** The fifty words that matter, Gujarati and Hindi script → the Latin tokens the rules understand. */
const XLIT = { 'કિંમત': 'price', 'ભાવ': 'price', 'કેટલા': 'kitna', 'કેટલું': 'kitna', 'કેટલી': 'kitni', 'કેન્સલ': 'cancel', 'રદ': 'cancel', 'સુરક્ષિત': 'safe', 'સેફ': 'safe', 'જમવાનું': 'food', 'ખાવાનું': 'food', 'શાકાહારી': 'veg', 'જૈન': 'jain', 'પિકઅપ': 'pickup', 'ક્યાંથી': 'kahan se', 'ક્યાં': 'kahan', 'બુક': 'book', 'બુકિંગ': 'booking', 'હા': 'haan', 'ઓકે': 'ok', 'તારીખ': 'date', 'સીટ': 'seat', 'સીટો': 'seats', 'સમાવેશ': 'included', 'પૈસા': 'paise', 'ચુકવણી': 'payment', 'એડવાન્સ': 'advance', 'રિફંડ': 'refund', 'હોટેલ': 'hotel', 'રૂમ': 'room', 'લોકો': 'log', 'જણ': 'log', 'મોંઘું': 'mehenga', 'ડિસ્કાઉન્ટ': 'discount', 'ગોવા': 'goa', 'મનાલી': 'manali', 'લદ્દાખ': 'ladakh', 'કેરળ': 'kerala', 'કચ્છ': 'kutch', 'ડિસેમ્બર': 'december', 'જાન્યુઆરી': 'january', 'નવેમ્બર': 'november', 'ઓક્ટોબર': 'october', 'દિવસ': 'days', 'પ્લાન': 'plan', 'વિગત': 'details', 'આભાર': 'thanks', 'નમસ્તે': 'namaste', 'કરો': 'karo', 'વચન': 'promise', 'હોલ્ડ': 'hold', 'મળશે': 'milega', 'મળે': 'milega', 'કેમ': 'kyun', 'ક્યારે': 'kab', 'સલામત': 'safe', 'સલામતી': 'safety', 'બાળકો': 'kids', 'બાળક': 'kids', 'ઠીક': 'theek', 'માટે': 'ke liye', 'બચ્ચા': 'bachche', 'નહોતું': 'nahi tha', 'મોડી': 'late', 'જોઈએ': 'chahiye', 'સંભાળી': 'sambhal', 'સંભાળ': 'sambhal', 'બધું': 'sab', 'તમે': 'aap', 'રિવ્યુ': 'review', 'કરી': 'kar', 'આપો': 'do', 'મોકલો': 'bhejo', 'કહો': 'batao', 'છોકરીઓ': 'girls', 'મહિલા': 'women',
  'कीमत': 'price', 'दाम': 'price', 'कितना': 'kitna', 'कितने': 'kitne', 'कितनी': 'kitni', 'रद्द': 'cancel', 'कैंसिल': 'cancel', 'कैंसल': 'cancel', 'सुरक्षित': 'safe', 'सेफ': 'safe', 'खाना': 'khana', 'शाकाहारी': 'veg', 'जैन': 'jain', 'पिकअप': 'pickup', 'कहाँ': 'kahan', 'कहां': 'kahan', 'से': 'se', 'बुक': 'book', 'बुकिंग': 'booking', 'हाँ': 'haan', 'हां': 'haan', 'ठीक': 'theek', 'तारीख': 'date', 'सीट': 'seat', 'सीटें': 'seats', 'शामिल': 'included', 'पैसे': 'paise', 'भुगतान': 'payment', 'एडवांस': 'advance', 'रिफंड': 'refund', 'होटल': 'hotel', 'रूम': 'room', 'लोग': 'log', 'लोगों': 'log', 'महंगा': 'mehenga', 'डिस्काउंट': 'discount', 'गोवा': 'goa', 'मनाली': 'manali', 'लद्दाख': 'ladakh', 'केरल': 'kerala', 'कच्छ': 'kutch', 'दिसंबर': 'december', 'जनवरी': 'january', 'नवंबर': 'november', 'अक्टूबर': 'october', 'दिन': 'days', 'प्लान': 'plan', 'जानकारी': 'details', 'धन्यवाद': 'thanks', 'नमस्ते': 'namaste', 'करो': 'karo', 'वादा': 'promise', 'होल्ड': 'hold', 'मिलेगा': 'milega', 'क्यों': 'kyun', 'कब': 'kab', 'सुरक्षा': 'safety', 'बच्चों': 'bachche', 'बच्चे': 'bachche', 'था': 'tha', 'लेट': 'late', 'संभाल': 'sambhal', 'सब': 'sab', 'आप': 'aap', 'रिव्यू': 'review', 'गंदा': 'ganda', 'कर': 'kar', 'दो': 'do', 'भेजो': 'bhejo', 'बताओ': 'batao', 'चाहिए': 'chahiye', 'लड़कियां': 'girls', 'लड़कियों': 'girls', 'महिला': 'women', 'के': 'ke', 'लिए': 'liye', 'का': 'ka', 'है': 'hai', 'क्या': 'kya', 'हम': 'hum', 'मैं': 'main', 'और': 'aur', 'नहीं': 'nahi' };
const DIGITS = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9', '૦': '0', '૧': '1', '૨': '2', '૩': '3', '૪': '4', '૫': '5', '૬': '6', '૭': '7', '૮': '8', '૯': '9' };
function latinise(text) {
  let t = String(text || '').replace(/[०-९૦-૯]/g, d => DIGITS[d]);
  if (!GUJ.test(t) && !DEV.test(t)) return t;
  t = t.replace(/[\u0A80-\u0AFF\u0900-\u097F]+/g, w => XLIT[w] || XLIT[w.replace(/[ોેાીુૂંઃ]$/u, '')] || ' ');
  return t.replace(/\s+/g, ' ').trim();
}
const scriptOf = (t) => GUJ.test(t) ? 'gujarati' : DEV.test(t) ? 'hindi' : null;
const isHinglish = (t) => !!scriptOf(t) || /\b(hai|kya|kitna|kitne|bhai|bhaiya|didi|batao|chahiye|karna|karenge|nahi|haan|ji|kab|kaise|paise|rupay|mein|ka|ki|ke|ho|hoga|hogi|milega|plz|pls)\b/i.test(t);

class Growth {
  constructor(brain, { dataDir } = {}) {
    this.brain = brain;
    this.file = path.join(dataDir || brain.dataDir, 'growth.json');
    this.state = { profile: { name: 'Travelers Clan', city: '', phone: '', website: 'https://travelersclan.in', instagram: '', email: '', hours: '9am–9pm, 7 days', languages: ['English', 'Hindi'], usp: 'small group trips with a trip captain, fixed dates, no hidden costs', trips: [], policies: { included: 'travel from the start city, stay (sharing basis), breakfast and dinner, all sightseeing in the plan, a trip captain who travels with the group', excluded: 'lunches, personal shopping, entry tickets not in the plan, anything marked optional', payment: 'advance by UPI or bank transfer to hold the seat, balance 7 days before departure, GST invoice on request', cancellation: 'advance is transferable to any other batch within 6 months; cancellation 15+ days before departure refunds everything except the advance; under 15 days no refund because hotels and transport are already paid', pickup: 'we start from the city centre at a fixed point and time shared in the trip WhatsApp group 3 days before', safety: 'a trip captain travels with every group, we keep an emergency contact for every traveller, women travellers are roomed with women only, and we have run every batch with women travelling solo', food: 'vegetarian and Jain options on every meal, tell us allergies at booking', age: 'most travellers are 20 to 40; families and parents are welcome on the relaxed batches', proof: 'every batch has photos and traveller reviews on our Google profile and Instagram; we can send last batch\'s photos and a past traveller\'s number you can call before you pay anything', handled: 'yes, everything from pickup to drop is handled: transport, stay, meals, permits, and a trip captain who travels with the group and sorts anything on the spot' }, policiesHi: { included: 'start city se travel, stay (sharing), breakfast aur dinner, plan ki saari sightseeing, aur ek trip captain jo group ke saath chalta hai', excluded: 'lunch, personal shopping, plan ke bahar ki entry tickets, aur jo optional likha hai', payment: 'seat hold ke liye UPI ya bank transfer se advance, balance departure se 7 din pehle, GST invoice maangne par', cancellation: 'advance 6 mahine ke andar kisi bhi batch mein transfer ho sakta hai; departure se 15+ din pehle cancel karo to advance chhod ke sab refund; 15 din ke andar refund nahi kyunki hotel aur transport pay ho chuke hote hain', pickup: 'city centre ke ek fixed point se nikalte hain, point aur time trip WhatsApp group mein 3 din pehle share hota hai', safety: 'har group ke saath trip captain hota hai, har traveller ka emergency contact rakhte hain, ladkiyon ki rooming ladkiyon ke saath hi hoti hai, aur har batch mein solo ladkiyan travel kar chuki hain', food: 'har meal mein veg aur Jain option, allergy booking par bata do', age: 'zyada traveller 20 se 40 ke hain; relaxed batches mein family aur parents welcome hain', proof: 'har batch ki photos aur travellers ke reviews hamare Google profile aur Instagram par hain; pichle batch ki photos aur ek purane traveller ka number bhej sakte hain, pay karne se pehle call kar lo', handled: 'haan, pickup se drop tak sab hum handle karte hain: transport, stay, khana, permits, aur ek trip captain jo group ke saath chalta hai aur wahin sab sort karta hai' } }, leads: [], threads: {}, log: [], settings: { autoReply: false, handoffKeywords: ['pay', 'payment', 'book', 'advance', 'upi', 'account', 'refund', 'cancel', 'complaint', 'angry', 'legal'] } };
    try { if (fs.existsSync(this.file)) { Object.assign(this.state, JSON.parse(fs.readFileSync(this.file, 'utf8'))); this._mtime = fs.statSync(this.file).mtimeMs; } } catch (e) { /* fresh */ }
  }
  /** Another writer (the WhatsApp connector, a second tab) may have saved since we loaded: merge, never overwrite. */
  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      let st; try { st = fs.statSync(this.file).mtimeMs; } catch { st = 0; }
      if (st && st !== this._mtime) { try { this.mergeFrom(JSON.parse(fs.readFileSync(this.file, 'utf8'))); } catch { /* corrupt file: ours wins */ } }
      fs.writeFileSync(this.file, JSON.stringify(this.state)); this._mtime = fs.statSync(this.file).mtimeMs;
    } catch (e) { /* read-only fs is fine */ }
  }
  mergeFrom(other) {
    if (!other || typeof other !== 'object') return;
    for (const o of other.leads || []) { const m = this.state.leads.find(l => l.id === o.id); if (!m) this.state.leads.push(o); else if ((o.updated || 0) > (m.updated || 0)) Object.assign(m, o, { touches: Math.max(m.touches || 0, o.touches || 0) }); else m.touches = Math.max(m.touches || 0, o.touches || 0); }
    for (const [id, th] of Object.entries(other.threads || {})) { const m = this.state.threads[id]; if (!m) { this.state.threads[id] = th; continue; } const seen = new Set(m.messages.map(x => x.t + '|' + x.role)); for (const x of th.messages || []) if (!seen.has(x.t + '|' + x.role)) m.messages.push(x); m.messages.sort((a, b) => a.t - b.t); m.said = Object.assign({}, th.said, m.said); }
    const seenLog = new Set(this.state.log.map(x => x.t + '|' + x.id)); for (const x of other.log || []) if (!seenLog.has(x.t + '|' + x.id)) this.state.log.push(x);
    this.state.log.sort((a, b) => a.t - b.t);
    if (other.profile && (other.profile.updated || 0) > (this.state.profile.updated || 0)) this.state.profile = other.profile;
  }
  get profile() { return this.state.profile; }
  setProfile(p) {
    const P = this.state.profile;
    for (const k of ['name', 'city', 'phone', 'website', 'instagram', 'email', 'hours', 'usp', 'upi']) if (p[k] != null) P[k] = String(p[k]).trim();
    if (p.policies && typeof p.policies === 'object') { P.policies = P.policies || {}; P.policiesHi = P.policiesHi || {}; for (const [k, v] of Object.entries(p.policies)) if (v != null && String(v).trim() !== P.policies[k]) { P.policies[k] = String(v).trim(); delete P.policiesHi[k]; } }
    if (p.policiesHi && typeof p.policiesHi === 'object') for (const [k, v] of Object.entries(p.policiesHi)) if (v != null) P.policiesHi[k] = String(v).trim();
    this.translatePolicies();
    if (p.languages) P.languages = Array.isArray(p.languages) ? p.languages : String(p.languages).split(',').map(s => s.trim()).filter(Boolean);
    if (Array.isArray(p.trips)) P.trips = p.trips.map(t => ({ name: String(t.name || '').trim(), date: t.date || '', days: +t.days || 0, price: +t.price || 0, seats: +t.seats || 0, booked: +t.booked || 0, from: t.from || P.city })).filter(t => t.name);
    P.updated = Date.now();
    this.save();
    this.brain.teach(this.profileFacts().join(' '), { source: 'growth', importance: 0.9 });
    return P;
  }
  /** Any policy you changed loses its Hinglish twin; an open model writes it once and it is saved, never translated live. */
  async translatePolicies() {
    const llm = this.llm(); const P = this.profile; if (!llm) return;
    P.policiesHi = P.policiesHi || {};
    for (const [k, v] of Object.entries(P.policies || {})) if (!P.policiesHi[k]) { const out = await llm.ask('Rewrite this travel-company policy in natural Hinglish (Hindi words in Latin script, English numbers and nouns), same facts, one sentence, no emojis.', v, { maxTokens: 120 }); if (out) P.policiesHi[k] = out.trim(); }
    this.save();
  }
  /** The profile as teachable sentences so the mind answers "what is the phone number" correctly. */
  profileFacts() {
    const P = this.profile; const f = [];
    if (P.phone) f.push(`${P.name} phone number is ${P.phone}.`);
    if (P.city) f.push(`${P.name} is based in ${P.city}.`);
    for (const [k, v] of Object.entries(P.policies || {})) f.push(`The ${k === 'included' ? 'inclusions' : k === 'excluded' ? 'exclusions' : k} policy is ${v.replace(/[.;]+$/, '').replace(/;/g, ',')}.`);
    if (P.upi) f.push(`${P.name} UPI id is ${P.upi}.`);
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
      const left = this.seatsLeft(t);
      posts.push({ type: 'offer', title: `${t.name} · ${t.date ? fmtDate(t.date) : 'dates on request'} · ${money(t.price)} per person`, body: `${t.days ? t.days + ' days' : 'Fixed departure'} from ${t.from || P.city}. Stay, travel, meals and a trip captain included. No hidden costs.${left ? ` ${left} of ${t.seats} seats left.` : ''} WhatsApp ${P.phone || 'us'} to hold a seat.`, cta: 'Book', link: this.waLink(`Hi, I want to know about ${t.name} on ${t.date}`) || P.website });
    }
    posts.push({ type: 'update', title: `How a ${P.name} trip works`, body: `Pick a date, pay a small advance, and we handle the rest: transport, stay, food, and a captain who travels with you. Small groups, real people, ${P.usp}.`, cta: 'Learn more', link: P.website });
    posts.push({ type: 'update', title: 'From last week\'s batch', body: `Add 3 photos of travellers' faces and one of the meal. Caption: "${(this.upcoming(1)[0] || {}).name || 'Next batch'} crew, ${new Date().toLocaleDateString('en-IN', { month: 'long' })}. Next departure ${(this.upcoming(1)[0] || {}).date || 'soon'}."`, cta: 'Call', link: this.waLink() });
    const llm = this.llm();
    if (llm) for (const p of posts.slice(0, 2)) { const out = await llm.ask('You write Google Business Profile posts for an Indian travel company. Keep every fact and number. Max 60 words, plain, no hashtags, no emojis.', `Title: ${p.title}\nBody: ${p.body}`, { maxTokens: 150 }); if (out) p.body = out; }
    return posts;
  }
  async reviewReply(text, stars = 5, name = '') {
    const P = this.profile; const first = name ? name.split(' ')[0] : '';
    const t = String(text || '');
    const liked = (t.match(/\b(captain|guide|driver|food|stay|hotel|group|itinerary|views?|people)\b[^.,;]{0,40}\b(great|good|amazing|excellent|lovely|best|wonderful|helpful|superb)\b|\b(great|good|amazing|excellent|lovely|best|wonderful|helpful|superb)\b[^.,;]{0,25}\b(captain|guide|driver|food|stay|hotel|group|itinerary|views?|people)\b/i) || [])[0];
    let draft;
    const hiName = first ? first + ', ' : '';
    if (stars >= 4) draft = `Thank you ${first || 'so much'}! ${/captain|guide|driver|food|stay|hotel/i.test(t) ? 'Glad the ' + (t.match(/captain|guide|driver|food|stay|hotel/i)[0].toLowerCase()) + ' made the trip for you. ' : ''}It was a pleasure travelling with you. Our next departures are up on the profile; seats go first to past travellers, so message us on WhatsApp before they open publicly. See you on the next one, team ${P.name}.`;
    else if (stars === 3) draft = `${hiName ? hiName + 'thank' : 'Thank'} you for the honest feedback. ${liked ? `We are glad the ${liked.trim()}, and we will pass it on. ` : ''}${/late|delay|wait/i.test(t) ? 'The delay should not have happened and we have changed how we schedule that leg. ' : 'We have noted exactly what fell short. '}Please message ${P.phone || 'us on WhatsApp'} so we can make the next trip right for you. Team ${P.name}.`;
    else draft = `${first || 'We'}${first ? ', we' : ''} are sorry. This is not the experience we promise and we are not going to argue with it here. Please message ${P.phone || 'us on WhatsApp'} or email ${P.email || 'us'} today; the founder will call you back personally within 24 hours, hear the full story, and set it right. Team ${P.name}.`;
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
  /** What the customer wants. Every intent is scored; negation cancels objections; the open model breaks ties. */
  static get INTENTS() {
    return [
      ['grief', 4, /\b(passed away|passed last|died|death|expired|no more|demise|dehant|guzar gaye|nahi rahe|funeral)\b/],
      ['escalate', 3, /\b(nobody replies|no one replies|no reply|third time|3rd time|is this how you treat|ignoring me|still waiting|i want to cancel|cancel my|cancel our|refund my|want (a |my )?refund|refund chahiye|refund do|money back|complaint|cheated|fraud|legal|consumer court|worst|pathetic|angry|scammed|this is a scam|you are a scam|you people are (a )?scam|not what was promised|promise nahi|promised|was (rude|dirty|late|cold|filthy)|were (rude|dirty|late|cold)|ganda|gandi|late thi|late tha|bakwas|bekaar|disappointed|unacceptable|never again)\b/],
      ['book', 3, /\b(paid|payment done|transferred|sent the advance|screenshot|upi id|account number|bank details|how (do|to|can) (i |we )?pay|where (do|to) (i |we )?pay|payment link|pay now|hold (my|our|the|\d+)( seats?)?|book (it|us|me|now|\d+|kar(o|do))|confirm (my|our|the) (seats?|booking)|yes hold|haan hold|pay kaise|hold kar(o|do)|^hold$)\b/],
      ['book', 2, /^\s*(ok|okay|yes|haan|ha|sure|great)?[\s,]*(book|booking|hold|book karo|hold karo|book kar do|confirm)\b[\s!.]*$/],
      ['faq:reliability', 3, /\b(broke down|breakdown|nobody helped|no one helped|bad experience|another company|other company|stranded|left us|didn'?t help|did not help|last time .{0,30}(bad|worst|horrible))\b/],
      ['faq:trust', 3, /\b(convince me|says .{0,40}scam|is this a scam|scam hai|scam to nahi|real or scam|how do i know|how can i trust|run away|wont run|won't run|take my money|fraud these days|fraud ho|scam these days|is this genuine|legit\?|registered|gst number|company registered)\b/],
      ['faq:confused', 3, /\b(don'?t understand|dont get it|confused|new to this|first time booking|first time with you|first time doing this|what is advance|what does advance|per person or|for everyone or|samajh nahi|samjha nahi|matlab)\b/],
      ['faq:medical', 3, /\b(bp|blood pressure|heart|asthma|diabet\w*|knee|surgery|pregnan\w*|wheelchair|medical|doctor|medicine|altitude sick)\b/],
      ['faq:handled', 2.5, /\b(handle|handled|manage|take care|arrange|arranged|sab (aap|tum|aap log)|sambhal|sambhaal|pickup (se|to) drop|door ?to ?door|end to end)\b/],
      ['faq:proof', 2.5, /\b(reviews?|proof|genuine|legit|real or fake|trust(worthy)?|testimonial|past trips?|previous trips?|photos? of (past|last|previous)|rating|google rating|pichle trips?|pichhle|koi proof)\b/],
      ['faq:hidden', 2, /\b(hidden|extra (cost|charge)s?|anything extra|all[- ]inclusive|total cost|any other charges|chhupa|chupa)\b/],
      ['faq:included', 2, /\b(included?|includes|inclusions|what (do|will) (i|we) get|covers?|kya kya milega|kya include|included hai)\b/],
      ['faq:excluded', 1.5, /\b(not included|exclu\w*|lunch)\b/],
      ['faq:cancellation', 2, /\b(cancel\w*|refund\w*|postpone|reschedule|transfer\w*)\b/],
      ['faq:pickup', 2, /\b(pickup|pick up|pick-up|boarding|start(ing)? point|where (do|will) we (meet|start)|departure point|kahan se|kaha se|from where|bus (leave|leaves|depart)|what time|kitne baje|departure time|reporting time)\b/],
      ['faq:extend', 3, /\b(add|extend|extra|more)\s+(\d+|a|an|one|two|three|couple of)\s*(more |extra )?(days?|nights?)\b|\bextend (the|our|my) (trip|stay)\b|\bstay (longer|back)\b/],
      ['faq:dateq', 3, /\b(weekend|weekday|which day|what day|day of the week|saturday|sunday|friday|monday|public holiday|long weekend)\b/],
      ['objection:competitor', 3, /\b(another (agency|company|operator|guy)|other (agency|company|operator)|competitor|someone else|elsewhere|dusri company|doosri company)\b.*\d|\bwhy (should i|pay|would i) (pay )?(more|14|this)|why pay more|cheaper (elsewhere|outside|there)|giving (it|goa|manali|the same) at\b/],
      ['faq:safety', 2, /\b(safe\w*|security|girls?|women|ladies|female|solo girl|alone|akeli|akela)\b/],
      ['faq:food', 2, /\b(veg\w*|jain|food|meals?|khana|non-?veg|allerg\w*)\b/],
      ['faq:age', 2, /\b(kids?|children|bachch\w*|parents|seniors?|elderly)\b.*\b(ok|okay|fine|allowed|suitable|theek|thik|possible|manage|comfortable|aa sakte|chalega)\b|\b(age|kids?|children|parents|senior|years old|bachch\w*)\b.*\b(allow|ok|fine|suitable|can|join|come|aa sakte)\b|\b(allow|ok|fine|suitable|can|join|come)\b.*\b(age|kids?|children|parents|senior)\b|\b(age limit|minimum age|max age)\b|\b(mother|father|mom|dad|mummy|papa|parents|grandm\w*|grandf\w*|dadi|nani|nana|dada)\b.*\b(\d{2})\b.*\?|\bis (it|this|the trip) (really )?(ok|okay|fine|safe|suitable) for (her|him|them|my)\b/],
      ['faq:payment', 1.5, /\b(payment|advance|instal\w*|emi|gst|invoice|pay)\b/],
      ['faq:stay', 1.5, /\b(stay|hotel|rooms?|sharing|accommodation|resort|camp)\b/],
      ['details', 1.5, /\b(itinerary|plan|details?|schedule|day ?wise|day by day|brochure|pdf|more info|batao|bhejo|jankari)\b/],
      ['price', 1.5, /\b(price|cost|rate|kitna|kitne|kitni|how much|budget|charges|per person|pp|bhav|daam)\b/],
      ['book', 2.5, /\b(add me|add us|still (add|join)|can i still|last minute|will pay (full|now)|pay full now|abhi pay|leaving tomorrow)\b/],
      ['affirm', 2.5, /^\s*(ok|okay|k|yes|yeah|ya|haan|ha|sure|great|fine|cool|done|alright|theek|thik|hmm|okk+|yess+)\b[\s!.]*$/],
      ['objection:price', 2, /\b(expensive|costly|too much|mehenga|mehnga|mehengi|discount|cheaper|negotiate|kam karo|best price|bahut zyada|made of gold|gold or what|can'?t afford|cannot afford|afford|budget tight|tight budget|paise nahi|tight af)\b/],
      ['objection:delay', 2, /\b(think|later|will tell|let you know|discuss|ask (my|the)|baad mein|dekhte|sochke)\b/],
      ['thanks', 2, /\b(thanks|thank you|thx|shukriya|dhanyavad|aabhar)\b/],
      ['greet', 1, /^\s*(hi+|hello|hey|namaste|hola|good (morning|evening|afternoon))\b/],
    ];
  }
  intent(text) {
    const t = latinise(text).toLowerCase();
    const scores = {};
    for (const [name, w, re] of Growth.INTENTS) if (re.test(t)) scores[name] = (scores[name] || 0) + w;
    // Negation: "not expensive", "no hidden" are not objections or worries; "not too expensive, nice" is a yes.
    if (/\b(not|nahi|no|nope|isn'?t|never)\s+(too |so |that |very |at all )?(expensive|costly|mehenga|much)\b/.test(t)) delete scores['objection:price'];
    if (/\b(not|no)\s+(hidden|extra)\b/.test(t) && !/\?/.test(t)) delete scores['faq:hidden'];
    // A question about cancelling is a FAQ; an action with a first-person verb is an escalation (kept above).
    if (scores['faq:cancellation'] && scores['escalate'] && /\b(if|what if|agar|kya hoga|policy|refundable|rules?)\b/.test(t) && !/\b(fraud|cheat|scam|complaint|legal|worst|pathetic|angry)\b/.test(t)) delete scores['escalate'];
    if (scores.greet && t.length > 40) delete scores.greet;
    if (scores['faq:trust']) { delete scores.escalate; delete scores['faq:proof']; }
    if (scores['faq:reliability']) { delete scores.escalate; delete scores['faq:safety']; delete scores['faq:handled']; delete scores['objection:delay']; }
    if (scores['faq:confused'] && /\b(nervous|scared|worried|first time travelling|first time traveling)\b/.test(t)) delete scores['faq:confused'];
    if (scores.grief && /\b(scared|afraid|worried|nervous|dar|is (it|this|the trip) (really )?(ok|okay|fine|safe) for|theek rahega|ok for (her|him|them))\b/.test(t)) { delete scores.grief; scores['faq:age'] = (scores['faq:age'] || 0) + 3; }
    if (scores.grief) { delete scores.escalate; delete scores['faq:cancellation']; delete scores.book; }
    if (scores['faq:confused']) { delete scores['faq:payment']; delete scores.price; }
    if (scores['faq:medical']) { delete scores['faq:safety']; delete scores['faq:age']; }
    if (scores['faq:payment'] && scores.book) delete scores['faq:payment'];
    if (scores['objection:competitor']) { delete scores['faq:payment']; delete scores['objection:price']; delete scores.price; }
    if (scores['faq:extend']) { delete scores['faq:stay']; delete scores.details; }
    if (scores['faq:dateq']) { delete scores.price; delete scores.details; }
    if (scores['faq:pickup'] && scores['faq:dateq'] && /bus|leave|time/.test(t)) delete scores['faq:dateq'];
    if (scores['faq:proof'] && scores['faq:safety'] && /review|proof|legit|genuine/.test(t)) delete scores['faq:safety'];
    if (scores['faq:handled']) { delete scores['faq:pickup']; delete scores['faq:included']; }
    if (scores.escalate && /\b(promise|refund chahiye|refund do|was (rude|dirty|late|cold)|ganda|gandi|bakwas|disappointed)\b/.test(t)) delete scores['faq:cancellation'];
    if (scores['faq:included'] && scores['faq:hidden']) delete scores['faq:included'];
    if (scores['faq:excluded'] && (scores['faq:included'] || scores['faq:hidden'])) delete scores['faq:excluded'];
    if (scores['details'] && scores['price']) delete scores['details'];
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (!ranked.length) return { intent: 'enquiry', confidence: 0.5, ambiguous: false, latin: t };
    const ambiguous = ranked.length > 1 && ranked[0][1] - ranked[1][1] < 0.5;
    return { intent: ranked[0][0], confidence: ambiguous ? 0.5 : 0.9, ambiguous, alt: ranked[1] ? ranked[1][0] : null, latin: t };
  }
  /** Ask the open model to settle an ambiguous or unmatched intent. Only called when a model is present. */
  async intentLLM(text, guess) {
    const llm = this.llm(); if (!llm) return guess;
    const names = Growth.INTENTS.map(i => i[0]).concat('enquiry');
    const got = await llm.json('You classify a customer WhatsApp message to an Indian travel company into exactly one intent.', `Message: ${text}\nIntents: ${names.join(', ')}\nReturn {"intent": one of the intents}`, { maxTokens: 40 });
    return got && names.includes(got.intent) ? got.intent : guess;
  }

  /** One incoming WhatsApp / web-chat message. Returns the reply, whether a human must take over, and the lead row. */
  async chat({ id, name = '', text, source = 'whatsapp' }) {
    id = String(id || 'web-' + Math.random().toString(36).slice(2, 8));
    const th = this.thread(id); th.said = th.said || {}; th.messages.push({ role: 'lead', text: String(text || ''), t: Date.now() });
    const lead = this.lead(id, name); lead.source = lead.source || source; lead.touches++; lead.updated = Date.now();
    const transcript = th.messages.slice(-12).map(m => `${m.role === 'lead' ? 'lead' : 'clan'}: ${latinise(m.text)}`).join('\n');
    const leadText = th.messages.filter(m => m.role === 'lead').map(m => latinise(m.text)).join('\n');
    const script = scriptOf(text); if (script) lead.language = script; else if (isHinglish(text)) lead.language = 'hinglish'; else if (!lead.language && /[a-z]/i.test(text)) lead.language = 'english';
    const hi = lead.language && lead.language !== 'english';
    const req = parseRequirements(leadText);
    { const all = [...leadText.matchAll(/\b(?:we are|hum|now|ab)\s+(\d{1,2})\b|\b(\d{1,2})\s*(?:people|pax|persons|of us|friends|members|log|logon|jan|janta|guys|ppl)\b|\b(?:squad|gang|group|team|batch) of\s+(\d{1,2})\b/gi)]; for (const m of all) if (m[3]) { m[1] = m[3]; } if (all.length) req.group = +(all[all.length - 1][1] || all[all.length - 1][2]); }
    { const cp = latinise(leadText).match(/\b(\d{1,2})\s*couples?\b/i); const kd = latinise(leadText).match(/\b(\d{1,2})\s*(kids?|children|bachch\w*)\b/i); const ad = latinise(leadText).match(/\b(\d{1,2})\s*adults?\b/i); if (cp || (kd && ad)) req.group = (cp ? +cp[1] * 2 : 0) + (ad ? +ad[1] : 0) + (kd ? +kd[1] : 0); }
    if (!req.group) { const m = leadText.match(/\b(\d{1,2})\s*(log|logo|logon|bande|jan|janta|members?)\b/i) || leadText.match(/\bfor\s+(\d{1,2})\b(?!\s*(days?|nights?|k\b|000))/i) || leadText.match(/\b(\d{1,2})\s+(?:of us|pax|ppl|people)\b/i); if (m) req.group = +m[1]; else if (/\b(hum dono|dono|couple)\b/i.test(leadText)) req.group = 2; }
    if (req.destination && !lead.trip) lead.trip = this.matchTrip(req.destination.name) || req.destination.name;
    const scored = this.intent(text);
    let intent = scored.intent;
    let appendFaq = null;
    if (/^faq:(food|safety|age|medical)$/.test(intent) && !th.said.price && (req.destination || this.tripFor(req, lead)) && (req.group || req.budget || req.month) && latinise(text).split(/\s+/).length >= 8) { appendFaq = intent; intent = 'enquiry'; }
    if ((scored.ambiguous || (intent === 'enquiry' && latinise(text).split(/\s+/).length > 3 && !req.destination)) && this.llm()) intent = await this.intentLLM(text, intent);
    th.intents = (th.intents || []).concat({ t: Date.now(), text: String(text).slice(0, 120), intent, confidence: scored.confidence }).slice(-30);
    const handoff = intent === 'book' || intent === 'escalate';
    // The council reviews substantive turns only (a new requirement, a question, an objection): it teaches the mind
    // and its critic flags weak replies. "ok", "thanks", "hi" are not worth a lesson.
    const substantive = ['enquiry', 'price', 'details', 'objection:price', 'objection:delay', 'escalate'].includes(intent) && latinise(text).split(/\s+/).length >= 3;
    const council = substantive ? await this.brain.council.handle({ conversation: transcript, name: lead.name }) : { agents: {} };
    const A = council.agents || {}; council.sales = A.sales; council.critic = A.critic; council.cx = A.cx;
    const draft = council.sales && council.sales.output.draft || '';
    if (intent === 'book') this.hold(this.tripFor(req, lead), id, req.group || 1);
        // Group size changed mid-chat: re-quote the total once.
    const latest = latinise(text); const mk = latest.match(/\b(?:make it|make that|change to|now|ab)\s+(\d{1,2})\b|\b(\d{1,2})\s+(?:now|ab|people now|log ab)\b|\bactually\s+(\d{1,2})\b/i); if (mk) req.group = +(mk[1] || mk[2] || mk[3]);
    const prevGroup = th.said.group; if (req.group && req.group !== prevGroup && th.said.price && /\b(now|ab|actually|we are|hum|make it|make that|change)\b/i.test(latest)) { th.said.price = false; th.said.regroup = true; const held = this.profile.trips.find(x => (x.holds || []).some(h => h.lead === id)); if (held) this.hold(held, id, req.group); }
    // Switching trip mid-chat: the latest message names a different destination than the lead's trip.
    const mentioned = DEST.find(latest); if (mentioned && lead.trip && slug(lead.trip) !== slug(mentioned.name) && !slug(lead.trip).includes(slug(mentioned.name))) { lead.trip = this.matchTrip(mentioned.name) || mentioned.name; req.destination = mentioned; th.said.price = false; }
    if (req.group) th.said.group = req.group;
    let reply = this.composeGrounded({ text, req, lead, draft, intent, said: th.said, hi, stage: council.sales && council.sales.output.stage });
    th.said.regroup = false;
    if (appendFaq) { const extra = this.composeGrounded({ text, req, lead, draft: '', intent: appendFaq, said: th.said, hi }); reply = reply.replace(/\s*(Shall I hold[^.?]*\?|Hold karun\?)\s*$/, '') + ' ' + extra.replace(/^\w+, /, '').replace(/\s*(To hold[^.]*\.|Seat hold[^.]*\.|Reply "hold"[^.]*\.)\s*$/i, ''); reply = reply.trim() + (hi ? ' Hold karun?' : ` Shall I hold ${req.group > 1 ? req.group + ' seats' : 'one'}?`); }
    // Never send the exact same reply twice in one conversation.
    if (th.messages.some(m => m.role === 'clan' && m.text === reply)) reply = this.vary(reply, hi, intent, lead);
    const stage = detectStage(transcript);
    if (intent === 'book') lead.stage = 'hold'; else if (intent === 'escalate') lead.stage = lead.stage === 'new' ? 'qualified' : lead.stage;
    else if (intent.startsWith('objection')) lead.stage = 'objection';
    else if (th.said.price && ['new', 'qualified'].includes(lead.stage)) lead.stage = 'quoted';
    else if (stage && stage !== 'enquiry' && STAGES.includes(stage) && lead.stage === 'new') lead.stage = stage; else if (lead.stage === 'new' && (req.destination || req.month)) lead.stage = 'qualified';
    lead.next = handoff ? Date.now() + 2 * 3600e3 : snapToHours(Date.now() + DAY);
    th.messages.push({ role: 'clan', text: reply, t: Date.now(), auto: this.state.settings.autoReply && !handoff });
    this.state.log.push({ t: Date.now(), id, source, handoff, stage: lead.stage, intent }); if (this.state.log.length > 2000) this.state.log.splice(0, this.state.log.length - 2000);
    this.save();
    return { id, reply, intent, confidence: scored.confidence, script, handoff, send: this.state.settings.autoReply && !handoff, lead, stage: lead.stage, verdict: council.critic && council.critic.verdict, issues: council.critic ? council.critic.findings.slice(0, 3) : [], language: script || (isHinglish(text) ? 'hinglish' : 'english') };
  }

  tripFor(req, lead) { return this.profile.trips.find(x => slug(x.name) === slug(lead.trip) || (req.destination && slug(x.name).includes(slug(req.destination.name)))) || null; }
  priceLine(t, n, hi) {
    const left = this.seatsLeft(t); const adv = this.advance(t);
    const parts = [`${t.name}: ${t.date ? fmtDate(t.date) + ', ' : ''}${t.days ? t.days + ' days, ' : ''}${money(t.price)} per person${left ? `, ${left} seats left` : ''}.`];
    parts.push(hi ? 'Stay, travel, khana aur trip captain sab included, koi hidden cost nahi.' : 'Stay, travel, meals and a trip captain included, no hidden costs.');
    if (n > 1) parts.push(hi ? `${n} logon ka total ${money(n * t.price)}.` : `For ${n} people the total is ${money(n * t.price)}.`);
    if (left && n && left < n) parts.push(hi ? `Abhi ${left} hi seats hain; next batch mein ${n} ke liye jagah hai.` : `Only ${left} seats remain on this batch; the next batch has room for ${n}.`);
    parts.push(hi ? `${money(adv)} per person advance se seat hold ho jaati hai. Hold karun?` : `A ${money(adv)} per person advance holds the seats. Shall I hold ${n > 1 ? n + ' seats' : 'one'}?`);
    return parts.join(' ');
  }
  /** Seats left = seats − booked − live holds. A hold lasts 24 h unless the advance is confirmed (stage advance). */
  seatsLeft(t) { this.releaseHolds(); return Math.max(0, (t.seats || 0) - (t.booked || 0) - (t.holds || []).reduce((n, h) => n + h.n, 0)); }
  releaseHolds() { const now = Date.now(); for (const t of this.profile.trips) if (t.holds && t.holds.length) t.holds = t.holds.filter(h => h.until > now); }
  hold(t, leadId, n = 1) { if (!t) return null; t.holds = (t.holds || []).filter(h => h.lead !== leadId); const h = { lead: leadId, n: Math.max(1, +n || 1), until: Date.now() + DAY, t: Date.now() }; t.holds.push(h); this.save(); return h; }
  /** The advance arrived: a hold becomes booked seats. */
  confirmHold(leadId) { for (const t of this.profile.trips) { const h = (t.holds || []).find(x => x.lead === leadId); if (h) { t.booked = (t.booked || 0) + h.n; t.holds = t.holds.filter(x => x !== h); this.save(); return { trip: t.name, seats: h.n }; } } return null; }
  advance(t) { return Math.min(5000, Math.round((t.price || 10000) * 0.3 / 500) * 500) || 2000; }

  /** Emotion in the message: the reply opens by meeting it before anything else. */
  emotion(text) {
    const t = latinise(text).toLowerCase();
    if (/\b(scared|afraid|worried|nervous|anxious|dar lag|darr|fikar|tension|panic)\b/.test(t)) return 'fear';
    if (/!{2,}|\b(yay+|finally|approved|so excited|cant wait|can'?t wait|woohoo|mil gayi|ho gayi|manjoor|मंजूर|મંજૂર)\b/i.test(text) || /!{2,}/.test(text)) return 'joy';
    if (/\b(lol|lmao|haha|made of gold|or what|seriously\?)\b/.test(t)) return 'sarcasm';
    return null;
  }
  /** The reply: answers the intent from the real trip and the written policies, says the price once, always ends with one next step. */
  composeGrounded({ text, req, lead, draft, intent, said = {}, stage, hi }) {
    const P = this.profile; const pol = P.policies || {}; if (hi == null) hi = isHinglish(text); const first = lead.name ? lead.name.split(' ')[0] + ', ' : '';
    const t = this.tripFor(req, lead); const n = req.group || 0;
    const emo = this.emotion(text);
    const escalated = lead.stage === 'escalated' || (said && said.escalated);
    const nextStep = () => { if (escalated) return hi ? 'Founder ka call aane tak main yahin hoon, jo bhi chahiye likh dijiye.' : 'The founder will call you as promised; write anything else you need here.'; if (!t) return hi ? 'Dates aur kitne log batao, ek ghante mein plan aur price bhejta hoon.' : 'Tell me the dates and how many of you, and I will send the plan and price within the hour.'; if (!said.price) { said.price = true; return this.priceLine(t, n, hi); } if (['hold', 'advance', 'balance'].includes(lead.stage)) return hi ? 'Aapki seat hold hai; advance aate hi team confirm karegi.' : 'Your seats are on hold; the team confirms as soon as the advance arrives.'; return hi ? `Seat hold karne ke liye bas "hold" likho.` : `To hold ${n > 1 ? n + ' seats' : 'a seat'}, just reply "hold".`; };
    const polHi = P.policiesHi || {};
    const ask = (key, fallback) => { const v = (hi && polHi[key]) || pol[key]; return v ? v[0].toUpperCase() + v.slice(1) + '.' : fallback; };
    const emoNow = this.emotion(text); const care = emoNow === 'fear' ? (hi ? 'Samajh sakta hoon, yeh fikar jaayaz hai. ' : 'I understand the worry, and it is a fair one. ') : '';
    // Comparing two of our trips: show both against the budget and recommend.
    { const names = this.profile.trips.filter(x => new RegExp('\\b' + slug(x.name).replace(/-/g, ' ') + '\\b', 'i').test(latinise(text))); if (names.length >= 2) { said.price = true; const rows = names.map(x => `${x.name} ${x.date ? fmtDate(x.date) : ''}: ${money(x.price)} per person, ${this.seatsLeft(x)} seats left${req.budget ? (x.price <= req.budget * 1.05 ? (hi ? ' (budget mein)' : ' (within budget)') : (hi ? ` (budget se ${money(x.price - req.budget)} upar)` : ` (${money(x.price - req.budget)} over budget)`)) : ''}`); const fit = req.budget ? names.filter(x => x.price <= req.budget * 1.05).sort((a, b) => a.price - b.price)[0] : names.sort((a, b) => a.price - b.price)[0]; return `${first}${rows.join('. ')}. ${fit ? (hi ? `${n > 1 ? n + ' logon ke liye ' : ''}main ${fit.name} suggest karunga${req.budget ? ' (budget mein fit)' : ''}; total ${money(fit.price * (n || 1))}.` : `${n > 1 ? 'For ' + n + ' of you ' : ''}I would pick ${fit.name}${req.budget ? ', it fits the budget' : ''}; total ${money(fit.price * (n || 1))}.`) : (hi ? 'Dono budget se upar hain; advance + do kiston se manage ho sakta hai, ya agle sasta batch.' : 'Both are above the budget; advance plus two instalments can bridge it, or the next cheaper batch.')} ${/\b(knee|bp|heart|cannot walk|can'?t walk|senior|parents|elderly|asthma)\b/i.test(latinise(text)) ? (hi ? ' Knee/health ke liye: relaxed pace, kam walking, private cab transfers; dono mein manage ho jaata hai, Goa flat hai.' : ' For the knee or health concern: relaxed pace, minimal walking, private cab transfers; both work, Goa is flat.') : ''} ${hi ? 'Kaunsa hold karun?' : 'Which one shall I hold?'}`.replace(/\s+/g, ' '); } }
    switch (intent) {
      case 'grief': return `${first}${hi ? 'Bahut dukh hua sunkar. Is waqt aapko kisi formality ki zarurat nahi hai.' : 'I am so sorry for your loss. You do not need to deal with any formality right now.'} ${hi ? 'Unki seat ka poora paisa, advance samet, hum refund ya kisi aur ke naam transfer kar denge, jo aap chahein. Founder khud aapko call karenge; jab aap taiyaar hon tab bata dijiye.' : 'Their seat will be fully refunded, advance included, or transferred to anyone you choose, whichever you prefer. The founder will call you personally; just tell us when you are ready.'}`;
      case 'faq:extend': { const d = t ? DEST.find(t.name) : req.destination; const num = (latinise(text).match(/\b(\d+|a|an|one|two|three|couple of)\b\s*(more |extra )?(days?|nights?)/i) || [])[1]; const extra = { a: 1, an: 1, one: 1, two: 2, three: 3, 'couple of': 2 }[String(num).toLowerCase()] || +num || 1; const perDay = d ? d.costPerDay : 3000; const per = extra * perDay; return `${first}${hi ? `Haan, ${extra} din aur add ho sakte hain: lagbhag ${money(per)} per person (${money(perDay)}/din: stay, khana, local travel)${n > 1 ? `, ${n} logon ke ${money(per * n)}` : ''}. Batch ke baad private extension ki tarah; confirm karo to exact quote 1 ghante mein.` : `Yes, ${extra} more day${extra > 1 ? 's' : ''} can be added: about ${money(per)} per person (${money(perDay)} a day for stay, meals and local travel)${n > 1 ? `, ${money(per * n)} for ${n}` : ''}. We run it as a private extension after the batch; say yes and I send the exact quote within the hour.`}`; }
      case 'faq:dateq': { if (!t || !t.date) return `${first}${nextStep()}`; const dep = new Date(t.date); const ret = new Date(dep.getTime() + Math.max(1, (t.days || 1) - 1) * DAY); const wd = (x) => x.toLocaleDateString('en-IN', { weekday: 'long' }); const weekend = [0, 6].includes(dep.getDay()); return `${first}${hi ? `${t.name} ${fmtDate(dep)} ko ${wd(dep)} ko nikalta hai${weekend ? ' (weekend)' : ' (weekday)'} aur ${fmtDate(ret)} ${wd(ret)} ko wapas.` : `${t.name} departs ${fmtDate(dep)}, a ${wd(dep)}${weekend ? ' (weekend)' : ' (weekday)'}, and returns ${fmtDate(ret)}, ${wd(ret)}.`} ${hi ? `Office walon ko ${Math.max(0, (t.days || 1) - (weekend ? 2 : 0))} din ki chhutti lagegi.` : `That is ${Math.max(0, (t.days || 1) - (weekend ? 2 : 0))} day${(t.days || 1) - (weekend ? 2 : 0) === 1 ? '' : 's'} of leave for office-goers.`} ${nextStep()}`; }
      case 'objection:competitor': { const other = (latinise(text).match(/(\d{1,3}(?:,\d{3})+|\d{4,6})/) || [])[1]; return `${first}${hi ? `Sahi sawaal.${other ? ` ${money(String(other).replace(/,/g, ''))} mein aksar sharing mein 4-6 log, khana alag, transfers alag, aur koi captain nahi hota.` : ''} Hamare ${t ? money(t.price) : 'price'} mein stay, travel, saare meals, sightseeing aur ek trip captain jo saath chalta hai, sab included; koi hidden cost nahi. Unki inclusion list bhejo: agar line-by-line same hai to main price match kar dunga.` : `Fair question.${other ? ` At ${money(String(other).replace(/,/g, ''))} it is usually 4 to 6 to a room, meals extra, transfers extra, and no captain on the trip.` : ''} Our ${t ? money(t.price) : 'price'} includes stay, travel, all meals, sightseeing and a trip captain who travels with you; no hidden costs. Send me their inclusion list: if it matches ours line by line, I will match the price.`} ${nextStep()}`.replace(/\s+/g, ' '); }
      case 'faq:reliability': return `${first}${hi ? 'Yahi farak hai hamare aur bus-wale operator mein.' : 'That is exactly the difference between us and a bus operator.'} ${hi ? 'Har batch ke saath ek trip captain chalta hai jo wahin problem sort karta hai, har route par backup vehicle ka contact hota hai, har traveller ka emergency contact hamare paas hota hai, aur founder ka number 24x7 chalu rehta hai.' : 'A trip captain travels with every batch and sorts problems on the spot, every route has a backup vehicle contact, we hold an emergency contact for every traveller, and the founder\'s number is live 24x7.'} ${ask('proof', '')} ${nextStep()}`.replace(/\s+/g, ' ');
      case 'faq:trust': return `${first}${hi ? 'Sahi sawaal hai, aur poochna chahiye.' : 'Fair question, and you should ask it.'} ${hi ? `Advance ${P.upi ? P.upi + ' (company UPI)' : 'company account'} mein jaata hai, GST invoice milta hai, cancellation policy likhi hui hai (advance transferable), aur pay karne se pehle pichle batch ke kisi traveller se baat kara sakte hain.` : `The advance goes to ${P.upi ? P.upi + ', the company UPI' : 'the company account'}, you get a GST invoice, the cancellation policy is written down (advance is transferable), and before you pay anything we can connect you with a traveller from the last batch.`} ${ask('proof', '')} ${nextStep()}`.replace(/\s+/g, ' ');
      case 'faq:confused': { const ex = t || this.upcoming(1)[0]; return `${first}${hi ? 'Koi baat nahi, simple hai.' : 'No problem, it is simple.'} ${ex ? (hi ? `${money(ex.price)} ek insaan ka hai (per person). ${n > 1 ? `${n} log ho to total ${money(ex.price * n)}. ` : ''}Advance matlab seat pakki karne ke liye pehle ${money(this.advance(ex))} per person; baaki ${money(ex.price - this.advance(ex))} departure se 7 din pehle.` : `${money(ex.price)} is for one person. ${n > 1 ? `For ${n} people the total is ${money(ex.price * n)}. ` : ''}The advance is the first ${money(this.advance(ex))} per person that confirms your seat; the remaining ${money(ex.price - this.advance(ex))} is due 7 days before departure.`) : ''} ${hi ? 'Is price mein stay, travel, khana aur captain sab included hai.' : 'That price includes stay, travel, meals and the captain.'} ${hi ? 'Koi bhi sawaal poochho, main hoon.' : 'Ask me anything, I am here.'}`.replace(/\s+/g, ' '); }
      case 'faq:medical': { const care2 = care; const d = req.destination || (t ? DEST.find(t.name) : null); const hiAlt = d && d.maxAltitude >= 2500; return `${first}${care2}${hi ? 'Yeh poochna bilkul sahi hai.' : 'Good that you asked.'} ${hiAlt ? (hi ? `${d.name} ${d.maxAltitude} m tak jaata hai; BP, heart ya saans ki problem ho to doctor ki clearance zaroori hai, aur hum pehle 2 din acclimatisation rakhte hain, oxygen aur local doctor ka contact saath hota hai.` : `${d.name} goes up to ${d.maxAltitude} m; with BP, heart or breathing conditions a doctor's clearance is a must, and we keep 2 acclimatisation days, oxygen and a local doctor's contact.`) : (hi ? 'Is trip mein altitude ki dikkat nahi hai; dawai saath rakho, captain ko bata do, aur emergency contact hamare paas hota hai.' : 'This trip has no altitude issue; carry the medicines, tell the captain, and we keep an emergency contact.')} ${d && d.seniors ? (hi ? `Seniors ke liye: ${d.seniors}.` : `For seniors: ${d.seniors}.`) : ''} ${hi ? 'Chaho to founder se 5 minute call kara doon?' : 'Shall I set up a 5 minute call with the founder to talk it through?'}`.replace(/\s+/g, ' '); }
      case 'escalate': said.escalated = true; return `${first}${hi ? 'Main samajh gaya, aur yeh hamare liye serious hai. Founder khud aapko 24 ghante ke andar call karenge' : 'I hear you, and we take this seriously. The founder will personally call you within 24 hours'}${P.phone ? ` (${P.phone})` : ''}. ${hi ? 'Jo hua, yahan likh dijiye taaki call se pehle sab pata ho.' : 'Please write what happened here so nothing is missed before the call.'}`;
      case 'book': { said.price = true; if (/\b(tomorrow|last minute|still add|can i still|leaving)\b/.test(latinise(text).toLowerCase()) && !t) return `${first}${hi ? 'Haan, last minute bhi ho jaata hai agar seat hai. Kaunsa trip? Seat check karke abhi hold karta hoon; poora payment aur screenshot aate hi team 5 minute mein confirm karegi.' : 'Yes, last minute works if a seat is free. Which trip? I will check and hold it right away; once the full payment and screenshot arrive the team confirms within 5 minutes.'}${this.nextBatches(hi) ? ' ' + this.nextBatches(hi) : ''}`;
        if (/\b(tomorrow|last minute|still add|can i still|leaving)\b/.test(latinise(text).toLowerCase()) && t) { const left = this.seatsLeft(t); if (!left) return `${first}${hi ? `${t.name} full hai, par waiting list mein daal deta hoon; seat khulte hi pehle aapko.` : `${t.name} is full, but I am putting you on the waiting list; the first seat that opens is yours.`}`; this.hold(t, lead.id, n || 1); return `${first}${hi ? `Haan, ${left} seat${left > 1 ? 's' : ''} hain. Aapki seat abhi hold kar di; poora ${money(t.price * (n || 1))}${P.upi ? ' ' + P.upi + ' par' : ''} bhejkar screenshot bhejo, team 5 minute mein confirm karegi aur pickup point bhejegi.` : `Yes, ${left} seat${left > 1 ? 's' : ''} left. I have held yours now; send the full ${money(t.price * (n || 1))}${P.upi ? ' to ' + P.upi : ''} with the screenshot and the team confirms within 5 minutes and sends the pickup point.`}`; } if (/\b(paid|payment done|transferred|screenshot sent|sent the advance|kar diya|bhej diya)\b/i.test(latinise(text))) { said.booked = true; return `${first}${hi ? 'Mil gaya, shukriya! Team abhi check karke confirmation aur trip group ka link bhejegi. Sabke poore naam aur ek emergency contact bhej do.' : 'Received, thank you! The team is checking it now and will send the confirmation and the trip group link. Please send everyone\'s full names and one emergency contact.'}`; } said.booked = true; const adv = t ? this.advance(t) : 2000; return `${first}${hi ? 'Badhiya!' : 'Great!'} ${t ? (hi ? `${t.name} ke ${n || ''} seat${n > 1 ? 's' : ''} hold kar rahe hain.` : `Holding ${n ? n + ' seats' : 'your seat'} on ${t.name}.`) : ''} ${hi ? `Advance ${money(adv)} per person${P.upi ? ' UPI ' + P.upi + ' par' : ''} bhejkar screenshot yahan bhejo, aur sabke poore naam (ID ke jaisa). Team ${P.name} ka member abhi confirm karega.` : `Send the ${money(adv)} per person advance${P.upi ? ' to UPI ' + P.upi : ''} and the screenshot here, with the full names as on ID. A ${P.name} team member will confirm it personally in a few minutes.`}`.replace(/\s+/g, ' '); }
      case 'faq:hidden': return `${first}${hi ? 'Koi hidden cost nahi.' : 'No hidden costs.'} ${ask('included', 'Travel, stay, meals and the captain are included.')} ${hi ? 'Jo included nahi hai:' : 'Not included:'} ${pol.excluded || 'personal expenses'}. ${nextStep()}`;
      case 'faq:included': return `${first}${hi ? 'Included hai:' : 'Included:'} ${pol.included || 'travel, stay, meals, captain'}. ${hi ? 'Included nahi:' : 'Not included:'} ${pol.excluded || 'personal expenses'}. ${nextStep()}`;
      case 'faq:excluded': return `${first}${hi ? 'Included nahi hai:' : 'Not included:'} ${pol.excluded || 'personal expenses'}. ${hi ? 'Baaki sab price mein hai.' : 'Everything else is in the price.'} ${nextStep()}`;
      case 'faq:cancellation': return `${first}${care}${ask('cancellation', 'The advance is transferable to another batch; full refund minus advance up to 15 days before.')} ${nextStep()}`;
      case 'faq:pickup': return `${first}${ask('pickup', 'Pickup point and time are shared in the trip group 3 days before.')}${/time|baje|leave|depart/.test(latinise(text).toLowerCase()) ? (hi ? ' Nikalne ka time zyadatar subah 5-6 baje hota hai; exact time group mein aata hai.' : ' Departure time is usually 5 to 6 in the morning; the exact time comes in the group.') : ''}${t && t.from ? (hi ? ` Shuruaat ${t.from} se.` : ` We start from ${t.from}.`) : ''} ${nextStep()}`;
      case 'faq:proof': return `${first}${ask('proof', 'Reviews and photos from every batch are on our Google profile and Instagram.')} ${nextStep()}`;
      case 'faq:handled': return `${first}${ask('handled', 'Yes, everything from pickup to drop is handled, with a captain on the trip.')} ${nextStep()}`;
      case 'faq:safety': return `${first}${care}${ask('safety', 'A captain travels with every group and women are roomed with women only.')} ${nextStep()}`;
      case 'faq:food': return `${first}${ask('food', 'Veg and Jain options on every meal.')} ${nextStep()}`;
      case 'faq:age': { const d = req.destination || (t ? DEST.find(t.name) : null); const senior = /\b(mother|father|parents|mom|dad|mummy|papa|senior|elderly|6\d|7\d|8\d|grand)\b/.test(latinise(text).toLowerCase()); return `${first}${care}${ask('age', 'All ages are welcome.')}${senior ? ' ' + (hi ? `Seniors ke liye: ${d && d.seniors ? d.seniors : 'relaxed pace, ground-floor room, captain unke saath'}; ek emergency contact aur dawai ki list le lete hain, aur captain har din unka haal poochta hai.` : `For seniors: ${d && d.seniors ? d.seniors : 'relaxed pace, ground-floor room, the captain stays close'}; we take an emergency contact and a medicine list, and the captain checks on them every day.`) + ' ' + (hi ? 'Chaho to founder se 5 minute baat kara doon, phir decide karna.' : 'If it helps, I can set up a 5 minute call with the founder before you decide.') : ''} ${senior ? '' : nextStep()}`.replace(/\s+/g, ' '); }
      case 'faq:payment': return `${first}${ask('payment', 'Advance to hold the seat, balance 7 days before departure.')}${t ? (hi ? ` ${t.name} ka advance ${money(this.advance(t))} per person hai.` : ` For ${t.name} the advance is ${money(this.advance(t))} per person.`) : ''} ${nextStep()}`;
      case 'faq:stay': return `${first}${hi ? 'Stay sharing basis par hai (2-3 log per room), clean aur central; same-gender rooming.' : 'Stay is on sharing basis (2 to 3 per room), clean and central; same-gender rooming.'}${t ? (hi ? ' Pure trip ki price mein included.' : ' Included in the trip price.') : ''} ${nextStep()}`;
      case 'details': { if (!t) return `${first}${nextStep()}`; const d = DEST.find(t.name); const days = t.days || 3; const plan = Array.from({ length: Math.min(days, 6) }, (_, i) => `D${i + 1} ${i === 0 ? 'depart ' + (t.from || P.city || 'city') + ', check in, evening walk' : i === days - 1 ? 'breakfast, last stop, return' : d && d.highlights && d.highlights[i - 1] ? d.highlights[i - 1] : 'sightseeing + free time'}`).join('; '); said.price = true; return `${first}${t.name} ${hi ? 'plan' : 'plan'}: ${plan}. ${this.priceLine(t, n, hi)}`; }
      case 'price': { said.price = true; return `${first}${t ? this.priceLine(t, n, hi) : (hi ? 'Kaunsa trip aur kitne log? Price fixed aur all-inclusive hoti hai.' : 'Which trip and how many of you? Our prices are fixed and all-inclusive.') + (req.destination ? '' : ' ' + this.nextBatches(hi))}`; }
      case 'objection:price': {
        if (!t) { const ex = this.upcoming(1)[0]; return `${first}${hi ? 'Samajh sakta hoon.' : 'I get it.'} ${ex ? (hi ? `Hum advance ${money(this.advance(ex))} aur baaki do kiston mein le lete hain, aur 6+ ke group mein organiser free jaata hai.` : `We take ${money(this.advance(ex))} as advance and the rest in two parts, and in a group of 6 or more the organiser travels free.`) : ''} ${hi ? 'Kaunsa trip dekh rahe ho? Main sabse sasta batch dhoondh deta hoon.' : 'Which trip are you looking at? I will find the cheapest batch that fits.'}`.replace(/\s+/g, ' '); }
        const soft = /afford|tight|paise nahi/.test(latinise(text).toLowerCase());
        const open = emo === 'sarcasm' ? (hi ? 'Haha, hotel sone ka nahi hai, par ' : 'Ha, no gold in the hotel, but ') : soft ? (hi ? 'Samajh sakta hoon. ' : 'I get it. ') : '';
        if (soft) return `${first}${open}${hi ? `Do tarike hain: advance ${money(this.advance(t))} abhi aur baaki do kiston mein departure se pehle; ya ${n >= 6 ? 'group mein organiser ki seat free, yani ek kam pay karo' : 'agle cheaper batch ki waiting list'}.` : `Two ways to make it work: ${money(this.advance(t))} now and the rest in two parts before departure; or ${n >= 6 ? 'the organiser travels free in your group, so you pay for one less' : 'the waiting list for the next cheaper batch'}.`} ${nextStep()}`;
        return `${first}${open}${hi ? `price fixed hai aur sab included hai; alag se hotel + travel + khana jodoge to ${money(Math.round(t.price * 1.2 / 100) * 100)} se upar jaata hai.` : `the price is fixed and all-inclusive; booking the stay, travel and meals separately comes to over ${money(Math.round(t.price * 1.2 / 100) * 100)}.`} ${n >= 6 ? (hi ? `${n} log ho to organiser ki seat free: ek kam do.` : `For ${n} people the organiser travels free, so pay for ${n - 1}.`) : (hi ? 'Advance abhi, balance 7 din pehle, isse aasaan ho jaata hai.' : 'Advance now and balance 7 days before departure makes it easier.')} ${nextStep()}`.replace(/^(\w+, )?(the|price)/, (m, a, b) => (a || '') + (open ? b : b.charAt(0).toUpperCase() + b.slice(1)));
      }
      case 'objection:delay': return `${first}${hi ? 'Bilkul, aaram se sochiye.' : 'Of course, take your time.'} ${t && t.seats - t.booked > 0 ? (hi ? `Bas yeh dhyaan rahe: ${t.name} mein ${t.seats - t.booked} seats bachi hain; 24 ghante ke liye bina advance hold kar sakta hoon, bolo to.` : `One thing to know: ${t.name} has ${t.seats - t.booked} seats left; I can hold yours for 24 hours without advance if you want.`) : ''}`.trim();
      case 'affirm': return `${first}${said.price ? (hi ? 'Badhiya. Seat hold karne ke liye "hold" likho, ya koi sawaal ho to poochho.' : 'Great. Reply "hold" to hold the seats, or ask me anything else.') : nextStep()}`;
      case 'thanks': return `${first}${hi ? 'Khushi hui! Koi bhi sawaal ho to yahan message karo.' : 'Happy to help! Message here any time.'}${t && !said.price ? ' ' + nextStep() : ''}`;
      case 'greet': return `${first}${hi ? 'Namaste! Kaunsa trip aur kaunsi dates dekh rahe ho, aur kitne log?' : 'Hi! Which trip and dates are you looking at, and how many of you?'} ${this.nextBatches(hi)}`.trim();
      default: {
        // Destination questions (crowds, quiet, weather, beaches, best month) answered from the destinations table.
        { const d = req.destination || (t ? DEST.find(t.name) : null); if (d && /\b(crowd|crowded|quiet|peaceful|weather|rain|cold|hot|snow|best (time|month)|too (hot|cold|crowded)|beach|beaches|nightlife|safe area|which area)\b/i.test(latinise(text))) { const m = req.month; const st = m ? DEST.seasonStatus(d, m) : null; const quiet = /quiet|peaceful|crowd/i.test(latinise(text)); return `${first}${m ? (hi ? `${d.name} ${DEST.MONTHS[m - 1]} mein ${st === 'in season' ? 'peak season hai: mausam best, par bheed aur rate zyada' : st === 'shoulder season' ? 'shoulder season hai: kam bheed, acche rate' : 'off season hai'}.` : `${d.name} in ${DEST.MONTHS[m - 1]} is ${st === 'in season' ? 'peak season: best weather, but busier and pricier' : st === 'shoulder season' ? 'shoulder season: fewer people, better rates' : 'off season'}.`) : ''} ${quiet ? (hi ? `Hum ${d.name === 'Goa' ? 'South Goa ki shaant beaches (Palolem, Agonda) rakhte hain, Baga-Calangute ki bheed se door' : 'main strip se door shaant stay rakhte hain'}, aur group chhota hota hai.` : `We ${d.name === 'Goa' ? 'stay on the quieter South Goa beaches (Palolem, Agonda), away from the Baga-Calangute crowd' : 'keep the stay away from the main strip'}, and the group is small.`) : ''} ${(d.highlights || []).length ? (hi ? `Highlights: ${d.highlights.slice(0, 3).join(', ')}.` : `Highlights: ${d.highlights.slice(0, 3).join(', ')}.`) : ''} ${(d.risks || []).length && !quiet ? (hi ? `Dhyaan rakhne layak: ${d.risks[0]}.` : `Worth knowing: ${d.risks[0]}.`) : ''} ${nextStep()}`.replace(/\s+/g, ' '); } }
        // No destination but a group and a budget: recommend the cheapest fit, with the group offer.
        if (!t && !req.destination && (req.budget || n >= 6) && this.upcoming(1).length) { const up = this.upcoming(6).filter(x => !req.month || !x.date || new Date(x.date).getMonth() + 1 === req.month); const list = (up.length ? up : this.upcoming(6)).slice().sort((a, b) => a.price - b.price); const c = list[0]; const eff = n >= 6 ? Math.round(c.price * (n - 1) / n) : c.price; said.price = true; return `${first}${hi ? `Sabse sasta batch: ${c.name} ${c.date ? fmtDate(c.date) : ''}, ${money(c.price)} per person, ${this.seatsLeft(c)} seats.` : `Cheapest batch: ${c.name} ${c.date ? fmtDate(c.date) : ''}, ${money(c.price)} per person, ${this.seatsLeft(c)} seats.`} ${n >= 6 ? (hi ? `${n} log ho to organiser free jaata hai, yani effective ${money(eff)} per person.` : `For ${n} of you the organiser travels free, so effectively ${money(eff)} per person.`) : ''} ${req.budget && eff > req.budget ? (hi ? `Budget ${money(req.budget)} se ${money(eff - req.budget)} upar hai: advance ${money(this.advance(c))} aur baaki do kiston mein, ya 3 din ka chhota plan bana dete hain.` : `That is ${money(eff - req.budget)} over your ${money(req.budget)}: advance ${money(this.advance(c))} and the rest in two parts, or we trim it to a shorter plan.`) : ''} ${hi ? `${n >= 6 ? n + ' seats' : 'Seat'} hold karun?` : `Shall I hold ${n >= 6 ? n + ' seats' : 'a seat'}?`}`.replace(/\s+/g, ' '); }
        if (t && said.price && !said.regroup && req.month && new RegExp('\\b' + DEST.MONTHS[req.month - 1].slice(0, 3), 'i').test(latinise(text)) && t.date) { const inMonth = new Date(t.date).getMonth() + 1 === req.month; return `${first}${inMonth ? (hi ? `${DEST.MONTHS[req.month - 1]} mein hi hai: ${t.name} ${fmtDate(t.date)} ko nikalta hai.` : `${DEST.MONTHS[req.month - 1].charAt(0).toUpperCase() + DEST.MONTHS[req.month - 1].slice(1)} works: ${t.name} departs ${fmtDate(t.date)}.`) : (hi ? `${t.name} ka batch ${fmtDate(t.date)} ko hai, ${DEST.MONTHS[req.month - 1]} mein custom bana sakte hain.` : `The ${t.name} batch is on ${fmtDate(t.date)}; for ${DEST.MONTHS[req.month - 1]} we can run it custom.`)} ${n > 1 ? (hi ? `${n} logon ka total ${money(t.price * n)}.` : `For ${n} people the total is ${money(t.price * n)}.`) : ''} ${hi ? `Seat hold ke liye "hold" likho.` : `Reply "hold" to hold ${n > 1 ? n + ' seats' : 'a seat'}.`}`.replace(/\s+/g, ' '); }
        if (t && said.price && !said.regroup) return `${first}${hi ? 'Haan, bilkul.' : 'Yes, of course.'} ${draft && draft.length < 200 ? draft + ' ' : ''}${hi ? 'Aur kuch poochna ho to poochho; seat hold ke liye "hold" likho.' : 'Ask me anything else; reply "hold" when you want the seats held.'}`.replace(/\s+/g, ' ');
        if (t) { said.price = true; const traits = detectTraits(text); let r = `${first}${emo === 'joy' ? (hi ? 'Badhai ho! ' : 'Congratulations! ') : emo === 'fear' ? (hi ? 'Samajh sakta hoon, chinta mat karo. ' : 'I understand the worry, and it is a fair one. ') : ''}${said.regroup ? (hi ? `Theek, ${n} log. ` : `Got it, ${n} people. `) : ''}${this.priceLine(t, n, hi)}`;
          const totalBudget = /\b(total|altogether|overall|in all|for all|sab milake|poora)\b/i.test(latinise(text)) && req.budget; if (totalBudget && n > 1) { const need = t.price * n; r += ' ' + (need > totalBudget ? (hi ? `Aapka total budget ${money(totalBudget)} hai, yeh ${money(need - totalBudget)} upar hai: advance abhi aur baaki do kiston mein, ya ${t.days - 1} din ka chhota plan.` : `Your total budget is ${money(totalBudget)}, so this is ${money(need - totalBudget)} over: advance now and the rest in two parts, or a ${t.days - 1}-day version.`) : (hi ? `Aapke total budget ${money(totalBudget)} mein aa jaata hai.` : `It fits inside your total budget of ${money(totalBudget)}.`)); } else if (req.budget && req.budget < t.price * 0.9) r += ' ' + (hi ? `Aapka budget ${money(req.budget)} hai; ${money(t.price)} mein sab included hai, alag se kuch nahi lagega.` : `Your budget is ${money(req.budget)}; ${money(t.price)} is all-inclusive, nothing extra on the trip.`);
          if (traits.includes('anxious') || traits.includes('family with kids') || traits.includes('family with seniors')) r = `${first}${ask('safety', '')} ` + r.replace(first, '');
          if (traits.includes('skeptical')) r += ' ' + ask('proof', '');
          if (traits.includes('wants it all handled')) r += ' ' + (hi ? 'Pickup se drop tak sab hum handle karte hain.' : 'Everything from pickup to drop is handled by us.');
          if (traits.includes('terse') && r.length > 260) r = r.split(/(?<=[.!?])\s/).slice(0, 3).join(' '); if (req.budget && req.budget < t.price * 0.9) r += ' ' + (hi ? `Aapka budget ${money(req.budget)} hai; ${money(t.price)} mein sab included hai, alag se kuch nahi lagega.` : `Your budget is ${money(req.budget)}; ${money(t.price)} is all-inclusive, nothing extra on the trip.`); return r; }
        if (req.destination) { const d = req.destination; const days = req.days || d.idealDays || 4; const per = Math.round((d.costPerDay || 3000) * days / 500) * 500; const season = req.month ? DEST.seasonStatus(d, req.month) : null; const seasonLine = season === 'off season' ? (hi ? ` Dhyaan rahe: ${DEST.MONTHS[req.month - 1]} mein ${d.name} off-season hai; best mahine ${d.season.map(m => DEST.MONTHS[m - 1]).join(', ')}.` : ` Note: ${d.name} is off-season in ${DEST.MONTHS[req.month - 1]}; best months are ${d.season.map(m => DEST.MONTHS[m - 1]).join(', ')}.`) : ''; const seniorNote = /\b(parents|seniors?|elderly|cannot walk|can'?t walk|knee|6\d|7\d)\b/i.test(latinise(text)) ? ' ' + (hi ? `Seniors ke liye: ${d.seniors || 'relaxed pace'}; hum walking kam, ground-floor room aur private cab rakhte hain.` : `For seniors: ${d.seniors || 'relaxed pace'}; we keep walking minimal, ground-floor rooms and a private cab.`) : ''; said.price = true; return `${first}${hi ? `${d.name} ka fixed batch abhi nahi hai, par custom plan ban sakta hai: ${days} din, andaaza ${money(per)} per person all-inclusive${n > 1 ? ` (${n} log: ${money(per * n)})` : ''}, final price 1 ghante mein.` : `We do not have a fixed batch for ${d.name} right now, but we can run it custom: ${days} days, estimated ${money(per)} per person all-inclusive${n > 1 ? ` (${money(per * n)} for ${n})` : ''}, exact price within the hour.`}${seasonLine}${seniorNote} ${this.nextBatches(hi, 'Ya fir fixed batches', 'Or our fixed batches')} ${hi ? 'Dates batao to plan bhejta hoon.' : 'Send me your dates and I will send the plan.'}`.replace(/\s+/g, ' '); }
        if (draft && stage && !['enquiry', 'qualified'].includes(stage)) return draft;
        return `${first}${hi ? 'Kaunsa trip aur kaunsi dates dekh rahe ho, aur kitne log?' : 'Which trip and dates are you looking at, and how many of you?'} ${this.nextBatches(hi)}`.trim();
      }
    }
  }
  /** A second phrasing when the same reply would repeat. */
  vary(reply, hi, intent, lead) {
    const tail = hi ? ['Jaise maine bataya: ', 'Dobara se: ', 'Short mein: '] : ['As I mentioned: ', 'Once more: ', 'In short: '];
    const pickT = tail[(lead.touches || 0) % tail.length];
    const short = reply.length > 160 && !/^(book|escalate)$/.test(intent) ? reply.split(/(?<=[.!?])\s/).slice(0, 2).join(' ') : reply;
    return pickT + short.charAt(0).toLowerCase() + short.slice(1);
  }
  nextBatches(hi, hiLabel = 'Next batches', enLabel = 'Next batches') { const next = this.upcoming(3).map(x => `${x.name}${x.date ? ' ' + fmtDate(x.date) : ''}${x.price ? ' ' + money(x.price) : ''}`).join(', '); return next ? `${hi ? hiLabel : enLabel}: ${next}.` : ''; }
  matchTrip(dest) { const t = this.profile.trips.find(x => slug(x.name).includes(slug(dest))); return t ? t.name : ''; }
  isOpen() { const h = new Date().getUTCHours() + 5.5; const hr = ((h % 24) + 24) % 24; return hr >= 9 && hr < 21; }
  updateLead(id, patch) { const l = this.state.leads.find(x => x.id === id); if (!l) return null; if ((patch.stage && ['advance', 'balance', 'travelled'].includes(patch.stage)) || +patch.value > 0) this.confirmHold(id); if (patch.stage === 'lost') for (const t of this.profile.trips) t.holds = (t.holds || []).filter(h => h.lead !== id); for (const k of ['name', 'phone', 'trip', 'stage', 'value', 'notes', 'source']) if (patch[k] != null) l[k] = k === 'value' ? +patch[k] : String(patch[k]); if (patch.next) l.next = new Date(patch.next).getTime(); if (patch.done) { l.touches = Math.max(l.touches, 1) + 1; l.next = snapToHours(Date.now() + SEQUENCE[Math.min(SEQUENCE.length - 1, l.touches - 1)].day * DAY); } l.updated = Date.now(); this.save(); return l; }
  addLead(row) { const id = String(row.id || row.phone || slug(row.name) + '-' + Date.now().toString(36)); const l = this.lead(id, row.name); return this.updateLead(id, row) || l; }
  /** Today's work: every lead whose follow-up is due, with the message to send, drafted by sequence step and stage. */
  async today() {
    const now = Date.now(); const due = this.state.leads.filter(l => !['lost', 'reviewed'].includes(l.stage) && l.next <= now).sort((a, b) => a.next - b.next);
    const out = [];
    for (const l of due.slice(0, 30)) out.push({ lead: l, step: SEQUENCE[Math.min(SEQUENCE.length - 1, l.touches)], message: this.followUp(l) });
    this.releaseHolds();
    const holdAlerts = [].concat(...this.upcoming(5).map(t => (t.holds || []).map(h => `${t.name}: ${h.n} seat${h.n > 1 ? 's' : ''} on hold for ${(this.state.leads.find(l => l.id === h.lead) || {}).name || h.lead}, expires ${new Date(h.until).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}. Mark the lead "advance" once paid.`)));
    const seatAlerts = this.upcoming(5).filter(t => t.seats && t.seats - t.booked <= 3 && t.seats - t.booked > 0).map(t => `${t.name} on ${t.date}: only ${t.seats - t.booked} seat${t.seats - t.booked === 1 ? '' : 's'} left, post it today.`);
    const stale = this.upcoming(5).filter(t => t.date && (new Date(t.date) - now) < 10 * DAY && t.seats && t.booked / t.seats < 0.5).map(t => `${t.name} departs in ${Math.ceil((new Date(t.date) - now) / DAY)} days at ${Math.round(100 * t.booked / t.seats)}% full: decide today, push hard or merge with the next batch.`);
    return { date: new Date().toISOString().slice(0, 10), due: out, alerts: [...holdAlerts, ...seatAlerts, ...stale], counts: this.counts() };
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
  /** The 9am message to your own phone: what to do today, in one screen. */
  async digest() {
    const t = await this.today(); const P = this.profile; const lines = [`${P.name} · ${new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}`];
    for (const a of t.alerts) lines.push('! ' + a);
    lines.push(`${t.due.length} follow-up${t.due.length === 1 ? '' : 's'} due:`);
    for (const d of t.due.slice(0, 8)) lines.push(`• ${d.lead.name || d.lead.id} (${d.lead.trip || 'no trip'}, ${d.lead.stage}) → ${d.step.name}`);
    if (t.due.length > 8) lines.push(`• …and ${t.due.length - 8} more in the Grow tab`);
    const c = t.counts; lines.push(`Pipeline: ${Object.entries(c).map(([k, v]) => `${v} ${k}`).join(', ') || 'empty'}.`);
    for (const x of this.upcoming(3)) lines.push(`${x.name} ${x.date ? fmtDate(x.date) : ''}: ${x.booked || 0}/${x.seats || '?'} booked, ${this.seatsLeft(x)} left.`);
    const camp = this.campaigns().find(x => x.status === 'run now'); if (camp) lines.push(`Campaign to run: ${camp.name} (${camp.pitch}).`);
    lines.push('Post one reel today. Reply to every message within 2 minutes.');
    return { text: lines.join('\n'), due: t.due.length, alerts: t.alerts.length };
  }
  /** Everything the Grow tab needs in one call. */
  async overview() { return { profile: this.profile, upcoming: this.upcoming(), gbp: this.gbpAudit(), campaigns: this.campaigns(), counts: this.counts(), roi: this.roi(), waLink: this.waLink('Hi, I want to know about your upcoming trips'), settings: this.state.settings, mentor: this.brain.mentor.status() }; }
}

module.exports = { Growth, CALENDAR, SEQUENCE, STAGES, latinise, scriptOf, snapToHours };
