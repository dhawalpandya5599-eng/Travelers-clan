'use strict';
/**
 * risk.js — the news desk's memory: dated advisories about places, with their impact on travel.
 * Seeded with standing knowledge; grows from pasted headlines, RSS feeds (local server) and the chief.
 * Every item: { where, country, headline, kind, severity, date, impact, advice, source }
 *   kind: weather | political | security | visa | transport | health | event
 */
const KINDS = [
  ['weather', /\b(monsoon|cyclone|typhoon|flood|landslide|snow|storm|heatwave|rain|avalanche|cloudburst)\b/i],
  ['security', /\b(terror|attack|unrest|curfew|protest|riot|shooting|kidnap|strike|clash|violence|bandh)\b/i],
  ['political', /\b(election|coup|sanction|border|tension|war|ceasefire|diplomatic|advisory|government)\b/i],
  ['visa', /\b(visa|e-visa|entry|permit|passport|immigration)\b/i],
  ['transport', /\b(flight|airline|airport|highway|road closed|closure|ferry|train|cancell)\b/i],
  ['health', /\b(outbreak|virus|dengue|malaria|vaccin|health|hospital|epidemic)\b/i],
  ['event', /\b(festival|eid|diwali|new year|holiday|match|concert|summit|marathon)\b/i],
];
const SEVERITY = [['high', /\b(war|terror|attack|curfew|evacuat|ban|closed|do not travel|avoid all|cyclone|earthquake|coup)\b/i], ['medium', /\b(unrest|protest|strike|flood|landslide|advisory|delay|cancell|outbreak|tension)\b/i]];

const SEED = [
  { where: 'Ladakh', country: 'India', headline: 'Manali-Leh and Srinagar-Leh highways close with winter snow', kind: 'transport', severity: 'medium', date: '2026-10-01', impact: 'Road access to Leh is unreliable from November to May; fly in.', advice: 'Book flights to Leh for off-season dates and keep a buffer day.', source: 'standing' },
  { where: 'Kashmir', country: 'India', headline: 'Security situation in Kashmir can change at short notice', kind: 'security', severity: 'medium', date: '2026-10-01', impact: 'Occasional restrictions on movement and internet.', advice: 'Check advisories a week before departure; keep flexible dates and a written refund clause.', source: 'standing' },
  { where: 'Kerala', country: 'India', headline: 'South-west monsoon brings heavy rain and landslides in the Western Ghats', kind: 'weather', severity: 'medium', date: '2026-10-01', impact: 'Munnar and Wayanad roads can close June to August.', advice: 'Avoid hill sections in peak monsoon; houseboats run year round.', source: 'standing' },
  { where: 'Sikkim', country: 'India', headline: 'Landslides on North Sikkim roads during monsoon', kind: 'weather', severity: 'medium', date: '2026-10-01', impact: 'Lachung and Gurudongmar access can be cut June to September.', advice: 'Plan North Sikkim for October to May.', source: 'standing' },
  { where: 'Bali', country: 'Indonesia', headline: 'Mount Agung and nearby volcanoes issue periodic alerts', kind: 'weather', severity: 'low', date: '2026-10-01', impact: 'Rare airport disruptions when alert levels rise.', advice: 'Travel insurance with trip interruption cover.', source: 'standing' },
  { where: 'Thailand', country: 'Thailand', headline: 'Andaman coast monsoon closes island boats May to October', kind: 'weather', severity: 'medium', date: '2026-10-01', impact: 'Phi Phi and Similan trips cancel in rough seas.', advice: 'Use the Gulf side (Koh Samui) in those months.', source: 'standing' },
  { where: 'Vietnam', country: 'Vietnam', headline: 'Typhoon season hits central Vietnam September to November', kind: 'weather', severity: 'medium', date: '2026-10-01', impact: 'Da Nang and Hoi An can flood; flights delay.', advice: 'Prefer north and south in those months, or keep a buffer.', source: 'standing' },
  { where: 'Nepal', country: 'Nepal', headline: 'Monsoon landslides and flight delays to Pokhara June to September', kind: 'weather', severity: 'medium', date: '2026-10-01', impact: 'Mountain views hidden; roads slow.', advice: 'Plan October to November or March to April.', source: 'standing' },
  { where: 'Dubai', country: 'UAE', headline: 'Summer heat above 45 degrees June to September', kind: 'weather', severity: 'low', date: '2026-10-01', impact: 'Outdoor plans shift to evenings.', advice: 'Sell November to March; indoor itineraries in summer.', source: 'standing' },
  { where: 'Georgia', country: 'Georgia', headline: 'Mountain road to Kazbegi closes in heavy snow', kind: 'transport', severity: 'low', date: '2026-10-01', impact: 'Winter day trips can cancel.', advice: 'Keep Kazbegi as a flexible day.', source: 'standing' },
  { where: 'Middle East', country: 'Region', headline: 'Regional tensions can disrupt Gulf airspace and transit flights', kind: 'political', severity: 'medium', date: '2026-10-01', impact: 'Transit via Gulf hubs may reroute or delay.', advice: 'Book direct flights where possible; insure for disruption.', source: 'standing' },
];

