'use strict';
/**
 * mentor.js — the parent.
 *
 * ATLAS learns on its own, but it grows fastest with a mentor: a frontier Claude model that
 *  1. answers when ATLAS is unsure, and ATLAS then *learns the answer* (distillation),
 *  2. reflects on recent experience and writes lessons ATLAS consolidates into semantic memory,
 *  3. synthesizes new skills as sandboxed code with tests, which ATLAS admits only if they pass.
 *
 * The mentor is optional. Without `@anthropic-ai/sdk` + credentials, every method returns null
 * and the agent still learns from the humans it talks to.
 *
 * Model: Claude Fable 5.1 (the most capable generally available model) with server-side refusal
 * fallbacks enabled so a safety decline is retried on an Opus-class model inside the same call.
 */

let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk'); } catch { /* optional */ }

const MODEL = process.env.ATLAS_MENTOR_MODEL || 'claude-fable-5-1';

/**
 * Local mentor: Ollama (https://ollama.com) running on the same machine, no key and no credits.
 * Set OLLAMA_URL (default http://127.0.0.1:11434) and OLLAMA_MODEL (default llama3.2). Probed once at start.
 */
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

class Mentor {
  constructor() {
    this.client = null;
    this.enabled = false;
    this.backend = null;          // 'claude' | 'ollama'
    this.calls = 0;
    this.lastError = null;
    const hasCreds = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
    if (Anthropic && hasCreds) {
      try { this.client = new Anthropic(); this.enabled = true; this.backend = 'claude'; } catch (e) { this.lastError = e.message; }
    } else {
      this.lastError = !Anthropic ? 'no Claude SDK/key' : 'ANTHROPIC_API_KEY not set';
      this.probeOllama();
    }
  }

  /** Is a local Ollama server answering? If so, use it. */
  async probeOllama() {
    if (process.env.ATLAS_NO_OLLAMA || typeof window !== 'undefined') return false; // browsers use the page's own mentor
    try {
      const r = await fetch(OLLAMA_URL + '/api/tags', { signal: AbortSignal.timeout(1500) });
      if (!r.ok) throw new Error('status ' + r.status);
      const tags = await r.json();
      const names = (tags.models || []).map(m => m.name);
      if (!names.length) { this.lastError = 'Ollama is running but has no models (run: ollama pull ' + OLLAMA_MODEL + ')'; return false; }
      this.ollamaModel = names.find(n => n.startsWith(OLLAMA_MODEL)) || names[0];
      this.enabled = true; this.backend = 'ollama'; this.lastError = null;
      return true;
    } catch (e) { this.lastError = (this.lastError ? this.lastError + '; ' : '') + 'no local Ollama at ' + OLLAMA_URL; return false; }
  }

  status() { return { enabled: this.enabled, backend: this.backend, model: this.backend === 'ollama' ? 'ollama/' + this.ollamaModel : MODEL, calls: this.calls, lastError: this.lastError }; }

  async ask(system, user, { maxTokens = 2000 } = {}) {
    if (!this.enabled) return null;
    this.calls++;
    if (this.backend === 'ollama') {
      try {
        const r = await fetch(OLLAMA_URL + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120000),
          body: JSON.stringify({ model: this.ollamaModel, stream: false, options: { num_predict: maxTokens, temperature: 0.3 }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
        if (!r.ok) throw new Error('Ollama status ' + r.status);
        const j = await r.json();
        return (j.message && j.message.content || '').trim() || null;
      } catch (e) { this.lastError = e.message; return null; }
    }
    try {
      const params = { model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }], output_config: { effort: 'medium' } };
      let response;
      if (/fable|opus-5|sonnet-5-5/.test(MODEL)) {
        response = await this.client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
      } else {
        response = await this.client.messages.create(params);
      }
      if (response.stop_reason === 'refusal') { this.lastError = 'mentor declined: ' + (response.stop_details?.category || 'policy'); return null; }
      return response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim() || null;
    } catch (e) {
      this.lastError = e.message;
      return null;
    }
  }

  /** Answer a question using the agent's own memories as context, so the answer is grounded. */
  async answer(question, context) {
    const system = 'You are the mentor of ATLAS, a young learning agent that serves the Travelers Clan, a travel company. ' +
      'Answer the question briefly (max 3 sentences) using the provided memories when relevant. ' +
      'If the memories do not cover it and it is clan-specific, say you do not know yet and suggest what to ask the chief. ' +
      'Then on a new line write FACTS: followed by up to 3 short declarative sentences ATLAS should memorise, each of the form "<subject> is/has/offers <object>".';
    const user = `Memories:\n${context}\n\nQuestion: ${question}`;
    const out = await this.ask(system, user, { maxTokens: 600 });
    if (!out) return null;
    const [text, factsPart] = out.split(/\nFACTS:\s*/i);
    const facts = factsPart ? factsPart.split(/\n+/).map(s => s.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean) : [];
    return { text: text.trim(), facts };
  }

  /** Reflect on recent episodes and produce lessons (declarative sentences) worth consolidating. */
  async reflect(recentEpisodes) {
    const system = 'You are the mentor of ATLAS, a learning agent for the Travelers Clan. Read the recent conversation log and ' +
      'extract the durable knowledge in it as 3-8 short declarative sentences ("X is Y", "X offers Y", "Customers need Y"). ' +
      'Skip pleasantries. Output one sentence per line, nothing else.';
    const out = await this.ask(system, recentEpisodes.map(e => `[${e.role}] ${e.text}`).join('\n'), { maxTokens: 800 });
    return out ? out.split(/\n+/).map(s => s.replace(/^[-*\d.\s]+/, '').trim()).filter(s => s.length > 8) : [];
  }

  /** Synthesize a new skill as sandboxed JS. Returns {name, description, source, tests} or null. */
  async synthesizeSkill(need, examples) {
    const system = 'You write small JavaScript skills for ATLAS, a learning agent. A skill is a CommonJS module that sets ' +
      '`module.exports = { match, run }`. `match(input)` returns null when the skill does not apply, else an args value. ' +
      '`run(args, input)` returns a string. No require, no IO, no async, pure functions only. ' +
      'Respond with JSON only: {"name": "kebab-case", "description": "...", "source": "<module code>", "tests": [{"input": "...", "expect": "<substring of expected output>"}]} with at least 2 tests.';
    const out = await this.ask(system, `Need: ${need}\nExample inputs:\n${examples.join('\n')}`, { maxTokens: 2500 });
    if (!out) return null;
    try {
      const json = out.match(/\{[\s\S]*\}/);
      return json ? JSON.parse(json[0]) : null;
    } catch { return null; }
  }
}

module.exports = { Mentor, MODEL };
