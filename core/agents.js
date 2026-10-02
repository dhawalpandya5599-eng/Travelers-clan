'use strict';
/**
 * agents.js — the clan's departments. Each agent is a specialist with one duty and a strict output:
 *   { agent, verdict: 'ok'|'warn'|'block', findings: [...], suggestions: [...], output: {...}, lessons: [...] }
 * `lessons` are declarative sentences the brain learns after every run, so every agent trains OYE constantly.
 * Agents reason with data and rules first; when a mentor (Claude or a local Ollama model) is present they
 * add free-form judgement through `ctx.mentor`.
 */
const T = require('./text');
const L = require('./learning');
const cohorts = require('./cohorts');
const { detectStage } = require('./funnel');
const DEST = require('./destinations');

const MONTH_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;
function parseRequirements(text) {
  const t = String(text);
  const dest = DEST.find(t);
  const month = DEST.monthNum((t.match(MONTH_RE) || [])[1]);
  const group = +(t.match(/\b(\d{1,3})\s*(?:people|pax|persons|of us|friends|members|employees|adults|students|seniors|riders)\b/i) || [])[1] || (/\b(couple|honeymoon|my wife and i|me and my husband|two of us|2 of us|my parents)\b/i.test(t) ? 2 : /\b(solo|alone|by myself)\b/i.test(t) ? 1 : null);
  // Budget: scan every amount; prefer ones with a budget/price context or a k/lakh suffix; ignore ages and small numbers.
  let budget = null;
  for (const m of t.matchAll(/(budget|around|approx|about|max|upto|up to|rs\.?|₹|inr)?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|lakh|lac|thousand)?\s*(per\s*(?:person|head|pp|pax)|pp|each|total)?/gi)) {
    let v = +m[2].replace(/,/g, ''); const u = (m[3] || '').toLowerCase(); if (u === 'k' || u === 'thousand') v *= 1000; if (u === 'lakh' || u === 'lac') v *= 100000;
    const contextual = m[1] || m[3] || m[4];
    if (v >= 2000 && (contextual || v >= 5000)) { budget = v; if (contextual) break; }
  }
  const days = +(t.match(/\b(\d{1,2})\s*(?:days?|nights?|d\b|n\b)/i) || [])[1] || null;
  const needs = [];
  for (const [re, need] of [[/\b(kids?|children|child)\b/i, 'kids'], [/\b(parents|elderly|senior|retired|aged|knee)\b/i, 'seniors'], [/\b(veg|jain|halal|vegetarian)\b/i, 'dietary'], [/\b(safe|safety)\b/i, 'safety'], [/\b(private|no group|not group)\b/i, 'privacy'], [/\b(wifi|coworking|remote)\b/i, 'wifi'], [/\b(gst|invoice|quote|quotation)\b/i, 'invoice'], [/\b(trek|summit|rafting|paraglid|bike)\b/i, 'adventure'], [/\b(romantic|honeymoon|anniversary|candlelight)\b/i, 'romance'], [/\b(luxury|five star|5 star|premium|suite)\b/i, 'luxury'], [/\b(cheap|cheapest|budget tight|discount|low budget)\b/i, 'price'], [/\b(doctor|medical|walking|wheelchair|ground floor)\b/i, 'medical'], [/\b(photo|photoshoot|reels|insta)\b/i, 'photos'], [/\b(nightlife|party|parties|bonfire|music)\b/i, 'fun']]) if (re.test(t)) needs.push(need);
  return { destination: dest, month, group, budget, days, needs, raw: t };
}