class RiskDesk {
  constructor(state) { this.items = SEED.slice(); this.updated = SEED[0].date; if (state) this.load(state); }
  classify(headline) {
    const kind = (KINDS.find(([, re]) => re.test(headline)) || ['event'])[0];
    const severity = (SEVERITY.find(([, re]) => re.test(headline)) || ['low'])[0];
    return { kind, severity };
  }
  /** Add a headline; place is detected from the text when not given. */
  add({ headline, where, country, date, impact, advice, source = 'news' }) {
    const DEST = require('./destinations');
    const d = where ? null : DEST.find(headline);
    const w = where || (d ? d.name : null) || (headline.match(/\b(India|Nepal|Bhutan|Thailand|Vietnam|Bali|Indonesia|Dubai|UAE|Georgia|Maldives|Sri Lanka|Singapore|Europe|Middle East|Kashmir|Ladakh|Kerala|Goa|Himachal|Sikkim|Meghalaya)\b/i) || [])[1];
    if (!w) return null;
    const { kind, severity } = this.classify(headline);
    const item = { where: w, country: country || (d ? d.country : w), headline: headline.trim().slice(0, 200), kind, severity, date: date || new Date().toISOString().slice(0, 10), impact: impact || `${kind} risk for travel to ${w}.`, advice: advice || (severity === 'high' ? 'Pause bookings and contact booked travelers.' : 'Tell travelers and keep flexible dates.'), source };
    if (this.items.some(i => i.headline.toLowerCase() === item.headline.toLowerCase())) return null;
    this.items.push(item); this.updated = item.date; if (this.items.length > 400) this.items.shift();
    return item;
  }
  /** Ingest free text: one headline per line. Returns added items. */
  ingest(text, source = 'news') { return String(text).split(/\n+/).map(l => l.replace(/^[-*\d.\s]+/, '').trim()).filter(l => l.length > 15).map(l => this.add({ headline: l, source })).filter(Boolean); }
  relevant(place, country, { maxAgeDays = 120 } = {}) {
    const since = Date.now() - maxAgeDays * 864e5;
    const p = String(place || '').toLowerCase(), c = String(country || '').toLowerCase();
    const GROUPS = { 'middle east': /uae|dubai|qatar|saudi|oman|kuwait|bahrain/ };
    return this.items.filter(i => new Date(i.date).getTime() >= since && (!place
      || i.where.toLowerCase() === p
      || (c && c !== 'india' && i.country.toLowerCase() === c && i.where.toLowerCase() === c)
      || (GROUPS[i.where.toLowerCase()] && GROUPS[i.where.toLowerCase()].test(c + ' ' + p))))
      .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity]) || (b.date > a.date ? 1 : -1));
  }
  dump() { return { items: this.items.filter(i => i.source !== 'standing'), updated: this.updated }; }
  load(s) { for (const i of s.items || []) if (!this.items.some(x => x.headline === i.headline)) this.items.push(i); this.updated = s.updated || this.updated; }
}
module.exports = { RiskDesk, SEED };
