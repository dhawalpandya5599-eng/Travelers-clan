'use strict';
/**
 * connections.js — ways data gets in and out without an API key: lead CSV import (Meta lead forms, Google Forms,
 * any sheet export), a calendar (ICS) of departures for Google Calendar, a generic lead webhook, and a JSON export
 * of the lead sheet for Google Sheets or Excel.
 */
function parseCSV(text) { const rows = []; let row = [], cell = '', q = false; const s = String(text || ''); for (let i = 0; i < s.length; i++) { const c = s[i]; if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; } else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c; } if (cell || row.length) { row.push(cell); rows.push(row); } return rows.filter(r => r.some(x => x.trim())); }
const COLS = { name: /^(full[ _]?name|name|first[ _]?name|customer)/i, phone: /^(phone|phone[ _]?number|mobile|whatsapp|contact)/i, email: /^e-?mail/i, trip: /^(trip|destination|package|interested|which trip)/i, source: /^(source|platform|channel|lead[ _]?source)/i, notes: /^(message|notes?|comments?|requirements?|budget|dates?)/i, created: /^(created|date|time|timestamp)/i };
/** Import leads from a CSV export (Meta lead forms, Google Forms, Sheets). Returns counts. */
function importLeadsCSV(growth, text, { source = 'csv' } = {}) {
  const rows = parseCSV(text); if (rows.length < 2) return { imported: 0, skipped: 0, error: 'need a header row and at least one lead' };
  const head = rows[0].map(h => h.trim()); const idx = {}; for (const [k, re] of Object.entries(COLS)) idx[k] = head.findIndex(h => re.test(h));
  if (idx.phone < 0 && idx.name < 0) return { imported: 0, skipped: rows.length - 1, error: 'no name or phone column found; headers seen: ' + head.join(', ') };
  let imported = 0, skipped = 0;
  for (const r of rows.slice(1)) { const get = (k) => idx[k] >= 0 ? String(r[idx[k]] || '').trim() : ''; const phone = get('phone').replace(/\D/g, ''); const name = get('name'); if (!phone && !name) { skipped++; continue; } const id = phone ? (phone.length === 10 ? '91' + phone : phone) : 'csv-' + name.toLowerCase().replace(/\s+/g, '-'); const existing = growth.state.leads.find(l => l.id === id); const row = { id, name, phone, trip: get('trip'), source: get('source') || source, notes: [get('notes'), get('email')].filter(Boolean).join(' · ') }; if (existing) { growth.updateLead(id, row); skipped++; } else { growth.addLead({ ...row, next: new Date().toISOString() }); imported++; } }
  return { imported, skipped, total: growth.state.leads.length };
}
/** Departures as an ICS calendar: subscribe in Google Calendar or import once. */
function tripsICS(growth) {
  const P = growth.profile; const esc = (s) => String(s || '').replace(/[,;]/g, m => '\\' + m).replace(/\n/g, '\\n'); const d8 = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const ev = growth.upcoming(20).filter(t => t.date).map(t => { const start = new Date(t.date); const end = new Date(start.getTime() + Math.max(1, t.days || 1) * 864e5); return ['BEGIN:VEVENT', `UID:${t.name.toLowerCase().replace(/\s+/g, '-')}-${d8(start)}@travelersclan`, `DTSTAMP:${d8(new Date())}T000000Z`, `DTSTART;VALUE=DATE:${d8(start)}`, `DTEND;VALUE=DATE:${d8(end)}`, `SUMMARY:${esc(t.name)} batch · ${t.booked || 0}/${t.seats || '?'} booked`, `DESCRIPTION:${esc(`₹${t.price} per person, ${growth.seatsLeft(t)} seats left. Balance due ${new Date(start.getTime() - 7 * 864e5).toDateString()}. Pickup shared 3 days before.`)}`, 'END:VEVENT'].join('\r\n'); });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${esc(P.name)}//ATLAS//EN`, `X-WR-CALNAME:${esc(P.name)} departures`, ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
/** Lead sheet as CSV for Google Sheets or Excel. */
function leadsCSV(growth) { const cols = ['id', 'name', 'phone', 'trip', 'stage', 'source', 'value', 'touches', 'created', 'next', 'notes']; const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; return cols.join(',') + '\n' + growth.state.leads.map(l => cols.map(c => q(c === 'created' || c === 'next' ? (l[c] ? new Date(l[c]).toISOString() : '') : l[c])).join(',')).join('\n') + '\n'; }
/** Generic webhook payload (Meta lead form relay, Zapier, Make, a form on the site) → a lead. */
function webhookLead(growth, body) { const b = body || {}; const f = (k) => b[k] || (b.field_data || []).find(x => new RegExp(k, 'i').test(x.name || ''))?.values?.[0] || ''; const phone = String(f('phone') || f('phone_number') || f('whatsapp') || '').replace(/\D/g, ''); const name = String(f('name') || f('full_name') || ''); if (!phone && !name) return { error: 'no name or phone' }; const id = phone ? (phone.length === 10 ? '91' + phone : phone) : 'web-' + Date.now().toString(36); const lead = growth.addLead({ id, name, phone, trip: String(f('trip') || f('destination') || ''), source: String(b.source || b.platform || 'webhook'), notes: String(f('message') || f('notes') || ''), next: new Date().toISOString() }); return { ok: true, id: lead.id }; }
module.exports = { parseCSV, importLeadsCSV, tripsICS, leadsCSV, webhookLead };
