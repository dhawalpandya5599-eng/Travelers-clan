'use strict';
/**
 * council.js — the clan's agents working as one. A lead or a plan passes through the departments in order,
 * the Critic reviews everything, and every agent's lessons are taught to the mind. The council never
 * sends anything; it prepares a package a human (or the automation arm) can act on.
 */
const { AGENTS, parseRequirements } = require('./agents');

class Council {
  constructor(brain) { this.brain = brain; }
  ctx() { const b = this.brain; return { brain: b, memory: b.memory, skills: b.skills, funnel: b.funnel, conversion: b.conversion, risk: b.risk, mentor: b.mentor }; }

  /** Full pass on a conversation or a message. With a language model present (Claude, Ollama or any open model
   *  endpoint) the council also understands free-form text, polishes the draft in the customer's own style and
   *  gets a second-opinion critique; without one, the rule-based agents run alone. */
  async handle(task) {
    task = typeof task === 'string' ? { conversation: task } : task;
    const ctx = this.ctx(); const out = {};
    const text = task.conversation || task.message || '';
    const req = parseRequirements(text);
    const llm = ctx.mentor && ctx.mentor.enabled ? ctx.mentor : null;
    // 1. Understanding: when the rules cannot see the destination or dates, ask the model to extract them.
    if (llm && (!req.destination || !req.month || !req.group)) {
      const got = await llm.json('You extract travel requirements from a customer conversation for an Indian travel company.', `Conversation:\n${text}\n\nReturn {"destination": string|null, "month": month name|null, "days": number|null, "group": number|null, "budgetPerPerson": number in INR|null, "needs": [short tags], "language": "english"|"hinglish"|"other", "mood": "neutral"|"excited"|"anxious"|"annoyed"}`, { maxTokens: 300 });
      if (got) { task.llm = got; if (got.destination && !req.destination) { const DEST = require('./destinations'); const d = DEST.find(got.destination); if (d) req.destination = d; } if (got.month && !req.month) req.month = require('./destinations').monthNum(got.month); if (got.group && !req.group) req.group = +got.group; if (got.budgetPerPerson && !req.budget) req.budget = +got.budgetPerPerson; if (got.days && !req.days) req.days = +got.days; }
    }
    out.sales = AGENTS.sales.run(task, ctx);
    // The same grounded reply the WhatsApp agent would send, when the growth profile can ground it.
    try { const g = this.brain.growth; const d = g.draftFor(text, { name: task.name || '' }); if (d && d.reply && out.sales && out.sales.output) { out.sales.output.draftRules = out.sales.output.draft; out.sales.output.draft = d.reply; out.sales.output.intent = d.intent; if (d.handoff) out.sales.output.nextAction = 'handoff_to_human'; } } catch (e) { /* keep the rules draft */ }
    out.operations = AGENTS.operations.run({ ...task, requirements: req }, ctx);
    out.cx = AGENTS.cx.run(task, ctx);
    out.news = AGENTS.news.run({ ...task, requirements: req }, ctx);
    out.wellbeing = AGENTS.wellbeing.run(task, ctx); if (!out.wellbeing.findings.length) delete out.wellbeing;
    try { const V = require('./visa'); if (V.mentionsVisa(text) || (req.destination && req.destination.country && req.destination.country !== 'India')) { out.visa = AGENTS.visa.run({ ...task, requirements: req }, ctx); if (!out.visa.findings.length) delete out.visa; } } catch { /* desk optional */ }
    out.critic = AGENTS.critic.run(task, ctx, out);
    // 2. Polish: rewrite the draft in the customer's style, answering every open point the critic found.
    if (llm && out.sales && out.sales.output.draft) {
      const openPoints = [...(out.cx.output.unanswered || []), ...out.critic.findings.filter(f => /draft/i.test(f))];
      const polished = await llm.ask(`You are OYE, the trip buddy of Travelers Clan, an Indian small-group travel company (fixed dates, a trip captain on every batch, no hidden costs). You write like a warm, sharp friend who has done these trips, never like a call centre. Rewrite the draft reply so it: answers every open point in the order the customer raised them; keeps every fact, number, date and policy from the draft exactly (never invent a price, seat count, date or promise); names the feeling first when the customer is worried, angry or grieving, then the fact, then one next step; mirrors the customer's language and register (Hinglish for Hinglish, Gujarati-flavoured Hinglish for Gujarati, plain English otherwise), their formality and their message length; uses the tone "${out.cx.output.tone}"; ends with one clear question or action (never two); stays under 90 words; no emojis unless the customer used them; no markdown, no bullet points, no sign-off.`, `Conversation:\n${text}\n\nDraft:\n${out.sales.output.draft}\n\nOpen points to address:\n${openPoints.join('\n') || 'none'}`, { maxTokens: 300 });
      if (polished) { out.sales.output.draftRules = out.sales.output.draft; out.sales.output.draft = polished; out.sales.output.polishedBy = ctx.mentor.status().model; }
      // 3. Second opinion from the model, added to the critic's findings.
      const second = await llm.json('You are a strict quality critic for a travel company. Find real problems only.', `Conversation:\n${text}\n\nProposed reply:\n${out.sales.output.draft}\n\nOperations summary: ${out.operations.output.requirements ? JSON.stringify(out.operations.output.requirements) : 'none'}\n\nReturn {"problems": [max 3 short strings], "fixes": [max 3 short strings]}`, { maxTokens: 300 });
      if (second && Array.isArray(second.problems)) { for (const pr of second.problems.slice(0, 3)) out.critic.findings.push(`(model) ${pr}`); for (const fx of (second.fixes || []).slice(0, 3)) out.critic.suggestions.push(`(model) ${fx}`); if (second.problems.length && out.critic.verdict === 'ok') out.critic.verdict = 'warn'; }
    }
    return this.finish(out, 'lead');
  }

