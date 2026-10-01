'use strict';
/**
 * evolution.js — the agent's genome and the evolutionary loop that improves it.
 *
 * The genome is the set of neuro-parameters that shape how ATLAS learns:
 * plasticity, forgetting, working memory capacity, consolidation threshold, curiosity.
 * Each generation, a population of mutated genomes is scored on a fitness function that
 * combines (a) a self-test of recall on facts the agent has learned and (b) the running
 * record of human feedback. Elites survive; the best genome becomes the live brain.
 */

const DEFAULT_GENOME = {
  learningRate: 0.25,          // Hebbian plasticity
  decayTau: 48,                // forgetting time constant (hours)
  consolidationThreshold: 0.5, // salience needed to replay an episode into semantic memory
  curiosity: 0.6,              // propensity to ask questions about weak concepts
  explorationEps: 0.15,        // chance to try a lower-ranked answer strategy
  wmCapacity: 7,               // working memory slots
  associationThreshold: 0.08,  // minimum activation to propagate through a synapse
  confidenceFloor: 0.35,       // below this, the agent admits ignorance instead of guessing
};

const BOUNDS = {
  learningRate: [0.02, 0.9], decayTau: [4, 720], consolidationThreshold: [0.05, 1.5], curiosity: [0.3, 1],
  explorationEps: [0, 0.5], wmCapacity: [3, 15], associationThreshold: [0.01, 0.4], confidenceFloor: [0.1, 0.8],
};

function clamp(k, v) { const [lo, hi] = BOUNDS[k]; v = Math.max(lo, Math.min(hi, v)); return k === 'wmCapacity' ? Math.round(v) : +v.toFixed(4); }

function mutate(g, rate = 0.3, sigma = 0.25, rng = Math.random) {
  const out = { ...g };
  for (const k of Object.keys(DEFAULT_GENOME)) {
    if (rng() < rate) {
      const span = BOUNDS[k][1] - BOUNDS[k][0];
      // Gaussian-ish step via sum of uniforms (Irwin–Hall), scaled to the parameter's range.
      const z = (rng() + rng() + rng() - 1.5) * 2;
      out[k] = clamp(k, g[k] + z * sigma * span * 0.25);
    }
  }
  return out;
}

function crossover(a, b, rng = Math.random) {
  const out = {};
  for (const k of Object.keys(DEFAULT_GENOME)) out[k] = clamp(k, rng() < 0.5 ? a[k] : (a[k] + b[k]) / 2);
  return out;
}

class Evolution {
  constructor(state) {
    this.generation = 0;
    this.genome = { ...DEFAULT_GENOME };
    this.history = [];      // [{generation, best, mean, genome, t}]
    this.feedback = { up: 0, down: 0 };
    this.populationSize = 8;
    if (state) Object.assign(this, state);
  }

  recordFeedback(good) { good ? this.feedback.up++ : this.feedback.down++; }

  humanScore() {
    const n = this.feedback.up + this.feedback.down;
    return n ? (this.feedback.up + 1) / (n + 2) : 0.5; // Laplace-smoothed approval rate
  }

  /**
   * Run one generation. `evaluate(genome) -> number in [0,1]` builds a scratch brain with that
   * genome, replays the lesson corpus, and measures recall accuracy on held-out probes.
   */
  step(evaluate, rng = Math.random) {
    const pop = [this.genome];
    while (pop.length < this.populationSize) {
      const parent = pop[Math.floor(rng() * pop.length)];
      pop.push(rng() < 0.3 && pop.length > 1 ? mutate(crossover(parent, pop[Math.floor(rng() * pop.length)], rng), 0.2, 0.2, rng) : mutate(parent, 0.35, 0.3, rng));
    }
    const scored = pop.map(genome => ({ genome, fitness: evaluate(genome) * 0.7 + this.humanScore() * 0.3 }));
    scored.sort((a, b) => b.fitness - a.fitness);
    const best = scored[0];
    const mean = scored.reduce((a, s) => a + s.fitness, 0) / scored.length;
    // Elitism: the incumbent genome is always in the population and scored on the same probes as
    // its children, so adopting this generation's champion can never regress within a generation.
    const accepted = best.genome !== this.genome;
    this.genome = best.genome;
    this.generation++;
    const entry = { generation: this.generation, best: +best.fitness.toFixed(4), mean: +mean.toFixed(4), genome: { ...this.genome }, accepted, t: Date.now() };
    this.history.push(entry);
    if (this.history.length > 500) this.history.shift();
    return entry;
  }

  dump() { return { generation: this.generation, genome: this.genome, history: this.history, feedback: this.feedback, populationSize: this.populationSize }; }
}

module.exports = { Evolution, DEFAULT_GENOME, BOUNDS, mutate, crossover };
