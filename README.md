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

Optional mentor (Claude Fable 5.1, with server-side refusal fallbacks):

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
