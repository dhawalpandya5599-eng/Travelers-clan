'use strict';
/**
 * cohorts.js — who the clan talks to, around the globe.
 *
 * A cohort is a recurring kind of customer: where they come from, how they decide (personality,
 * modelled loosely on the Big Five), what they need from a trip, what makes them hesitate, and how
 * to talk to them. The data is small and explicit so ATLAS can explain its reasoning, and it feeds
 * three things: synthetic customers for training, a cohort classifier skill, and reply drafting.
 */

const COHORTS = [
  { id: 'metro-young-pros', name: 'Indian metro young professionals', regions: ['Mumbai', 'Bengaluru', 'Pune', 'Hyderabad', 'Delhi', 'Gurugram'], ages: [24, 34],
    personality: { openness: 0.7, conscientiousness: 0.5, extraversion: 0.7, agreeableness: 0.6, neuroticism: 0.4 },
    decision: 'fast, peer-driven, weekend-constrained', channel: 'WhatsApp text', budget: [15000, 40000], tripDays: [3, 6], groupSize: [2, 6],
    needs: ['long weekend dates', 'Instagram-worthy spots', 'nightlife or cafes', 'quick itinerary PDF'], objections: ['leave approval', 'price per person'],
    tone: 'crisp and upbeat', triggers: ['limited seats', 'friends already booked', 'early-bird price'],
    cues: ['weekend', 'long weekend', 'office', 'leave', 'friends', 'cafe', 'reels', 'insta', 'bangalore', 'bengaluru', 'mumbai', 'pune', 'hyderabad', 'gurgaon', 'gurugram'] },
  { id: 'college-groups', name: 'Indian college groups', regions: ['Ahmedabad', 'Jaipur', 'Indore', 'Nagpur', 'Chandigarh', 'Lucknow'], ages: [18, 23],
    personality: { openness: 0.8, conscientiousness: 0.3, extraversion: 0.9, agreeableness: 0.7, neuroticism: 0.4 },
    decision: 'slow, group consensus, extremely price sensitive', channel: 'WhatsApp group and Instagram DM', budget: [6000, 15000], tripDays: [3, 5], groupSize: [6, 20],
    needs: ['lowest price', 'group discount', 'bonfire and music', 'budget stay'], objections: ['parents permission', 'exam dates', 'collecting money from everyone'],
    tone: 'friendly and energetic', triggers: ['group discount', 'one free seat per ten', 'pay in two parts'],
    cues: ['college', 'students', 'exam', 'semester', 'cheapest', 'budget', 'group of', 'bonfire', 'hostel', 'discount'] },
  { id: 'indian-families', name: 'Indian families with kids', regions: ['Surat', 'Vadodara', 'Rajkot', 'Nashik', 'Kolkata', 'Chennai'], ages: [35, 50],
    personality: { openness: 0.4, conscientiousness: 0.8, extraversion: 0.5, agreeableness: 0.7, neuroticism: 0.6 },
    decision: 'careful, safety first, wants a phone call', channel: 'phone call then WhatsApp', budget: [40000, 150000], tripDays: [5, 8], groupSize: [3, 8],
    needs: ['safe comfortable stay', 'veg or Jain food', 'private cab', 'kid-friendly pace', 'clear inclusions'], objections: ['altitude for kids', 'food', 'hidden costs'],
    tone: 'reassuring and detailed', triggers: ['private vehicle', 'family rooms', 'doctor on call', 'all-inclusive price'],
    cues: ['family', 'kids', 'children', 'parents', 'veg', 'jain', 'private cab', 'safe', 'comfortable', 'elderly', 'my wife', 'my husband'] },
  { id: 'honeymooners', name: 'Honeymoon couples', regions: ['Delhi', 'Mumbai', 'Ahmedabad', 'Jaipur', 'Kolkata'], ages: [24, 32],
    personality: { openness: 0.6, conscientiousness: 0.6, extraversion: 0.5, agreeableness: 0.8, neuroticism: 0.5 },
    decision: 'emotional, privacy and romance over price', channel: 'WhatsApp with photos', budget: [50000, 200000], tripDays: [5, 8], groupSize: [2, 2],
    needs: ['private villa or pool', 'candlelight dinner', 'photoshoot', 'no group'], objections: ['crowded group trips', 'dates fixed by wedding'],
    tone: 'warm and romantic', triggers: ['surprise setup', 'private transfers', 'couple photoshoot'],
    cues: ['honeymoon', 'couple', 'wedding', 'romantic', 'private', 'villa', 'candlelight', 'anniversary', 'just married'] },
  { id: 'solo-women', name: 'Solo women travelers', regions: ['Bengaluru', 'Delhi', 'Mumbai', 'Kochi', 'Chandigarh'], ages: [23, 38],
    personality: { openness: 0.9, conscientiousness: 0.7, extraversion: 0.5, agreeableness: 0.6, neuroticism: 0.5 },
    decision: 'researches safety reviews, decides alone', channel: 'Instagram DM then WhatsApp', budget: [12000, 35000], tripDays: [3, 7], groupSize: [1, 1],
    needs: ['safe group with women', 'female trip leader', 'verified reviews', 'single occupancy option'], objections: ['safety', 'sharing room with strangers'],
    tone: 'respectful and transparent', triggers: ['women-only departures', 'female leader', 'past traveler reviews'],
    cues: ['solo', 'alone', 'female', 'woman', 'women', 'safe for girls', 'single room', 'first solo trip', 'girl'] },
  { id: 'nri-families', name: 'NRI families visiting India', regions: ['New Jersey', 'London', 'Toronto', 'Sydney', 'Dubai', 'Singapore'], ages: [35, 55],
    personality: { openness: 0.6, conscientiousness: 0.8, extraversion: 0.5, agreeableness: 0.6, neuroticism: 0.4 },
    decision: 'plans months ahead, expects professionalism and email', channel: 'email and WhatsApp call', budget: [100000, 400000], tripDays: [7, 14], groupSize: [3, 10],
    needs: ['premium hotels', 'airport pickup', 'flexible dates', 'invoice', 'international card payment'], objections: ['time zones', 'reliability', 'hygiene'],
    tone: 'professional and prompt', triggers: ['written itinerary with hotel names', 'refund policy', 'video call'],
    cues: ['nri', 'visiting india', 'coming to india', 'usd', 'dollars', 'pounds', 'from london', 'from usa', 'from canada', 'from australia', 'from toronto', 'from sydney', 'from singapore', 'from new jersey', 'invoice', 'international card', 'video call', 'refund policy', 'time zone'] },
  { id: 'european-backpackers', name: 'European backpackers', regions: ['Berlin', 'Amsterdam', 'Barcelona', 'Lyon', 'Lisbon', 'Prague'], ages: [20, 32],
    personality: { openness: 0.9, conscientiousness: 0.4, extraversion: 0.7, agreeableness: 0.7, neuroticism: 0.3 },
    decision: 'spontaneous, authenticity over comfort, books days before', channel: 'Instagram or email', budget: [8000, 25000], tripDays: [4, 12], groupSize: [1, 3],
    needs: ['local experiences', 'hostel vibe', 'treks', 'flexible plan', 'English-speaking guide'], objections: ['touristy packages', 'fixed group schedule'],
    tone: 'casual and authentic', triggers: ['homestays', 'local food', 'offbeat villages'],
    cues: ['backpack', 'backpacking', 'hostel vibe', 'trek', 'hiking', 'authentic', 'local food', 'homestay', 'homestays', 'euro', 'euros', 'from germany', 'from france', 'from spain', 'from netherlands', 'off the beaten', 'flexible plan', 'english speaking', 'few days before', 'berlin', 'amsterdam', 'barcelona', 'lyon', 'lisbon', 'prague', 'europe', 'european'] },
  { id: 'gulf-expats', name: 'Gulf-based Indian expats', regions: ['Dubai', 'Abu Dhabi', 'Doha', 'Riyadh', 'Muscat'], ages: [28, 45],
    personality: { openness: 0.5, conscientiousness: 0.7, extraversion: 0.6, agreeableness: 0.6, neuroticism: 0.4 },
    decision: 'books around Eid and summer leave, wants value and comfort', channel: 'WhatsApp call', budget: [40000, 120000], tripDays: [5, 10], groupSize: [2, 6],
    needs: ['cool-weather destinations', 'halal or veg options', 'direct flight cities', 'family comfort'], objections: ['heat', 'long transfers', 'visa timing'],
    tone: 'courteous and efficient', triggers: ['Eid departures', 'AED pricing', 'airport pickup'],
    cues: ['dubai', 'abu dhabi', 'doha', 'qatar', 'riyadh', 'saudi', 'oman', 'muscat', 'aed', 'eid', 'summer vacation', 'halal', 'direct flight', 'cool weather', 'live in dubai', 'gulf'] },
  { id: 'corporate-offsites', name: 'Corporate offsite organisers', regions: ['Bengaluru', 'Gurugram', 'Pune', 'Hyderabad', 'Noida'], ages: [28, 45],
    personality: { openness: 0.5, conscientiousness: 0.9, extraversion: 0.6, agreeableness: 0.5, neuroticism: 0.5 },
    decision: 'needs a quote, GST invoice and manager approval', channel: 'email and call', budget: [200000, 1500000], tripDays: [2, 4], groupSize: [15, 80],
    needs: ['team activities', 'conference room', 'GST invoice', 'single quote', 'transport from office'], objections: ['approval cycle', 'liability', 'vendor onboarding'],
    tone: 'formal and precise', triggers: ['itemised quote', 'past corporate clients', 'activity list'],
    cues: ['offsite', 'team outing', 'corporate', 'company', 'gst', 'invoice', 'employees', 'team building', 'hr', 'quotation', 'quote'] },
  { id: 'seniors', name: 'Senior citizens', regions: ['Pune', 'Vadodara', 'Mysuru', 'Kolkata', 'Jaipur'], ages: [58, 75],
    personality: { openness: 0.4, conscientiousness: 0.8, extraversion: 0.5, agreeableness: 0.8, neuroticism: 0.6 },
    decision: 'slow, trusts a phone call and references', channel: 'phone call', budget: [30000, 90000], tripDays: [5, 9], groupSize: [2, 12],
    needs: ['easy pace', 'minimal walking', 'medical support', 'pilgrimage or scenic', 'ground-floor rooms'], objections: ['health', 'altitude', 'long drives'],
    tone: 'patient and respectful', triggers: ['doctor on call', 'wheelchair access', 'temple visits'],
    cues: ['senior', 'seniors', 'senior group', 'retired', 'pilgrimage', 'temple', 'char dham', 'knee', 'elderly', 'my parents', 'aged', 'relaxed pace', 'easy pace', 'no long drives', 'minimal walking', 'call me', 'doctor', '60 years', '65 years'] },
  { id: 'adventure-junkies', name: 'Adventure junkies', regions: ['Bengaluru', 'Pune', 'Delhi', 'Manali', 'Dehradun'], ages: [22, 40],
    personality: { openness: 0.9, conscientiousness: 0.6, extraversion: 0.8, agreeableness: 0.5, neuroticism: 0.2 },
    decision: 'judges by difficulty grade and gear, books fast', channel: 'Instagram DM', budget: [10000, 45000], tripDays: [4, 10], groupSize: [1, 6],
    needs: ['high-altitude treks', 'rafting or paragliding', 'certified guides', 'gear list', 'difficulty grade'], objections: ['beginner-level groups', 'safety record'],
    tone: 'direct and expert', triggers: ['summit altitude', 'guide certifications', 'small batch'],
    cues: ['trek', 'summit', 'altitude', 'rafting', 'paragliding', 'bike trip', 'biking', 'difficult', 'moderate', 'gear', 'camping', 'pass'] },
  { id: 'luxury-couples', name: 'Luxury couples', regions: ['Mumbai', 'Delhi', 'Dubai', 'London', 'Singapore'], ages: [30, 50],
    personality: { openness: 0.6, conscientiousness: 0.7, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.3 },
    decision: 'expects curation, dislikes forms, decides on trust', channel: 'WhatsApp with a concierge feel', budget: [150000, 600000], tripDays: [4, 10], groupSize: [2, 4],
    needs: ['five-star stays', 'private guide', 'fine dining', 'no fixed group', 'seamless transfers'], objections: ['group trips', 'generic itineraries'],
    tone: 'polished and concise', triggers: ['bespoke itinerary', 'named hotels', 'private experiences'],
    cues: ['luxury', 'five star', '5 star', 'private guide', 'bespoke', 'premium', 'resort', 'business class', 'fine dining', 'suite'] },
  { id: 'digital-nomads', name: 'Digital nomads', regions: ['Lisbon', 'Bali', 'Goa', 'Chiang Mai', 'Tbilisi', 'Bengaluru'], ages: [25, 40],
    personality: { openness: 0.9, conscientiousness: 0.6, extraversion: 0.6, agreeableness: 0.6, neuroticism: 0.3 },
    decision: 'needs wifi and a workspace, stays long, books month by month', channel: 'email or Instagram', budget: [20000, 60000], tripDays: [14, 60], groupSize: [1, 2],
    needs: ['reliable wifi', 'monthly stay', 'coworking', 'quiet room', 'weekend excursions'], objections: ['connectivity', 'noise', 'short packages'],
    tone: 'practical and relaxed', triggers: ['wifi speed', 'monthly rate', 'community events'],
    cues: ['remote work', 'work from', 'wifi', 'coworking', 'nomad', 'long stay', 'a month', 'monthly', 'workation', 'laptop'] },
];

