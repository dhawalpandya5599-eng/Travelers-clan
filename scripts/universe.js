#!/usr/bin/env node
'use strict';
/** Play the customer universe against the WhatsApp agent, build the playbook, teach the mind, save the report.
 *   node scripts/universe.js [--n 400] [--verbose]   (ATLAS_DATA=mind to teach the shipped mind) */
const path = require('path'); const os = require('os'); const fs = require('fs');
const { Brain } = require('../core/brain'); const U = require('../core/universe');
const args = process.argv.slice(2); const N = +(args[args.indexOf('--n') + 1]) || 400; const verbose = args.includes('--verbose');
(async () => {
  const dir = process.env.ATLAS_DATA || fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-universe-'));
  const b = new Brain({ dataDir: dir, autosave: false }); b.evolution.genome.curiosity = 0; b.studyCurriculum(path.join(__dirname, '..', 'curriculum'));
  const g = b.growth; const hadProfile = g.profile.phone && g.upcoming(1).length;
  if (!hadProfile) g.setProfile({ city: 'Ahmedabad', phone: '9876543210', upi: 'tc@upi', trips: [{ name: 'Goa', date: '2099-12-12', days: 4, price: 14500, seats: 16, booked: 9 }, { name: 'Manali', date: '2099-12-20', days: 5, price: 12500, seats: 20, booked: 3 }] });
  const trips = g.upcoming(2); U.setSeed(5);
  const personas = U.generate(N); const results = [];
  for (const p of personas) { const trip = trips[personas.indexOf(p) % trips.length]; try { results.push(await U.play(p, g, trip)); } catch (e) { results.push({ persona: p, log: [], state: {}, verdict: { ok: false, reason: 'crash: ' + e.message } }); } }
  const pb = U.playbook(results);
  console.log(`\nCustomer universe: ${pb.total} personas from a space of ${U.ALL.toLocaleString()} combinations · handled well ${pb.ok}/${pb.total} (${Math.round(100 * pb.ok / pb.total)}%)`);
  console.log('Weakest segments:'); for (const [k, rows] of Object.entries(pb.table)) { const w = rows[0]; if (w.rate < 0.8) console.log(`  ${k.padEnd(10)} ${w.value.padEnd(28)} ${Math.round(w.rate * 100)}% (${w.n})`); }
  console.log('Failure reasons:'); for (const f of pb.fails.slice(0, 8)) console.log(`  ${String(f.n).padStart(4)}  ${f.reason}`);
  if (verbose) for (const r of results.filter(r => !r.verdict.ok).slice(0, 6)) { console.log(`\n--- ${r.persona.lifeStage} · ${r.persona.geo} · ${r.persona.decision} · ${r.persona.risk} · ${r.persona.trust} · ${r.persona.language} · ${r.persona.scenario} → ${r.verdict.reason}`); for (const l of r.log) console.log(`  ${l.who === 'customer' ? '>' : ' '} ${l.text.slice(0, 140)}`); }
  const taught = b.teach(pb.lessons.join('\n'), { source: 'universe', importance: 0.75 }); console.log(`Taught ${taught} lesson(s) to the mind.`);
  if (process.env.ATLAS_DATA) b.saveNow();
  // forget the synthetic leads so the real lead sheet stays clean
  g.state.leads = g.state.leads.filter(l => !String(l.id).startsWith('universe-')); for (const k of Object.keys(g.state.threads)) if (k.startsWith('universe-')) delete g.state.threads[k]; g.state.log = g.state.log.filter(x => x.source !== 'universe'); for (const t of g.profile.trips) t.holds = (t.holds || []).filter(h => !String(h.lead).startsWith('universe-')); g.save();
  fs.mkdirSync(path.join(__dirname, '..', 'synth'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'synth', 'universe-report.json'), JSON.stringify({ at: new Date().toISOString(), space: U.ALL, n: pb.total, ok: pb.ok, table: pb.table, fails: pb.fails, lessons: pb.lessons, samples: results.filter(r => !r.verdict.ok).slice(0, 25).map(r => ({ persona: r.persona, reason: r.verdict.reason, log: r.log })) }, null, 1));
})();
