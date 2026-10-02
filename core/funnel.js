'use strict';
/**
 * funnel.js — what OYE learns from journeys: where deals are, what to do next, and why deals die.
 *
 *  - detectStage(transcript): which funnel stage a conversation is at, from the last few messages.
 *  - Funnel.train(journeys): for every (traveler type, stage, action) the downstream booking rate, revenue,
 *    and completion; for every loss reason its frequency per type; stage drop-offs.
 *  - Funnel.best(type, stage): the action with the best outcome, with evidence counts (falls back to all types).
 *  - Funnel.lessons(): teachable sentences ("For families, answering an objection with proof converts best").
 */
const STAGE_CUES = [
  ['advance', /\b(payment link|how do we pay|how to pay|send (the )?link|pay now|paid|advance)\b/i],
  ['negotiation', /\b(discount|cheaper|best price|final price|negotiat|can you do|lower|offer)\b/i],
  ['objection', /\b(safe|hidden|veg|jain|walking|altitude|private or group|approval|invoice|gst|wifi|too expensive|expensive|is it|what about|concern|worried|but )\b/i],
  ['quoted', /\b(per person|per head|all inclusive|itinerary|pdf|quote|quotation|price is|costs?)\b/i],
  ['qualified', /\b(\d+\s*(of us|people|pax|persons|adults)|budget|dates?|in (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i],
  ['enquiry', /./],
];
function detectStage(transcript) {
  const lines = (Array.isArray(transcript) ? transcript.map(m => (typeof m === 'string' ? m : m.text)) : String(transcript).split(/\n+/)).map(l => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] || ''; const lastIsClan = /^clan:/i.test(last);
  const lead = lines.filter(l => !/^clan:/i.test(l)).map(l => l.replace(/^lead:\s*/i, ''));
  const lastLead = lead[lead.length - 1] || '';
  const clanQuoted = lines.some(l => /^clan:/i.test(l) && /\b(per person|per head|all inclusive|itinerary|pdf|price|quote)\b/i.test(l));
  if (/\b(payment link|how do we pay|how to pay|send (the )?link|pay now|paid|lets do it|let's do it|book it|confirm)\b/i.test(lastLead)) return 'advance';
  if (/\b(discount|cheaper|best price|final price|negotiat|can you do|lower|any offer)\b/i.test(lastLead)) return 'negotiation';
  if (/\b(hmm|but|is it|what about|concern|worried|safe|hidden|veg|jain|walking|altitude|private or group|approval|invoice|gst|wifi|expensive|too much|cold|certification|refund|cancel)\b/i.test(lastLead) && (clanQuoted || lead.length > 1)) return 'objection';
  if (clanQuoted) return 'quoted';
  const info = [/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\bweekend\b|\d{1,2}\/\d{1,2}/i, /\b\d{1,3}\s*(of us|people|pax|persons|adults|friends|members|employees)\b|\b(couple|solo|alone|my wife|my husband|my parents)\b/i, /\bbudget\b|\d{2,3}\s*k\b|\d{4,7}|lakh/i].filter(re => re.test(lead.join(' '))).length;
  if (info >= 2) return 'qualified';
  return 'enquiry';
}

class Funnel {
  constructor(state) { this.stats = {}; this.losses = {}; this.drop = {}; this.n = 0; if (state) this.load(state); }
  key(type, stage, action) { return `${type}|${stage}|${action}`; }
  train(journeys) {
    for (const j of journeys) {
      this.n++;
      const booked = j.outcome === 'booked' ? 1 : 0, done = j.balancePaid ? 1 : 0;
      const potential = (j.person.requirements.budgetPerPerson || 1) * (j.person.requirements.groupSize || 1);
      const rev = Math.min(1.5, j.revenue / potential); // share of this lead's own potential we captured (mix-independent)
      for (const s of j.steps) for (const type of [j.person.type, '*']) {
        const k = this.key(type, s.stage, s.action);
        const st = this.stats[k] || (this.stats[k] = { n: 0, booked: 0, done: 0, revenue: 0, referred: 0, reviewed: 0 });
        st.n++; st.booked += booked; st.done += done; st.revenue += rev; st.referred += j.referred ? 1 : 0; st.reviewed += j.reviewed ? 1 : 0;
      }
      if (j.outcome !== 'booked' && j.lostWhy) for (const type of [j.person.type, '*']) { const L = this.losses[type] || (this.losses[type] = {}); L[j.lostWhy] = (L[j.lostWhy] || 0) + 1; }
      for (const type of [j.person.type, '*']) { const D = this.drop[type] || (this.drop[type] = {}); const reached = new Set(j.steps.map(s => s.stage)); for (const st of reached) D[st] = (D[st] || 0) + 1; }
    }
    return this;
  }
  options(type, stage) {
    const rows = Object.entries(this.stats).filter(([k]) => k.startsWith(`${type}|${stage}|`)).map(([k, v]) => ({ action: k.split('|')[2], n: v.n, rate: v.n ? v.booked / v.n : 0, done: v.n ? v.done / v.n : 0, revenue: v.n ? v.revenue / v.n : 0, referred: v.n ? v.referred / v.n : 0, reviewed: v.n ? (v.reviewed || 0) / v.n : 0 }));
    // Objective per stage: before booking, expected revenue per lead (bookings × what they pay, net of discounts);
    // after booking, completion, then reviews and referrals (the cheapest future bookings).
    const value = (r) => ({ balance: r.done, travelled: r.reviewed + r.referred, reviewed: r.reviewed, referred: r.referred }[stage] ?? r.revenue);
    return rows.sort((a, b) => value(b) - value(a) || b.rate - a.rate);
  }
  best(type, stage) {
    let rows = this.options(type, stage).filter(r => r.n >= 15);
    if (!rows.length) rows = this.options('*', stage).filter(r => r.n >= 15);
    return rows.length ? { ...rows[0], alternatives: rows.slice(1, 3), evidence: rows.reduce((a, r) => a + r.n, 0) } : null;
  }
  lossReasons(type = '*') { const L = this.losses[type] || {}; const tot = Object.values(L).reduce((a, b) => a + b, 0) || 1; return Object.entries(L).map(([why, n]) => ({ why, n, share: n / tot })).sort((a, b) => b.n - a.n); }
  dropoff(type = '*') { const D = this.drop[type] || {}; const order = ['enquiry', 'qualified', 'quoted', 'objection', 'negotiation', 'advance', 'balance', 'travelled', 'reviewed', 'referred']; return order.filter(s => D[s]).map(s => ({ stage: s, reached: D[s] })); }
  lessons() {
    const out = []; const said = (t) => t.replace(/_/g, ' ');
    const types = [...new Set(Object.keys(this.stats).map(k => k.split('|')[0]))].filter(t => t !== '*');
    const STAGE_WORD = { enquiry: 'at the enquiry stage', qualified: 'after qualifying', quoted: 'after quoting', objection: 'when they object', negotiation: 'while negotiating', advance: 'at the advance step', balance: 'for the balance payment', travelled: 'during the trip', reviewed: 'for reviews', referred: 'for referrals' };
    for (const stage of Object.keys(STAGE_WORD)) {
      const b = this.best('*', stage); if (!b) continue;
      out.push(`The best action ${STAGE_WORD[stage]} is ${said(b.action)}.`);
      const alt = b.alternatives[0];
      if (alt && b.rate > 0 && ['enquiry', 'qualified', 'quoted', 'objection', 'negotiation', 'advance'].includes(stage)) out.push(`${said(b.action)[0].toUpperCase() + said(b.action).slice(1)} ${STAGE_WORD[stage]} books ${Math.round(b.rate * 100)} percent and captures ${Math.round(b.revenue * 100)} percent of lead value versus ${Math.round(alt.rate * 100)} percent and ${Math.round(alt.revenue * 100)} percent for ${said(alt.action)}.`);
      if (alt && stage === 'travelled') out.push(`${said(b.action)[0].toUpperCase() + said(b.action).slice(1)} during the trip gets ${Math.round(b.reviewed * 100)} percent reviews and ${Math.round(b.referred * 100)} percent referrals versus ${Math.round(alt.reviewed * 100)} and ${Math.round(alt.referred * 100)} for ${said(alt.action)}.`);
    }
    for (const type of types) {
      for (const stage of ['enquiry', 'qualified', 'objection', 'negotiation']) {
        const rows = this.options(type, stage).filter(r => r.n >= 15); if (rows.length < 2) continue;
        out.push(`For ${type} customers the best action ${STAGE_WORD[stage]} is ${said(rows[0].action)}.`);
      }
      const L = this.lossReasons(type); if (L.length) out.push(`${type[0].toUpperCase() + type.slice(1)} customers are most often lost because of ${L[0].why}.`);
    }
    const L = this.lossReasons('*'); if (L.length) out.push(`The most common reason a lead is lost is ${L[0].why}.`, `The second most common reason a lead is lost is ${L[1] ? L[1].why : L[0].why}.`);
    return out;
  }
  dump() { return { stats: this.stats, losses: this.losses, drop: this.drop, n: this.n }; }
  load(s) { this.stats = s.stats || {}; this.losses = s.losses || {}; this.drop = s.drop || {}; this.n = s.n || 0; }
}
module.exports = { Funnel, detectStage };
