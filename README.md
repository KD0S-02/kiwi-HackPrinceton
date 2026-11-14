# Kiwi

Kiwi is an employee-only desktop guide that sits next to your cursor. It looks at your screen, listens when you hold a key, and points at the button or field you asked about. It is modeled on [Clicky](https://github.com/farzaa/clicky), with one difference: Kiwi knows the company. It knows who you are, who your manager is, and which rules apply to you, so it can say "you can't send that quote yet, and here is why".

This repo has two apps:

| App | What it is |
|---|---|
| `apps/desktop` | Kiwi. An Electron app with a small floating panel, a transparent full-screen overlay, push-to-talk voice, and the agent. |
| `apps/fieldnote` | Fieldnote. A fake restaurant-supply CRM (Next.js) that Kiwi guides people through. It is the demo target. |

Built for HackPrinceton.

## The demo in one paragraph

Sparsh Bohra is an account executive at Fieldnote. His manager is Shail Shah. The rule: an account executive may send a quote on their own opportunities and may not discount past 15 percent. Anything over the cap needs Shail. The demo record is **Harbor Diner**, discounted 20 percent, so **Send Quote** is switched off. Sparsh holds Control + Option and asks "where is Send Quote?". Kiwi flies a small kiwi slice to the button, draws a ring around it, and explains that the discount is over the cap and Shail has to sign off.

Sign in with a work email. Three accounts are preloaded. Shail Shah reviews the team book and sends anything over the cap to Krishna Das. Krishna Das owns Fieldnote, has no manager, and sees the whole company.

## Who is who

- **Sparsh Bohra** (`sparsh.bohra@fieldnote.com`) is an account executive. In the data he is the record `user`. He owns his own restaurants. Kiwi calls him Sparsh or "you".
- **Shail Shah** (`shail.shah@fieldnote.com`) is a senior account executive. He is Sparsh's manager. He does not carry a personal book. His manager is Krishna Das.
- **Krishna Das** (`krishna.das@fieldnote.com`) owns Fieldnote. He has no manager. He sees every deal, and a discount over the cap stops with him.
- **Alex Morgan** is still in the directory. Other account executives report to him. He is not Sparsh's manager.
- **Fieldnote** is the fictional restaurant-supply company: 40 restaurants, 32 employees, 2 offices (Jersey City and Chicago), 3 warehouses, 40 products.

## How it works

```text
hold Control + Option  ->  AssemblyAI streaming STT  ->  transcript
                                                          |
screen capture (JPEG)  ----------------------------------+
                                                          v
                         one agent call (deepagents, Gemini) with KNOWN CONTEXT
                                                          |
                              finish({ stops: [{x, y, say, kind, allow, ...}] })
                                                          v
                  overlay: kiwi slice flies to x,y, draws ring, shows the sentence
```

### Agent (`scripts/ask.ts`)

- Built with `createDeepAgent` from `deepagents`, with Gemini (`gemini-3.1-flash-lite`) as the model. The filesystem and sub-agent tools are removed, so only three tools remain: `lookupUser`, `searchPages`, and `finish`.
- The agent is built once and reused.
- **Known context.** The signed-in user's record (from the graph) and a couple of policy pages are loaded once at startup and placed at the top of every message as `KNOWN CONTEXT`. A "where is it?" question therefore needs no tool call at all.
- **`finish` returns directly** (`returnDirect: true`), so there is no second model round after the answer is ready.
- Thinking is turned off (`thinkingBudget: 0`) and output is capped at 400 tokens. This took one where-question from tens of seconds to about one second in our timing script.
- A tour (several stops) is the only path that does a live `searchPages` before finishing.
- Rules are enforced in the prompt and in the tools: Kiwi will not type a discount over 15 and will not click Send while the screen shows a discount over 15. It points by default and only clicks or types when asked and allowed.

### Knowledge

- **Neo4j Aura** holds the company graph: people, reporting lines, accounts, territories, warehouses, products, opportunities. `lookupUser` reads it.
- **Pinecone** (index `fieldnote`, 768 dimensions, cosine) holds embedded written pages: `data/docs/authored` (pages a person would actually write) and `data/docs/generated` (one page per restaurant, built from records). Embeddings are `gemini-embedding-001`. Pinecone is only used by `searchPages`, never on the fast path.
- Seed data lives in `data/records/*.json` and is the single source for Fieldnote, the graph and the generated docs.

### Desktop app (`apps/desktop`)

- **Panel**: a small always-on-top window. Signed out, it asks for a work email and an SSO login, and it does not mention Fieldnote. Signed in, the header is Kiwi · Fieldnote with the person's name and role. Press Enter to ask. The mic sits to the right of the bar, and Record sits to the right of the mic. Log out is an icon on the top right. The kiwi matches the record button and spins while an answer is loading. Drag the top bar to move it. Its position is remembered. It shows on every desktop (Space), including over full-screen apps.
- **Record**: while Record is on, Kiwi keeps a still each time the screen changes (`data/runs/<id>/`). Pause holds the trail. Stop asks for a title and a note and saves the run as a draft. It does not turn that trail into a skill yet. Asking a question does not wait on the recording.
- **Overlay**: a transparent, click-through, full-screen window. The kiwi slice trails your mouse. When an answer arrives it flies along an arc to the target, draws a ring, shows the sentence, and goes back to following the mouse after about seven seconds.
- **Push-to-talk**: hold Control + Option (a global key hook via `uiohook-napi`), release to ask. The mic is captured in the panel, down-sampled to 16 kHz PCM16, and streamed to AssemblyAI's `universal-3-6-pro` streaming model with key terms such as Fieldnote, Harbor Diner, Send Quote, Sparsh Bohra, Shail Shah and Krishna Das. Escape cancels.
- **Screen capture**: Electron `desktopCapturer`, JPEG, with Kiwi's own windows hidden for the shot. Stop coordinates are scaled from the shot back to the display, including multi-display offsets.
- **Packaged as `dist/Kiwi.app`** (a renamed, ad-hoc signed copy of Electron with the kiwi icon and bundle id `com.fieldnote.kiwi`). See the permissions note below for why this matters.

### Fieldnote (`apps/fieldnote`)

A Next.js 15 app styled like a real SaaS CRM. Sign in with a work email (`sparsh.bohra@fieldnote.com`, `shail.shah@fieldnote.com`, or `krishna.das@fieldnote.com`). The cookie `fieldnote_session` is that person's id. Unknown emails are refused. Six distinct screens:

| Screen | Purpose |
|---|---|
| Home | Greeting, KPI cards, "needs a decision" card, pipeline by stage, deals, open cases |
| Accounts / Account detail | Restaurant list filtered by search, owner, territory and warehouse, plus a per-restaurant page |
| Pipeline | Opportunities by stage, filtered by search, stage, owner, discount (over or within the cap) and minimum amount |
| Opportunity | Stage path, Owner / Stage / Amount / Discount cards, Send Quote, tabs for Overview, Products, Activity, Approvals |
| Fulfillment | Orders filtered by status, warehouse, search and amount, plus invoices, shipments and cases |
| Supply | Warehouse cards (click one to filter), a stock table filtered by warehouse, family and low stock, and purchase orders |
| Company | Pipeline by territory and a scrollable roster per office |
| Search, Profile | Global search, and your profile and permissions |

Every record type also has its own list page with a search box and a filter for each column (`/contacts`, `/quotes`, `/approvals`, `/invoices`, `/shipments`, `/cases`, `/products`, `/suppliers`, `/purchase-orders`, `/inventory`, `/warehouses`, `/people`). The main screens link to them, and they keep the main screen highlighted in the nav.

**Filters live in the URL.** `/pipeline?owner=all&stage=Proposal` opens the pipeline already filtered. Dropdowns apply as soon as you pick, the search box applies as you type, and "Clear filters" resets. The definitions are in `apps/fieldnote/lib/filters.ts`, and Kiwi reads the same file to build links, so the two cannot drift.

**Create, edit and delete work everywhere.** New account, opportunity, order, case and purchase order; Edit on every row and record page; Delete with a confirmation box; plus Clone, Change owner, Add product, Edit line, Log activity, Request approval, Save discount, Send Quote, Cycle count, Follow and CSV exports. They write to the JSON records through an allow-listed record API (`GET` pages, `POST`, `PATCH`, `DELETE`). Approvals and stock lines cannot be deleted. The discount can only change through its own route, and Send Quote checks both ownership and the 15 percent cap on the server.

### Staying on Fieldnote

**Scope.** Kiwi helps with Fieldnote and with any work thing on your screen: a PDF, an email, a doc, a spreadsheet or a website about customers, suppliers, products, prices or orders. Ask "summarize this pdf", "what's the new fryer oil price here", "what does this email want from me" or "draft a reply saying yes". When the question is about what's in front of you and Fieldnote isn't the front window, Kiwi takes one screenshot (with its own windows hidden) and reads it. It declines only what is clearly not work, like sports, jokes, poems or what to watch tonight ("That's outside work, so I'll pass.").

**Written answers.** Summaries, lists and drafts open in a box in Kiwi's window, which grows to fit, with **Copy** and **Close** buttons. Kiwi says one short line out loud. To put a draft where your cursor is, ask "paste it in": Kiwi copies it, switches back to the app you were in and presses Command-V. It pastes only when you ask and never sends an email or message for you. A written answer stays put unless you ask Kiwi to open or show something.

**Getting to Fieldnote from anywhere.** Before Kiwi points at or opens anything, `apps/desktop/fieldnote.ts` puts a live, signed-in Fieldnote page in front:

| You are | Kiwi |
|---|---|
| On another desktop | Activates the Chrome window holding Fieldnote, which switches desktops |
| In Preview, a Google Doc, Finder or any other app | Brings Chrome forward on the Fieldnote tab |
| On a PDF or another tab in Chrome | Switches to the Fieldnote tab |
| In a second Chrome window | Raises the window that has Fieldnote |
| With Chrome minimized | Restores the window |
| With a stale tab Chrome put to sleep | Reloads it |
| With no Fieldnote tab, or Chrome not running | Opens Chrome on the page the answer needs (for example `/pipeline`) |
| Signed out | Signs in, then continues |
| With the Fieldnote server down | Says so, with the command to start it |

If a question needs a page you are not on ("why can't I send the Harbor Diner quote"), Kiwi opens that page first, then points at the answer on it. Owner filters are only kept when you say whose records you want, so "show me open cases" means everyone's.

Tests: `npx tsx scripts/check-chrome.ts` runs the scenarios in the table against your real Chrome (quit Kiwi first). `npx tsx scripts/check-scope.ts` asks twelve in-scope and out-of-scope questions from outside Fieldnote. `npx tsx scripts/check-screen.ts` reads a supplier price sheet and a supplier email from images (`/tmp/kiwi-sheet.png`, `/tmp/kiwi-email.png`; render any PDF with `qlmanage -t -s 1600 -o /tmp file.pdf`) and checks summaries, numbers, drafts, pasting and declines.

### Kiwi and the CRM

Kiwi gets a site map of every list, filter and allowed value (`scripts/site-map.ts`). "Show me open delivery-complaint cases" becomes one stop with target `url:/cases?status=open&kind=delivery+complaint`. Kiwi brings the Fieldnote tab forward, opens that URL in the page through the bridge (no reload), and points at the filter bar. On the current page it can also choose dropdown options and type in the search box. For create, edit and delete it opens the dialog and leaves the final click to you; it never presses the confirm button on Delete.

Tests:

- `npx tsx scripts/check-crm.ts` drives headless Chrome through the bridge and checks URL filters, filter controls, and the New, Edit and Delete dialogs. Quit Kiwi first, because it holds the bridge port.
- `npx tsx scripts/check-filters.ts` asks Gemini a dozen list questions and checks that each URL renders.

## Run it

Requirements: macOS (Apple silicon tested), Node 20+, and the keys below.

```bash
npm install
cp .env.example .env        # then fill in the secrets
npm run check-env           # confirms every service answers

# one-time data load
npm run generate            # records + docs
npm run load-graph          # Neo4j
npm run embed-docs          # Pinecone (rate limited; it backs off and retries)

# run
cd apps/fieldnote && npm run dev      # http://localhost:3000
cd ../.. && npm run kiwi              # launches dist/Kiwi.app
```

`.env` needs: `GEMINI_API_KEY`, `ASSEMBLYAI_API_KEY`, `PINECONE_API_KEY`, `NEO4J_PASSWORD` (names for the rest are in `.env.example`). `.env` is gitignored.

### Rebuilding `dist/Kiwi.app`

`dist/` is not committed. Build it once with:

```bash
./scripts/build-kiwi-app.sh
```

The script signs the app with a requirement that names only the bundle id (`com.fieldnote.kiwi`). A plain ad-hoc signature is tied to the exact file contents, so every rebuild looks like a new app to macOS and it asks for Accessibility, Microphone and Screen Recording again. Rebuild only when you must. Editing the code under `apps/desktop` does not need a rebuild.

### macOS permissions (why Kiwi must be launched with `npm run kiwi`)

Kiwi needs **Accessibility** (global Control + Option), **Microphone**, and **Automation** for Google Chrome (switching tabs and windows). **Screen Recording** is used only when you ask about something on screen outside Fieldnote; Fieldnote itself is always read through the bridge.

macOS gives a process the permissions of the app that launched it. If Kiwi is started from a Cursor or Terminal window, the prompts name that app and Kiwi never appears in the list. `npm run kiwi` starts the bundle through macOS (`open -n`), so Kiwi is its own app and the prompts name **Kiwi**. After allowing Screen Recording, quit and reopen Kiwi once. If you re-sign the app, macOS may ask again. To start clean: `tccutil reset All com.fieldnote.kiwi`.

## Why it is fast (and how it compares to Clicky)

Clicky is quick because it is a single streaming vision call with no tools. Kiwi keeps an agent (so it can use the graph and written pages) but follows the same rule on the hot path:

1. Load what is always needed once, at startup.
2. Put it in the prompt, not behind a tool call.
3. Make the last tool end the run.

On top of that, each question takes the fastest path that can answer it:

- **Local router** (`apps/desktop/router.ts`, under 1 ms). "Where is X", "open X", "switch to the Fieldnote tab" and "why can't I send the quote" are answered from the live page controls, the page's own warning text and the Chrome tab list, with no model call.
- **Lean model call.** Other questions about the page on screen get one forced `finish` call with the page controls as text, without a screenshot or the agent loop. This usually takes 0.6 to 1.5 s.
- **Full agent.** Data questions ("what does Harbor Diner usually order") and tours use the deepagents loop with its lookup tools.
- **Free-tier limit.** The Gemini free tier allows 15 requests a minute for this model. Past that, calls are throttled or rejected, which shows up as multi-second answers. A paid key removes most of the latency spikes.
- **Going back to Fieldnote.** Before pointing, Kiwi brings the Fieldnote Chrome window and tab to the front, which switches macOS desktops if you moved away. The Chrome tab list is fetched as soon as you start holding the keys. Timings go to `/tmp/kiwi-timing.log`.

Rejected on purpose: Redis (nothing to share across processes), putting the whole graph in the prompt (slow and noisy), and Pinecone on the click path.

Kiwi keeps Clicky's interaction: hold Control + Option to talk, a buddy that follows the cursor and flies to targets along an arc, a loading state, and a push-to-talk transcript. It differs in using a drawn slice instead of the system cursor, an Electron overlay instead of AppKit, and Gemini plus AssemblyAI instead of Claude plus ElevenLabs.

## Status

### Done

- Seed company (40 restaurants, 32 people, warehouses, products), generated and authored pages, and a graph loader and embedder. Three sign-in accounts: Sparsh, Shail, and Krishna.
- Agent with cached context, direct `finish`, and the discount and ownership rules. A five-question script (`npm test`) passed on the last full run. A single cached where-question measured about 1 second; the full five-question run was still slow because of Gemini latency spikes and the live search in the tour question.
- Fieldnote CRM: login and logout, six distinct screens, global search, profile, working mock buttons, server-side rules.
- Desktop app: movable panel on all Spaces, cursor buddy with flight to target, hold-to-talk with AssemblyAI streaming, screen capture, Escape to cancel, packaged and signed as Kiwi with its own icon and permission prompts.
- Fieldnote and Kiwi logos (the kiwi is a slice, the app icon is a rounded square).

### Not done yet

- **Voice and permissions are untested end to end.** The code exists, but nobody has yet held Control + Option on a real session and heard it answer back.
- **Finding and pressing controls.** Fieldnote pages run a small bridge (`components/KiwiBridge.tsx`) that connects to Kiwi on `ws://127.0.0.1:4555`. Before each ask, Kiwi collects the page's visible controls (ids, labels, disabled state) and Chrome's tab titles, and the agent answers with a `target`, not just pixels. Kiwi then locates the real element, flies to its exact position, and clicks or types through the DOM. Chrome tabs are switched with AppleScript, which asks once for Automation permission. Kiwi no longer looks at screen pixels at all. `scripts/check-bridge.ts` and `scripts/check-targets.ts` test this.
- **Clicking and typing go through the page, not the mouse.** Kiwi only acts when you ask it to open, press or set something and the rule allows it. It refuses to type a discount over 15 and never confirms a delete. (`apps/desktop/input/kiwi-input`, the old Swift mouse helper, is still built but unused.)
- **No spoken replies.** Kiwi answers on screen only. There is no text to speech.
- **No permission card.** Kiwi has no "OK to do this for you?" step before an action.
- **Tours** return stops, but only the first stop is shown. There is no step-through.
- **Mock data persistence.** Fieldnote writes to the JSON files directly. Restore `data/records` from git after testing.
- No automated tests for the desktop app or the Fieldnote UI. The checks are scripts under `scripts/`.
- Not notarized. Only ad-hoc signed, so it runs on the machine it was built on.

### Further scope of improvement

- A confirmation card before Kiwi clicks or types, and click targets from the accessibility tree instead of a vision guess.
- Spoken answers: stream text to speech like Clicky does with ElevenLabs.
- Multi-stop tours with next and back, and an on-screen progress dot trail.
- Stream the model response so the first words show while the answer is still being produced.
- A menu-bar icon (Clicky is menu-bar only) instead of a floating panel, plus a setting for the hotkey.
- Multi-monitor stops: the agent only sees the display under the cursor today.
- Detect UI elements with accessibility trees or DOM hints for more precise coordinates than a vision guess.
- A skill compiled from a recording, so a later question can use the idea even when the workflow is only close. Today a recording is a named draft trail and nothing more.
- Per-role rules for the rest of the directory (ops, business development), not only the three sign-in accounts.
- Real auth in Fieldnote and a real database in place of JSON files.
- Fix the 1 high severity `npm audit` finding, add CI, and add a Playwright suite for Fieldnote.
- A proper installer: notarized DMG with auto-update.

## Repo layout

```text
apps/desktop/      Electron app: main.ts, panel.html, overlay.html, preload.cjs, record.ts, kiwi.svg, kiwi-icon.svg
apps/fieldnote/    Next.js CRM: app/, components/, lib/data.ts, middleware.ts
data/records/      Seed JSON the CRM and the graph read
data/docs/         authored/ and generated/ written pages
data/rules.json    The discount cap and send-quote rule
data/ui.json       Named controls on the opportunity page
scripts/           ask.ts (agent), load-graph.ts, embed-docs.ts, lookup-user.ts, search-pages.ts, tests
fixtures/          harbor-diner.png, the test screenshot
docs/spec.md       Original implementation spec
```
