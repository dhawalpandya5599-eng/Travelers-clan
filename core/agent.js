'use strict';
/**
 * agent.js — ATLAS as a reasoning agent. A language model (Claude through the page, Ollama, or any open model
 * endpoint) thinks step by step and acts through tools that expose everything ATLAS knows and can do: its memory,
 * the trips and seats, the written policies, the destinations table, the risk desk, the council of agents, the lead
 * sheet, holds, campaigns and content. Every run ends with facts the mind memorises, so the agent learns from use,
 * and every answer can be corrected by the chief, which becomes a lesson for the next time.
 *
 * Without a model the agent still works: it routes the request to the closest tool by keywords. Nothing breaks offline.
 */
const DEST = require('./destinations');

const MAX_STEPS = 8;

function tools(brain) {
  const g = brain.growth; const m = brain.memory;
  const T = {
    recall: { desc: 'Search what ATLAS remembers (facts, lessons, policies, people). args: {query}', run: async ({ query }) => { const r = await brain.respond(String(query || ''), { user: 'agent' }); const facts = m.recall(String(query || ''), 8).map(f => f.text || `${f.s} ${f.p} ${f.o}`); return { answer: r.text, facts }; } },
    trips: { desc: 'Upcoming trips with date, price, seats left, holds. args: {}', run: async () => g.upcoming(10).map(t => ({ name: t.name, date: t.date, days: t.days, price: t.price, seats: t.seats, booked: t.booked, seatsLeft: g.seatsLeft(t), holds: (t.holds || []).length })) },
    policies: { desc: 'The written policies (included, excluded, payment, cancellation, pickup, safety, food, age) and business profile. args: {}', run: async () => ({ business: { name: g.profile.name, city: g.profile.city, phone: g.profile.phone, upi: g.profile.upi, usp: g.profile.usp }, policies: g.profile.policies }) },
    destination: { desc: 'Facts about a destination: season months, min/ideal days, cost per day, altitude, permits, risks, route. args: {name}', run: async ({ name }) => { const d = DEST.find(String(name || '')); return d ? { ...d, now: DEST.seasonStatus(d, new Date().getMonth() + 1) } : { error: 'unknown destination; known: ' + Object.values(DEST.DESTINATIONS).map(x => x.name).join(', ') }; } },
    plan_trip: { desc: 'Operations + critic build a day-by-day plan with price and findings from one line of requirements. args: {requirements}', run: async ({ requirements }) => { const r = await brain.council.review({ message: String(requirements || '') }); const o = r.agents.operations && r.agents.operations.output || {}; return { verdict: r.verdict, season: o.season, perPerson: o.perPerson, itinerary: (o.itinerary || []).map(d => `D${d.day} ${d.plan}`), findings: [].concat(...Object.values(r.agents).map(a => a.findings || [])).slice(0, 8), fixes: r.fixes.slice(0, 6) }; } },
    analyse_lead: { desc: 'Full council pass on a customer conversation: cohort, stage, lead score, next action, draft reply, issues. args: {conversation, name?}', run: async ({ conversation, name }) => { const r = await brain.council.handle({ conversation: String(conversation || ''), name: name || '' }); const s = r.agents.sales && r.agents.sales.output || {}; return { verdict: r.verdict, cohort: s.cohort, stage: s.stage, score: s.score, nextAction: s.nextAction, draft: s.draft, issues: [].concat(...Object.values(r.agents).map(a => a.findings || [])).slice(0, 6) }; } },
    whatsapp_reply: { desc: 'What the WhatsApp agent would reply to a customer message, grounded on real trips and policies (EN/Hinglish/Gujarati/Hindi). args: {text, id?}', run: async ({ text, id }) => { const r = await g.chat({ id: id || 'agent-' + Date.now().toString(36), text: String(text || ''), source: 'agent' }); return { reply: r.reply, intent: r.intent, handoff: r.handoff, stage: r.stage }; } },
    leads: { desc: 'The lead sheet; optional stage filter. args: {stage?}', run: async ({ stage }) => g.state.leads.filter(l => !stage || l.stage === stage).slice(0, 50).map(l => ({ id: l.id, name: l.name, trip: l.trip, stage: l.stage, source: l.source, touches: l.touches, next: new Date(l.next).toISOString().slice(0, 10), value: l.value })) },
    today: { desc: 'Follow-ups due now with drafted messages, seat alerts, pipeline counts. args: {}', run: async () => { const t = await g.today(); return { due: t.due.map(d => ({ lead: d.lead.name || d.lead.id, trip: d.lead.trip, stage: d.lead.stage, step: d.step.name, message: d.message })), alerts: t.alerts, counts: t.counts }; } },
    add_lead: { desc: 'Add or update a lead. args: {name, phone?, trip?, stage?, source?, value?, notes?}', run: async (a) => g.addLead(a || {}) },
    hold_seats: { desc: 'Hold seats on a trip for a lead for 24h. args: {trip, lead, n}', run: async ({ trip, lead, n }) => { const t = g.profile.trips.find(x => x.name.toLowerCase().includes(String(trip || '').toLowerCase())); if (!t) return { error: 'no such trip' }; const h = g.hold(t, String(lead || 'agent'), +n || 1); return { held: h.n, trip: t.name, until: new Date(h.until).toISOString(), seatsLeft: g.seatsLeft(t) }; } },
    campaigns: { desc: 'Festival/season campaign calendar with start dates, and broadcast drafts per segment. args: {}', run: async () => ({ campaigns: g.campaigns(), broadcasts: (await g.broadcasts()).drafts }) },
    content: { desc: 'Instagram bio, 7-day post plan with scripts and captions, hashtags; Google posts and keywords. args: {}', run: async () => { const c = await g.content(); const posts = await g.gbpPosts(); return { bio: c.bio, week: c.plan.map(p => `${p.day} ${p.format}: ${p.idea}`), captions: c.plan.filter(p => p.caption).map(p => p.caption), hashtags: c.hashtags, googlePosts: posts.map(p => p.title + ' — ' + p.body), keywords: g.keywords() }; } },
    risk: { desc: 'Travel risks and news affecting a place. args: {place}', run: async ({ place }) => brain.risk.relevant(String(place || ''), '').slice(0, 8) },
    calc: { desc: 'Arithmetic. args: {expression} e.g. "4*14500*0.3"', run: async ({ expression }) => { const e = String(expression || '').replace(/[^0-9+\-*/().% ]/g, ''); try { return { result: Function('"use strict";return (' + e + ')')() }; } catch (x) { return { error: 'bad expression' }; } } },
    remember: { desc: 'Memorise durable facts (plain sentences, one per item). args: {facts: [..]}', run: async ({ facts }) => ({ learned: brain.teach((facts || []).join('\n'), { source: 'agent', importance: 0.8 }) }) },
    persona: { desc: 'Read a customer message and return the psyche cues that matter (anxious, skeptical, analytical, consensus seeker, price sensitive, wants it all handled, rushed, terse, family) with handling advice. args: {text}', run: async ({ text }) => { const U = require('./universe'); const traits = U.detect(String(text || '')); const TIPS = { anxious: 'lead with safety proof before price', skeptical: 'offer reviews, last batch photos and a past traveller to call', analytical: 'send the inclusions list and the day-wise plan before asking for a hold', 'consensus seeker': 'give a forwardable one-page plan and a 24h hold without advance', 'defers to spouse or parent': 'write the message so it can be forwarded as is', 'very price sensitive': 'show the all-inclusive comparison and pay-in-parts', 'wants it all handled': 'promise pickup to drop in one sentence', rushed: 'answer in two lines and offer the hold now', terse: 'reply under 40 words', 'family with kids': 'answer safety, food and pace first', 'family with seniors': 'answer altitude, walking and doctor first' }; return { traits, advice: traits.map(t => TIPS[t]).filter(Boolean) }; } },
    review_reply: { desc: 'Draft a reply to a Google review. args: {text, stars, name?}', run: async ({ text, stars, name }) => g.reviewReply(String(text || ''), +stars || 5, name || '') },
  };
  return T;
}

