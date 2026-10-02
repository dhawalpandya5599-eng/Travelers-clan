# OYE handoff: continue on your own computer

This file is the bridge between the cloud session that built OYE and the next session on your PC.
Open the repo in Claude Code (or any editor) and say: **"Read HANDOFF.md and continue from Next steps."**

## Where the work lives

| What | Where |
|---|---|
| Code, one branch only | `https://github.com/dhawalpandya5599-eng/Travelers-clan`, branch `claude/clever-maxwell-aclt88` |
| Dashboard preview (web bundle, runs in the browser alone) | https://claude.ai/artifact/Fb9Q6asYMnTvANGbz6amfE |
| Live site | https://travelersclan.in (admin: `/admin/atlas`, public chat: `/atlas-chat`) |
| Self-improvement routine (cloud, every 6 h) | "OYE self-improvement loop", cron `7 */6 * * *` UTC |
| Hostinger | account `u269274394`, website `travelersclan.in`, Node app, entry `server.js`, build script `build` |

## Get the exact code on your PC

```bat
git clone -b claude/clever-maxwell-aclt88 https://github.com/dhawalpandya5599-eng/Travelers-clan.git
cd Travelers-clan
node server.js
```

Open http://localhost:3000. Zero dependencies, Node 22 or newer. Already cloned? `git checkout claude/clever-maxwell-aclt88 && git pull`.

Everything green right now (all run without a model, rules only):

```bat
npm run check
```

| Suite | Command | Result at handoff |
|---|---|---|
| Unit tests | `npm test` | 19/19 |
| Eval | `node scripts/eval.js` | 173/173 |
| Levels 1 to 8 | `node scripts/levels.js` | 104/104, all 100% |
| Stress (200 WhatsApp chats) | `node scripts/stress.js` | 0.1% weak |
| Customer universe (400 personas) | `node scripts/universe.js` | 400/400 |
| Mastery (needs a model) | `node scripts/mastery.js` | writes `MASTERY-REVIEW.md` when no model is connected |

## Deploy the latest version to travelersclan.in

On the PC that has the website source (`C:\Downloads\tcnodedeploy`):

```bat
cd C:\Users\dhawa\Travelers-clan
git pull
node scripts\integrate-site.js "C:\Downloads\tcnodedeploy" --zip --force
```

It prints `Deploy archive: ...\releases\travelersclan_<date>_<time>.zip ... atlas folder included`.
Upload that zip in hPanel → Websites → travelersclan.in → Deploy (or tell Claude "uploaded" and it starts the build through the Hostinger connector).
After the build: `/admin/atlas` is the dashboard, `/atlas-chat/widget.js` is the floating OYE.

Put OYE on every page of the site (once, before `</body>`):

```html
<script src="/atlas-chat/widget.js" data-base="/atlas-chat"></script>
```

Any button can open it with a question: `<a href="#" data-oye="Goa in December for 4?">Ask OYE</a>`.
Live trip cards: `<div id="atlas-trips"></div><script src="/atlas-chat/trips.js" data-base="/atlas-chat"></script>`.

## What OYE is (map of the code)

| Area | Files |
|---|---|
| Mind: memory, synapses, consolidation, evolution | `core/brain.js`, `core/memory.js`, `core/learning.js`, `core/reason.js`, `core/evolution.js` |
| WhatsApp / website sales agent (intents, Hinglish, holds, leads, campaigns) | `core/growth.js` |
| Reasoning agent with ~30 tools, works with or without a model | `core/agent.js`, `core/mentor.js` (Claude, Ollama, OpenAI-compatible) |
| Council of agents (sales, cx, operations, critic, strategy, pricing, wellbeing, analyst) | `core/council.js`, `core/agents.js` |
| Autopilot: proposals, outbox, KPIs | `core/autopilot.js`, `scripts/whatsapp.js` (Baileys bridge, optional) |
| Customer universe and personality models | `core/universe.js`, `core/minds.js` |
| Business strategy, pricing, patterns, news, 5W1H | `core/strategy.js` |
| 79 destinations, activities with timings | `core/destinations.js`, `core/world.js` |
| Skills, connections (CSV, ICS, webhook) | `core/skills.js`, `core/connections.js` |
| Curriculum (30 lessons OYE studies at start) | `curriculum/*.md` |
| Dashboard | `public/index.html`, `public/app.js`, `public/style.css`, 3D map libs in `public/vendor/` |
| Customer-facing floating assistant | `public/widget.js` |
| Servers | `server.js` (zero-dependency), `integrations/express.js` (mount inside the website) |
| Web bundle builder | `scripts/build-web.js` → `dist/oye-web.html` |

Environment variables accept `OYE_*` or the older `ATLAS_*` names. `ATLAS_NO_OLLAMA=1` skips the local model probe.

## Done in the last cloud session

- Renamed ATLAS → OYE everywhere the user sees it (routes unchanged).
- Audit fixes across growth, agent, autopilot, connections, destinations (booking flow, holds capped at seats left, payment acknowledged first, lakh budgets, date guards, CSV injection, ICS folding, atomic saves).
- New floating OYE assistant for the website: branded avatar, nudge, greeting, live trip cards with seats left, one-tap hold, quick replies, typing indicator, WhatsApp handoff that carries the chat, memory across pages, mobile sheet, `window.OYE.ask()`.
- New `human` intent: "talk to a person / call me / number do" hands off properly.
- Sharper OYE persona in the council polish prompt (feeling first, facts exact, one next step, mirror the customer's language).
- Inside the mind: the 3D map now refits when data arrives and when the tab opens, hides unconnected ideas and tiny islands, clickable clusters fly the camera to the hub.

## Next steps (in order)

1. **Deploy**: run the integrate line above, upload, check `/admin/atlas` and the floating OYE on the home page.
2. **Connect a model** in Set up (Claude key, or Ollama locally) so the council polishes replies and `npm run mastery` can grade itself.
3. **Level 8** in `scripts/levels.js`: harder than 7 (level 7 added: crises mid-trip, corporate groups, regroup after a hold, company-side cancellation, weather packing in Gujarati, full payment totals, competitor-driven cancellation, ads vs referrals maths, operator price hikes, marketing budget choice, 1-star review handling). Ideas for 8: a 5-turn negotiation that changes trip, date and group each turn; two customers in one chat; a refund dispute with dates to compute; a Gujarati voice-note transcript with typos; a cash-flow question across three batches.
4. **WhatsApp bridge**: `npm run whatsapp` on a PC that stays on, scan the QR, enable auto-reply in Marketing → settings once replies look right.
5. **Website**: add the widget tag and `data-oye` buttons on trip pages; put the trip cards block on the trips page.
6. **Teach OYE** real data: import past leads (CSV in Set up), real trips with seats, policies and UPI id in the profile.
7. Keep the routine: every run adds a harder level, fixes to 100%, trains, publishes the bundle and pushes.

## Credits note

The cloud session ran low on credits. Workflows and subagents were stopped; everything above was finished by hand and pushed. Nothing is pending in the cloud: the branch is the single source of truth.
