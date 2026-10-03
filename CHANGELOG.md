# Changelog

## 1.2.0 (2026-10-03)

- Routing knowledge: 38 routes with legs, km, hours, halts, hazards, season, train and flight options, driving rules and a plan checker; answers "kaise jayenge", "bus kitne ghante" and "route for ladakh in july"; journey line in the pre-departure brief.
- Local intelligence for 24 places: money and UPI, SIM, transport, food, dress, scams, tipping, emergency, plugs, time, alcohol, phrases, water, health; answers "upi chalega?", "daaru milegi?", "local tips for dubai".
- Lessons 31 and 32, RESOURCES.md, 20 new paraphrases, 2 eval checks.
- Cloud routine paused to preserve credits.
- Hex planning in the style of Uber H3: hotel zone per destination, feasible day-by-day itineraries with timings, hotel ranking by source-weighted Bayesian reviews, stars and location (Goa, Manali, Bangkok, Phuket, Dubai, Kerala); lesson 33.
- Procedural exam ladder, levels 12 to 100 (`npm run ladder`), in the release gate; highest level at 100%: 100. Fixes it found: Hinglish "jana" read as January, a group size said earlier lost on the hold turn, Gujarati and Hindi travel and local words, Hinglish competitor objections, typo tolerance for intent keywords, Gujarati hand-off wording.
- Captain's trip pack (`trip pack for goa`, Trip pack button, `/api/pack`), level 11 (desks in the customer's and the chief's words), `npm run knowledge` coverage report.

## 1.1.0 (2026-10-03)

- OYE floating assistant for the website: trip cards, one-tap hold, quick replies, WhatsApp handoff with context, memory across pages, analytics (opened, messages, holds, WhatsApp, human).
- Exams: levels 7 to 10 at 100%, paraphrase suite (164 wordings), browser smoke, release gate (`npm run release`).
- Business rules editable in Set up replace hardcoded numbers (advance, holds, refunds, kids, name change, joins, rooms, margins, visa handling).
- Sales operations: trip board per departure, balance-due and pre-departure proposals, waiting list, hand-off wait alerts, lost reasons, source attribution, traveller names and emergency contact tracking.
- Visa and permits desk: knowledge base for 28 countries and 9 Indian permit regions, case file per traveller per trip, connected to chat, agent, council, autopilot, board and dashboard.
- Mind map renders in the web bundle; clickable clusters; main continent only.
- Built-in server: optional password (`OYE_PASSWORD`), daily backups to `data/backups/` (14 kept).
- Rename ATLAS to OYE.

## 1.0.0

- First complete OYE: mind, WhatsApp agent, council, autopilot, curriculum, dashboard, levels 1 to 6.
