# OYE learning log

Every self-improvement run appends an entry: what was measured, what was weakest and why, what changed, before/after numbers, next target. The routine runs every 6 hours.

## 2026-10-02 · baseline (set by the parent session)

- Tests 19/19 · exam 116/116 · stress 300 conversations, 0.1% weak replies, holds reached 143/143.
- Mind: generation 99, ~715 facts.
- Weakest now: the reasoning agent has never run with a real model on the live site (no model connected there); the autopilot has no real leads to work on; the mind's free question answering is still word-overlap retrieval.
- Next target: make `core/agent.js` fallback answers richer and give the council's "Reply to a customer" the same grounded reply the WhatsApp agent gives (same trip and policy facts), so both screens agree.

## 2026-10-02 · mastery rounds 1-2 (graded by the parent session by hand)

- Round 1 battery (38 items): questions ~5/10 (fallback dumped all policies, could not compute an advance, parsed the visa question into garbage), expressions ~4/10 (fear, anger, grief, guilt, confusion got a generic "which trip?"; "how do I know you won't run away with my advance" was treated as a complaint), requirements ~6/10 (Lonavala and Rann of Kutch unknown, irrelevant Gulf/Pokhara news attached), situations ~8/10.
- Fixes: specific-answer fallback in core/agent.js (policy key, advance maths, refund-by-days, season, visa/documents, seats and value, trips by month, hottest lead); emotion layer (fear, joy, sarcasm) and new intents grief, trust, confused, medical, affordability, last-minute booking in core/growth.js; no pitch after an escalation; squad/gang/group of N parsing; 8 destinations added with aliases; news only for recognised destinations.
- Round 2: questions ~8.5, expressions ~8.5, requirements ~8, situations ~9. Locked in with 12 expression cases and 2 council cases in the exam (130/130). Stress 0.1% weak; universe 300/300.
- Not passed yet by the strict gate (needs a model to grade every item). Next: the routine grades with the model and keeps teaching until the gate passes.

## 2026-10-02 · mastery levels 1-6, pass mark 100%

- Built scripts/levels.js: 80 checks across six levels, easiest to hardest. Started at L1 100%, L2 67%, then fixed level by level: group-change phrasing and re-holds, trip switching mid-chat, month confirmation, Gujarati safe/hold/discount words, nervous first-timers vs confusion, "husband says scam" vs escalation, bad-experience reliability answer, two-trip comparison against budget, cheapest-fit recommendation for large groups, destination questions (crowds, quiet, weather), senior notes on custom estimates, incident SOPs, push-or-merge decision, named campaigns, review replies that acknowledge the praised part, persona-based closing advice, zero-budget lead plan, couples+kids group counting, total-budget maths, trip extensions, weekday reasoning, competitor price objection with inclusion-match offer, price-change revenue maths, broadcast drafting, run-rate to fill.
- Result: all six levels 100%; exam 130/130; stress 0.1% weak; universe 300/300; tests 19/19.
- Next: level 7 (real customer transcripts once the number is live) and model-graded mastery in the routine.

## 2026-10-02 · new knowledge and business skills

- 8 lessons (17-24), 277 sentences, every one parse-checked; mind facts 738 → 1025 after training (generation 102).
- 12 skills: gst, tcs, margin, break-even, instalments, forex, altitude, packing, long-weekends, invoice, utm, referral, trip-cost.
- 19 exam cases for knowledge and skills; exam 149/149; levels 1-6 100%; stress 0.1%; universe 300/300.

## 2026-10-02 · the full skill set

- core/world.js (48 destinations + activities with timings), core/minds.js (personality systems + therapy map), core/strategy.js (techniques, pricing strategy, pricing analytics, patterns, news reading, 5W1H), core/connections.js (CSV in/out, ICS, webhook).
- Skills: activities, 5w1h, personality, therapy, strategy, pricing-strategy, understand (+ the 12 business skills). Agent tools: activities, brief_5w1h, personality, therapy, strategy, pricing_strategy, pricing_analytics, patterns, read_news, understand. Council: strategy, pricing, wellbeing, analyst.
- Lessons 25-30 (203 facts). Exam 173/173; levels 1-6 100%; stress 0.1%; universe 300/300; tests 19/19; mind 1,247 facts, generation 104.
