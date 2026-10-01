'use strict';
/**
 * journeys.js — humans, not templates. A simulator of real travel buyers and their end-to-end journey.
 *
 * Each person has latent traits (urgency, price sensitivity, trust need, how many people decide, channel
 * habits, writing style) sampled around their traveler type and region. They write the way people really
 * write: Hinglish, lowercase, typos, emoji, voice-note bursts, formal emails. A journey walks the funnel
 *   enquiry → qualified → quoted → objection → negotiation → advance paid → balance paid → travelled → reviewed → referred
 * and at every step the clan chooses an action; the person's response depends on their traits and the
 * action's fit. The simulator holds the ground truth; ATLAS never sees it, only the transcripts and outcomes.
 */
const { COHORTS, TYPES, REGIONS, get } = require('./cohorts');

let seed = 11;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;
const jitter = (v, w = 0.2) => Math.max(0, Math.min(1, v + (rnd() - 0.5) * 2 * w));
function setSeed(s) { seed = s; }

const DEST = { domestic: ['Ladakh', 'Spiti', 'Goa', 'Manali', 'Kasol', 'Meghalaya', 'Kerala', 'Rajasthan', 'Andaman', 'Rishikesh', 'Sikkim', 'Kashmir', 'Coorg', 'Varkala'], international: ['Bali', 'Vietnam', 'Thailand', 'Dubai', 'Bhutan', 'Sri Lanka', 'Georgia', 'Singapore', 'Maldives', 'Nepal'] };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const NAMES = {
  india: ['Riya Shah', 'Aman Verma', 'Priya Nair', 'Rahul Mehta', 'Sneha Patel', 'Karan Singh', 'Neha Joshi', 'Vikram Rao', 'Pooja Desai', 'Arjun Iyer', 'Divya Reddy', 'Rohan Kulkarni', 'Ananya Sen', 'Siddharth Jain', 'Kavya Menon', 'Nikhil Agarwal', 'Meera Pillai', 'Harsh Trivedi', 'Ishita Bose', 'Dev Chauhan', 'Mehul Parikh', 'Jay Thakkar', 'Krupa Modi', 'Dhruv Bhatt', 'Tanvi Gandhi', 'Fatima Shaikh', 'Imran Khan', 'Simran Kaur', 'Gurpreet Gill', 'Zoya Ansari'],
  west: ['Lena Fischer', 'Tom Walker', 'Sophie Martin', 'Lucas Moreau', 'Emma Clarke', 'Noah Becker', 'Julia Rossi', 'Felix Weber', 'Mia Johansson', 'Jonas Schmidt', 'Chloé Dubois', 'Mateo García', 'Inês Costa', 'Ben Taylor', 'Hanna Novak', 'Ravi Patel', 'Anjali Desai', 'Nikhil Shah'],
  gulf: ['Fatima Al Zaabi', 'Omar Haddad', 'Aisha Rahman', 'Yusuf Siddiqui', 'Sara Qureshi', 'Zayd Malik', 'Hiba Nasser', 'Imran Chaudhry', 'Deepak Menon', 'Sunita Pillai'],
  apac: ['Wei Lin', 'Hana Sato', 'Ji-woo Park', 'Aroon Chai', 'Nadia Rahman', 'Olivia Nguyen', 'Liam Chen', 'Mei Tan', 'Arjun Krishnan', 'Grace Lim'],
  africa: ['Amara Okafor', 'Kwame Mensah', 'Zanele Dlamini', 'Youssef Mansour', 'Thandiwe Moyo', 'Chidi Eze', 'Naledi Khumalo', 'Omar Farouk'],
  latam: ['Valentina Rojas', 'Mateus Silva', 'Camila Torres', 'Diego Fernández', 'Luisa Ramírez', 'Thiago Souza', 'Isabela Costa', 'Andrés Castro'],
};
const POOL = { 'in-west': 'india', 'in-north': 'india', 'in-south': 'india', 'in-east': 'india', gulf: 'gulf', 'uk-eu': 'west', na: 'west', apac: 'apac', africa: 'africa', latam: 'latam', 'east-asia': 'apac' };