  /** Review an itinerary (text or structured) the way the Critic does, with Operations and the news desk. */
  async review(task) {
    task = typeof task === 'string' ? { message: task } : task;
    const ctx = this.ctx(); const out = {};
    out.operations = AGENTS.operations.run(task, ctx);
    out.news = AGENTS.news.run({ ...task, requirements: parseRequirements(task.message || task.conversation || '') }, ctx);
    out.critic = AGENTS.critic.run(task, ctx, out);
    return this.finish(out, 'itinerary');
  }

  async ask(agentName, task) {
    const agent = AGENTS[agentName]; if (!agent) throw new Error('no such agent: ' + agentName);
    task = typeof task === 'string' ? { conversation: task, message: task } : task;
    const out = {}; out[agentName] = await agent.run(task, this.ctx(), {});
    return this.finish(out, agentName);
  }

  /** Teach the mind every lesson the agents produced; summarise verdicts. */
  finish(out, kind) {
    let taught = 0; const lessons = [];
    for (const r of Object.values(out)) if ((r.lessons || []).length) { lessons.push(...r.lessons); taught += this.brain.teach(r.lessons.join('\n'), { source: 'council:' + r.agent, importance: 0.6 }); }
    const verdict = Object.values(out).some(r => r.verdict === 'block') ? 'block' : Object.values(out).some(r => r.verdict === 'warn') ? 'warn' : 'ok';
    const fixes = [].concat(...Object.values(out).map(r => (r.suggestions || []).map(s => `${r.agent}: ${s}`)));
    this.brain.event('council', `${kind}: ${verdict} · ${Object.values(out).map(r => `${r.agent} ${r.verdict}`).join(', ')} · taught ${taught} fact(s).`);
    this.brain.save();
    return { kind, verdict, agents: out, fixes, lessons, taught, summary: this.summary(out, verdict) };
  }

  summary(out, verdict) {
    const lines = [`Verdict: ${verdict.toUpperCase()}.`];
    if (out.sales) lines.push(`Sales: ${out.sales.output.cohort || 'unknown cohort'}, stage ${out.sales.output.stage}, next ${out.sales.output.nextAction.replace(/_/g, ' ')} (${out.sales.output.evidence}).`);
    if (out.operations && out.operations.output.itinerary) lines.push(`Operations: ${out.operations.output.requirements.destination}, ${out.operations.output.season}, ${out.operations.output.itinerary.length} days, ~${out.operations.output.perPerson} per person.`);
    for (const r of Object.values(out)) for (const f of r.findings || []) lines.push(`• ${r.agent}: ${f}`);
    for (const r of Object.values(out)) for (const s of r.suggestions || []) lines.push(`→ ${r.agent}: ${s}`);
    if (out.sales) lines.push(`Draft: ${out.sales.output.draft}`);
    return lines.join('\n');
  }
}
module.exports = { Council };
