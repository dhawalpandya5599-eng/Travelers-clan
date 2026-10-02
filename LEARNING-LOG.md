# ATLAS learning log

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