/** Compose the clan's next message from the stage, the chosen action, the last customer message and what the mind knows. */
function composeReply({ stage, action, lastLead, cohort, name, memory, req }) {
  const hi = name ? `Hi ${name}!` : 'Hi!';
  const first = (name || '').split(' ')[0];
  const tone = cohort ? cohort.tone : '';
  const warm = /patient|reassuring|respectful|warm/.test(tone) ? 'I completely understand, ' : /formal|polished|professional/.test(tone) ? 'Thank you for raising this. ' : 'Good question! ';
  // Objection: find the playbook answer ("The X objection should be answered with Y") that overlaps the customer's words.
  const objAnswer = () => {
    const words = new Set(T.tokens(lastLead || ''));
    const rules = memory.facts.filter(f => /objection$/.test(f.s) && f.p === 'should' && f.wrong < 2).map(f => ({ f, hit: T.tokens(f.s.replace(/ objection$/, '')).filter(t => words.has(t)).length })).filter(r => r.hit > 0).sort((a, b) => b.hit - a.hit);
    const generic = { safe: 'every departure has a trained trip leader, a doctor on call and verified reviews from past travelers you can speak to', price: 'the price includes stay, transport, meals and activities, and you can pay 30% now and the rest two weeks before departure', expensive: 'the price includes stay, transport, meals and activities, and you can split the payment', food: 'veg and Jain meals are arranged at every stop', hidden: 'the price is all inclusive and the written list of inclusions and exclusions is attached', private: 'this can run as a private trip with no group', date: 'we have another departure the following week and one free date change', cold: 'we provide layered clothing lists and heated stays', walking: 'the pace is easy with minimal walking and a vehicle at every stop', altitude: 'the plan has acclimatisation days, oxygen in the vehicle and a doctor on call', wifi: 'the stay has tested wifi and a speed test screenshot is attached', invoice: 'a GST invoice and vendor documents are attached', discount: 'I can add a bonfire night and airport pickup at no cost, and split the payment', certification: 'our guides are certified and the certificates are attached', group: 'we hold seats for 48 hours and share a group payment link so everyone can pay their part' };
    if (rules.length) return `${warm}${rules[0].f.o.replace(/^(be\s+)?answered with\s*/i, 'here is how we handle it: ')}.`;
    const key = Object.keys(generic).find(k => new RegExp('\\b' + k, 'i').test(lastLead || ''));
    return `${warm}${key ? generic[key] : 'here is exactly how we handle it, with photos and a past traveler you can talk to'}.`;
  };
  switch (stage) {
    case 'enquiry': return null; // the cohort opener with qualifying questions (draftReply) is right here
    case 'qualified': {
      const d = req && req.destination ? req.destination.name : 'the trip';
      const missing = []; if (!req || !req.month) missing.push('your travel dates'); if (!req || !req.group) missing.push('how many of you are travelling'); if (!req || !req.budget) missing.push('a rough budget per person');
      const asked = (lastLead || '').split('?').slice(0, -1).map(q => q.trim().split(/[.,;]/).pop().trim()).map(q => q.split(/\s+/).length > 8 ? q.split(/\s+/).slice(-6).join(' ') : q).filter(q => q.length > 3);
      const ack = asked.length ? ` I will cover ${asked.map(a => a.replace(/^(and|also|plus)\s+/i, '')).join(' and ')} in it.` : '';
      return `${hi} Perfect, ${req && req.month ? DEST.MONTHS[req.month - 1] : 'those dates'} works well for ${d}. I am sending the day-by-day plan with the all-inclusive price per person within the hour, plus photos and reviews from the last group.${ack}${missing.length ? ` To finalise it, could you share ${missing.join(' and ')}?` : action === 'call' ? ' Can I call you for five minutes to understand what matters most?' : ' Anything you want built in?'}`;
    }
    case 'quote': {
      const d = req && req.destination; if (!d) return null;
      const days = (req.days || d.idealDays); const perPerson = Math.round(d.costPerDay * days / 100) * 100;
      const plan = d.route.slice(0, Math.max(d.minDays, days)).map((r, i) => `D${i + 1} ${r}`).join(' · ');
      return `${hi} Here is the ${days}-day ${d.name} plan: ${plan}. ${perPerson} per person all inclusive (stay, transport, meals, activities)${req.group ? `, ${perPerson * req.group} for ${req.group}` : ''}. Photos and reviews from the last group attached. ${action === 'call' ? 'Shall I call you to walk through it?' : 'Shall I hold seats for 48 hours?'}`;
    }
    case 'objection': return `${objAnswer()} ${action === 'call' ? 'Shall I call you for five minutes to walk you through it?' : 'Shall I hold seats for 48 hours while you decide?'}`;
    case 'quoted': return `${hi} Just checking if you had a chance to look at the plan. Happy to adjust anything, and we also have a departure the following week if dates are tight.`;
    case 'negotiation': return `${hi} ${action === 'split_payment' ? 'You can pay 30% now and the rest two weeks before departure.' : action === 'small_discount' ? 'For a group this size I can do 5% off, valid till Friday.' : action === 'big_discount' ? 'If you confirm today I can do 12% off.' : 'The price stays, but I will add a bonfire night and airport pickup at no cost.'} Shall I send the link?`;
    case 'advance': return `${hi} Here is the payment link for the advance: [link]. Seats are held for 24 hours, and you get the welcome kit the moment it lands.`;
    case 'balance': return `${hi} A reminder that the balance is due 15 days before departure. The trip group and packing list go out a week before.`;
    default: return null;
  }
}

