'use strict';
/**
 * strategy.js — business techniques, pricing strategies, pricing analytics, pattern finding and news reading for a
 * small group-travel company. Everything is explicit so the chief can read the reasoning.
 */
const money = (n) => '₹' + Math.round(+n || 0).toLocaleString('en-IN');

/** Business techniques, indexed by the situation they fix. */
const TECHNIQUES = {
  'no leads': [['Organiser offer', 'one free seat per 10 paid to colleges, HR, societies; one organiser fills a bus'], ['Google Business Profile', '20 reviews in 30 days, weekly post with date and price'], ['Reel a day', 'faces, date and price on screen, 7 to 9pm'], ['Referral link', 'both sides 5% off; past travellers are the cheapest channel'], ['20 concrete messages a day', '"6 seats left for Goa 12 Dec, hold two?" never "please support"']],
  'low conversion': [['Reply in 2 minutes', 'speed beats cleverness; the first to reply wins'], ['One price, one next step', 'every reply ends with "reply hold"'], ['24-hour hold without advance', 'moves fence-sitters without a discount'], ['Pay in parts', 'advance plus two instalments'], ['Social proof on day 3', 'a traveller screenshot or voice note'], ['Inclusion-match offer', 'against cheaper quotes: match line by line, never cut first']],
  'cancellations': [['Transferable advance', 'to any batch within 6 months, written in the policy'], ['Balance 7 days before', 'the trip runs only when the balance is in'], ['Confirmation in 5 minutes', 'after payment, with the group link'], ['Pre-trip WhatsApp group', 'opened 7 days before; people who have met do not cancel']],
  'low fill': [['Launch 6 weeks out', 'fixed dates, visible seat count'], ['Past-traveller early access', '48 hours before public'], ['Push or merge at 10 days', 'under half full: 48-hour push, then merge with a free upgrade'], ['Festival calendar', 'start campaigns 5 weeks before each window']],
  'low margin': [['Price at 20% margin on ground cost', 'rounded to 500'], ['Added value not discounts', 'bonfire, pickup, upgrade'], ['Organiser seat instead of group discount', 'costs one seat, fills ten'], ['Vendor contracts in writing', '25% to block, balance on check-in']],
  'bad reviews': [['Reply within 24 hours', 'acknowledge the praised part, fix the fault, invite a call'], ['Founder call in 24 hours', 'for every 1 or 2 star'], ['Incident log', 'same day, with what changed']],
  'seasonality': [['Counter-season products', 'monsoon treks, winter deserts, summer hills'], ['Workations', 'monthly stays in shoulder months'], ['Corporate offsites', 'January to March and October to November']],
  'competition': [['Captain as the difference', 'a person travels with every batch'], ['Inclusion transparency', 'carousel of what the price includes'], ['Niche batches', 'women-only, seniors, students, photographers'], ['Reviews as moat', 'every traveller asked the next day']],
  'cash flow': [['Advances in a separate account', 'not revenue until the trip runs'], ['Vendor payments after written quotes', 'and after the batch is confirmed'], ['Monthly report', 'leads, bookings, revenue, margin per batch']],
  'growth': [['One full bus first', 'proof before scale'], ['Repeat travellers', 'cost nothing to acquire; early access and referral'], ['Partner channels', 'colleges, HR, societies, cafes'], ['Fixed departures over custom', 'custom trips eat time; fixed batches scale']],
};
function techniques(situation) { const s = String(situation || '').toLowerCase(); const keys = Object.keys(TECHNIQUES).filter(k => s.includes(k) || s.includes(k.split(' ')[1] || '~') || ({ leads: 'no leads', convert: 'low conversion', conversion: 'low conversion', cancel: 'cancellations', fill: 'low fill', empty: 'low fill', margin: 'low margin', profit: 'low margin', review: 'bad reviews', season: 'seasonality', competitor: 'competition', competition: 'competition', cash: 'cash flow', grow: 'growth', scale: 'growth' })[Object.keys({ leads: 1, convert: 1, conversion: 1, cancel: 1, fill: 1, empty: 1, margin: 1, profit: 1, review: 1, season: 1, competitor: 1, competition: 1, cash: 1, grow: 1, scale: 1 }).find(w => s.includes(w)) || ''] === k); const picked = keys.length ? keys : ['growth']; return picked.map(k => ({ situation: k, moves: TECHNIQUES[k] })); }

