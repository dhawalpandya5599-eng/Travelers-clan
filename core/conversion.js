'use strict';
/**
 * conversion.js — learning how conversations turn into bookings.
 *
 * A small naive-Bayes model over conversation features: cohort type, region, reply delay bucket,
 * whether the tone matched the cohort, which trigger was used, which objection came up and whether
 * it was answered, price position vs budget, and follow-up count. It is trained on conversation
 * records (synthetic today, real WhatsApp exports tomorrow) and gives:
 *   predict(features)  → probability of booking with the strongest reasons for and against
 *   lessons()          → what converts and what loses, per cohort, as teachable sentences
 */

function features(conv) {
  const f = {};
  f['type=' + conv.type] = 1; f['region=' + conv.region] = 1;
  f['delay=' + (conv.firstReplyMinutes <= 10 ? 'fast' : conv.firstReplyMinutes <= 60 ? 'hour' : conv.firstReplyMinutes <= 1440 ? 'day' : 'late')] = 1;
  f['tone=' + (conv.toneMatched ? 'matched' : 'mismatched')] = 1;
  f['trigger=' + (conv.triggerUsed || 'none')] = 1;
  f['objection=' + (conv.objection || 'none')] = 1;
  f['objectionAnswered=' + (conv.objectionAnswered ? 'yes' : 'no')] = 1;
  f['price=' + (conv.priceVsBudget < 0.9 ? 'under' : conv.priceVsBudget <= 1.1 ? 'at' : conv.priceVsBudget <= 1.3 ? 'over' : 'far-over')] = 1;
  f['followups=' + Math.min(3, conv.followUps || 0)] = 1;
  f['social-proof=' + (conv.socialProof ? 'yes' : 'no')] = 1;
  return f;
}

class Conversion {
  constructor(state) { this.counts = { booked: {}, lost: {} }; this.n = { booked: 0, lost: 0 }; this.vocab = new Set(); if (state) this.load(state); }
  train(convs) {
    for (const c of convs) {
      const label = c.outcome === 'booked' ? 'booked' : 'lost';
      this.n[label]++;
      for (const k of Object.keys(features(c))) { this.counts[label][k] = (this.counts[label][k] || 0) + 1; this.vocab.add(k); }
    }
    return this;
  }
  predict(conv) {
    if (!this.n.booked || !this.n.lost) return null;
    const f = features(conv); const V = this.vocab.size || 1;
    const logp = (label) => Object.keys(f).reduce((a, k) => a + Math.log(((this.counts[label][k] || 0) + 1) / (this.n[label] + V)), Math.log(this.n[label] / (this.n.booked + this.n.lost)));
    const lb = logp('booked'), ll = logp('lost');
    const p = 1 / (1 + Math.exp(ll - lb));
    const reasons = Object.keys(f).map(k => ({ k, w: Math.log(((this.counts.booked[k] || 0) + 1) / (this.n.booked + V)) - Math.log(((this.counts.lost[k] || 0) + 1) / (this.n.lost + V)) }))
      .filter(r => !/^(type|region)=/.test(r.k)).sort((a, b) => b.w - a.w);
    return { p: +p.toFixed(3), for: reasons.filter(r => r.w > 0.15).slice(0, 3).map(r => r.k), against: reasons.filter(r => r.w < -0.15).slice(-3).reverse().map(r => r.k) };
  }
  /** Lift of each feature: P(booked|feature) relative to base rate. */
  lifts() {
    const base = this.n.booked / (this.n.booked + this.n.lost);
    return [...this.vocab].map(k => { const b = this.counts.booked[k] || 0, l = this.counts.lost[k] || 0; return { k, n: b + l, rate: (b + 1) / (b + l + 2), lift: ((b + 1) / (b + l + 2)) / base }; }).filter(x => x.n >= 40);
  }
  lessons() {
    const out = []; const L = this.lifts();
    const say = (k) => ({ 'delay=fast': 'a first reply within ten minutes', 'delay=hour': 'a first reply within an hour', 'delay=day': 'a first reply within a day', 'delay=late': 'a first reply after a day',
      'tone=matched': 'a reply in the right tone', 'tone=mismatched': 'a reply in the wrong tone', 'objectionAnswered=yes': 'answering the objection', 'objectionAnswered=no': 'ignoring the objection',
      'price=under': 'a price under budget', 'price=at': 'a price at budget', 'price=over': 'a price slightly over budget', 'price=far-over': 'a price far over budget', 'social-proof=yes': 'sending social proof', 'social-proof=no': 'skipping social proof',
      'followups=0': 'no follow-up', 'followups=1': 'one follow-up', 'followups=2': 'two follow-ups', 'followups=3': 'three follow-ups' }[k] || (k.startsWith('trigger=') ? `the trigger "${k.slice(8)}"` : k.startsWith('objection=') ? `the objection "${k.slice(10)}"` : k));
    for (const x of L.filter(x => !/^(type|region)=/.test(x.k)).sort((a, b) => b.lift - a.lift)) {
      if (x.lift >= 1.2) out.push(`${say(x.k)[0].toUpperCase() + say(x.k).slice(1)} raises the booking rate to ${Math.round(x.rate * 100)} percent.`);
      else if (x.lift <= 0.8) out.push(`${say(x.k)[0].toUpperCase() + say(x.k).slice(1)} lowers the booking rate to ${Math.round(x.rate * 100)} percent.`);
    }
    for (const x of L.filter(x => /^type=/.test(x.k))) out.push(`The booking rate for ${x.k.slice(5)} customers is ${Math.round(x.rate * 100)} percent.`);
    return out;
  }
  dump() { return { counts: this.counts, n: this.n, vocab: [...this.vocab] }; }
  load(s) { this.counts = s.counts || { booked: {}, lost: {} }; this.n = s.n || { booked: 0, lost: 0 }; this.vocab = new Set(s.vocab || []); }
}

module.exports = { Conversion, features };