// --- how people actually write ---------------------------------------------------------------
const OPEN = {
  india: ['hi', 'Hi', 'Hello', 'hello ji', 'Hey', 'Hii', 'Namaste', 'hi there', 'Good evening', 'Hlo'],
  west: ['Hi', 'Hello', 'Hey there', 'Hi!', 'Good morning', 'Hello,'],
  gulf: ['Hi', 'Hello', 'Salam', 'Hi, hope you are well.', 'Good evening'],
  apac: ['Hi', 'Hello', 'Hi there', 'Good day', 'Hello,'],
  africa: ['Hi', 'Hello', 'Good day', 'Hi there'],
  latam: ['Hi', 'Hello!', 'Hey', 'Hi there!'],
};
const SEEDS = {
  friends: ['{o} we are {n} friends planning {d} in {m}, budget around {b} per head. what packages do you have', '{o} {n} of us want to do {d} on the {m} long weekend. need something fun, not too hectic. price?', '{o} saw your ad. {d} for {n} people, {m}. itinerary and cost pls', '{o} bachelor trip for my friend, {n} guys, {d}, {m}. want good stay and parties', '{o} planning a reunion trip, {n} batchmates, {d} in {m}. Can you share options?', '{o} {d} {m} {n} pax budget {b} pp. details?'],
  family: ['{o} we are a family of {n} with 2 kids (6 and 10), looking at {d} in {m}. Need safe comfortable hotels and veg food. What is the all inclusive price', '{o} planning {d} for my parents and kids, {n} people, {m}. is it safe for elderly? please share full details with inclusions', '{o} family trip {d} {m}, {n} people, jain food needed. no hidden charges please', '{o} My wife and kids want to see {d}. {n} of us, {m}. Private cab preferred. Budget around {b} per person', '{o} we want a relaxed {d} holiday, {n} family members, {m}. kindly share packages with hotel names'],
  couple: ['{o} we are getting married in {m} and want a honeymoon in {d}. private villa, candlelight dinner. budget {b} total', '{o} anniversary trip for 2 to {d} in {m}. something romantic, no group', '{o} me and my husband, {d}, {m}. 5-6 days. cost?', '{o} just married :) looking at {d} for {m}, can you arrange couple photoshoot?', '{o} couple trip {d} {m}, want private stay not group. share itinerary'],
  solo: ['{o} I am a solo female traveler planning {d} in {m}. is the group safe? any women only batches? budget {b}', '{o} first solo trip. {d}, {m}. Do you have a female trip leader and single room option?', '{o} travelling alone, {d} in {m}. can i talk to past travelers before booking?', '{o} solo, {d}, {m}. small batch preferred. how many people usually come?', '{o} planning {d} alone in {m}, want to meet like minded people. details pls'],
  senior: ['{o} we are retired, {n} of us, want to see {d} in {m}. easy pace, minimal walking, doctor on call? Budget {b} per person', '{o} my parents aged 65 and 68 want {d} in {m}. ground floor rooms, no long drives please', '{o} senior group of {n}, {d}, {m}. temple visits and relaxed pace. can you call me', '{o} {d} for elderly parents, {m}. knee issues, need comfortable transport'],
  corporate: ['{o} we need a quote for a team offsite in {d} for {n} employees in {m}, 2 nights, team building activities and GST invoice', 'Hello, I am from the HR team. Corporate outing to {d}, {n} people, {m}. Please send an itemised quotation and transport from our office.', '{o} company offsite {d} {m}, {n} pax, budget approx {b} per head. need vendor documents for onboarding', '{o} looking for an offsite venue near {d} for {n} people, {m}. conference room needed.'],
  adventure: ['{o} looking for a moderate to difficult trek near {d} in {m}, {n} people. summit altitude, gear list, guide certifications?', '{o} {d} bike trip in {m}, {n} riders, want the high passes. small batch? budget {b}', '{o} rafting + camping in {d}, {n} of us, {m}. safety record and difficulty grade pls', '{o} {d} trek {m}, done 3 treks before, want something tougher. {n} people'],
  luxury: ['{o} looking for a bespoke {d} trip for {n} in {m}, five star stays, private guide, fine dining. budget {b} per person', '{o} premium {d} itinerary, {m}, suites and business class. please curate', '{o} luxury {d} for {n}, private transfers, {m}. named hotels please', '{o} we want a curated {d} experience in {m}, no fixed group, best properties'],
  nomad: ['{o} I work remotely and want a month-long stay near {d} starting {m}. reliable wifi and a coworking space are must haves. monthly rate? budget {b}', '{o} workation in {d} for 3 weeks, quiet room with good wifi, weekend excursions. {n} of us', '{o} digital nomad, long stay in {d} from {m}. wifi speed? community events?'],
  student: ['{o} we are {n} college students, {d} in {m} after exams. cheapest package? budget {b} max per head', '{o} group of {n} from college, {d} trip, bonfire and music, hostel is fine. group discount?', '{o} students here, {n} of us, {d} {m}. can we pay in two parts?', '{o} semester break trip {d}, {n} people, budget tight around {b}. options?'],
};
const HINGLISH = [['what is the', 'kya hai'], ['please', 'pls'], ['please', 'plz'], ['how much', 'kitna'], ['want', 'chahiye'], ['is it', 'kya ye'], ['tell me', 'batao'], ['share', 'bhejo'], ['budget', 'budget'], ['good', 'accha'], ['can you', 'kar sakte ho'], ['details', 'details bhejo']];
const TYPOS = [['the', 'teh'], ['package', 'pakage'], ['itinerary', 'itenary'], ['itinerary', 'itinery'], ['budget', 'bugdet'], ['people', 'ppl'], ['please', 'plese'], ['accommodation', 'accomodation'], ['and', 'nd'], ['you', 'u'], ['are', 'r'], ['for', '4']];
const EMOJI = ['🙏', '😊', '✨', '🏔️', '🌴', '❤️', '🙂', '👍', '😄', '🧳'];

