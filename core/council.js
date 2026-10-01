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

  /** Full pass on a conversation or a message. */
  async handle(task) {
    task = typeof task === 'string' ? { conversation: task } : task;
    const ctx = this.ctx(); const out = {};
    out.sales = AGENTS.sales.run(task, ctx);
    out.operations = AGENTS.operations.run(task, ctx);
    out.cx = AGENTS.cx.run(task, ctx);
    out.news = AGENTS.news.run({ ...task, requirements: parseRequirements(task.conversation || task.message || '') }, ctx);
    out.critic = AGENTS.critic.run(task, ctx, out);
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
