# The OYE operating system

How Travelers Clan runs OYE day to day, how OYE gets better, and what must be true before anything goes live.
Read this once; the dashboard follows the same order.

## 1. Who does what

| Role | Owns | Where |
|---|---|---|
| Founder (Dhawal) | Trips, prices, the numbers OYE states as fact, approving drafts, confirming bookings | Set up, Today's work |
| OYE | First reply to every customer in seconds, holds, follow-ups, drafts, proposals, learning from corrections | WhatsApp, website widget, dashboard |
| Claude (cloud routine or local Claude Code) | Harder exams, fixes to 100%, new skills and data, releases | `scripts/`, `core/`, this repo |

## 2. The numbers OYE states as fact

OYE never invents a refund rule; it reads them from two places you control in Set up:

- **Policies** (sentences): included, not included, payment, cancellation, pickup, safety, food, ages. Quoted word for word.
- **Rules** (numbers): advance % and cap, hold hours, balance due, refund cut-off, transfer months, refund-when-we-cancel days, kids free-under and reduced-until ages and %, free name change days, self-drive or flight join % off, private room %, teacher free per N students, corporate quote hours, transport and stay share of price, target margin, confirmation minutes, pickup share days.

Blank means the default. Change a number and every reply, draft, exam and the autopilot use it from the next message. The defaults were set by Claude, not by you: **confirm or change each one in Set up, card 4, before the widget goes on the website.**

## 3. The daily loop (10 minutes)

0. Read the **Trip board** at the top of Today's work: per departure, booked, held, left, seats needed per day, leads by stage, lost reasons, money booked and open, and red flags (balance pending, pickup point not set, captain not assigned, waiting list with a seat open, under half full inside 10 days). Anyone shown as waiting for a human gets answered first.
1. Open **Today's work**. Follow-ups due now are listed with a ready draft; send or edit.
2. Holds expiring today: call, convert or release.
3. **OYE proposes** on Start here: approve, edit or dismiss each card (a follow-up, a seat push, a fill decision, a review ask, a referral ask).
4. Anything OYE got wrong: open **Reply to a customer**, paste the message, correct the reply. The correction becomes a lesson.

## 4. The weekly loop (30 minutes, Monday)

1. Ask OYE: "summarise this week: leads, holds, bookings, and what to do monday morning".
2. Ask: "which of our trips should get the marketing budget this week and why" and "write a 7-day instagram content calendar for <trip> with hooks".
3. Update trips and seats in Set up; add next month's batch 45 days out.
4. Check the Google profile score and the campaign calendar in **Marketing**.

## 4b. Sales operations OYE now runs by itself

| Moment | What OYE does | Where it shows |
|---|---|---|
| Lead writes in | replies in seconds, qualifies (trip, date, people, budget), quotes with total, advance, seats left and one next step | WhatsApp, widget |
| Hold | 24-hour hold (rule), capped at seats left, partial hold plus waiting list when short | reply, Trip board |
| Hold expiring | proposal with the message, 4 hours before | OYE proposes |
| Advance paid | founder marks "advance"; hold becomes a booking | Today's work |
| Balance due | proposal per traveller with the exact amount, inside the balance window (rule) | OYE proposes, Trip board flag |
| Pre-departure | one brief per trip, inside the pickup window (rule), with pickup, captain, carry list, group link | OYE proposes |
| Seat opens | first right to the waiting list, 4 hours each | OYE proposes |
| Hand-off | booking, complaint, incident, "talk to a person" flagged; 30 minutes without a human reply becomes a red card | Trip board, OYE proposes |
| Lost | reason recorded (price, competitor, timing, dates, silent) and counted per trip | Trip board |
| After the trip | review ask the day after, referral offer, rebook campaigns by calendar | OYE proposes, Marketing |
| Source | every lead carries where it came from (WhatsApp, website page, Instagram, referral) | Trip board |