function fmtMoney(v, currency) { if (currency === 'INR') return v >= 100000 ? `${(v / 100000).toFixed(1).replace(/\.0$/, '')} lakh` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v); if (currency === 'AED') return `AED ${Math.round(v / 20)}`; return `$${Math.round(v / 80)}`; }

/** Style a message the way this person writes. */
function stylize(text, person) {
  let t = text;
  const st = person.style;
  if (st.hinglish && person.pool === 'india') for (const [a, b] of HINGLISH) if (chance(0.35)) t = t.replace(new RegExp('\\b' + a + '\\b', 'i'), b);
  if (st.lowercase) t = t.toLowerCase();
  if (st.typos) for (const [a, b] of TYPOS) if (chance(0.25)) t = t.replace(new RegExp('\\b' + a + '\\b'), b);
  if (st.noPunct) t = t.replace(/[.,]/g, '');
  if (st.emoji) t = t + ' ' + pick(EMOJI);
  if (st.bursts && t.length > 60 && chance(0.5)) { const i = t.indexOf(' ', Math.floor(t.length / 2)); if (i > 0) t = t.slice(0, i) + '\n' + t.slice(i + 1); }
  if (st.formal) t = t.replace(/^(hi|hey|hlo|hii)\b/i, 'Dear Travelers Clan team,').replace(/\bpls\b|\bplz\b/g, 'please') + (/[.!?]$/.test(t) ? '' : '.') + ' Regards, ' + person.name.split(' ')[0];
  return t.replace(/\s+\n/g, '\n').trim();
}