// ---------------------------------------------------------------- SALES
const sales = {
  name: 'sales', title: 'Sales', duty: 'qualify, pick the next move, draft the message',
  run(task, ctx) {
    const text = task.conversation || task.message || '';
    const lines = String(text).split(/\n+/).map(l => l.trim()).filter(Boolean);
    const lead = ctx.skills.tryAll(`score this lead: ${lines.filter(l => !/^clan:/i.test(l)).join(' ')}`);
    const stage = detectStage(lines);
    const top = cohorts.classify(text)[0]; const cohort = top ? cohorts.get(top.id) : null;
    const type = cohort ? (cohort.type || cohort.id) : '*';
    const best = ctx.funnel && ctx.funnel.n ? (ctx.funnel.best(type, stage) || ctx.funnel.best('*', stage)) : null;
    const leadLines = lines.filter(l => !/^clan:/i.test(l)).map(l => l.replace(/^lead:\s*/i, ''));
    const lastLead = leadLines[leadLines.length - 1] || '';
    const req = parseRequirements(leadLines.join(' '));
    const lastIsLead = !/^clan:/i.test(lines[lines.length - 1] || '');
    const composed = composeReply({ stage: stage === 'quoted' && lastIsLead ? 'quote' : stage, action: best ? best.action : 'reply_fast_qualify', lastLead, cohort, name: task.name || '', memory: ctx.memory, req });
    const draft = composed ? { reply: composed } : cohorts.draftReply(leadLines.join(' '), { name: task.name || '' });
    const findings = [], suggestions = [], lessons = [];
    if (lead && /JUNK/.test(lead.output)) findings.push('Lead looks like junk: one polite reply, no chase.');
    if (best && best.rate < 0.2 && stage !== 'enquiry') suggestions.push(`Weak stage for this type (${Math.round(best.rate * 100)}% book): consider moving to a call.`);
    if (cohort) lessons.push(`${cohort.name} leads at the ${stage} stage should get ${best ? best.action.replace(/_/g, ' ') : 'a fast qualifying reply'}.`);
    return { agent: 'sales', verdict: lead && /JUNK/.test(lead.output) ? 'warn' : 'ok', findings, suggestions, lessons,
      output: { stage, cohort: cohort ? cohort.name : null, type, score: lead ? lead.output : null, nextAction: best ? best.action : 'reply_fast_qualify', evidence: best ? `${Math.round(best.rate * 100)}% book, ${best.n} cases` : 'default', draft: draft.reply } };
  },
};

// ---------------------------------------------------------------- OPERATIONS
const operations = {
  name: 'operations', title: 'Operations', duty: 'feasibility, routing, timing, requirement and emotional fit, itinerary',
  run(task, ctx) {
    const req = task.requirements || parseRequirements(task.conversation || task.message || '');
    const findings = [], suggestions = [], lessons = [];
    const d = req.destination;
    if (!d) return { agent: 'operations', verdict: 'warn', findings: ['Destination not recognised; ask which destination they want.'], suggestions: ['Offer three options that fit their month and budget.'], lessons: [], output: { requirements: req } };
    const season = DEST.seasonStatus(d, req.month);
    let verdict = 'ok'; const bump = (v) => { if (v === 'block' || verdict !== 'block') verdict = verdict === 'block' ? 'block' : v; };
    if (season === 'off season') { bump('block'); findings.push(`${d.name} in ${DEST.MONTHS[req.month - 1]} is off season (${d.risks[0]}).`); suggestions.push(`Move to ${d.season.slice(0, 3).map(m => DEST.MONTHS[m - 1]).join(', ')}, or offer ${alternatives(d, req.month).join(' / ') || 'another destination'} for that month.`); }
    else if (season === 'shoulder season') { bump('warn'); findings.push(`${d.name} in ${DEST.MONTHS[req.month - 1]} is shoulder season; weather can turn.`); suggestions.push('Keep a buffer day and flexible cancellation.'); }
    const days = req.days || d.idealDays;
    if (req.days && req.days < d.minDays) { bump('warn'); findings.push(`${req.days} days is too short for ${d.name}; minimum is ${d.minDays}.`); suggestions.push(`Propose ${d.idealDays} days, or a shorter nearby destination.`); }
    if (d.acclimatize && (req.needs.includes('seniors') || req.needs.includes('kids'))) { bump('warn'); findings.push(`${d.name} reaches ${d.maxAltitude} m; ${req.needs.includes('seniors') ? 'seniors: ' + d.seniors : 'kids: ' + d.kids}.`); suggestions.push('Add acclimatisation days, a doctor on call, and medical declaration.'); }
    if (d.permits.length) suggestions.push(`Arrange: ${d.permits.join('; ')}.`);
    const perPerson = Math.round(d.costPerDay * days * (req.needs.includes('luxury') ? 2.2 : req.needs.includes('price') ? 0.8 : 1) / 100) * 100;
    if (req.budget && perPerson > req.budget * 1.15) { bump('warn'); findings.push(`Estimated ${perPerson} per person exceeds the stated budget ${req.budget}.`); suggestions.push(`Cut to ${Math.max(d.minDays, Math.floor(req.budget / d.costPerDay))} days or downgrade stays; or propose ${alternatives(d, req.month, req.budget / days).join(' / ') || 'a cheaper destination'}.`); }
    // Itinerary: route trimmed or padded to the day count, with acclimatisation and a buffer.
    const route = d.route.slice(0, Math.max(d.minDays, days));
    while (route.length < days) route.splice(route.length - 1, 0, `Free day in ${d.name} (local exploring, rest)`);
    const itinerary = route.map((r, i) => ({ day: i + 1, plan: r }));
    const longDrives = Object.entries(d.drive).filter(([, h]) => h >= 7).map(([k, h]) => `${k} (${h} h)`);
    if (longDrives.length && (req.needs.includes('seniors') || req.needs.includes('kids'))) { findings.push(`Long drives: ${longDrives.join(', ')}.`); suggestions.push('Break long drives with an overnight stop.'); }
    // Emotional fit: does the plan carry what this kind of traveler came for?
    const emotional = [];
    const wants = { romance: /villa|candlelight|sunset|private|lake|beach/i, fun: /nightlife|bonfire|cafes|party|beach/i, adventure: /trek|rafting|bike|pass|snorkel|scuba|hike/i, luxury: /resort|villa|spa|suite/i, photos: /sunrise|lake|terrace|golden|dunes|bridge/i, privacy: /private|villa|free day/i, medical: /rest|free day|easy/i, wifi: /free day|cafe/i };
    for (const n of req.needs) if (wants[n] && !itinerary.some(x => wants[n].test(x.plan)) && !(d.highlights || []).some(h => wants[n].test(h))) emotional.push(n);
    if (emotional.length) { bump('warn'); findings.push(`The plan does not yet carry what they came for: ${emotional.join(', ')}.`); suggestions.push(`Add one deliberate moment for ${emotional.join(' and ')} (name it on the itinerary).`); }
    lessons.push(`${d.name} is ${season === 'in season' ? 'in season' : season} in ${req.month ? DEST.MONTHS[req.month - 1] : 'that month'}.`, `${d.name} needs at least ${d.minDays} days.`, `${d.name} costs about ${d.costPerDay} per person per day.`);
    return { agent: 'operations', verdict, findings, suggestions, lessons, output: { requirements: { destination: d.name, month: req.month ? DEST.MONTHS[req.month - 1] : null, group: req.group, budget: req.budget, days, needs: req.needs }, season, perPerson, total: req.group ? perPerson * req.group : null, itinerary, permits: d.permits, risks: d.risks } };
  },
};
function alternatives(d, month, maxPerDay) {
  return Object.values(DEST.DESTINATIONS).filter(x => x !== d && month && x.season.includes(month) && (!maxPerDay || x.costPerDay <= maxPerDay)).sort((a, b) => Math.abs(a.costPerDay - d.costPerDay) - Math.abs(b.costPerDay - d.costPerDay)).slice(0, 3).map(x => x.name);
}

