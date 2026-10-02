'use strict';
/**
 * minds.js — every way of describing a person that helps a travel company serve them: Big Five, MBTI (16), DISC (4),
 * Enneagram (9), generations, travel archetypes, attachment styles, decision styles, money styles, and the therapy map
 * (what travel can do for a state of mind). Each entry says how to recognise it in a message and how to handle it.
 */
const BIG5 = {
  openness: { high: 'wants new places, offbeat stays, local food; sell discovery and stories', low: 'wants known places, familiar food, fixed plan; sell certainty and reviews' },
  conscientiousness: { high: 'wants the plan, inclusions and timings in writing; sell precision', low: 'wants it handled; sell ease and one next step' },
  extraversion: { high: 'wants the group, bonfire, nightlife; sell the people', low: 'wants quiet corners, small groups, free time; sell space' },
  agreeableness: { high: 'says yes easily, needs reminders; sell gently and confirm twice', low: 'challenges every claim; sell with proof and let them win small points' },
  neuroticism: { high: 'worries about safety, money, delays; sell reassurance first and keep promises exact', low: 'relaxed, decides fast; sell the hold now' },
};
const MBTI = {
  ISTJ: { tag: 'the planner', cues: ['itinerary', 'exactly', 'schedule', 'confirm'], handle: 'full day-wise plan in writing, no surprises, punctual departures', trip: 'heritage circuits, Rajasthan, Kerala' },
  ISFJ: { tag: 'the caretaker', cues: ['family', 'parents', 'safe', 'comfortable'], handle: 'safety and comfort details first, family rooms, veg food', trip: 'Kerala, Ooty, Mount Abu' },
  INFJ: { tag: 'the seeker', cues: ['meaningful', 'peace', 'quiet', 'retreat'], handle: 'purpose and quiet, small group, free mornings', trip: 'Rishikesh, Dharamshala, Varanasi' },
  INTJ: { tag: 'the strategist', cues: ['efficient', 'optimise', 'worth it', 'value'], handle: 'value logic, inclusions list, no fluff', trip: 'Spiti, Ladakh, Japan' },
  ISTP: { tag: 'the adventurer', cues: ['bike', 'trek', 'raft', 'hands on'], handle: 'activities and gear, less talk', trip: 'Ladakh bike, Rishikesh, Kedarkantha' },
  ISFP: { tag: 'the artist', cues: ['photos', 'aesthetic', 'cafe', 'vibe'], handle: 'visuals, photo spots, cafes, slow pace', trip: 'Kasol, Gokarna, Pondicherry' },
  INFP: { tag: 'the dreamer', cues: ['always wanted', 'dream', 'feel', 'soul'], handle: 'story of the place, gentle nudges, no hard sell', trip: 'Meghalaya, Varkala, Bhutan' },
  INTP: { tag: 'the analyst', cues: ['why', 'how does', 'compare', 'data'], handle: 'answer the why, compare options honestly', trip: 'Hampi, Khajuraho, Uzbekistan' },
  ESTP: { tag: 'the thrill seeker', cues: ['adrenaline', 'party', 'bungee', 'lets go'], handle: 'offer the hold now, big activities', trip: 'Goa, Rishikesh, Thailand' },
  ESFP: { tag: 'the entertainer', cues: ['fun', 'music', 'nightlife', 'squad'], handle: 'people, bonfire, nightlife, quick booking', trip: 'Goa, Manali, Bali' },
  ENFP: { tag: 'the explorer', cues: ['spontaneous', 'random', 'new people', 'excited'], handle: 'variety and people, short message, emojis ok', trip: 'Vietnam, Meghalaya, Georgia' },
  ENTP: { tag: 'the debater', cues: ['but why', 'what if', 'other option'], handle: 'engage the debate briefly, then one clear offer', trip: 'Ladakh, Turkey, Kazakhstan' },
  ESTJ: { tag: 'the organiser', cues: ['organising for', 'our group', 'invoice', 'HR'], handle: 'one point of contact, invoice, organiser offer', trip: 'corporate offsites, Lonavala, Jaipur' },
  ESFJ: { tag: 'the host', cues: ['everyone', 'all of us', 'make sure', 'nobody'], handle: 'confirm the group is cared for, group rooms, veg counts', trip: 'Goa, Udaipur, Kerala' },
  ENFJ: { tag: 'the leader', cues: ['team', 'bring people', 'inspire', 'together'], handle: 'make them the hero, organiser seat, shareable plan', trip: 'Spiti, Rann of Kutch, Bhutan' },
  ENTJ: { tag: 'the commander', cues: ['bottom line', 'final price', 'decide', 'no nonsense'], handle: 'price, inclusions, hold, done, three lines', trip: 'Dubai, Singapore, Europe' },
};
const DISC = { D: { tag: 'dominant', cues: ['bottom line', 'quick', 'just tell me', 'final'], handle: 'short, direct, options with a recommendation' }, I: { tag: 'influencer', cues: ['fun', 'friends', 'excited', 'love'], handle: 'warm, social proof, people stories' }, S: { tag: 'steady', cues: ['safe', 'comfortable', 'usually', 'family'], handle: 'patient, reassurance, no pressure, step by step' }, C: { tag: 'conscientious', cues: ['details', 'exactly', 'policy', 'included'], handle: 'precise facts, written inclusions, no exaggeration' } };
const ENNEAGRAM = { 1: ['the perfectionist', 'wants it done right; be exact and honest about limits'], 2: ['the helper', 'books for others; praise their care, make their people comfortable'], 3: ['the achiever', 'wants the best and the photos; sell premium and status'], 4: ['the individualist', 'wants unique; sell offbeat and story'], 5: ['the investigator', 'wants data; give facts, respect space'], 6: ['the loyalist', 'wants safety and backup plans; show contingencies'], 7: ['the enthusiast', 'wants variety and fun; sell the itinerary density'], 8: ['the challenger', 'wants control; give options and let them decide'], 9: ['the peacemaker', 'wants ease and no conflict; handle everything, one next step'] };
const GENERATIONS = { 'Gen Z': ['18 to 27', 'reels, slang, budget, aesthetics; reply fast and short, instalments'], Millennial: ['28 to 43', 'experiences, work-life balance, reviews; weekend trips, workations'], 'Gen X': ['44 to 59', 'value and comfort, families, phone calls; clear inclusions, private cab'], Boomer: ['60 plus', 'safety, pace, pilgrimages; call back, ground floor, doctor on call'] };
const ARCHETYPES = { backpacker: 'budget, hostels, long stays, flexible dates', luxury: 'premium stays, private transfers, surprise touches', family: 'safety, food, pace, kid activities', honeymoon: 'privacy, romance, photos', pilgrim: 'temples, timing of aarti, veg food, elderly pace', adventurer: 'treks, rafting, bikes, altitude', workationer: 'wifi, monthly rate, quiet room', foodie: 'local food walks, cooking classes', photographer: 'golden hour, offbeat spots, slow pace', healer: 'yoga, ayurveda, silence, nature' };
const ATTACHMENT = { secure: 'decides calmly; normal flow', anxious: 'needs frequent confirmation; send a confirmation after every step', avoidant: 'dislikes pressure; give space, no follow-up before 3 days', fearful: 'wants to go and fears it; reassurance plus an easy exit (transferable advance)' };
const MONEY = { saver: 'asks for discounts; show value and pay-in-parts', spender: 'upgrades easily; offer the premium tier', planner: 'asks about instalments; give a schedule', avoider: 'delays payment; gentle deadlines with a reason' };