/** A person: sampled from a cohort with latent traits that drive the journey. */
function person(cohort) {
  const c = typeof cohort === 'string' ? get(cohort) : cohort;
  const type = c.type || c.id, regionId = c.region || (c.id.includes('nri') ? 'na' : c.id.includes('gulf') ? 'gulf' : c.id.includes('european') ? 'uk-eu' : 'in-west');
  const pool = POOL[regionId] || 'india';
  const t = c.personality;
  const traits = {
    urgency: jitter(type === 'friends' || type === 'adventure' ? 0.7 : type === 'corporate' || type === 'senior' ? 0.35 : 0.5, 0.3),
    priceSensitivity: jitter(type === 'student' ? 0.9 : type === 'luxury' ? 0.15 : type === 'friends' ? 0.65 : 0.5, 0.25),
    trustNeed: jitter(type === 'family' || type === 'senior' || type === 'solo' ? 0.8 : type === 'luxury' ? 0.7 : 0.45, 0.2),
    deciders: type === 'corporate' ? 3 : type === 'student' || type === 'friends' ? 2 + Math.floor(rnd() * 3) : type === 'family' ? 2 : 1,
    responsiveness: jitter(0.4 + t.extraversion * 0.4, 0.2),
    patience: jitter(0.3 + t.conscientiousness * 0.5, 0.2),
  };
  const currency = c.currency || 'INR';
  const budgetPP = Math.round((c.budget[0] + rnd() * (c.budget[1] - c.budget[0])) / 500) * 500;
  const groupSize = c.groupSize[0] + Math.floor(rnd() * (c.groupSize[1] - c.groupSize[0] + 1));
  const intl = currency !== 'INR' ? chance(0.35) : (type === 'luxury' || type === 'couple' ? chance(0.6) : chance(0.3));
  const destination = pick(intl ? DEST.international : DEST.domestic);
  const month = c.months ? pick(c.months) : pick(MONTHS);
  const style = { hinglish: pool === 'india' && chance(0.45), lowercase: chance(type === 'corporate' || type === 'luxury' ? 0.1 : 0.5), typos: chance(0.35), noPunct: chance(0.3), emoji: chance(type === 'student' || type === 'friends' || type === 'couple' ? 0.5 : 0.15), bursts: chance(0.4), formal: type === 'corporate' || (type === 'luxury' && chance(0.5)) || (pool === 'west' && chance(0.4)) };
  const name = pick(NAMES[pool]);
  const p = { name, cohort: c.id, type, region: regionId, pool, traits, style, currency, requirements: { destination, month, groupSize, budgetPerPerson: budgetPP, days: c.tripDays[0] + Math.floor(rnd() * (c.tripDays[1] - c.tripDays[0] + 1)), needs: c.needs, channel: c.channel }, personality: c.personality };
  p.opener = stylize(pick(SEEDS[type] || SEEDS.friends).replace('{o}', pick(OPEN[pool] || OPEN.india)).replace(/{n}/g, groupSize).replace(/{b}/g, fmtMoney(budgetPP, currency)).replace(/{d}/g, destination).replace(/{m}/g, month), p);
  return p;
}