// ---------------------------------------------------------------- CUSTOMER EXPERIENCE
const cx = {
  name: 'cx', title: 'Customer Experience', duty: 'tone, emotion, unanswered questions, response time, touchpoints',
  run(task, ctx) {
    const text = String(task.conversation || task.message || '');
    const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
    const leadLines = lines.filter(l => !/^clan:/i.test(l)).map(l => l.replace(/^lead:\s*/i, ''));
    const clanLines = lines.filter(l => /^clan:/i.test(l)).map(l => l.replace(/^clan:\s*/i, ''));
    const findings = [], suggestions = [], lessons = [];
    const neg = leadLines.filter(l => /\b(not happy|disappoint|worst|angry|cancel|refund|waiting|no reply|ignored|expensive|too much|doubt|scam|unsafe|worried|concern|hmm|but)\b/i.test(l));
    const questions = leadLines.filter(l => /\?/.test(l) || /\b(is it|can we|do you|what about|how much|any)\b/i.test(l));
    const lastClan = clanLines[clanLines.length - 1] || '';
    const unanswered = questions.filter(q => { const qt = new Set(T.tokens(q)); return !clanLines.some(c => T.tokens(c).filter(t => qt.has(t)).length >= Math.min(2, qt.size)); });
    if (unanswered.length) findings.push(`Unanswered: ${unanswered.map(q => `"${q.slice(0, 60)}"`).join(', ')}.`);
    if (neg.length) findings.push(`Negative or anxious signals: ${neg.map(q => `"${q.slice(0, 50)}"`).join(', ')}.`);
    const top = cohorts.classify(text)[0]; const cohort = top ? cohorts.get(top.id) : null;
    const toneWanted = cohort ? cohort.tone : 'warm and clear';
    if (lastClan && /^(ok|fine|yes|no|let me know)\b/i.test(lastClan)) findings.push('Last clan reply is curt; it reads as disinterest.');
    if (cohort && /respectful|reassuring|patient/.test(toneWanted) && lastClan && !/\b(safe|understand|happy to|of course|absolutely|we will|here is)\b/i.test(lastClan)) suggestions.push(`This cohort needs a ${toneWanted} tone: acknowledge the concern before answering.`);
    if (unanswered.length) suggestions.push('Answer every open question explicitly, in the order asked, before pitching.');
    if (neg.length) suggestions.push('Name the worry, give proof (policy, photo, past traveler), then a small next step.');
    const touchpoints = ['first reply within 10 minutes', 'itinerary within the hour', 'follow-up at 24 hours and 3 days', 'payment link same day as yes', 'trip group and packing list a week before', 'check-in call a day before departure', 'review request two days after', 'referral offer a week after'];
    if (cohort) lessons.push(`${cohort.name} should be spoken to in a ${cohort.tone} tone.`);
    if (neg.length) lessons.push('A worried lead needs the worry named and proof before any pitch.');
    return { agent: 'cx', verdict: unanswered.length || neg.length ? 'warn' : 'ok', findings, suggestions, lessons, output: { tone: toneWanted, unanswered, negatives: neg, touchpoints } };
  },
};

