'use strict';
/**
 * pack.js — the captain's trip pack: one document per departure that gathers what the desks know.
 * Entry (visa or permit), the journey and driving days, local intelligence, the pre-departure brief, the
 * readiness flags from the board, who is booked, and the emergency numbers. Built from the other modules; no new facts.
 */
const RT = require('./routing'); const LC = require('./local'); const DEST = require('./destinations');
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
function pack(brain, tripName) {
  const g = brain.growth; const P = g.profile; const t = g.profile.trips.find(x => x.name.toLowerCase() === String(tripName || '').toLowerCase()) || g.upcoming(10).find(x => new RegExp(String(tripName || ''), 'i').test(x.name)) || g.upcoming(1)[0];
  if (!t) return 'No trip to pack yet; add one in Set up.';
  const d = DEST.find(t.name); const rule = brain.visa.rule(t.name); const tl = rule ? brain.visa.timeline(rule, t.date) : null; const route = RT.route(t.name); const local = LC.place(t.name);
  const board = g.tripBoard().trips.find(r => r.name === t.name) || { flags: [], booked: t.booked || 0, left: g.seatsLeft(t) };
  const booked = g.state.leads.filter(l => l.trip && l.trip.toLowerCase() === t.name.toLowerCase() && ['advance', 'balance', 'hold'].includes(l.stage));
  const V = require('./visa');
  const S = [];
  S.push(`${P.name} · TRIP PACK · ${t.name}${t.date ? ' · ' + fmtDate(t.date) : ''}${t.days ? ' · ' + t.days + ' days' : ''} · ₹${(t.price || 0).toLocaleString('en-IN')} per person`);
  S.push(`Seats: ${board.booked} booked of ${t.seats || '?'}, ${board.left} left. Captain: ${t.captain || '{assign}'}. Hotel: ${t.hotel || '{confirm}'}. Pickup: ${t.pickup || '{set point and time}'}. Group link: ${t.groupLink || '{create}'}.`);
  if (board.flags.length) S.push('Open items: ' + board.flags.join('; ') + '.');
  S.push('');
  S.push(`1. ENTRY · ${rule ? (rule.region || rule.country) + ': ' + V.TYPE_WORDS[rule.type] : 'check'}${tl && tl.leadDays ? ` · apply by ${tl.applyBy}` : ''}`);
  if (rule) { S.push(`   Fee: ${rule.fee ? '₹' + rule.fee.toLocaleString('en-IN') + ' per person, ' + rule.feeNote : rule.feeNote}. ${rule.apply}${rule.url ? ' · ' + rule.url : ''}.`); S.push('   Documents: ' + rule.docs.join('; ') + '.'); if (rule.tips.length) S.push('   Traps: ' + rule.tips.join('; ') + '.'); }
  S.push('');
  S.push('2. JOURNEY');
  if (route) { S.push('   ' + RT.journey(route.key, { city: P.city })); const days = RT.groupByDay(route); if (route.hills) S.push('   Driving days: ' + days.map((x, i) => `D${i + 1} ${x[0].from} → ${x[x.length - 1].to} (${x.reduce((n, l) => n + l.km, 0)} km, ${Math.round(x.reduce((n, l) => n + l.hours, 0) * 2) / 2} h)`).join('; ') + '.'); S.push('   Legs: ' + route.legs.map(([a, b, km, h, note]) => `${a} → ${b} ${km ? km + ' km ' : ''}${h} h${note ? ' (' + note + ')' : ''}`).join('; ') + '.'); if (route.hazards.length) S.push('   Watch: ' + route.hazards.join('; ') + '.'); S.push('   Season: ' + route.season + '.'); const w = RT.check(route.key, { month: t.date ? new Date(t.date).getMonth() + 1 : 0 }); if (w.length) S.push('   Checks: ' + w.join(' ')); }
  else S.push(`   No route sheet yet for ${t.name}; add it to core/routing.js.`);
  if (d) S.push(`   Altitude: up to ${d.maxAltitude || d.altitude || 0} m${(d.maxAltitude || 0) >= 2500 ? ' (acclimatisation day, oxygen in the vehicle, no alcohol for 2 days)' : ''}. Best months: ${(d.season || []).map(m => DEST.MONTHS[m - 1]).join(', ') || 'see season'}.`);
  S.push('');
  S.push('3. ON THE GROUND');
  S.push(local ? '   ' + LC.brief(local.key).split('\n').join('\n   ') : `   No local notes yet for ${t.name}; add it to core/local.js.`);
  const acts = DEST.activitiesFor ? DEST.activitiesFor(t.name) : []; if (acts && acts.length) S.push('   Activities with timings: ' + acts.slice(0, 8).map(a => `${a.name || a[0]}${a.start ? ' ' + a.start : ''}${a.hours ? ' (' + a.hours + ' h)' : ''}`).join('; ') + '.');
  S.push('');
  S.push('4. TRAVELLERS');
  S.push(booked.length ? booked.map(l => `   ${l.name || l.id} · ${l.seats || 1} seat${(l.seats || 1) > 1 ? 's' : ''} · ${l.stage}${l.names && l.names.length ? ' · names: ' + l.names.join(', ') : ' · names pending'}${l.emergency ? ' · ICE ' + l.emergency : ' · ICE pending'}${l.phone ? ' · ' + l.phone : ''}`).join('\n') : '   Nobody booked yet.');
  S.push('');
  S.push('5. BRIEF TO SEND (' + (g.rules.pickupShareDays) + ' days before)');
  S.push(`   Hi {name}, ${P.name} here with your ${t.name} departure details. Date: ${fmtDate(t.date)}. Pickup: ${t.pickup || '{point and time}'}, be there 15 minutes early. ${route ? 'Journey: ' + RT.journey(route.key, { city: P.city }).split('. Gateway')[0] + '. ' : ''}Carry: original photo ID for everyone, the booking screenshot, your medicines, a water bottle, one warm layer${rule && rule.type !== 'none' ? '; ' + rule.docs[0] : ''}. Captain: ${t.captain || '{name and number}'}. Meals: breakfast and dinner included, veg and Jain available. Emergency: ${P.phone || '{office}'}. Group: ${t.groupLink || '{link}'}.`);
  S.push('');
  S.push('6. EMERGENCY');
  S.push(`   Office: ${P.phone || '{office number}'} (24x7 during the trip). ${local && local.emergency ? 'Local: ' + local.emergency + '.' : 'India: 112 all services, 108 ambulance, 1363 tourist helpline.'} Nearest hospital: {fill from the route sheet}. Insurance helpline: {policy number}.`);
  S.push('   Rules: captain counts heads at every stop; no one walks off alone after dark; incident → captain calls the office first, then the family; founder speaks to press, nobody else.');
  return S.join('\n');
}
module.exports = { pack };