// --- the funnel --------------------------------------------------------------------------------
const STAGES = ['enquiry', 'qualified', 'quoted', 'objection', 'negotiation', 'advance', 'balance', 'travelled', 'reviewed', 'referred'];
const ACTIONS = {
  enquiry: ['reply_fast_qualify', 'reply_fast_price', 'reply_slow_qualify', 'reply_slow_price', 'ignore'],
  qualified: ['send_itinerary_pdf', 'send_price_only', 'call', 'send_social_proof_then_price'],
  quoted: ['wait', 'follow_up_24h', 'follow_up_3d', 'offer_date_flex', 'offer_discount'],
  objection: ['answer_with_proof', 'answer_briefly', 'ignore', 'discount', 'call'],
  negotiation: ['hold_price_add_value', 'small_discount', 'big_discount', 'split_payment', 'walk_away'],
  advance: ['send_payment_link_now', 'send_payment_link_later', 'ask_bank_transfer'],
  balance: ['remind_7d_before', 'remind_1d_before', 'no_reminder'],
  travelled: ['trip_group_and_packing_list', 'minimal_comms'],
  reviewed: ['ask_review_2d', 'ask_review_2w', 'no_ask'],
  referred: ['referral_reward', 'no_referral_ask'],
};
const OBJECTIONS = {
  friends: ['price per head is high', 'dates clash with office', 'everyone is not free'], family: ['is it safe for kids', 'what about veg food', 'any hidden costs', 'hotel quality'], couple: ['is it private or group', 'photos of the villa', 'can we change dates'], solo: ['is it safe for a woman alone', 'who else is coming', 'single room option'],
  senior: ['too much walking', 'altitude and health', 'long drives'], corporate: ['need approval from management', 'GST invoice and vendor docs', 'liability and insurance'], adventure: ['difficulty level', 'guide certification', 'gear included'], luxury: ['hotel names', 'is it truly private', 'transfers'], nomad: ['wifi speed', 'monthly rate', 'noise'], student: ['too expensive', 'can we pay later', 'parents permission'],
};