Trip rows accept optional `pickup`, `captain`, `hotel` and `groupLink`; set them and the flags clear and the brief fills itself.

## 4c. The visa and permits desk

Its own knowledge base (`core/visa.js`): 28 countries the clan sells plus 9 Indian permit regions, each with the entry type for Indian passports (visa-free, arrival card, visa on arrival, e-visa, online authorisation, embassy, conditional, permit), stay, fee, processing days, the buffer we keep, documents, the official link, and the traps. Every entry carries the month it was checked; verify the link before each batch. Its own case file (`visa.json`): one row per traveller per trip, status not started → documents → applied → approved (or rejected, not needed), documents ticked, dates, notes.

Where it connects:

| Connection | What happens |
|---|---|
| WhatsApp and widget | "visa lagega?", "which documents", "passport expires in 3 months" get the exact rule, fee, apply-by date for our batch, documents and our help; the widget has a Visa & documents chip |
| Chief agent | "visa for dubai", "visa status for the thailand batch", "which trips need visa"; also a `visa` tool for the model |
| Council | a visa agent joins whenever the conversation touches entry or an international destination: finding, apply-by, what to collect at the advance |
| Autopilot | `visa_apply` proposals per traveller inside the window: collect documents, apply now, chase the decision; the pre-departure brief carries the entry line |
| Trip board | flag per trip: travellers without a visa or permit and the apply-by date |
| Today's work | the desk: lookup any country, cases per trip with a status dropdown |
| Rules | visa handling charge per person (0 = free) in Set up card 4 |
| Mind | lesson 10 holds the same facts in plain sentences, so "ask OYE" knows them too |

Cases open themselves for every traveller on hold, advance or balance for a trip that needs action; the founder only moves the status.

## 4d. Routing and local intelligence

`core/routing.js`: 38 routes from Ahmedabad or the gateway, leg by leg with km, hours, halts and hazards, the train and flight options, the season, and the driving rules (600 km a day on the plains, 300 in the hills, driver rest every 4 hours, no night driving in the hills, sleeping altitude up 500 m a night above 2,500 m). `check()` audits a plan against them; the Ladakh and Spiti orders are enforced. `core/local.js`: street-level notes for 24 places: money and UPI, SIM, getting around, food (veg and Jain), dress, scams, tipping, emergency numbers, plugs, time difference, alcohol, phrases, water, health.

Where they connect: customers asking "bus kitne ghante", "kaise jayenge", "upi chalega?", "daaru milegi?" on WhatsApp or the widget; the chief asking "route for ladakh in july" or "local tips for dubai"; the model's `route` and `local` tools; the pre-departure brief's journey line; lessons 31 and 32 in the mind. `RESOURCES.md` lists the official links a human verifies against.

## 4e. The captain's trip pack and the knowledge map

`trip pack for <trip>` (chief chat), the Trip pack button on the board, or `/api/pack?trip=` builds one document per departure: entry rules and apply-by, journey and driving days, local intelligence, activities, travellers with names and emergency contacts, the brief to send, and emergency numbers. `npm run knowledge` prints what OYE knows per destination (route, local notes, visa or permit, activities) and the gaps to fill next.

## 5. How OYE gets better

Three exam ladders, all rules only, all at 100% right now:

| Ladder | Command | What it proves |
|---|---|---|
| Eval, 173 checks | `node scripts/eval.js` | facts, funnel, playbook, council, WhatsApp, expression |
| Levels 1 to 11, 140 checks | `node scripts/levels.js` | easiest to hardest: facts, flow, emotion, requirements, business judgement, expert, master, grandmaster, legend, chief |
| Paraphrases, 184 wordings | `node scripts/paraphrase.js` | the same intent said many ways routes the same (guards against rules tuned to one sentence) |
| Procedural ladder, levels 12 to 100 | `node scripts/ladder.js` | generated conversations that get harder with the level (more turns, mixed languages and scripts, typos, group changes, trip switches, objections, desk questions), judged against the trip data; highest level passed at 100% right now: 36 |