const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'for', 'and', 'or', 'is', 'we', 'i', 'my', 'our', 'with', 'on', 'at']);
function norm(t) { return String(t).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' '); }

/** Classify a lead message into cohorts. Returns ranked [{id, name, score, hits}]. */
function classify(message) {
  const text = ' ' + norm(message) + ' ';
  const ranked = COHORTS.map(c => {
    const hits = c.cues.filter(cue => text.includes(' ' + cue + ' ') || text.includes(' ' + cue));
    const regions = c.regions.map(r => r.toLowerCase()).filter(r => text.includes(' ' + r + ' '));
    let score = hits.reduce((a, h) => a + (h.includes(' ') ? 3 : 2), 0) + regions.length * 2;
    const budget = (text.match(/(\d{2,3})\s*k\b|(\d{4,7})/) || []).filter(Boolean).slice(1).map(v => v.length <= 3 ? +v * 1000 : +v)[0];
    if (budget && budget >= c.budget[0] * 0.5 && budget <= c.budget[1] * 1.5) score += 1;
    const group = (text.match(/\b(\d{1,2})\s*(?:people|pax|persons|of us|friends|members|employees)\b/) || [])[1];
    if (group && +group >= c.groupSize[0] && +group <= c.groupSize[1]) score += 1;
    return { id: c.id, name: c.name, score, hits };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
  return ranked;
}

function get(id) { return COHORTS.find(c => c.id === id); }

/** Draft a first reply that matches the cohort's tone, needs and triggers, and asks for what is missing. */
function draftReply(message, { name = '' } = {}) {
  const ranked = classify(message);
  const c = ranked.length ? get(ranked[0].id) : null;
  const text = norm(message);
  const missing = [];
  if (!/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|weekend|next week|next month|\d{1,2}\/\d{1,2})/i.test(text)) missing.push('your travel dates');
  if (!/\b(\d{1,2})\s*(people|pax|persons|of us|friends|members)\b|\bcouple\b|\bsolo\b|\balone\b/.test(text)) missing.push('how many of you are travelling');
  if (!/\d{2,3}\s*k\b|\d{4,7}|budget/.test(text)) missing.push('a rough budget per person');
  const hi = name ? `Hi ${name}!` : 'Hi!';
  if (!c) return { cohort: null, reply: `${hi} Thanks for reaching out to Travelers Clan. To plan this right, could you share ${missing.join(', ') || 'a little more about the trip you have in mind'}? I will send a day-by-day plan within the hour.` };
  const openers = {
    'crisp and upbeat': `${hi} Great timing, this one fills up on long weekends.`,
    'friendly and energetic': `${hi} Love that you are planning this with the whole gang.`,
    'reassuring and detailed': `${hi} Thank you for considering us for your family. We plan these around comfort and safety first.`,
    'warm and romantic': `${hi} Congratulations! We would love to make this one special.`,
    'respectful and transparent': `${hi} Thanks for writing in. Our groups are led with safety as the first rule, and you can speak to past women travelers before deciding.`,
    'professional and prompt': `${hi} Thank you for reaching out. I will send a written itinerary with hotel names and the refund policy today.`,
    'casual and authentic': `${hi} Nice, you are after the real thing, not the tourist loop.`,
    'courteous and efficient': `${hi} Thanks for the message. We run departures timed with Eid and summer leave, with pickups from the airport.`,
    'formal and precise': `${hi} Thank you for your enquiry. I will share an itemised quotation with a GST invoice and a list of team activities.`,
    'patient and respectful': `${hi} Namaste, and thank you for writing. Our trips for seniors keep an easy pace with a doctor on call.`,
    'direct and expert': `${hi} Good choice. I will send the difficulty grade, summit altitude, gear list and our guides' certifications.`,
    'polished and concise': `${hi} Thank you. I will curate a private itinerary with named hotels and your own guide.`,
    'practical and relaxed': `${hi} We have monthly stays with tested wifi and a quiet work corner.`,
  };
  const ask = missing.length ? ` To tailor it, could you share ${missing.join(', ')}?` : ' I will send the plan and price within the hour.';
  const hook = c.triggers[0] ? ` Also worth knowing: ${c.triggers[0]}.` : '';
  return { cohort: c, reply: `${openers[c.tone] || hi}${hook}${ask}` };
}

/** Facts about every cohort, as teaching sentences. */
function lessons() {
  const out = [];
  for (const c of COHORTS) {
    out.push(`${c.name} are a customer cohort.`);
    out.push(`${c.name} usually come from ${c.regions.slice(0, 3).join(', ')}.`);
    out.push(`${c.name} are ${c.ages[0]} to ${c.ages[1]} years old.`);
    out.push(`${c.name} decide in a way that is ${c.decision}.`);
    out.push(`${c.name} prefer ${c.channel}.`);
    out.push(`${c.name} have a budget of ${c.budget[0]} to ${c.budget[1]} per person.`);
    out.push(`${c.name} need ${c.needs.join(', ')}.`);
    out.push(`${c.name} worry about ${c.objections.join(' and ')}.`);
    out.push(`${c.name} should be spoken to in a ${c.tone} tone.`);
    out.push(`${c.name} are convinced by ${c.triggers.join(', ')}.`);
    const p = c.personality; const hi = Object.entries(p).filter(([, v]) => v >= 0.7).map(([k]) => k); const lo = Object.entries(p).filter(([, v]) => v <= 0.3).map(([k]) => k);
    if (hi.length) out.push(`${c.name} are high in ${hi.join(' and ')}.`);
    if (lo.length) out.push(`${c.name} are low in ${lo.join(' and ')}.`);
  }
  return out;
}

module.exports = { COHORTS, classify, draftReply, lessons, get };