/** Pricing strategies: a price ladder and the rules for when to move. */
function priceStrategy({ cost, price, competitor, seats, booked = 0, daysOut = 45, demand = 'normal' }) {
  const base = price || Math.round((cost / 0.8) / 500) * 500; const left = Math.max(0, (seats || 0) - booked); const fill = seats ? booked / seats : 0;
  const ladder = [{ tier: 'Early bird (first 30% of seats, until 4 weeks out)', price: Math.round(base * 0.93 / 100) * 100, why: 'rewards the people who make the batch real; anchors the full price' }, { tier: 'Standard', price: base, why: 'the price on the website and in every reply' }, { tier: 'Last 3 seats', price: base, why: 'never discount the last seats; scarcity sells them; add value (room upgrade) instead' }, { tier: 'Premium (private room, front seats, airport pickup)', price: Math.round(base * 1.25 / 100) * 100, why: 'a decoy that makes standard look right and catches spenders' }];
  const rules = [];
  if (competitor && competitor < base) rules.push(`Competitor at ${money(competitor)}: do not cut; lead with inclusions and the captain, offer inclusion-match, then a 24-hour hold.`);
  if (daysOut <= 10 && fill < 0.5) rules.push('Under half full inside 10 days: push 48 hours (past travellers, hold without advance), then merge. A price cut now loses margin on every seat and trains customers to wait.');
  if (fill >= 0.8 && daysOut > 14) rules.push('Over 80% full with 2+ weeks left: raise the next batch by 5 to 8% and open a waitlist.');
  if (demand === 'high') rules.push('High demand: open a second batch, do not raise the price mid-sale (breaks trust in a WhatsApp market).');
  if (cost) rules.push(`Floor: never below ${money(Math.round(cost * 1.1 / 100) * 100)} (10% over ground cost); margin at standard is ${Math.round(100 * (base - cost) / base)}%.`);
  rules.push('Group: organiser free per 10 paid; never a percentage discount. Pay in parts beats a discount for price-sensitive buyers.');
  return { base, left, fill: Math.round(fill * 100), ladder, rules };
}
/** Pricing analytics from the trips and the lead sheet. */
function priceAnalytics(trips, leads, dest) {
  const rows = trips.map(t => { const d = dest.find(t.name); const days = t.days || (d && d.idealDays) || 1; const perDay = Math.round((t.price || 0) / days); const bench = d ? d.costPerDay : null; const fill = t.seats ? Math.round(100 * (t.booked || 0) / t.seats) : 0; const quoted = leads.filter(l => (l.trip || '').toLowerCase() === t.name.toLowerCase()); const booked = quoted.filter(l => ['advance', 'balance', 'travelled', 'reviewed'].includes(l.stage)).length; const lost = quoted.filter(l => l.stage === 'lost').length; return { trip: t.name, price: t.price, perDay, benchmarkCostPerDay: bench, impliedMargin: bench ? Math.round(100 * (perDay - bench) / perDay) : null, fill, leads: quoted.length, booked, lost, quoteToBook: quoted.length ? Math.round(100 * booked / quoted.length) : null, revenue: (t.booked || 0) * (t.price || 0), open: Math.max(0, (t.seats || 0) - (t.booked || 0)) * (t.price || 0) }; });
  const notes = [];
  for (const r of rows) { if (r.impliedMargin != null && r.impliedMargin < 15) notes.push(`${r.trip}: implied margin ${r.impliedMargin}% is thin; price per day ${money(r.perDay)} vs ground ${money(r.benchmarkCostPerDay)}.`); if (r.impliedMargin != null && r.impliedMargin > 35) notes.push(`${r.trip}: implied margin ${r.impliedMargin}% is high; expect price objections, add visible value.`); if (r.quoteToBook != null && r.leads >= 5 && r.quoteToBook < 20) notes.push(`${r.trip}: only ${r.quoteToBook}% of quoted leads book; the price or the reply is the problem, test pay-in-parts before any cut.`); if (r.fill >= 80) notes.push(`${r.trip}: ${r.fill}% full; raise the next batch 5 to 8%.`); }
  return { rows, notes };
}
/** Patterns in the lead sheet and chat log. */
function patterns(leads, log) {
  const by = (arr, f) => { const m = {}; for (const x of arr) { const k = f(x); if (k == null) continue; m[k] = (m[k] || 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const hour = (t) => new Date(t + 5.5 * 3600e3).getUTCHours();
  const dow = (t) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(t + 5.5 * 3600e3).getUTCDay()];
  const booked = leads.filter(l => ['advance', 'balance', 'travelled', 'reviewed', 'hold'].includes(l.stage));
  const out = { leadsByHour: by(leads, l => hour(l.created)), leadsByDay: by(leads, l => dow(l.created)), leadsBySource: by(leads, l => l.source), bookedBySource: by(booked, l => l.source), stageFunnel: by(leads, l => l.stage), tripDemand: by(leads, l => l.trip || 'unspecified'), touchesToBook: booked.length ? +(booked.reduce((s, l) => s + (l.touches || 0), 0) / booked.length).toFixed(1) : null, intents: by(log || [], x => x.intent), languages: by(leads, l => l.language) };
  const findings = [];
  if (out.leadsByHour[0]) findings.push(`Most enquiries come at ${out.leadsByHour[0][0]}:00 IST; be at the phone then.`);
  if (out.leadsByDay[0]) findings.push(`Busiest day: ${out.leadsByDay[0][0]}; post reels the evening before.`);
  const src = out.leadsBySource.map(([s, n]) => { const b = (out.bookedBySource.find(([x]) => x === s) || [s, 0])[1]; return [s, n, b, n ? Math.round(100 * b / n) : 0]; });
  const best = src.filter(x => x[1] >= 3).sort((a, b) => b[3] - a[3])[0]; if (best) findings.push(`Best converting source: ${best[0]} (${best[3]}% of ${best[1]} leads); put more effort there.`);
  const worst = src.filter(x => x[1] >= 5).sort((a, b) => a[3] - b[3])[0]; if (worst && worst[3] < 10) findings.push(`${worst[0]} brings leads that rarely book (${worst[3]}%); qualify harder or stop.`);
  const lost = out.stageFunnel.find(([s]) => s === 'lost'); if (lost && leads.length && lost[1] / leads.length > 0.4) findings.push(`${Math.round(100 * lost[1] / leads.length)}% of leads are lost; check the day-3 follow-up and the price objection reply.`);
  if (out.tripDemand[0] && out.tripDemand[0][0] !== 'unspecified') findings.push(`Most asked trip: ${out.tripDemand[0][0]} (${out.tripDemand[0][1]} leads); open a second batch if it is over 80% full.`);
  if (out.touchesToBook) findings.push(`Bookings take ${out.touchesToBook} messages on average; a lead that goes quiet after 2 is not lost yet.`);
  if (!findings.length) findings.push('Not enough real leads yet to see patterns; the first 30 real conversations will show the hours, the sources and the objections that matter.');
  return { ...out, findings };
}
/** News reading: paste headlines or an article; get affected destinations, severity, and the action. */
function readNews(text, dest, risk) {
  const items = String(text || '').split(/\n+/).map(l => l.trim()).filter(l => l.length > 15);
  const out = [];
  for (const line of items) {
    const low = line.toLowerCase(); const d = dest.find(line);
    const sev = /\b(curfew|war|attack|evacuat|cyclone|earthquake|flood|landslide|closed|banned|strike|riot|outbreak|crash)\b/.test(low) ? 'high' : /\b(delay|protest|rain|snow|heat ?wave|advisory|cancel|fare hike|surge|visa (rule|change)|fee)\b/.test(low) ? 'medium' : /\b(visa free|opens|reopen|new flight|new route|festival|discount|cheaper|record)\b/.test(low) ? 'opportunity' : 'low';
    const action = sev === 'high' ? 'Message every booked traveller on affected batches within the hour; confirm the plan 72 hours before departure; advance stays transferable.' : sev === 'medium' ? 'Watch; tell the captain; add a buffer day if within 2 weeks of departure.' : sev === 'opportunity' ? 'Marketing: post it today with a trip that benefits; open a batch if demand follows.' : 'Log only.';
    const topic = /visa/.test(low) ? 'visa' : /flight|airline|airport|fare/.test(low) ? 'flights' : /weather|rain|snow|cyclone|heat|flood/.test(low) ? 'weather' : /road|highway|pass|landslide/.test(low) ? 'roads' : /curfew|protest|strike|riot|war|attack/.test(low) ? 'security' : /fuel|price|inflation|rupee|dollar/.test(low) ? 'costs' : 'general';
    out.push({ headline: line, destination: d ? d.name : null, severity: sev, topic, action });
  }
  const added = risk ? risk.ingest(items.filter((l, i) => out[i].severity === 'high' || out[i].severity === 'medium').join('\n'), 'news-reading') : [];
  return { items: out, logged: added.length, summary: out.length ? `${out.filter(x => x.severity === 'high').length} high, ${out.filter(x => x.severity === 'medium').length} medium, ${out.filter(x => x.severity === 'opportunity').length} opportunities.` : 'No headlines found.' };
}
/** The 5W1H brief for a destination or a trip. */
function fiveW(d, { month, days, n, budget, activities = [] } = {}) {
  if (!d) return null; const DEST = require('./destinations'); const st = month ? DEST.seasonStatus(d, month) : null;
  return {
    what: `${d.name}, ${d.country}: ${(d.highlights || []).join(', ')}.`,
    why: `Because of ${(d.highlights || [])[0] || 'the place'}${st ? ` and it is ${st} in ${DEST.MONTHS[month - 1]}` : ''}; ${d.idealDays} days is ideal, ${d.minDays} the minimum.`,
    who: `Kids: ${d.kids}. Seniors: ${d.seniors}. Best for: ${activities.map(a => a.who).filter(Boolean).join(', ').split(', ').filter((v, i, a) => a.indexOf(v) === i).slice(0, 4).join(', ') || 'groups and couples'}.`,
    where: `Hub ${d.hub}; altitude ${d.altitude} to ${d.maxAltitude} m. Route: ${(d.route || []).join(' → ')}.`,
    when: `Season months ${d.season.map(m => DEST.MONTHS[m - 1].slice(0, 3)).join(', ')}${d.shoulder.length ? '; shoulder ' + d.shoulder.map(m => DEST.MONTHS[m - 1].slice(0, 3)).join(', ') : ''}.`,
    whom: `Permits or entry: ${(d.permits || []).join('; ') || 'none'}. Risks: ${(d.risks || []).join(', ') || 'none noted'}.`,
    which: activities.length ? 'Things to do: ' + activities.slice(0, 5).map(a => `${a.name} (${a.start}, ${a.hours}h${a.cost ? ', ' + money(a.cost) : ', free'})`).join('; ') : 'Things to do: see the route.',
    how: `Ground cost about ${money(d.costPerDay)} per person per day; ${days || d.idealDays} days ≈ ${money(d.costPerDay * (days || d.idealDays))} ground, sell near ${money(Math.round(d.costPerDay * (days || d.idealDays) / 0.8 / 500) * 500)}${n ? ` per person, ${money(Math.round(d.costPerDay * (days || d.idealDays) / 0.8 / 500) * 500 * n)} for ${n}` : ''}${budget ? (budget < d.costPerDay * (days || d.idealDays) / 0.8 ? `; budget ${money(budget)} is tight, trim days or stay category` : `; fits a ${money(budget)} budget`) : ''}.`,
  };
}
module.exports = { TECHNIQUES, techniques, priceStrategy, priceAnalytics, patterns, readNews, fiveW };
