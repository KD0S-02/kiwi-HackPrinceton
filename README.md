# Kiwi

Kiwi is an employee-only desktop guide that sits next to your cursor. It looks at your screen, listens when you hold a key, and points at the button or field you asked about. It is modeled on [Clicky](https://github.com/farzaa/clicky), with one difference: Kiwi knows the company. It knows who you are, who your manager is, and which rules apply to you, so it can say "you can't send that quote yet, and here is why".

This repo has two apps:

| App | What it is |
|---|---|
| `apps/desktop` | Kiwi. An Electron app with a small floating panel, a transparent full-screen overlay, push-to-talk voice, and the agent. |
| `apps/fieldnote` | Fieldnote. A fake restaurant-supply CRM (Next.js) that Kiwi guides people through. It is the demo target. |

Built for HackPrinceton.

## The demo in one paragraph

Sparsh Bohra is an account executive at Fieldnote. His manager is Alex Morgan. The rule: an account executive may send a quote on their own opportunities and may not discount past 15 percent. Anything over the cap needs Alex's approval. The demo record is **Harbor Diner**, discounted 20 percent, so **Send Quote** is switched off. Sparsh holds Control + Option and asks "where is Send Quote?". Kiwi flies a small kiwi slice to the button, draws a ring around it, and explains that the discount is over the cap and Alex has to approve it.

## Who is who

- **Sparsh Bohra** is the signed-in person. In the data, the graph and the plan he is the record `user` ("User"). The screens show his real name. Kiwi calls him Sparsh or "you".
- **Alex Morgan** is Sparsh's manager and the discount approver. He reports to **Sam Ortiz**, VP of Sales.
- **Fieldnote** is the fictional restaurant-supply company: 40 restaurants, 30 employees, 2 offices (Jersey City and Chicago), 3 warehouses, 40 products.

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

- **Panel**: a small always-on-top window with a text box, Ask, Talk and a status spinner. Drag the top bar to move it. Its position is remembered. It shows on every desktop (Space), including over full-screen apps.
- **Overlay**: a transparent, click-through, full-screen window. The kiwi slice trails your mouse. When an answer arrives it flies along an arc to the target, draws a ring, shows the sentence, and goes back to following the mouse after about seven seconds.
- **Push-to-talk**: hold Control + Option (a global key hook via `uiohook-napi`), release to ask. The mic is captured in the panel, down-sampled to 16 kHz PCM16, and streamed to AssemblyAI's `universal-3-6-pro` streaming model with key terms such as Fieldnote, Harbor Diner, Send Quote, Alex Morgan. Escape cancels.
- **Screen capture**: Electron `desktopCapturer`, JPEG, with Kiwi's own windows hidden for the shot. Stop coordinates are scaled from the shot back to the display, including multi-display offsets.
- **Packaged as `dist/Kiwi.app`** (a renamed, ad-hoc signed copy of Electron with the kiwi icon and bundle id `com.fieldnote.kiwi`). See the permissions note below for why this matters.

### Fieldnote (`apps/fieldnote`)

A Next.js 15 app styled like a real SaaS CRM, with a login screen (any password works, the cookie is `fieldnote_session`), and six distinct screens:

| Screen | Purpose |
|---|---|
| Home | Greeting, KPI cards, "needs a decision" card, pipeline by stage, deals, open cases |
| Accounts / Account detail | Restaurant list with search, and a per-restaurant page |
| Pipeline | Opportunities by stage, waiting-on-manager list, export |
| Opportunity | Stage path, Owner / Stage / Amount / Discount cards, Send Quote, tabs for Overview, Products, Activity, Approvals |
| Fulfillment | Orders with filter tabs, invoices, shipments, cases |
| Supply | Warehouses with stock bars, thinnest stock, purchase orders |
| Company | Pipeline by territory and a scrollable roster per office |
| Search, Profile | Global search, and your profile and permissions |

Older URLs (`/contacts`, `/invoices`, `/products`, and so on) redirect to the clubbed screens.

Working mock buttons: Clone, Change owner, Add product, Edit line, Log activity, Request approval, Save discount, Send Quote, New order, New purchase order, Cycle count, and CSV exports. They write to the JSON records through a generic, allow-listed record API. The discount can only change through its own route, and Send Quote checks both ownership and the 15 percent cap on the server.

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

Kiwi needs three permissions: **Accessibility** (global Control + Option), **Microphone**, and **Screen Recording**.

macOS gives a process the permissions of the app that launched it. If Kiwi is started from a Cursor or Terminal window, the prompts name that app and Kiwi never appears in the list. `npm run kiwi` starts the bundle through macOS (`open -n`), so Kiwi is its own app and the prompts name **Kiwi**. After allowing Screen Recording, quit and reopen Kiwi once. If you re-sign the app, macOS may ask again. To start clean: `tccutil reset All com.fieldnote.kiwi`.

## Why it is fast (and how it compares to Clicky)

Clicky is quick because it is a single streaming vision call with no tools. Kiwi keeps an agent (so it can use the graph and written pages) but follows the same rule on the hot path:

1. Load what is always needed once, at startup.
2. Put it in the prompt, not behind a tool call.
3. Make the last tool end the run.

Rejected on purpose: Redis (nothing to share across processes), putting the whole graph in the prompt (slow and noisy), and Pinecone on the click path.

Kiwi keeps Clicky's interaction: hold Control + Option to talk, a buddy that follows the cursor and flies to targets along an arc, a loading state, and a push-to-talk transcript. It differs in using a drawn slice instead of the system cursor, an Electron overlay instead of AppKit, and Gemini plus AssemblyAI instead of Claude plus ElevenLabs.

## Status

### Done

- Seed company (40 restaurants, 30 people, warehouses, products), generated and authored pages, and a graph loader and embedder.
- Agent with cached context, direct `finish`, and the discount and ownership rules. A five-question script (`npm test`) passed on the last full run. A single cached where-question measured about 1 second; the full five-question run was still slow because of Gemini latency spikes and the live search in the tour question.
- Fieldnote CRM: login and logout, six distinct screens, global search, profile, working mock buttons, server-side rules.
- Desktop app: movable panel on all Spaces, cursor buddy with flight to target, hold-to-talk with AssemblyAI streaming, screen capture, Escape to cancel, packaged and signed as Kiwi with its own icon and permission prompts.
- Fieldnote and Kiwi logos (the kiwi is a slice, the app icon is a rounded square).

### Not done yet

- **Voice and permissions are untested end to end.** The code exists, but nobody has yet held Control + Option on a real session and heard it answer back.
- **Kiwi does not click or type yet.** It points and explains. The `click` and `type` stops are returned by the agent but not executed.
- **No spoken replies.** Kiwi answers on screen only. There is no text to speech.
- **No permission card.** Kiwi has no "OK to do this for you?" step before an action.
- **Tours** return stops, but only the first stop is shown. There is no step-through.
- **Mock data persistence.** Fieldnote writes to the JSON files directly. Restore `data/records` from git after testing.
- No automated tests for the desktop app or the Fieldnote UI. The checks are scripts under `scripts/`.
- Not notarized. Only ad-hoc signed, so it runs on the machine it was built on.

### Further scope of improvement

- Execute clicks and typing through the OS (Accessibility API), gated by the same rules the agent already follows, with a confirmation card.
- Spoken answers: stream text to speech like Clicky does with ElevenLabs.
- Multi-stop tours with next and back, and an on-screen progress dot trail.
- Stream the model response so the first words show while the answer is still being produced.
- A menu-bar icon (Clicky is menu-bar only) instead of a floating panel, plus a setting for the hotkey.
- Multi-monitor stops: the agent only sees the display under the cursor today.
- Detect UI elements with accessibility trees or DOM hints for more precise coordinates than a vision guess.
- Per-role rules read from the graph (managers, ops, business development), not just the account executive cap.
- Real auth in Fieldnote and a real database in place of JSON files.
- Fix the 1 high severity `npm audit` finding, add CI, and add a Playwright suite for Fieldnote.
- A proper installer: notarized DMG with auto-update.

## Repo layout

```text
apps/desktop/      Electron app: main.ts, panel.html, overlay.html, preload.cjs, kiwi.svg, kiwi-icon.svg
apps/fieldnote/    Next.js CRM: app/, components/, lib/data.ts, middleware.ts
data/records/      Seed JSON the CRM and the graph read
data/docs/         authored/ and generated/ written pages
data/rules.json    The discount cap and send-quote rule
data/ui.json       Named controls on the opportunity page
scripts/           ask.ts (agent), load-graph.ts, embed-docs.ts, lookup-user.ts, search-pages.ts, tests
fixtures/          harbor-diner.png, the test screenshot
docs/spec.md       Original implementation spec
```