/** Travel as therapy: what a state of mind needs, and what trip gives it. Not medical advice; names the limit. */
const THERAPY = {
  burnout: { needs: 'rest, no decisions, nature, sleep', trip: 'slow 4 to 5 days: Coorg, Munnar, Wayanad or a Kerala houseboat', pace: 'one activity a day, late mornings', group: 'small or solo', do: ['no itinerary before 10am', 'phone in the bag on walks', 'one long meal a day with no screen'], avoid: 'packed sightseeing and night drives' },
  grief: { needs: 'quiet, water, gentle company, meaning', trip: 'Varanasi aarti, Rishikesh river mornings, Varkala cliff, Pondicherry', pace: 'unhurried', group: 'one trusted person or a kind small group', do: ['morning by the water', 'a letter written and let go', 'simple rituals'], avoid: 'party batches and crowds' },
  heartbreak: { needs: 'novelty, movement, people who do not know the story', trip: 'Meghalaya, Vietnam, Georgia, Kasol', pace: 'busy days, early nights', group: 'a friendly fixed-departure group', do: ['one thing that scares you a little', 'photos of yourself, not the view', 'new people every day'], avoid: 'honeymoon destinations' },
  anxiety: { needs: 'predictability, safety, control over the plan', trip: 'Udaipur, Mount Abu, Ooty, a planned Kerala', pace: 'fixed, written, no surprises', group: 'small, with a captain who checks in', do: ['the plan in writing the day before', 'a known pickup point', 'breathing walk every morning'], avoid: 'altitude and risky roads' },
  loneliness: { needs: 'belonging, shared tasks, laughter', trip: 'group trips with a bonfire: Manali, Rann of Kutch, Jaisalmer', pace: 'social', group: 'a mixed fixed-departure group of 12 to 16', do: ['sit with someone new at every meal', 'volunteer for one group task', 'the bonfire circle'], avoid: 'solo stays' },
  'low confidence': { needs: 'small wins, a summit, proof of capability', trip: 'Triund, Kheerganga, Kedarkantha, a first scuba dive', pace: 'progressive', group: 'supportive group with a captain', do: ['one physical goal', 'a photo at the top', 'tell the story the same night'], avoid: 'luxury passivity' },
  'creative block': { needs: 'new inputs, colour, strangeness, slowness', trip: 'Varanasi, Hampi, Jaisalmer, Uzbekistan', pace: 'wandering', group: 'solo or two', do: ['a notebook, no laptop', 'sunrise every day', 'talk to craftspeople'], avoid: 'resorts' },
  'family distance': { needs: 'shared time without roles, play', trip: 'Kerala houseboat, Diu, Ranthambore safari, Goa South', pace: 'relaxed with one shared activity a day', group: 'the family only', do: ['one activity each person chooses', 'no phones at dinner', 'a shared photo book after'], avoid: 'long drives and tight schedules' },
  'couple strain': { needs: 'novelty together, play, privacy', trip: 'Bali, Udaipur, Kashmir, Pondicherry', pace: 'two activities a day, long evenings', group: 'just the two', do: ['one surprise each', 'a cooking class or a boat', 'phones off after sunset'], avoid: 'group batches' },
  retirement: { needs: 'purpose, pace, company of equals', trip: 'pilgrim circuits, Bhutan, Sri Lanka, Rann of Kutch', pace: 'gentle', group: 'senior-friendly batch', do: ['a story told to the group', 'early mornings, afternoon rest', 'a temple or a lake a day'], avoid: 'altitude above 3000 m without clearance' },
};
const THERAPY_CUES = { burnout: /\b(burn ?out|exhausted|tired of work|no energy|drained|overworked|stress)\b/i, grief: /\b(grief|passed away|lost my|died|mourning|bereave)\b/i, heartbreak: /\b(break ?up|broke up|heartbreak|divorce|ex\b|left me)\b/i, anxiety: /\b(anxious|anxiety|panic|overthink|nervous|worried all)\b/i, loneliness: /\b(lonely|alone all|no friends|isolated|no one to)\b/i, 'low confidence': /\b(confidence|not capable|prove|comfort zone|self doubt|low on myself)\b/i, 'creative block': /\b(creative|block|inspiration|stuck in a rut|monotonous|same routine)\b/i, 'family distance': /\b(family time|kids growing|reconnect|distance with|bonding)\b/i, 'couple strain': /\b(relationship|marriage|spark|couple time|we fight|rekindle)\b/i, retirement: /\b(retired|retirement|after sixty|post retirement)\b/i };

