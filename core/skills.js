'use strict';
/**
 * skills.js — procedural memory (the basal ganglia / cerebellum).
 *
 * A skill is a named routine: `match(input) -> args|null` and `run(args) -> string`.
 * Built-in skills are code. Learned skills are synthesized at runtime (by the mentor or by
 * the agent itself), run in a sandbox, and admitted only after they pass their own tests.
 * Every skill keeps a win/loss ledger so evolution can retire ones that misfire.
 */

const vm = require('vm');
const cohorts = require('./cohorts');
const { detectStage } = require('./funnel');

class Skills {
  constructor(state) {
    this.skills = new Map();   // name -> {name, description, match, run, source, learned, wins, losses, tests}
    this.registerBuiltins();
    if (state) this.load(state);
  }

  register(skill) {
    this.skills.set(skill.name, { wins: 0, losses: 0, learned: false, ...skill });
  }

  tryAll(input) {
    const ranked = [...this.skills.values()].sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses));
    for (const s of ranked) {
      if (s.losses > s.wins + 3) continue; // retired by experience
      try {
        const args = s.match(input);
        if (args == null || args === false) continue;
        const output = s.run(args, input, this.context);
        if (typeof output === 'string' && output.trim()) { s.lastUsed = Date.now(); return { name: s.name, output }; }
      } catch (e) { s.losses++; }
    }
    return null;
  }

  /** Would any skill claim this input? (no side effects) */
  peek(input) {
    for (const s of this.skills.values()) { try { const a = s.match(input); if (a != null && a !== false) return s.name; } catch { /* ignore */ } }
    return null;
  }

  feedback(name, good) {
    const s = this.skills.get(name);
    if (s) good ? s.wins++ : s.losses++;
  }

  /**
   * Admit a learned skill from source code. The code must define `match` and `run`.
   * It runs in a VM sandbox with no IO, a 200ms budget, and must pass `tests` [{input, expect}].
   */
  learn({ name, description, source, tests = [] }) {
    if (!/^[a-z][a-z0-9_-]{1,40}$/i.test(name)) throw new Error('bad skill name');
    const sandbox = { Math, Date, Number, String, Array, Object, JSON, RegExp, parseFloat, parseInt, isNaN, module: { exports: {} } };
    vm.createContext(sandbox);
    new vm.Script(source, { filename: name + '.skill.js' }).runInContext(sandbox, { timeout: 200 });
    const mod = sandbox.module.exports;
    if (typeof mod.match !== 'function' || typeof mod.run !== 'function') throw new Error('skill must export match(input) and run(args)');
    const wrapped = {
      name, description, source, tests, learned: true, wins: 0, losses: 0,
      match: (input) => mod.match(String(input)),
      run: (args, input) => String(mod.run(args, String(input))),
    };
    for (const t of tests) {
      const args = wrapped.match(t.input);
      const out = args == null ? null : wrapped.run(args, t.input);
      if (out == null || !String(out).toLowerCase().includes(String(t.expect).toLowerCase())) {
        throw new Error(`skill test failed for "${t.input}": got ${JSON.stringify(out)}, expected to include ${JSON.stringify(t.expect)}`);
      }
    }
    this.skills.set(name, wrapped);
    return wrapped;
  }

  list() {
    return [...this.skills.values()].map(s => ({ name: s.name, description: s.description, learned: !!s.learned, wins: s.wins, losses: s.losses, lastUsed: s.lastUsed || null }));
  }

  dump() {
    return [...this.skills.values()].map(s => ({ name: s.name, description: s.description, learned: !!s.learned, wins: s.wins, losses: s.losses, source: s.learned ? s.source : undefined, tests: s.learned ? s.tests : undefined }));
  }

  load(list) {
    for (const s of list || []) {
      if (s.learned && s.source) { try { this.learn(s); } catch { continue; } }
      const cur = this.skills.get(s.name);
      if (cur) { cur.wins = s.wins || 0; cur.losses = s.losses || 0; }
    }
  }

  registerBuiltins() {
    this.register({
      name: 'council', description: 'Runs the lead or plan through Sales, Operations, Customer Experience, the news desk and the Critic.',
      match: (input) => { const m = input.match(/^(?:council|review|critic|check(?: this)?(?: plan| itinerary| lead)?|ops|operations|plan)[: ]+([\s\S]{6,})$/i); return m ? { mode: input.match(/^(\w+)/)[1].toLowerCase(), text: m[1] } : null; },
      run: ({ mode, text }, input, ctx) => {
        const brain = ctx && ctx.brain; if (!brain) return 'Council unavailable.';
        // Synchronous facade: agents other than the tester are synchronous, so run them directly.
        const { AGENTS, parseRequirements } = require('./agents');
        const c = brain.council; const cc = c.ctx(); const task = { conversation: text, message: text }; const out = {};
        if (mode === 'ops' || mode === 'operations' || mode === 'plan') { out.operations = AGENTS.operations.run(task, cc); out.news = AGENTS.news.run({ ...task, requirements: parseRequirements(text) }, cc); out.critic = AGENTS.critic.run(task, cc, out); }
        else if (mode === 'critic' || mode === 'review' || mode === 'check') { out.operations = AGENTS.operations.run(task, cc); out.cx = AGENTS.cx.run(task, cc); out.sales = AGENTS.sales.run(task, cc); out.news = AGENTS.news.run({ ...task, requirements: parseRequirements(text) }, cc); out.critic = AGENTS.critic.run(task, cc, out); }
        else { out.sales = AGENTS.sales.run(task, cc); out.operations = AGENTS.operations.run(task, cc); out.cx = AGENTS.cx.run(task, cc); out.news = AGENTS.news.run({ ...task, requirements: parseRequirements(text) }, cc); out.critic = AGENTS.critic.run(task, cc, out); }
        const r = c.finish(out, mode);
        const it = out.operations && out.operations.output.itinerary ? '\nItinerary: ' + out.operations.output.itinerary.map(x => `D${x.day} ${x.plan}`).join(' · ') : '';
        return r.summary + it;
      },
    });
    this.register({
      name: 'news-ingest', description: 'Feeds the news desk with headlines (one per line) and reports what changed.',
      match: (input) => { const m = input.match(/^(?:news|headlines?|advisory|advisories)[: ]+([\s\S]{15,})$/i); return m ? m[1] : null; },
      run: (text, input, ctx) => { const brain = ctx && ctx.brain; if (!brain) return 'News desk unavailable.'; const added = brain.risk.ingest(text, 'chief'); for (const i of added) brain.teach(`${i.where} has a ${i.severity} travel risk: ${i.headline}.`, { source: 'news', importance: 0.8 }); brain.save(); return added.length ? `Logged ${added.length} advisory(ies): ${added.map(i => `${i.where} [${i.severity} ${i.kind}]`).join(', ')}.` : 'No new advisories with a recognisable place.'; },
    });
    this.register({
      name: 'next-step', description: 'Reads a conversation, detects the funnel stage and the customer type, and says exactly what to do next, with a draft.',
      match: (input) => { const m = input.match(/^(?:next step|what next|what should (?:i|we) do next|next action|advise)(?:\s+for)?[: ]+([\s\S]{6,})$/i); return m ? m[1] : null; },
      run: (convo, input, ctx) => {
        const funnel = ctx && ctx.funnel; if (!funnel || !funnel.n) return 'I have not studied enough customer journeys yet.';
        const lines = convo.split(/\n+/).map(l => l.trim()).filter(Boolean);
        const stage = detectStage(lines);
        const top = cohorts.classify(convo)[0]; const type = top ? (cohorts.get(top.id).type || top.id) : '*';
        const best = funnel.best(type, stage) || funnel.best('*', stage);
        if (!best) return `Stage: ${stage}. No learned policy yet for this stage.`;
        const DRAFT = { reply_fast_qualify: 'Reply now: "Thanks for reaching out! To plan this right: which dates, how many of you, and a rough budget per person?"', reply_fast_price: 'Reply now with the starting price per person and ask for dates.', send_itinerary_pdf: 'Send the day-by-day plan as a PDF with the all-inclusive price per person.', send_social_proof_then_price: 'Send photos and two reviews from the last group, then the all-inclusive price.', call: 'Ask for a 5-minute call: "Can I call you to understand what matters most?"', answer_with_proof: 'Answer the concern specifically, attach proof (photos, policy, a past traveler to talk to).', follow_up_24h: 'Tomorrow: "Just checking if you had a chance to look at the plan. Happy to adjust anything."', offer_date_flex: 'Offer the following week\'s departure as an alternative date.', hold_price_add_value: 'Hold the price; add a bonfire night and airport pickup at no cost.', split_payment: 'Offer 30% now and the balance two weeks before departure.', small_discount: 'Offer 5% for the group size, valid until Friday.', send_payment_link_now: 'Send the advance payment link now; hold seats for 24 hours.', remind_7d_before: 'Remind about the balance 7 days before departure.', trip_group_and_packing_list: 'Create the WhatsApp trip group and send the packing list a week before.', ask_review_2d: 'Ask for a review two days after the trip ends.', referral_reward: 'Offer a referral discount on their next trip.' };
        const pct = (r) => Math.round(r * 100);
        return `Stage: ${stage}. Customer type: ${type === '*' ? 'unknown' : type}. Do: ${best.action.replace(/_/g, ' ')} (books ${pct(best.rate)}%, captures ${pct(best.revenue)}% of lead value, ${best.n} similar cases${best.alternatives[0] ? `; next best ${best.alternatives[0].action.replace(/_/g, ' ')} at ${pct(best.alternatives[0].rate)}%` : ''}). ${DRAFT[best.action] || ''}`;
      },
    });
    this.register({
      name: 'why-lost', description: 'Explains why leads are lost, overall or for a customer type, from studied journeys.',
      match: (input) => { const m = input.match(/^(?:why (?:do|are) (?:we )?(?:lose|losing)|why (?:do )?(.+?) (?:leads )?(?:get lost|drop|ghost)|loss reasons?)(?:\s+(?:for\s+)?(\w+))?\s*(?:leads|customers)?\??$/i); return m ? (m[1] || m[2] || '*') : null; },
      run: (who, input, ctx) => {
        const funnel = ctx && ctx.funnel; if (!funnel || !funnel.n) return 'I have not studied enough customer journeys yet.';
        const type = who === '*' ? '*' : (Object.keys(funnel.losses).find(t => t !== '*' && who.toLowerCase().includes(t)) || '*');
        const L = funnel.lossReasons(type).slice(0, 4); const D = funnel.dropoff(type);
        return `${type === '*' ? 'Overall' : type[0].toUpperCase() + type.slice(1) + ' customers'}: lost mostly because ${L.map(l => `${l.why} (${Math.round(l.share * 100)}%)`).join(', ')}. Funnel: ${D.map(d => `${d.stage} ${d.reached}`).join(' → ')}.`;
      },
    });
    this.register({
      name: 'predict', description: 'Predicts whether a lead will book from how the conversation went, with reasons.',
      match: (input) => { const m = input.match(/^(?:predict|will (?:this|the) lead book|chance of booking|booking chance)[: ]+(.{10,})$/i); return m ? m[1] : null; },
      run: (desc, input, ctx) => {
        const model = ctx && ctx.conversion; if (!model || !model.n.booked) return 'I have not studied enough conversations yet to predict bookings.';
        const t = desc.toLowerCase();
        const mins = (t.match(/replied (?:in|after|within) (\d+)\s*(min|minute|hour|day)/) || []);
        const firstReplyMinutes = mins[1] ? +mins[1] * ({ min: 1, minute: 1, hour: 60, day: 1440 }[mins[2]]) : /instant|immediately|right away|within 10 min/.test(t) ? 5 : /next day|a day later/.test(t) ? 1500 : 45;
        const conv = { type: (cohorts.classify(desc)[0] || {}).id || 'unknown', region: 'in', firstReplyMinutes, toneMatched: !/wrong tone|cold reply|curt|rude/.test(t),
          triggerUsed: /discount|limited seats|early.?bird|private|doctor|reviews|quote/.test(t) ? 'some' : null, objection: /(price|expensive|safety|safe|food|hidden|dates|exam|permission|leave)/.test(t) ? 'some' : null,
          objectionAnswered: !/(ignored|did not answer|didn't answer|no answer|unanswered)/.test(t), priceVsBudget: /over budget|too expensive|expensive/.test(t) ? 1.25 : /under budget|cheaper than|within budget/.test(t) ? 0.85 : 1.0,
          followUps: (t.match(/(\d) follow/) || [])[1] ? +(t.match(/(\d) follow/))[1] : /follow/.test(t) ? 1 : 0, socialProof: /(photos|reviews|testimonial|social proof)/.test(t) };
        const r = model.predict(conv); if (!r) return 'Not enough data yet.';
        const say = (k) => k.replace(/^(\w+)=(.+)$/, (_, a, b) => ({ delay: 'reply ' + b, tone: 'tone ' + b, trigger: 'trigger ' + b, objection: 'objection ' + b, objectionAnswered: 'objection answered ' + b, price: 'price ' + b, followups: b + ' follow-ups', 'social-proof': 'social proof ' + b }[a] || k));
        return `Booking chance ${Math.round(r.p * 100)}%. Helping: ${r.for.map(say).join(', ') || 'nothing much'}. Hurting: ${r.against.map(say).join(', ') || 'nothing much'}. ${r.p < 0.4 ? 'Fix the biggest hurting factor and follow up within 24 hours.' : 'Send the payment link now.'}`;
      },
    });
    this.register({
      name: 'cohort', description: 'Recognises which customer cohort a lead belongs to and how to talk to them.',
      match: (input) => { const m = input.match(/^(?:which|what)\s+cohort(?:\s+is\s+this(?:\s+lead|\s+customer|\s+message)?)?[: ]+(.{6,})$|^(?:who is this (?:lead|customer))[: ]+(.{6,})$|^(?:classify|profile)(?:\s+this)?(?:\s+lead|\s+customer)?[: ]+(.{6,})$/i); return m ? (m[1] || m[2] || m[3]) : null; },
      run: (msg) => {
        const ranked = cohorts.classify(msg);
        if (!ranked.length) return 'No clear cohort yet. Ask where they are from, who is travelling and what matters most to them.';
        const c = cohorts.get(ranked[0].id);
        const alt = ranked[1] && ranked[1].score >= ranked[0].score * 0.7 ? ` (could also be ${ranked[1].name})` : '';
        return `${c.name}${alt}. Signals: ${ranked[0].hits.join(', ') || 'budget and group size'}. They decide: ${c.decision}. They need: ${c.needs.slice(0, 3).join(', ')}. Tone: ${c.tone}. Convince with: ${c.triggers.join(', ')}. Watch for: ${c.objections.join(', ')}.`;
      },
    });
    this.register({
      name: 'reply', description: 'Drafts a first reply to a lead, matched to their cohort, asking for what is missing.',
      match: (input) => { const m = input.match(/^(?:reply to|draft (?:a )?reply(?: to| for)?|answer|respond to)(?:\s+this)?(?:\s+lead|\s+customer|\s+message)?(?:\s+from\s+(\w+))?[: ]+(.{6,})$/i); return m ? { name: m[1] || '', msg: m[2] } : null; },
      run: ({ name, msg }) => { const r = cohorts.draftReply(msg, { name }); return `${r.cohort ? `[${r.cohort.name} · ${r.cohort.tone}] ` : ''}${r.reply}`; },
    });
    // Lead gate: scores a lead message the way the clan triages WhatsApp enquiries.
    this.register({
      name: 'lead-gate', description: 'Scores a lead message as real or junk (date, destination, budget, group, intent).',
      match: (input) => { const m = input.match(/^(?:score|rate|qualify|is this (?:a )?(?:real|junk|good) lead)[: ]+(?:this )?(?:lead|message|enquiry)?[: ]*(.{6,})$/i); return m ? m[1] : null; },
      run: (msg) => {
        const t = msg.toLowerCase();
        const signals = [
          ['date', /\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|next (?:week|month)|this weekend|in (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|\d{1,2}\/\d{1,2})\b/, 2],
          ['destination', /\b(goa|ladakh|manali|spiti|kashmir|kerala|rishikesh|meghalaya|bali|thailand|dubai|vietnam|himachal|rajasthan|andaman|sikkim|bhutan|nepal|europe|trip to \w+)\b/, 2],
          ['budget', /\b(budget|rs\.?|₹|inr|\d{2,3}k|\d{4,6})\b/, 2],
          ['group size', /\b(\d{1,2}\s*(?:people|pax|persons|friends|adults|members|of us)|couple|solo|family)\b/, 1],
          ['intent', /\b(book|confirm|advance|pay|itinerary|plan|interested|want to go|looking for)\b/, 1],
          ['contact', /\b(call me|whatsapp|number|email)\b/, 1],
        ];
        const hits = signals.filter(([, re]) => re.test(t));
        const score = hits.reduce((a, [, , w]) => a + w, 0);
        const junk = /\b(just asking|price\?+$|rate\?+$|free|collab|influencer|job|vacancy|loan|crypto)\b/.test(t) && score < 3;
        const verdict = junk ? 'JUNK' : score >= 5 ? 'HOT' : score >= 3 ? 'WARM' : 'COLD';
        const missing = signals.filter(([n]) => !hits.some(([h]) => h === n)).slice(0, 3).map(([n]) => n);
        const next = verdict === 'HOT' ? 'Reply within 10 minutes with the itinerary and advance link.' : verdict === 'WARM' ? `Reply fast and ask for: ${missing.join(', ')}.` : verdict === 'COLD' ? `Qualify first: ask for ${missing.join(', ')}.` : 'Send one polite reply, do not chase.';
        return `Lead score ${score}/9 → ${verdict}. Signals: ${hits.map(h => h[0]).join(', ') || 'none'}. ${next}`;
      },
    });
    // Arithmetic: safe evaluator for + - * / ^ % and parentheses.
    this.register({
      name: 'arithmetic', description: 'Evaluates arithmetic expressions.',
      match: (input) => {
        const m = input.replace(/[?=]/g, '').match(/(?:what is|calculate|compute|evaluate|solve)?\s*(-?\d[\d\s.,+\-*/^%()x×÷]*\d)\s*$/i);
        if (!m) return null;
        const expr = m[1].replace(/,/g, '').replace(/[x×]/g, '*').replace(/÷/g, '/').replace(/\^/g, '**').replace(/\s+/g, '');
        if (!/^[\d.+\-*/%()]+$/.test(expr) || !/[+\-*/%]/.test(expr)) return null;
        return expr;
      },
      run: (expr) => {
        if (!/^[\d.+\-*/%() ]+$/.test(expr.replace(/\*\*/g, ''))) throw new Error('unsafe');
        const v = vm.runInNewContext(expr, {}, { timeout: 50 });
        if (typeof v !== 'number' || !isFinite(v)) throw new Error('nan');
        return `${expr.replace(/\*\*/g, '^')} = ${Number.isInteger(v) ? v : +v.toFixed(4)}`;
      },
    });

    this.register({
      name: 'percent', description: 'Percentages, discounts and margins.',
      match: (input) => { const m = input.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of|off|discount on)\s*(?:rs\.?|₹|\$|inr|usd)?\s*([\d,]+(?:\.\d+)?)/i); return m ? { p: +m[1], v: +m[2].replace(/,/g, ''), off: /off|discount/i.test(input) } : null; },
      run: ({ p, v, off }) => { const part = v * p / 100; return off ? `${p}% off ${v} = ${+(v - part).toFixed(2)} (saving ${+part.toFixed(2)})` : `${p}% of ${v} = ${+part.toFixed(2)}`; },
    });

    this.register({
      name: 'per-person', description: 'Splits a trip budget per traveler.',
      match: (input) => { const m = input.match(/(?:rs\.?|₹|\$|inr|usd)?\s*([\d,]{3,}(?:\.\d+)?)\s*(?:rs|inr|usd|\$)?\s*(?:total\s+)?(?:for|among|between|split(?: by| across| between)?|\/)\s*(\d{1,3})\s*(?:people|persons|pax|travellers|travelers|members|friends|adults)/i); return m ? { total: +m[1].replace(/,/g, ''), n: +m[2] } : null; },
      run: ({ total, n }) => `${total} split across ${n} travelers = ${+(total / n).toFixed(2)} per person.`,
    });

    this.register({
      name: 'date', description: 'Today, day of week, days until a date, trip length.',
      match: (input) => {
        if (/\b(what(?:'s| is) (?:the )?(?:date|day) today|today'?s date|what day is it)\b/i.test(input)) return { kind: 'today' };
        const m = input.match(/(?:days? (?:until|till|to|before)|how (?:many days|long) (?:until|till|to|before))\s+(\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{1,2}\s+[a-z]+(?:\s+\d{4})?)/i);
        if (m) return { kind: 'until', date: m[1] };
        const r = input.match(/(?:from|between)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[a-z]+(?:\s+\d{4})?)\s+(?:to|and|until|-)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[a-z]+(?:\s+\d{4})?)/i);
        if (r && /(?:days|nights|long|duration)/i.test(input)) return { kind: 'span', a: r[1], b: r[2] };
        return null;
      },
      run: (a) => {
        const parse = (s) => { const d = new Date(/\d{4}$/.test(s) || /^\d{4}-/.test(s) ? s : `${s} ${new Date().getFullYear()}`); if (isNaN(d)) throw new Error('date'); return d; };
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (a.kind === 'today') return `Today is ${today.toDateString()}.`;
        if (a.kind === 'until') { const d = parse(a.date); const n = Math.round((d - today) / 864e5); return n >= 0 ? `${n} day${n === 1 ? '' : 's'} until ${d.toDateString()}.` : `${d.toDateString()} was ${-n} days ago.`; }
        const d1 = parse(a.a), d2 = parse(a.b); const n = Math.round(Math.abs(d2 - d1) / 864e5);
        return `${d1.toDateString()} to ${d2.toDateString()} is ${n} days (${Math.max(0, n - 1)} nights... or ${n} nights if you leave the morning after).`;
      },
    });

    this.register({
      name: 'convert', description: 'Unit conversions (km/mi, kg/lb, °C/°F, currency hints).',
      match: (input) => { const m = input.match(/([\d.]+)\s*(km|kilometers?|mi|miles?|kg|lbs?|pounds?|°?c|celsius|°?f|fahrenheit|m|meters?|ft|feet)\s*(?:to|in|into)\s*(km|kilometers?|mi|miles?|kg|lbs?|pounds?|°?c|celsius|°?f|fahrenheit|m|meters?|ft|feet)\b/i); return m ? { v: +m[1], from: m[2].toLowerCase(), to: m[3].toLowerCase() } : null; },
      run: ({ v, from, to }) => {
        const canon = { km: 'km', kilometer: 'km', kilometers: 'km', mi: 'mi', mile: 'mi', miles: 'mi', kg: 'kg', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
          c: 'c', '°c': 'c', celsius: 'c', f: 'f', '°f': 'f', fahrenheit: 'f', m: 'm', meter: 'm', meters: 'm', ft: 'ft', feet: 'ft' };
        const f = canon[from], t = canon[to];
        const table = { 'km:mi': x => x * 0.621371, 'mi:km': x => x * 1.609344, 'kg:lb': x => x * 2.20462, 'lb:kg': x => x / 2.20462,
          'c:f': x => x * 9 / 5 + 32, 'f:c': x => (x - 32) * 5 / 9, 'm:ft': x => x * 3.28084, 'ft:m': x => x / 3.28084 };
        const fn = table[`${f}:${t}`]; if (!fn) throw new Error('no conversion');
        return `${v} ${from} ≈ ${+fn(v).toFixed(2)} ${to}`;
      },
    });
  }
}

module.exports = { Skills };