// ---------------------------------------------------------------- NEWS AND RISK DESK
const news = {
  name: 'news', title: 'News and risk desk', duty: 'current events, weather, geopolitics and their impact on travel plans',
  run(task, ctx) {
    const req = task.requirements || parseRequirements(task.conversation || task.message || '');
    const d = req.destination; const findings = [], suggestions = [], lessons = [];
    const items = ctx.risk && d ? ctx.risk.relevant(d.name, d.country) : [];
    let verdict = 'ok';
    for (const it of items) { if (it.severity === 'high') verdict = 'block'; else if (it.severity === 'medium' && verdict !== 'block') verdict = 'warn'; findings.push(`[${it.severity}] ${it.headline} (${it.date}, ${it.source || 'desk'}): ${it.impact}`); if (it.advice) suggestions.push(it.advice); }
    if (d && !items.length) findings.push(`No current advisories on file for ${d.name}. Last desk update: ${ctx.risk ? ctx.risk.updated : 'never'}.`);
    if (!d) findings.push('No destination to check yet.');
    for (const it of items) lessons.push(`${it.where} has a ${it.severity} travel risk: ${it.headline}.`);
    return { agent: 'news', verdict, findings, suggestions, lessons, output: { advisories: items, updated: ctx.risk ? ctx.risk.updated : null } };
  },
};

// ---------------------------------------------------------------- MARKETING
const marketing = {
  name: 'marketing', title: 'Marketing', duty: 'budget allocation, creatives, audiences, seasonal calendar',
  run(task, ctx) {
    const findings = [], suggestions = [], lessons = [];
    const facts = ctx.memory.facts.filter(f => /campaign/.test(f.s) && f.wrong < 2);
    const perLead = facts.filter(f => f.p === 'costs' && /^\d+\s*(inr|rs|₹)?\s*per (form lead|whatsapp conversation|lead)/i.test(f.o)).map(f => ({ campaign: f.s.replace(/ campaign$/, ''), cost: +(f.o.match(/\d+/) || [0])[0], what: (f.o.match(/per (.+)$/) || [])[1] }));
    if (perLead.length) { perLead.sort((a, b) => a.cost - b.cost); findings.push(`Cheapest acquisition: ${perLead[0].campaign} at ${perLead[0].cost} per ${perLead[0].what}; dearest: ${perLead[perLead.length - 1].campaign} at ${perLead[perLead.length - 1].cost}.`); suggestions.push(`Shift budget toward ${perLead[0].campaign}; cap ${perLead[perLead.length - 1].campaign} until its creative is refreshed.`); }
    const weakCtr = ctx.memory.facts.filter(f => f.p === 'needs' && /new creative/.test(f.o)).map(f => f.s);
    if (weakCtr.length) suggestions.push(`Refresh creative for: ${weakCtr.join(', ')} (a real trip video with a hook in the first three seconds).`);
    // Seasonal calendar: which destinations to advertise for the next three months, and to whom.
    const now = new Date(); const months = [1, 2, 3].map(k => ((now.getMonth() + k) % 12) + 1);
    const calendar = months.map(m => ({ month: DEST.MONTHS[m - 1], destinations: Object.values(DEST.DESTINATIONS).filter(d => d.season.includes(m)).slice(0, 6).map(d => d.name) }));
    const hooks = cohorts.COHORTS.filter(c => !c.generated).slice(0, 6).map(c => ({ cohort: c.name, hook: c.triggers[0], channel: c.channel }));
    suggestions.push(`Start ads six weeks before season: ${calendar.map(c => `${c.month}: ${c.destinations.slice(0, 3).join(', ')}`).join(' | ')}.`);
    lessons.push(...calendar.map(c => `${c.destinations.slice(0, 3).join(', ')} should be advertised for ${c.month}.`));
    return { agent: 'marketing', verdict: 'ok', findings, suggestions, lessons, output: { acquisition: perLead, calendar, hooks } };
  },
};