function detectAll(text) {
  const t = String(text || ''); const low = t.toLowerCase(); const out = { bigFive: {}, mbti: [], disc: [], enneagram: [], generation: null, archetypes: [], attachment: null, money: null, therapy: [] };
  const words = low.split(/\s+/).length;
  out.bigFive.openness = /offbeat|new|explore|unusual|hidden|local/.test(low) ? 'high' : /known|popular|usual|famous|standard/.test(low) ? 'low' : null;
  out.bigFive.conscientiousness = /exact|itinerary|schedule|details|plan|timing/.test(low) ? 'high' : /whatever|anything|handle|chill/.test(low) ? 'low' : null;
  out.bigFive.extraversion = /party|group|bonfire|nightlife|people|squad|gang/.test(low) ? 'high' : /quiet|peace|alone|private|solo/.test(low) ? 'low' : null;
  out.bigFive.agreeableness = /sure|fine|ok with|happy to|whatever you suggest/.test(low) ? 'high' : /prove|really\?|doubt|convince|why should/.test(low) ? 'low' : null;
  out.bigFive.neuroticism = /safe|worried|scared|what if|risk|fraud|cancel/.test(low) ? 'high' : /lets go|book it|done|cool/.test(low) ? 'low' : null;
  for (const [k, v] of Object.entries(MBTI)) if (v.cues.some(c => low.includes(c))) out.mbti.push(k);
  for (const [k, v] of Object.entries(DISC)) if (v.cues.some(c => low.includes(c))) out.disc.push(k);
  if (/organis|everyone|for my team|for us all/.test(low)) out.enneagram.push(2); if (/best|premium|luxury|top/.test(low)) out.enneagram.push(3); if (/unique|offbeat|different/.test(low)) out.enneagram.push(4); if (/data|exact|details/.test(low)) out.enneagram.push(5); if (/safe|backup|what if/.test(low)) out.enneagram.push(6); if (/fun|more|everything|all of it/.test(low)) out.enneagram.push(7); if (/i decide|options|control|myself/.test(low)) out.enneagram.push(8); if (/handle|easy|no hassle|simple/.test(low)) out.enneagram.push(9);
  out.generation = /\b(lit|af|bro|squad|vibe|yo\b|fr\b|ngl)\b/.test(low) ? 'Gen Z' : /\b(retired|grandchildren|pension|senior citizen)\b/.test(low) ? 'Boomer' : /\b(kids|school|emi|office|leave)\b/.test(low) ? 'Millennial' : /\b(parents aged|my daughter is|teenagers|family trip)\b/.test(low) ? 'Gen X' : null;
  for (const [k, v] of Object.entries(ARCHETYPES)) if (new RegExp('\\b(' + k + '|' + v.split(',')[0].trim().split(' ')[0] + ')', 'i').test(low)) out.archetypes.push(k);
  out.attachment = /confirm again|are you sure|please confirm|just checking/.test(low) ? 'anxious' : /no pressure|dont chase|will come back|stop messaging/.test(low) ? 'avoidant' : /want to but|scared but|afraid but/.test(low) ? 'fearful' : null;
  out.money = /discount|cheaper|budget|afford/.test(low) ? 'saver' : /upgrade|premium|best room|private/.test(low) ? 'spender' : /instal|emi|parts|schedule/.test(low) ? 'planner' : /later|next week|will pay soon/.test(low) ? 'avoider' : null;
  for (const [k, re] of Object.entries(THERAPY_CUES)) if (re.test(t)) out.therapy.push(k);
  if (words <= 4) out.style = 'terse';
  return out;
}
/** One readable brief for the chief, from everything detected. */
function brief(text) {
  const d = detectAll(text); const lines = [];
  const b5 = Object.entries(d.bigFive).filter(([, v]) => v).map(([k, v]) => `${k} ${v}: ${BIG5[k][v]}`); if (b5.length) lines.push('Big Five: ' + b5.join('; '));
  if (d.mbti.length) lines.push('MBTI lean: ' + d.mbti.slice(0, 2).map(k => `${k} ${MBTI[k].tag} → ${MBTI[k].handle}`).join(' | '));
  if (d.disc.length) lines.push('DISC: ' + d.disc.map(k => `${k} ${DISC[k].tag} → ${DISC[k].handle}`).join(' | '));
  if (d.enneagram.length) lines.push('Enneagram: ' + d.enneagram.slice(0, 2).map(n => `${n} ${ENNEAGRAM[n][0]} → ${ENNEAGRAM[n][1]}`).join(' | '));
  if (d.generation) lines.push(`Generation: ${d.generation} (${GENERATIONS[d.generation][0]}) → ${GENERATIONS[d.generation][1]}`);
  if (d.archetypes.length) lines.push('Travel archetype: ' + d.archetypes.map(a => `${a} (${ARCHETYPES[a]})`).join(' | '));
  if (d.attachment) lines.push(`Attachment: ${d.attachment} → ${ATTACHMENT[d.attachment]}`);
  if (d.money) lines.push(`Money style: ${d.money} → ${MONEY[d.money]}`);
  if (d.therapy.length) lines.push('State of mind: ' + d.therapy.map(k => `${k} → ${THERAPY[k].trip}`).join(' | '));
  return { detected: d, lines };
}
module.exports = { BIG5, MBTI, DISC, ENNEAGRAM, GENERATIONS, ARCHETYPES, ATTACHMENT, MONEY, THERAPY, THERAPY_CUES, detectAll, brief };
