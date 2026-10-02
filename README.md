# ATLAS — the mind of the Travelers Clan

**Adaptive Traveler Learning & Awareness System.** A self-learning, self-evolving cognitive agent
built from scratch in plain Node.js, with a live web visualizer of its brain. It is born knowing
nothing, learns from every conversation, sleeps to consolidate, evolves its own neuro-parameters,
and grows fastest when a frontier Claude model acts as its mentor.

> Honest framing: this is a cognitive architecture, not a superintelligence. Its intelligence is the
> sum of (a) what the clan teaches it, (b) the neuroscience-inspired machinery below, and (c) the
> mentor model it distils from. It gets smarter every day you talk to it.

```
npm start            # http://localhost:3000  (zero dependencies)
npm test             # 9 tests on memory, reasoning, skills, sleep, evolution
npm run train        # accelerated upbringing: study curriculum, self-quiz, sleep, evolve 10 generations
```

## Language models (all optional, open-source first)

| Where | How to switch it on | What it adds |
|---|---|---|
| Local, free | install [Ollama](https://ollama.com), `ollama pull llama3.2` (or `qwen2.5:7b`), start ATLAS | free-form understanding, replies polished in the customer's language, a second critic, learning from messy statements |
| Any OpenAI-compatible server (LM Studio, llama.cpp, vLLM, Groq, OpenRouter, Together, Hugging Face) | `OPENAI_BASE_URL=https://api.groq.com/openai/v1 OPENAI_MODEL=llama-3.3-70b-versatile OPENAI_API_KEY=...` | same, with bigger open models |
| In the browser | the **Load open model** button on your website or local file (WebLLM, ~0.7 GB, WebGPU) | same, no server at all |
| claude.ai | nothing to do; the page uses Claude through your account | same |
| Claude API | `ANTHROPIC_API_KEY` | same, with the frontier model |

Without any model, every agent still runs on rules and memory; the model is the fluency layer, the mind is the memory.

Optional mentor, two ways. Free and local: install [Ollama](https://ollama.com), run `ollama pull llama3.2`, start ATLAS; it finds the local model on its own (set `OLLAMA_MODEL` to use another). Or Claude Fable 5.1 with server-side refusal fallbacks:

```
npm install @anthropic-ai/sdk
export ANTHROPIC_API_KEY=sk-ant-...
npm start
```

## Where to run it

ATLAS is a single Node.js process with no build step and no database (its mind is one JSON file).

**Zero-install option:** `npm run build:web` bundles the whole brain into `dist/atlas-web.html`, a single page that runs entirely in the browser (memory lives in that browser's storage). Published as a claude.ai artifact it gains Claude as a mentor through the page's own ask-Claude capability.

| Option | Steps |
|---|---|
| **Your laptop** (fastest) | Install Node 18+, then `git clone`, `cd Travelers-clan`, `npm start`, open http://localhost:3000 |
| **Render** (free tier, always-on URL) | New → Blueprint → point at this repo; `render.yaml` sets everything, including a 1 GB disk so the mind survives restarts. Add `ANTHROPIC_API_KEY` in the dashboard to switch the mentor on. |
| **Railway / Fly / any Docker host** | `docker build -t atlas . && docker run -p 3000:3000 -v atlas-data:/data atlas` |
| **Hostinger Node.js hosting** | Upload the repo, start command `node server.js`, set env `ATLAS_DATA` to a persistent folder |

Keep `ATLAS_DATA` on a persistent disk: that folder is ATLAS's memory.

## Inside an existing Express website (travelersclan.in)

**Automatic (recommended):** on the PC that holds the site's source, double-click `ATLAS-install.bat` (Windows) or run `node scripts/integrate-site.js --zip`. It finds the site folder, copies ATLAS into `<site>/atlas`, inserts the mount lines into `server.js` (idempotent, marked `// ATLAS:begin`), smoke-tests the router, and writes `travelersclan_<timestamp>.zip` next to the site folder for the usual hPanel upload. Pass the site path explicitly if it lives somewhere unusual: `node scripts/integrate-site.js D:\sites\travelersclan --zip`.

**Manual:** 
Copy this repo as a folder named `atlas` into the site's source, then add two lines to the site's `server.js`:

```js
const atlas = require('./atlas/integrations/express');
app.use('/admin/atlas', atlas({ dataDir: __dirname + '/data/atlas', express }));
```

Put those lines after your admin authentication middleware so only admins reach `/admin/atlas`. The folder `data/atlas` must survive deploys (keep it out of the build output or point `dataDir` at a persistent path). The first boot seeds from `atlas/mind/state.json`, the mind trained by the parent. No new npm dependencies.

## The growing loop (nothing is ever lost)

Every copy of ATLAS keeps learning, and copies **merge** instead of overwrite. A merge is a union: all facts, memories, synapses, skills and the fittest genome from both sides survive.

| Where it runs | How it learns | How its learning is kept |
|---|---|---|
| Cloud routine (nightly) | new lesson, train, interview | commits `mind/state.json`, republishes the link |
| Local server (`npm start`) | conversation, daily self-upbringing | saves `data/state.json`; absorbs any newer `mind/state.json` after `git pull`; `npm run sync:push` folds local learning back into the repo |
| Browser page | conversation, mentor | browser storage; **Export mind** → **Merge a mind** on any other copy |
| Inside travelersclan.in | admin conversations | `data/atlas/state.json`; seeds from and merges with `atlas/mind/state.json` |

When cloud credits run out, run the local server: it continues from the last committed mind, keeps training itself daily, and `npm run sync:push` publishes what it learned so the cloud, the website and the browser page pick it up next time.

## The council of agents

Seven specialists, one duty each, all teaching the mind after every run:

| Agent | Duty |
|---|---|
| Sales | cohort, funnel stage, next action with evidence, drafted reply |
| Operations | feasibility (season, altitude, days, budget), routing, timing, permits, emotional fit, day-by-day itinerary |
| Customer Experience | tone for the cohort, unanswered questions, negative signals, touchpoints |
| News and risk desk | dated advisories (weather, security, political, visa, transport, health) and their impact; feed it headlines with `news: ...` |
| Critic | gaps, unsatisfactory answers, itinerary loopholes (acclimatisation, buffer, pace, budget, permits, weather clauses), fixes |
| Marketing | acquisition cost by campaign, budget shifts, creative refresh, seasonal calendar, hooks per cohort |
| Tester and teacher | probes the mind, lists weak answers and contradictions, teaches missing destination, permit and risk facts |

In chat: `council: <conversation>`, `plan: <requirements>`, `critic: <plan or conversation>`, `news: <headlines>`. API: `POST /api/council`, `/api/council/review`, `/api/council/ask`, `/api/news`. The dashboard's Council panel shows every agent's verdict, findings and fixes.

## The exam

`npm run exam` runs a fixed 54-question exam (recall, teaching, corrections, inference, yes/no, context, comparison, counting, arithmetic over facts, negation, typos, honesty, aggregation). Every change to the mind's code is measured against it; the nightly routine refuses to commit a round that lowers the score.

## Upbringing (how the parent trains it)

`mind/state.json` is the trained mind, versioned in git. A training round is:

```
ATLAS_DATA=mind npm run train -- --generations 20 --cycles 3   # study curriculum, self-quiz, sleep, evolve
ATLAS_DATA=mind npm run build:web                              # bake the mind into dist/atlas-web.html
```

Add lessons to `curriculum/` and rerun; the web page then opens already educated.

**Embedding in an existing website or admin panel:** the build also writes `dist/atlas-standalone.html`, a complete page with no server needs. Upload it anywhere (for example `/admin/atlas.html` on your host, or as a WordPress page via the file manager) and link to it from the admin menu, or embed it with `<iframe src="/admin/atlas.html" style="width:100%;height:90vh;border:0"></iframe>`. Memory lives in the browser of whoever opens it.

## How the brain works

| Region (neuroscience) | Module | What it does |
|---|---|---|
| Sensory cortex | `core/text.js` | Tokenising, stemming, entity spotting, sentence splitting, cosine similarity |
| Hippocampus (episodic memory) | `core/memory.js` | Every experience stored with time, emotional valence, importance; a forgetting curve whose time constant grows with rehearsal (spacing effect) |
| Neocortex (semantic memory) | `core/memory.js` | Concept graph with **Hebbian synapses** (co-activation strengthens links), spreading activation, capacity-limited **working memory** (7±2) |
| Sleep / consolidation | `Memory.consolidate` | Replays salient episodes into semantic facts, prunes weak synapses, merges duplicates |
| Dopamine (reward) | `Memory.reward` | 👍/👎 feedback potentiates or depresses the synapses that just fired (reward-modulated plasticity) |
| Language areas | `core/learning.js` | Triple extraction (`X is in Y`, `X offers Y`, …), question parsing, answer composition with confidence, corrections ("no, X is Y") |
| Basal ganglia (procedural memory) | `core/skills.js` | Built-in skills (arithmetic, percentages, per-person split, dates, unit conversion, **lead gate** scoring) plus **learned skills**: sandboxed JS admitted only if its tests pass |
| Genome / evolution | `core/evolution.js` | Learning rate, decay, consolidation threshold, curiosity, working-memory size … tuned by an evolutionary loop whose fitness is recall on held-out facts + human approval |
| The parent | `core/mentor.js` | Claude answers when ATLAS is unsure (and ATLAS memorises the answer), reflects on conversations into lessons, and writes new skills |
| Executive loop | `core/brain.js` | perceive → recall → reason → act → learn, plus curiosity questions, sleep and evolution |

## Teaching it

- **Statements** are learned: `The Ladakh trip costs 24000 per person.`
- **Questions** are answered from facts, skills, or memories: `How much is the Ladakh trip?`
- **Corrections** unlearn and relearn: `No, the Ladakh trip costs 26000.`
- **Rewards** shape plasticity: press 👍 or 👎 after an answer.
- **Curiosity**: ATLAS asks about entities it keeps noticing; answer and it learns.
- **WhatsApp**: paste an exported chat; staff messages become facts, lead questions become training signal, and ATLAS reports the most-asked topics. Try `score this lead: <message>`.
- **Curriculum**: drop `.md`/`.txt` lesson files into `curriculum/`; they are studied once on boot.
- **Sleep** every ~30 messages or 20 minutes; **evolve** hourly, or on demand from the UI.

Everything persists in `data/state.json`. Export the whole mind from the UI.

## API

| Route | Body | Purpose |
|---|---|---|
| `POST /api/chat` | `{message}` | Talk to ATLAS |
| `POST /api/feedback` | `{good: true/false}` | Reward or punish the last answer |
| `POST /api/teach` | `{text}` | Bulk lesson |
| `POST /api/import/whatsapp` | `{text, staff}` | Learn from an exported chat |
| `POST /api/sleep` | | Consolidate now |
| `POST /api/evolve` | `{generations}` | Run evolution now |
| `POST /api/grow` | | Ask the mentor to synthesize a skill for recurring unanswered questions |
| `GET /api/snapshot` · `/api/graph` · `/api/facts` · `/api/export` | | State for the UI |
| `GET /api/events` | | Server-Sent Events stream of cognitive activity |
| `POST /api/reset` | `{confirm:"RESET"}` | Rebirth |

## Grow tab: our own Google-profile, WhatsApp and marketing agents (free)

The paid "AI agents for local business" products sell three things. ATLAS now has all three inside the admin panel, no subscription:

| Agent | What it does | Where |
|---|---|---|
| Google profile | Audit score with the 10 things that matter, 20 local keywords, this week's posts, review replies (angry reviews are flagged "call them first") | Grow → Google profile |
| WhatsApp chat | Answers in seconds in English or Hinglish, grounded on your real trips (date, price, seats, total for the group, advance), keeps a lead sheet, hands booking/payment/complaints to a human | Grow → WhatsApp agent, website widget, `scripts/whatsapp.js` |
| Marketing | Indian festival/season campaign calendar with start dates, broadcast drafts per segment (past travellers, warm leads, referral, review ask, organisers), 5-touch follow-up sequence, ROI from the lead sheet | Grow → Today, Marketing & ROI |

Setup once in **Grow → Setup**: phone number, city, and your upcoming trips with fixed dates, prices and seats. Then open **Today** every morning, send what it drafted, press Done.

- **Live trip cards** on travelersclan.in: `<div id="atlas-trips"></div><script src="/atlas-chat/trips.js" data-base="/atlas-chat"></script>`. Fixed date, price, real seats left (holds counted), a WhatsApp button per trip, waitlist when full. Change a trip in Setup and the website changes. Preview at `/site-demo.html`.
- **Website widget** on travelersclan.in: `<script src="/atlas-chat/widget.js" data-base="/atlas-chat"></script>`. `scripts/integrate-site.js` now mounts the public routes for you (`app.use('/atlas-chat', atlasRouter.widget)`), so run it again with `--force` on an older install.
- **Real WhatsApp number, free**: `npm install @whiskeysockets/baileys qrcode-terminal && node scripts/whatsapp.js`, scan the QR from WhatsApp Business → Linked devices. Replies are drafted by default; flip "Auto-send" in the Grow tab to send them automatically. Money and complaint messages always wait for you.
- **Open-source model**: install [Ollama](https://ollama.com), run `ollama pull llama3.2` (or `qwen2.5:7b` for better Hindi), start ATLAS; every post, reply and broadcast gets polished in the customer's own language. Nothing breaks without it.

### Testing the WhatsApp agent

- `npm run exam` includes 18 WhatsApp conversations in English, Hinglish, Hindi and Gujarati script.
- `npm run stress` throws 200 synthetic customers at the agent (FAQ-heavy, bargainers, ghosts, group-size changers, script switchers, direct bookers, angry, thinkers) and reports every weak reply by category: empty, repeated, over-long, unanswered, wrong language, silent handoff. The weaknesses are taught to the mind as critic lessons and saved to `synth/stress-report.json`.
- Seats: a "hold" through the agent reserves seats for 24 hours. Mark the lead **advance** (or enter a booking value) when the money arrives and the hold becomes a booking; mark **lost** to release it.
- Daily digest: with `scripts/whatsapp.js` connected, your own number receives the day's follow-ups, seat alerts and the campaign to run at 9:00 IST (`WA_DIGEST_TO=91XXXXXXXXXX` to send it elsewhere).

### The customer universe

`npm run universe` generates every kind of customer a travel company can face by combination (life stage × geography × income × occasion × group × decision style × risk attitude × price sensitivity × trust × communication style × control need × language × channel × mood: over a billion kinds), samples hundreds with full coverage of every dimension, gives each a behaviour model (what they ask, how they react to price, scarcity, proof, holds), and plays them against the WhatsApp agent in four scenarios: sales, support complaint, marketing reaction, probing a vague lead. A judge scores each conversation; the playbook aggregates success by segment, lists failure reasons, teaches the mind lessons about who needs what, and saves `synth/universe-report.json` (shown on Reply to a customer). First run: 78% handled well; after fixing what it found (complaints in Hinglish, "handle everything", "any reviews?"): 99%.
