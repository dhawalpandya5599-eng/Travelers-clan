'use strict';
/**
 * importers.js — feeding ATLAS real experience.
 *
 * WhatsApp exports are the clan's richest record of how leads talk, what they ask, what converts.
 * This parser turns an exported chat (.txt) into episodes with speaker, time and valence, and
 * mines recurring questions so the agent knows what the clan is asked most often.
 */

const T = require('./text');

// Matches both "12/03/24, 10:15 pm - Name: message" and "[12/03/24, 10:15:02] Name: message".
const LINE = /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)\]?\s*[-–]?\s*([^:]{1,60}?):\s(.*)$/;
const SYSTEM = /(Messages and calls are end-to-end encrypted|created group|added|left$|changed the subject|<Media omitted>|image omitted|This message was deleted)/i;

function parseWhatsApp(text) {
  const msgs = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const m = raw.match(LINE);
    if (m) {
      if (SYSTEM.test(m[4])) continue;
      msgs.push({ date: m[1], time: m[2], who: m[3].trim(), text: m[4].trim() });
    } else if (msgs.length && raw.trim()) {
      msgs[msgs.length - 1].text += ' ' + raw.trim(); // continuation line
    }
  }
  return msgs;
}

/** Heuristic valence: emotional tone of a message. */
function valence(text) {
  const pos = (text.match(/\b(thanks?|thank you|great|awesome|love|perfect|confirmed|booked|done|excited|wow|super)\b/gi) || []).length;
  const neg = (text.match(/\b(cancel|refund|late|worst|bad|angry|complain|not happy|disappoint|scam|expensive|no reply|waiting)\b/gi) || []).length;
  return Math.max(-1, Math.min(1, (pos - neg) * 0.3));
}

/**
 * Import a WhatsApp export into the brain. Treats the clan's own staff as 'atlas-like' teachers
 * (their statements become facts) and everyone else as 'user' (their questions become training signal).
 */
function importWhatsApp(brain, text, { staff = [] } = {}) {
  const msgs = parseWhatsApp(text);
  const staffSet = new Set(staff.map(s => s.toLowerCase()));
  const L = require('./learning');
  let facts = 0, questions = 0;
  const askCounts = new Map();
  for (const m of msgs) {
    const isStaff = staffSet.has(m.who.toLowerCase());
    const v = valence(m.text);
    brain.memory.remember(isStaff ? 'lesson' : 'user', m.text, { valence: v, importance: isStaff ? 0.7 : 0.45, meta: { source: 'whatsapp', who: m.who, date: m.date } });
    if (isStaff) for (const f of L.extractFacts(m.text)) if (brain.memory.learnFact(f.s, f.p, f.o, { confidence: 0.65, source: 'whatsapp:' + m.who })) facts++;
    if (T.isQuestion(m.text)) {
      questions++;
      const key = T.tokens(m.text).slice(0, 4).join(' ');
      if (key) askCounts.set(key, (askCounts.get(key) || 0) + 1);
    }
  }
  const faq = [...askCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => ({ topic: k, count: n }));
  brain.event('learn', `Imported ${msgs.length} WhatsApp messages from ${new Set(msgs.map(m => m.who)).size} people; ${facts} facts, ${questions} questions.`);
  brain.save();
  return { messages: msgs.length, people: [...new Set(msgs.map(m => m.who))], facts, questions, faq };
}

module.exports = { parseWhatsApp, importWhatsApp, valence };

/**
 * Meta ads: campaign rows (as exported from Ads Manager or pulled through the Meta tools) become
 * facts and findings. Each row: {name, status, objective, spend, leads|results, costPerResult, resultType, impressions, clicks, ctr, frequency}.
 */
function adsLesson(rows, { period = 'the last 90 days', currency = 'INR' } = {}) {
  const live = rows.filter(r => +r.spend > 0);
  const out = [];
  const total = live.reduce((a, r) => a + +r.spend, 0);
  const leads = live.reduce((a, r) => a + (+r.leads || 0), 0);
  out.push(`Total ad spend in ${period} is ${Math.round(total)} ${currency}.`);
  if (leads) out.push(`Total form leads from ads in ${period} is ${leads}.`, `Blended cost per form lead is ${Math.round(total / leads)} ${currency} in ${period}.`);
  for (const r of live) {
    const n = r.name.replace(/\[.*?\]\s*/g, '').replace(/https?:\S+/g, 'WhatsApp link').trim();
    out.push(`${n} campaign is ${String(r.status).toLowerCase()}.`);
    out.push(`${n} campaign spent ${Math.round(+r.spend)} ${currency} in ${period}.`);
    if (r.results != null) out.push(`${n} campaign has ${r.results} ${r.resultType || 'results'} in ${period}.`);
    if (r.costPerResult != null) out.push(`${n} campaign costs ${Math.round(+r.costPerResult)} ${currency} per ${(r.resultType || 'result').replace(/s$/, '')}.`);
    if (r.ctr != null) out.push(`${n} campaign has a click rate of ${r.ctr} percent.`);
    if (r.frequency != null) out.push(`${n} campaign has a frequency of ${(+r.frequency).toFixed(2)}.`);
  }
  // Findings, by the clan's own rules.
  const priced = live.filter(r => r.costPerResult != null && r.leads).sort((a, b) => +a.costPerResult - +b.costPerResult);
  if (priced.length >= 2) {
    const best = priced[0], worst = priced[priced.length - 1];
    const bn = best.name.replace(/\[.*?\]\s*/g, '').trim(), wn = worst.name.replace(/\[.*?\]\s*/g, '').trim();
    out.push(`The cheapest leads come from ${bn} campaign.`);
    out.push(`${wn} campaign costs ${(+worst.costPerResult / +best.costPerResult).toFixed(1)} times more per lead than ${bn} campaign.`);
    out.push(`Budget should move from ${wn} campaign to ${bn} campaign.`);
  }
  for (const r of live) { if (+r.frequency > 3) out.push(`${r.name} campaign is fatigued because its frequency is above three.`); if (r.ctr != null && +r.ctr < 1) out.push(`${r.name.replace(/\[.*?\]\s*/g, '').replace(/https?:\S+/g, 'WhatsApp link').trim()} campaign needs a new creative because its click rate is under one percent.`); }
  return out;
}

function importAds(brain, rows, opts = {}) {
  const sentences = adsLesson(rows, opts);
  const facts = brain.teach(sentences.join('\n'), { source: 'meta-ads', importance: 0.9 });
  return { sentences: sentences.length, facts };
}

module.exports.adsLesson = adsLesson;
module.exports.importAds = importAds;