// ---------------------------------------------------------------- CRITIC
const critic = {
  name: 'critic', title: 'Critic', duty: 'gaps, negative responses, unsatisfactory answers, itinerary loopholes, fixes',
  run(task, ctx, prior = {}) {
    const findings = [], suggestions = [], lessons = [];
    let verdict = 'ok';
    const bump = (v) => { verdict = v === 'block' ? 'block' : verdict === 'block' ? 'block' : v; };
    const ops = prior.operations, sl = prior.sales, cxr = prior.cx, nw = prior.news;
    // 1. Unsatisfactory answers: the drafted reply must address every open question and every concern.
    if (sl && cxr) {
      for (const q of cxr.output.unanswered || []) { const qt = new Set(T.tokens(q)); if (T.tokens(sl.output.draft).filter(t => qt.has(t)).length < Math.min(2, qt.size)) { bump('warn'); findings.push(`Draft reply does not answer: "${q.slice(0, 60)}".`); suggestions.push(`Add one sentence answering "${q.slice(0, 40)}" with a specific, checkable fact.`); } }
      if ((cxr.output.negatives || []).length && !/\b(understand|sorry|safe|proof|photo|review|policy|covered|guarantee)\b/i.test(sl.output.draft)) { bump('warn'); findings.push('Draft ignores a negative signal from the lead.'); suggestions.push('Open the reply by naming the concern, then give proof.'); }
      if (/\d{4,}/.test(sl.output.draft) && !ops) { bump('warn'); findings.push('Draft quotes a price before feasibility was checked.'); }
    }
    // 2. Itinerary loopholes.
    if (ops && ops.output.itinerary) {
      const it = ops.output.itinerary, d = DEST.find(ops.output.requirements.destination) || {};
      if (ops.verdict === 'block') { bump('block'); findings.push('Operations blocked the plan; do not quote until fixed.'); }
      if (d.acclimatize && !it.slice(0, d.acclimatize).every(x => /acclimat/i.test(x.plan))) { bump('warn'); findings.push(`No acclimatisation day at ${d.maxAltitude} m.`); suggestions.push(`Make day 1${d.acclimatize > 1 ? ' and 2' : ''} rest in ${d.hub}.`); }
      if (!/buffer|departure/i.test(it[it.length - 1].plan)) { bump('warn'); findings.push('No buffer or departure day; a single delay breaks the return flight.'); suggestions.push('End with a buffer or departure day.'); }
      const perDay = it.filter(x => /\band\b|,/.test(x.plan)).length; if (perDay > it.length * 0.7 && (ops.output.requirements.needs || []).some(n => n === 'seniors' || n === 'kids' || n === 'medical')) { bump('warn'); findings.push('Pace is too dense for this group.'); suggestions.push('One anchor activity per day, afternoons free.'); }
      if (ops.output.requirements.budget && ops.output.perPerson > ops.output.requirements.budget * 1.15) { bump('warn'); findings.push('Price exceeds the stated budget by more than 15%.'); }
      if ((ops.output.permits || []).length) suggestions.push(`Confirm permits before taking the advance: ${ops.output.permits.join('; ')}.`);
      for (const r of ops.output.risks || []) if (/monsoon|typhoon|closure|cancell/i.test(r) && ops.output.season !== 'in season') { bump('warn'); findings.push(`Risk not mitigated: ${r}.`); suggestions.push('State the weather clause and refund rule in writing.'); }
      if (!it.some(x => /free day|rest/i.test(x.plan)) && it.length >= 6) suggestions.push('Add a free afternoon; every good trip has slack.');
      if (!ops.output.requirements.group) { bump('warn'); findings.push('Group size unknown; price per person cannot be final.'); }
      if (!ops.output.requirements.month) { bump('warn'); findings.push('Travel month unknown; season cannot be checked.'); }
    }
    // 3. World.
    if (nw && nw.verdict === 'block') { bump('block'); findings.push('News desk flags a high risk for this destination.'); }
    // 4. Missing information to close.
    const req = ops ? ops.output.requirements : null;
    if (req) for (const [k, label] of [['budget', 'budget per person'], ['group', 'group size'], ['month', 'travel month']]) if (!req[k]) suggestions.push(`Ask for the ${label} in the next message.`);
    if (findings.length) lessons.push(`A plan with ${findings.length} open issue${findings.length > 1 ? 's' : ''} should not be quoted until fixed.`);
    return { agent: 'critic', verdict, findings, suggestions, lessons, output: { blocking: verdict === 'block', issues: findings.length } };
  },
};

// ---------------------------------------------------------------- TESTER AND TEACHER
const tester = {
  name: 'tester', title: 'Tester and teacher', duty: 'examine the mind, find weak spots, teach',
  async run(task, ctx) {
    const findings = [], suggestions = [], lessons = [];
    const brain = ctx.brain;
    const probes = [
      ['What is a hot lead?', /date.*budget|budget/i], ['When should the first reply go out?', /ten minutes/i], ['What is the best action at the advance step?', /payment link/i],
      ['Which cohort is this lead: 12 college students, cheapest manali trip', /college|student/i], ['What raises the booking rate?', /reply|proof|price|follow/i], ['When is Ladakh season?', /june|july|august|september/i],
    ];
    let pass = 0; const saved = brain.pendingQuestion; brain.pendingQuestion = null;
    for (const [q, re] of probes) { const r = await brain.respond(q); if (re.test(r.text || '')) pass++; else findings.push(`Weak answer to "${q}": ${(r.text || '').slice(0, 80)}`); brain.pendingQuestion = null; }
    brain.pendingQuestion = saved;
    const unknowns = brain.unknowns.slice(-5); if (unknowns.length) { findings.push(`${brain.unknowns.length} questions it could not answer; latest: ${unknowns.map(u => `"${u.q}"`).join(', ')}.`); suggestions.push('Teach the missing facts in one sentence each.'); }
    const contradictions = brain.memory.contradictions || []; if (contradictions.length) { findings.push(`${contradictions.length} contradiction(s): ${contradictions.slice(0, 3).map(c => `${c.s} ${c.p}: ${c.options.join(' / ')}`).join('; ')}.`); suggestions.push('Settle each contradiction with one corrected sentence.'); }
    // Teach: from destinations and cohorts, re-affirm facts that are missing or weak.
    for (const d of Object.values(DEST.DESTINATIONS).slice(0, 24)) {
      if (!brain.memory.factsAbout(d.name.toLowerCase() + ' season').length) lessons.push(`${d.name} season is ${DEST.MONTHS[d.season[0] - 1]} to ${DEST.MONTHS[d.season[d.season.length - 1] - 1]}.`);
      if (!brain.memory.factsAbout(d.name.toLowerCase()).some(f => f.p === 'takes')) lessons.push(`${d.name} takes at least ${d.minDays} days.`);
    }
    for (const it of (brain.risk ? brain.risk.items : []).slice(-40)) if (!brain.memory.factsAbout(it.where.toLowerCase()).some(f => /risk/.test(f.o))) lessons.push(`${it.where} has a ${it.severity} travel risk: ${it.headline}.`);
    for (const d of Object.values(DEST.DESTINATIONS)) if (d.permits.length && !brain.memory.factsAbout(d.name.toLowerCase()).some(f => f.p === 'needs')) lessons.push(`${d.name} needs ${d.permits[0]}.`);
    return { agent: 'tester', verdict: pass === probes.length ? 'ok' : 'warn', findings, suggestions, lessons, output: { probes: probes.length, pass, unknowns: brain.unknowns.length, taught: lessons.length } };
  },
};