/** Simulate one journey. The truth lives here; the transcript is what ATLAS learns from. */
function journey(p, policy = null) {
  const T = p.traits; const steps = []; const log = [];
  const say = (who, text, minutesLater = 0) => log.push({ who, text, minutesLater });
  const act = (stage, options) => policy ? policy(stage, p, options) : pick(options);
  say('lead', p.opener);
  let stage = 'enquiry', alive = true, priceVsBudget = 1, discount = 0, trustBuilt = 0, outcome = null, lostAt = null, lostWhy = null;
  const fail = (why) => { alive = false; lostAt = stage; lostWhy = why; };

  // enquiry
  let a = act('enquiry', ACTIONS.enquiry); steps.push({ stage, action: a });
  if (a === 'ignore') { fail('no reply'); }
  else {
    const fast = a.startsWith('reply_fast'); const mins = fast ? 2 + Math.floor(rnd() * 9) : 60 + Math.floor(rnd() * 1500);
    const qualify = a.endsWith('qualify');
    say('clan', qualify ? `Hi ${p.name.split(' ')[0]}! Thanks for reaching out. To plan this right: which dates, how many of you, and a rough budget per person?` : `Hi ${p.name.split(' ')[0]}! ${p.requirements.destination} packages start at ${fmtMoney(p.requirements.budgetPerPerson * 1.1, p.currency)} per person.`, mins);
    const stay = fast ? 0.92 : 0.55 + T.patience * 0.3;
    if (!chance(stay)) fail(fast ? 'went quiet' : 'slow first reply');
    else { trustBuilt += qualify ? 0.15 : 0.05; say('lead', stylize(`${p.requirements.month}, ${p.requirements.groupSize} of us, budget ${fmtMoney(p.requirements.budgetPerPerson, p.currency)} per person`, p), 10 + Math.floor(rnd() * 600)); stage = 'qualified'; }
  }
  // qualified
  if (alive) {
    a = act('qualified', ACTIONS.qualified); steps.push({ stage, action: a });
    priceVsBudget = +(0.85 + rnd() * 0.45).toFixed(2);
    const price = Math.round(p.requirements.budgetPerPerson * priceVsBudget / 100) * 100;
    if (a === 'send_itinerary_pdf') { say('clan', `Here is a day-by-day plan (PDF). ${price} per person all inclusive: stay, transport, meals, activities.`); trustBuilt += 0.2; }
    else if (a === 'send_social_proof_then_price') { say('clan', `Photos and reviews from last month's ${p.requirements.destination} group attached. Plan: ${price} per person all inclusive.`); trustBuilt += 0.3; }
    else if (a === 'call') { say('clan', 'Can I call you for 5 minutes to understand what matters most?'); trustBuilt += T.trustNeed > 0.6 ? 0.35 : 0.1; if (p.type === 'corporate' || p.type === 'senior' || p.type === 'family') trustBuilt += 0.1; }
    else { say('clan', `${price} per person.`); trustBuilt += 0; }
    stage = 'quoted';
    const objects = chance(0.75 - trustBuilt * 0.4 + T.priceSensitivity * 0.2);
    if (objects) { stage = 'objection'; const ob = pick(OBJECTIONS[p.type] || OBJECTIONS.friends); say('lead', stylize(`hmm ${ob}?`, p), 30 + Math.floor(rnd() * 1400)); p._objection = ob; }
    else if (!chance(0.5 + T.urgency * 0.4)) { stage = 'quoted'; }
  }
  // quoted (silence) handling
  if (alive && stage === 'quoted') {
    a = act('quoted', ACTIONS.quoted); steps.push({ stage, action: a });
    if (a === 'wait') { if (!chance(0.25 + T.urgency * 0.4)) fail('ghosted after quote'); }
    else if (a === 'follow_up_24h') { say('clan', 'Just checking if you had a chance to look at the plan. Happy to adjust anything.', 1440); if (!chance(0.55 + T.responsiveness * 0.3)) fail('ghosted after follow-up'); }
    else if (a === 'follow_up_3d') { say('clan', 'Seats are filling for these dates, shall I hold a few for you?', 4320); if (!chance(0.45 + T.responsiveness * 0.3)) fail('ghosted after late follow-up'); }
    else if (a === 'offer_date_flex') { say('clan', 'If these dates are tight, we also have a departure the following week.', 1440); if (!chance(0.5 + T.responsiveness * 0.3)) fail('ghosted'); }
    else { discount = 0.07; say('clan', 'For this week only I can do 7% off if you confirm by Friday.', 1440); if (!chance(0.5 + T.priceSensitivity * 0.35)) fail('ghosted'); }
    if (alive) stage = 'negotiation';
  }
  // objection
  if (alive && stage === 'objection') {
    a = act('objection', ACTIONS.objection); steps.push({ stage, action: a });
    const proofFit = { answer_with_proof: 0.85, answer_briefly: 0.55, call: T.trustNeed > 0.6 ? 0.85 : 0.6, discount: p._objection && /expensive|price|high|pay/i.test(p._objection) ? 0.75 : 0.45, ignore: 0.1 }[a];
    say('clan', a === 'ignore' ? 'Let me know if you want to book.' : a === 'call' ? 'Let me call you and walk you through it.' : a === 'discount' ? 'I can take 5% off to make it work.' : a === 'answer_with_proof' ? `Good question. ${p._objection}: here is exactly how we handle it, with photos and a past traveler you can speak to.` : 'Yes, that is covered.', 20 + Math.floor(rnd() * 500));
    if (a === 'discount') discount = 0.05;
    if (!chance(proofFit * (0.7 + trustBuilt * 0.5))) fail(a === 'ignore' ? 'objection ignored' : 'objection not resolved');
    else { trustBuilt += a === 'answer_with_proof' ? 0.2 : 0.1; stage = 'negotiation'; }
  }
  // negotiation
  if (alive && stage === 'negotiation') {
    a = act('negotiation', ACTIONS.negotiation); steps.push({ stage, action: a });
    const asksDiscount = chance(T.priceSensitivity);
    if (asksDiscount) say('lead', stylize('any discount possible? we are many', p), 60);
    const effPrice = priceVsBudget * (1 - discount - (a === 'small_discount' ? 0.05 : a === 'big_discount' ? 0.12 : 0));
    if (a === 'walk_away') fail('we walked away');
    else {
      say('clan', a === 'hold_price_add_value' ? 'The price stays, but I will add a bonfire night and airport pickup at no cost.' : a === 'small_discount' ? 'I can do 5% off for a group this size.' : a === 'big_discount' ? '12% off if you confirm today.' : 'You can pay 30% now and the rest two weeks before departure.', 30);
      const deciderDrag = Math.pow(0.85, T.deciders - 1);
      let pBook = (effPrice <= 1 ? 0.75 : effPrice <= 1.15 ? 0.5 : 0.25) + trustBuilt * 0.3 + (a === 'split_payment' && T.priceSensitivity > 0.6 ? 0.15 : 0) + (a === 'hold_price_add_value' && T.priceSensitivity < 0.5 ? 0.1 : 0);
      pBook *= deciderDrag;
      if (!chance(Math.min(0.95, pBook))) fail(effPrice > 1.15 ? 'price over budget' : T.deciders > 1 ? 'group could not decide' : 'chose another operator');
      else stage = 'advance';
    }
  }
  // advance
  if (alive && stage === 'advance') {
    a = act('advance', ACTIONS.advance); steps.push({ stage, action: a });
    say('lead', stylize('ok lets do it. how do we pay', p), 120);
    say('clan', a === 'send_payment_link_now' ? 'Payment link for the advance: [link]. Seats are held for 24 hours.' : a === 'send_payment_link_later' ? 'I will send the payment link tomorrow morning.' : 'Please transfer the advance to this bank account: ...', a === 'send_payment_link_later' ? 900 : 5);
    const pPay = { send_payment_link_now: 0.9, send_payment_link_later: 0.6, ask_bank_transfer: p.currency === 'INR' ? 0.75 : 0.4 }[a];
    if (!chance(pPay)) fail('advance never paid'); else { say('lead', 'done, paid ✅', 60); outcome = 'booked'; stage = 'balance'; }
  }
  // post-booking
  let balancePaid = false, travelled = false, reviewed = false, referred = false, cancelled = false;
  if (alive && stage === 'balance') {
    a = act('balance', ACTIONS.balance); steps.push({ stage, action: a });
    balancePaid = chance({ remind_7d_before: 0.95, remind_1d_before: 0.85, no_reminder: 0.7 }[a]);
    if (!balancePaid) { cancelled = true; say('lead', stylize('sorry we have to cancel, something came up', p), 20000); }
    else { stage = 'travelled'; a = act('travelled', ACTIONS.travelled); steps.push({ stage, action: a }); travelled = true; const happy = chance(a === 'trip_group_and_packing_list' ? 0.9 : 0.75); p._happy = happy;
      stage = 'reviewed'; a = act('reviewed', ACTIONS.reviewed); steps.push({ stage, action: a }); reviewed = happy && chance({ ask_review_2d: 0.7, ask_review_2w: 0.4, no_ask: 0.1 }[a]);
      if (reviewed) say('lead', stylize('loved it! best trip in years, thank you team', p), 2880);
      stage = 'referred'; a = act('referred', ACTIONS.referred); steps.push({ stage, action: a }); referred = happy && chance(a === 'referral_reward' ? 0.35 : 0.12);
      if (referred) say('lead', stylize('my cousin wants to go too, can you share the plan with her', p), 20000); }
  }
  const revenue = outcome === 'booked' && balancePaid ? Math.round(p.requirements.budgetPerPerson * priceVsBudget * (1 - discount) * p.requirements.groupSize) : outcome === 'booked' ? Math.round(p.requirements.budgetPerPerson * priceVsBudget * 0.3 * p.requirements.groupSize) : 0;
  return { person: { name: p.name, cohort: p.cohort, type: p.type, region: p.region, requirements: p.requirements, traits: p.traits, style: p.style }, steps, log, outcome: outcome || 'lost', lostAt, lostWhy, priceVsBudget, discount, trustBuilt: +trustBuilt.toFixed(2), balancePaid, travelled, reviewed, referred, cancelled, revenue, currency: p.currency };
}

module.exports = { person, journey, stylize, STAGES, ACTIONS, OBJECTIONS, setSeed, rnd, pick };