Plus stress (200 chats), the customer universe (400 personas from a space of a billion), mastery (model-graded when a model is connected), and the browser smoke (`npm run smoke`).

**The ladder.** `npm run ladder` climbs from level 12 and stops at the first level under 100%; the release gate requires the recorded maximum, so a regression blocks a release. To climb higher: `node scripts/ladder.js --from <max+1> --verbose`, read the failing turn, fix the wording or the rule in `core/growth.js` (never the generator, unless the scenario is genuinely unfair). The next known failure is a typo inside a keyword ("chaeper"), which needs fuzzy matching of intent words.

**Adding a level.** In `scripts/levels.js` add a block with 12 items harder than the last level: `chat` (messages, judged on the last reply), `agent` (a chief request) or `review` (a plan), with `must` and `not` patterns. Run it alone with `--level N`, fix OYE until 100%, then run everything. A check that encodes a wrong policy is a test bug: fix the test, not OYE.

**Adding a wording.** When a real customer message misroutes, add it to the matching group in `scripts/paraphrase.js` first, then widen the intent in `core/growth.js` until the suite is green again.

**Teaching.** Lessons live in `curriculum/*.md` (30 files, read at start); facts you tell OYE in chat are remembered; corrections in Reply to a customer become lessons. `npm run train` and `npm run evolve` consolidate.

## 6. The release gate

Nothing goes live unless `npm run release` prints RELEASE READY. It runs tests, eval, levels, paraphrases, stress, universe, browser smoke, rebuilds `dist/oye-web.html`, writes `dist/oye-release-<sha>.zip` and `synth/release.json`. `--quick` skips the slow suites for a local check.

Then:

```bat
git push
node scripts\integrate-site.js "C:\Downloads\tcnodedeploy" --zip --force
```

Upload the printed zip in hPanel → Websites → travelersclan.in → Deploy. Dashboard at `/admin/atlas`; widget tag for the site:

```html
<script src="/atlas-chat/widget.js" data-base="/atlas-chat"></script>
```

## 6b. Running it safely

- **Password**: set `OYE_PASSWORD=yourword` before `node server.js` and the dashboard and API ask for it (any username, that password); the website widget routes stay open. Inside travelersclan.in the site's own admin login protects `/admin/atlas`.
- **Backups**: the server copies every data file to `data/backups/<date>/` on start and every 6 hours, keeping 14 days. Export mind in Advanced is the manual copy.
- **Website numbers**: the floating OYE reports opened, messages, holds, WhatsApp handoffs and human requests; the last 7 days show on the Trip board.
- **Names and emergency contacts**: when a booked traveller sends "names: A, B" or "emergency contact: number", OYE keeps them on the lead; the board flags bookings without names inside 7 days and without an emergency contact inside 3.

## 7. What is still weak (honest list)

- The exams are keyword checks written by the same author as the fixes. A model-graded pass (`npm run mastery` with a key in Set up) is the real second opinion; run it monthly.
- No real transcripts yet. Export 20 real WhatsApp conversations, grade them once by hand, and add them to `scripts/eval.js` as a golden set.
- The transliteration table covers common Hindi and Gujarati words only; new words found in real chats go into `XLIT` in `core/growth.js`.
- Dates in the suites are in 2099; add one fixture with a departure 10 days out so run-rate and hold-expiry paths run under test.
- The WhatsApp bridge and the Express mount are exercised by hand, not by a test.
- Fees and conditions in the visa desk are approximate and dated; the official link in each card is the truth.
- Two customers holding the last seat at the same moment is not tested.

## 8. If you are continuing with Claude Code on a PC

Open the repo and say: "Read SYSTEM.md and HANDOFF.md, run npm run release, and continue from section 7." Credits permitting, the cloud routine "OYE self-improvement loop" does the same every 6 hours on the branch `claude/clever-maxwell-aclt88`.