// ---------------------------------------------------------------- DIALOGUE TESTER
/**
 * Plays synthetic customers against the clan's own replies for several turns, scores each dialogue, and
 * teaches from the failures. The customer is simulated from a cohort with latent traits (journeys.js); the
 * clan side is what OYE would send: the Sales draft after the council has reviewed it.
 * Score (0-100): qualified (asked dates, group, budget) 25 · every question answered 25 · objection answered with
 * proof 20 · tone matched 10 · reached a next step (itinerary, call, or payment) 20.
 */
const dialogue = {
  name: 'dialogue', title: 'Dialogue tester', duty: 'simulate customers, score multi-turn conversations, teach from failures',
  async run(task, ctx) {
    const J = require('./journeys'); const { COHORTS } = require('./cohorts');
    const n = Math.min(12, Math.max(1, +task.count || 6)); const findings = [], suggestions = [], lessons = []; const transcripts = [];
    J.setSeed(+task.seed || (Date.now() % 100000));
    let total = 0;
    for (let i = 0; i < n; i++) {
      const cohort = COHORTS[Math.floor(J.rnd() * COHORTS.length)]; const p = J.person(cohort);
      const log = [{ who: 'lead', text: p.opener }]; const asked = new Set(); let objectionAnswered = null, nextStep = false, toneOk = true, unanswered = 0;
      const objection = J.pick(J.OBJECTIONS[p.type] || J.OBJECTIONS.friends);
      for (let turn = 0; turn < 3; turn++) {
        const convo = log.map(m => `${m.who}: ${m.text}`).join('\n');
        const salesOut = sales.run({ conversation: convo, name: p.name.split(' ')[0] }, ctx);
        const cxOut = cx.run({ conversation: convo }, ctx);
        const reply = salesOut.output.draft; log.push({ who: 'clan', text: reply });
        if (/dates?|when/i.test(reply)) asked.add('dates'); if (/how many|group size|of you/i.test(reply)) asked.add('group'); if (/budget/i.test(reply)) asked.add('budget');
        if (/itinerary|plan|pdf|call|payment|link|price|per person/i.test(reply)) nextStep = true;
        const wantTone = cohort.tone; const curt = /^(ok|fine|yes|no|let me know)\b/i.test(reply); if (curt) toneOk = false;
        // The customer answers what was asked, then raises an objection or a question.
        if (turn === 0) log.push({ who: 'lead', text: J.stylize(`${p.requirements.month}, ${p.requirements.groupSize} of us, budget ${p.requirements.budgetPerPerson} per person`, p) });
        else if (turn === 1) log.push({ who: 'lead', text: J.stylize(`hmm ${objection}?`, p) });
        else { const last = log[log.length - 2].text; const answers = new Set(T.tokens(objection)); objectionAnswered = T.tokens(last).filter(t => answers.has(t)).length >= Math.min(2, answers.size) || /understand|here is|covered|policy|proof|photo|review|doctor|safe|private|invoice|wifi|discount|split/i.test(last); }
        unanswered = (cx.run({ conversation: log.map(m => `${m.who}: ${m.text}`).join('\n') }, ctx).output.unanswered || []).length; // judged after our reply
      }
      const given = parseRequirements(log.filter(m => m.who === 'lead').map(m => m.text).join(' ')); const qualified = asked.size >= 2 || ((given.month ? 1 : 0) + (given.group ? 1 : 0) + (given.budget ? 1 : 0)) >= 2;
      const score = (qualified ? 25 : asked.size * 10) + (unanswered === 0 ? 25 : 10) + (objectionAnswered ? 20 : 0) + (toneOk ? 10 : 0) + (nextStep ? 20 : 0);
      total += score;
      const why = [];
      if (!qualified) why.push('did not qualify (dates, group, budget)'); if (unanswered) why.push(`${unanswered} question(s) left unanswered`); if (!objectionAnswered) why.push(`objection "${objection}" not answered`); if (!toneOk) why.push('curt reply'); if (!nextStep) why.push('no next step offered');
      transcripts.push({ person: `${p.name} (${cohort.name})`, score, why, log });
      if (why.length) { findings.push(`${p.name} (${cohort.name}) scored ${score}: ${why.join('; ')}.`); }
      if (!objectionAnswered) lessons.push(`The ${objection} objection from ${cohort.name} should be answered with proof before the next pitch.`);
      if (!qualified) lessons.push(`${cohort.name} leads should be asked the dates, the group size and the budget in the first reply.`);
    }
    const avg = Math.round(total / n);
    if (avg < 70) suggestions.push('Reply drafts must answer the last customer message before pitching; add objection answers to the draft.');
    if (findings.some(f => /not answered/.test(f))) suggestions.push('Give the Sales draft access to the objection library (lesson 8) so objections get a scripted answer.');
    return { agent: 'dialogue', verdict: avg >= 80 ? 'ok' : avg >= 60 ? 'warn' : 'block', findings, suggestions, lessons: [...new Set(lessons)].slice(0, 12), output: { dialogues: n, average: avg, transcripts } };
  },
};