const SYSTEM = (names) => `You are ATLAS, the operating mind of Travelers Clan, an Indian group-travel company. You think step by step and act through tools. You never invent prices, dates, seats or policies: fetch them with tools. Be concrete, short, and commercially sharp. Money in INR.
Protocol: reply with JSON only. Either {"thought": "...", "tool": "<name>", "args": {...}} to use a tool, or {"thought": "...", "final": "<answer for the chief, plain text, may be multi-line>", "facts": ["durable fact to memorise", ...], "todo": ["one next action for the chief", ...]} when done.
Tools: ${names}. Use at most ${MAX_STEPS} tool calls. Prefer trips/policies/today before answering anything about the business. If the request is a message to a customer, produce the exact text to send.`;

class Agent {
  constructor(brain) { this.brain = brain; this.tools = tools(brain); this.log = []; }
  get llm() { const m = this.brain.mentor; return m && m.enabled ? m : null; }

  async run(request, { maxSteps = MAX_STEPS } = {}) {
    const started = Date.now(); const steps = []; const names = Object.entries(this.tools).map(([k, t]) => `${k}: ${t.desc}`).join('\n');
    const llm = this.llm;
    let final = null, facts = [], todo = [];
    if (llm) {
      let transcript = `Request from the chief: ${request}`;
      for (let i = 0; i < maxSteps + 1; i++) {
        const out = await llm.json(SYSTEM(names), transcript + (i >= maxSteps ? '\n\nYou are out of tool calls: answer now with "final".' : ''), { maxTokens: 900 });
        if (!out) { final = null; break; }
        if (out.final) { final = String(out.final); facts = Array.isArray(out.facts) ? out.facts.filter(f => typeof f === 'string' && f.length > 8).slice(0, 5) : []; todo = Array.isArray(out.todo) ? out.todo.slice(0, 5) : []; break; }
        const tool = this.tools[out.tool];
        if (!tool) { transcript += `\n\nStep ${i + 1}: unknown tool "${out.tool}". Available: ${Object.keys(this.tools).join(', ')}.`; continue; }
        let result; try { result = await tool.run(out.args || {}); } catch (e) { result = { error: e.message }; }
        const short = JSON.stringify(result).slice(0, 2500);
        steps.push({ thought: out.thought, tool: out.tool, args: out.args || {}, result: JSON.parse(JSON.stringify(result, (k, v) => typeof v === 'string' && v.length > 600 ? v.slice(0, 600) + '…' : v)) });
        transcript += `\n\nStep ${i + 1}: thought: ${out.thought || ''}\ntool ${out.tool}(${JSON.stringify(out.args || {})}) → ${short}`;
      }
    }
    if (final == null) { const r = await this.fallback(request); final = r.final; steps.push(...r.steps); }
    if (facts.length) this.brain.teach(facts.join('\n'), { source: 'agent', importance: 0.8 });
    const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), t: started, request, final, steps, facts, todo, ms: Date.now() - started, model: llm ? llm.status().model : 'rules only' };
    this.log.push(entry); if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
    this.brain.event('agent', `${request.slice(0, 60)} → ${steps.length} step(s), ${facts.length} fact(s), ${entry.ms}ms`);
    return entry;
  }

  /** No model: answer the specific thing asked from the tools, then present it plainly. */
  async fallback(request) {
    const r = String(request).toLowerCase(); const steps = []; const g = this.brain.growth; const P = g.profile;
    const use = async (name, args) => { const result = await this.tools[name].run(args); steps.push({ tool: name, args, result }); return result; };
    const money = (n) => '₹' + Math.round(+n || 0).toLocaleString('en-IN');
    const tripNamed = () => g.upcoming(10).find(t => r.includes(t.name.toLowerCase())) || null;
    const n = +(r.match(/\b(\d{1,2})\s*(?:people|pax|persons|of us|friends|members|log|logon|guys|ppl)\b|\bfor\s+(\d{1,2})\b/) || []).slice(1).find(Boolean) || 0;
    const monthIdx = DEST.monthNum((r.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/) || [])[1]);
    let final;
    const policyKey = /\b(cancel|refund)/.test(r) ? 'cancellation' : /\b(include\w*|inclusion\w*|covered|what do (i|we) get)\b/.test(r) && !/not included|exclu/.test(r) ? 'included' : /\b(not included|exclu|extra)\b/.test(r) ? 'excluded' : /\b(pickup|boarding|start point)\b/.test(r) ? 'pickup' : /\b(safe|safety|women|girls)\b/.test(r) ? 'safety' : /\b(veg|food|jain|meal)\b/.test(r) ? 'food' : /\b(kids?|children|age|senior|parents)\b/.test(r) && /\b(allow|ok|policy|rule|suitable)\b/.test(r) ? 'age' : /\b(review|proof|genuine)\b/.test(r) ? 'proof' : /\b(payment|pay|instal|gst|invoice)\b/.test(r) && !/advance/.test(r) ? 'payment' : null;
    if (/\badvance\b/.test(r) && (tripNamed() || g.upcoming(1)[0])) { const t = tripNamed() || g.upcoming(1)[0]; const adv = g.advance(t); await use('trips', {}); final = `Advance for ${t.name}: ${money(adv)} per person${n ? `, ${money(adv * n)} for ${n}` : ''}. Balance ${money(t.price - adv)} per person${n ? ` (${money((t.price - adv) * n)} total)` : ''} is due 7 days before departure${P.upi ? '. UPI: ' + P.upi : ''}.`; }
    else if (/\b(refund|cancel)/.test(r) && /\b(\d{1,2})\s*days?\b/.test(r)) { const d = +r.match(/\b(\d{1,2})\s*days?\b/)[1]; const p = await use('policies', {}); final = `${d} days before departure: ${d >= 15 ? 'everything except the advance is refunded; the advance stays transferable to another batch within 6 months.' : 'no cash refund, because hotels and transport are already paid; the advance (and the balance if paid) can be transferred to another batch within 6 months or to another traveller.'}\nPolicy: ${p.policies.cancellation}`; }
    else if (policyKey) { const p = await use('policies', {}); final = `${policyKey.charAt(0).toUpperCase() + policyKey.slice(1)}: ${p.policies[policyKey] || 'not set yet (add it in Set up)'}`; }
    else if (/\b(season|in season|good time|best time|weather)\b/.test(r) && DEST.find(r)) { const d = await use('destination', { name: DEST.find(r).name }); const m = monthIdx || new Date().getMonth() + 1; const st = DEST.seasonStatus(d, m); final = `${d.name} in ${DEST.MONTHS[m - 1]}: ${st}. Best months: ${d.season.map(x => DEST.MONTHS[x - 1]).join(', ')}${d.shoulder.length ? '; shoulder: ' + d.shoulder.map(x => DEST.MONTHS[x - 1]).join(', ') : ''}. Risks: ${(d.risks || []).join(', ') || 'none noted'}.`; }
    else if (/\b(visa|document|documents|passport|permit|papers|id proof)\b/.test(r) && DEST.find(r)) { const d = await use('destination', { name: DEST.find(r).name }); const intl = d.country !== 'India'; final = `${d.name} (${d.country}): ${intl ? `passport valid 6 months beyond travel, ${(d.permits || []).join('; ') || 'check visa rules'}, return ticket and hotel confirmation; carry travel insurance.` : `government photo ID for every traveller (Aadhaar or passport; kids: school ID or birth certificate)${(d.permits || []).length ? '; permits: ' + d.permits.join('; ') : ''}.`}`; }
    else if (/\b(seats?|left|worth|how many)\b/.test(r) && (tripNamed() || /\btrip|batch\b/.test(r))) { const trips = await use('trips', {}); const list = tripNamed() ? trips.filter(t => t.name === tripNamed().name) : trips; final = list.length ? list.map(t => `${t.name} ${t.date || ''}: ${t.seatsLeft} seats left of ${t.seats} (${t.booked} booked, ${t.holds} on hold)${/worth|value|revenue/.test(r) ? `, worth ${money(t.seatsLeft * t.price)} if they all sell` : ''}, ${money(t.price)} per person.`).join('\n') : 'No trips set up yet. Add them in Set up.'; }
    else if (/\b(leaving|departing|departures?|trips?) (in|for|this|next)\b|\bwhich trips\b/.test(r)) { const trips = await use('trips', {}); const list = monthIdx ? trips.filter(t => t.date && new Date(t.date).getMonth() + 1 === monthIdx) : trips; final = list.length ? list.map(t => `${t.name}: ${t.date}, ${t.days} days, ${money(t.price)} per person, ${t.seatsLeft} seats left`).join('\n') : (monthIdx ? `No batch in ${DEST.MONTHS[monthIdx - 1]} yet.` : 'No trips set up yet.'); }
    else if (/\b(today|follow[- ]?up|due|pipeline|which lead|who should i)\b/.test(r)) { const t = await use('today', {}); const leads = await use('leads', {}); const open = leads.filter(l => !['lost', 'reviewed', 'travelled'].includes(l.stage)); const order = ['hold', 'advance', 'quoted', 'objection', 'qualified', 'new', 'balance']; const hot = open.sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage))[0]; final = t.due.length ? `${t.due.length} follow-up${t.due.length > 1 ? 's' : ''} due:\n` + t.due.map(d => `• ${d.lead} (${d.trip || 'no trip'}, ${d.stage}, ${d.step}): ${d.message}`).join('\n') : (hot ? `Nothing is due by schedule. Message ${hot.name || hot.id} first: stage "${hot.stage}"${hot.trip ? ' for ' + hot.trip : ''}, the closest to money. ${g.followUp(leads.find(l => l.id === hot.id) ? g.state.leads.find(l => l.id === hot.id) : hot)}` : 'No leads yet. Post today\'s reel and the trip cards; leads come from there.') + (t.alerts.length ? '\nAlerts: ' + t.alerts.join(' ') : ''); }
    else if (/\b(campaign|broadcast|diwali|festival|promotion)\b/.test(r)) { const c = await use('campaigns', {}); final = c.campaigns.map(x => `${x.status === 'run now' ? 'RUN NOW' : 'start ' + x.startBy}: ${x.name}, ${x.pitch}`).join('\n') + '\n\nBroadcasts:\n' + c.broadcasts.map(b => `[${b.segment}] ${b.text}`).join('\n'); }
    else if (/\b(instagram|reel|post|caption|content|google)\b/.test(r)) { const c = await use('content', {}); final = `Bio:\n${c.bio}\n\nThis week:\n${c.week.join('\n')}\n\nCaptions:\n${c.captions.join('\n')}\n\nGoogle posts:\n${c.googlePosts.join('\n')}`; }
    else if (/\b(plan|itinerary|days?|good idea|ok for|suitable)\b/.test(r) && DEST.find(r)) { const p = await use('plan_trip', { requirements: request }); final = `${p.season || ''} ~${money(p.perPerson)} per person\n${(p.itinerary || []).join('\n')}\n${(p.findings || []).join('\n')}\n${(p.fixes || []).join('\n')}`; }
    else if (/\b(lead|customer|wrote|said|replied|whatsapp)\b/.test(r) && /\n|:|"|'/.test(request)) { const msg = (request.match(/["“'‘](.+?)["”'’]/) || [])[1] || request.split(/\n|:/).slice(1).join(' ').trim() || request; const w = await use('whatsapp_reply', { text: msg }); final = `Reply to send:\n${w.reply}\n\n(${w.intent}${w.handoff ? ', needs you' : ''})`; }
    else if (/\b(price|cost|how much|rate)\b/.test(r)) { const trips = await use('trips', {}); const t = tripNamed() || trips[0]; final = t ? `${t.name}: ${money(t.price)} per person${n ? `, ${money(t.price * n)} for ${n}` : ''}, all-inclusive. ${t.seatsLeft} seats left.` : 'No trips set up yet.'; }
    else { const x = await use('recall', { query: request }); final = x.answer; }
    return { final: final + '\n\n(Answered by rules. Connect a language model in Set up for deeper reasoning.)', steps };
  }

  /** The chief corrects an answer: the correction becomes a lesson, and the pairing is remembered for next time. */
  correct(id, correction) {
    const e = this.log.find(x => x.id === id); if (!e) return null;
    e.correction = String(correction || '');
    this.brain.teach(`When asked "${e.request.slice(0, 120)}", the right answer is: ${e.correction.slice(0, 300)}.\n${e.correction}`, { source: 'chief-correction', importance: 1 });
    this.brain.feedback(false, 'agent correction');
    return e;
  }
  approve(id) { const e = this.log.find(x => x.id === id); if (!e) return null; e.approved = true; this.brain.feedback(true, 'agent approved'); if (e.final) this.brain.teach(`A good answer to "${e.request.slice(0, 120)}" was: ${e.final.slice(0, 300)}.`, { source: 'chief-approval', importance: 0.7 }); return e; }
}
module.exports = { Agent, tools, SYSTEM };