const STRAT = require('./strategy'); const MINDS = require('./minds');
const strategy = {
  name: 'strategy', title: 'Strategy', duty: 'business techniques for the situation at hand',
  run(task, ctx) { const text = task.message || task.conversation || ''; const picks = STRAT.techniques(text); const findings = picks.map(p => `${p.situation}: ${p.moves.slice(0, 3).map(m => m[0]).join(', ')}`); const suggestions = [].concat(...picks.map(p => p.moves.slice(0, 2).map(m => `${m[0]}: ${m[1]}`))); return { agent: 'strategy', verdict: 'ok', findings, suggestions, lessons: picks.map(p => `${p.situation.charAt(0).toUpperCase() + p.situation.slice(1)} is fixed by ${p.moves[0][0].toLowerCase()}.`), output: { picks } }; },
};
const pricing = {
  name: 'pricing', title: 'Pricing', duty: 'price ladder, floors, when to move the price',
  run(task, ctx) { const g = ctx.brain && ctx.brain.growth; const trips = g ? g.upcoming(10) : []; const an = STRAT.priceAnalytics(trips, g ? g.state.leads : [], DEST); const req = parseRequirements(task.message || task.conversation || ''); const t = req.destination ? trips.find(x => x.name.toLowerCase().includes(req.destination.name.toLowerCase())) : null; const ps = t ? STRAT.priceStrategy({ price: t.price, cost: req.destination ? req.destination.costPerDay * (t.days || req.destination.idealDays) : null, seats: t.seats, booked: t.booked, daysOut: t.date ? Math.ceil((new Date(t.date) - Date.now()) / 864e5) : 45 }) : null; return { agent: 'pricing', verdict: an.notes.length ? 'warn' : 'ok', findings: an.notes, suggestions: ps ? ps.rules.slice(0, 3) : ['Set trips in Set up to get a price ladder.'], lessons: an.notes.slice(0, 2), output: { analytics: an.rows, ladder: ps ? ps.ladder : null } }; },
};
const wellbeing = {
  name: 'wellbeing', title: 'Wellbeing', duty: 'travel as therapy: what this person needs from the trip',
  run(task, ctx) { const text = task.message || task.conversation || ''; const d = MINDS.detectAll(text); const findings = []; const suggestions = []; for (const k of d.therapy) { const t = MINDS.THERAPY[k]; findings.push(`State of mind: ${k}; needs ${t.needs}.`); suggestions.push(`Offer ${t.trip}; pace ${t.pace}; avoid ${t.avoid}.`); } if (d.attachment) suggestions.push(`Attachment ${d.attachment}: ${MINDS.ATTACHMENT[d.attachment]}.`); return { agent: 'wellbeing', verdict: 'ok', findings, suggestions, lessons: d.therapy.map(k => `A ${k} customer needs ${MINDS.THERAPY[k].trip}.`), output: { detected: d } }; },
};
const analyst = {
  name: 'analyst', title: 'Pattern analyst', duty: 'patterns in leads, sources, hours, funnel',
  run(task, ctx) { const g = ctx.brain && ctx.brain.growth; const p = STRAT.patterns(g ? g.state.leads : [], g ? g.state.log : []); return { agent: 'analyst', verdict: 'ok', findings: p.findings, suggestions: [], lessons: p.findings.filter(f => !/Not enough/.test(f)).slice(0, 2), output: p }; },
};
module.exports = { AGENTS: { sales, operations, cx, news, marketing, critic, tester, dialogue, strategy, pricing, wellbeing, analyst }, parseRequirements };
