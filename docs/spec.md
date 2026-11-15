# Kiwi implementation spec

Kiwi is the desktop guide. Fieldnote is the restaurant-supply company it guides. Both live in this repo. Sparsh builds the app, the agent, the graph load, and the Pinecone load.

Secrets live in `.env` at the repo root. That file is gitignored. `.env.example` has the same names and no values that can spend money or log into Aura.

## What is already set up

Checked on this machine. No app code depends on it yet.

| Service | State |
|---|---|
| Gemini chat | `gemini-3.1-flash-lite` answered. Key is `GEMINI_API_KEY` in `.env`. |
| Gemini embeddings | `gemini-embedding-001` returned 768 dimensions with that same key. |
| Other keys | Do not add a second Gemini key. `GEM_API_KEY` is not a Gemini key and is not in `.env`. |
| Neo4j Aura | `neo4j+s://1bd7d1f4.databases.neo4j.io`, database `1bd7d1f4`, user `1bd7d1f4`. `RETURN 1` succeeded. Password is only in `.env`. |
| Pinecone | Index `fieldnote` is Ready. 768 dimensions, cosine, AWS us-east-1. Host `fieldnote-lpkzdlv.svc.aped-4627-b74a.pinecone.io`. Namespace `fieldnote` is created on the first upsert. |

Do not create the Pinecone quickstart index `developer-quickstart-py`. That one uses Pinecone's Llama embedder. This project embeds with Gemini and writes vectors into `fieldnote`.

Voice keys are not part of this setup. AssemblyAI and ElevenLabs wait until the three demo asks work by typing.

## Repo

```text
kiwi-HackPrinceton/
  .env
  apps/desktop/          Electron. Pill, kiwi, hotkey, screenshot, agent.
  apps/fieldnote/        Next.js. The company app Kiwi looks at and clicks.
  data/rules.json
  data/ui.json
  data/records/          JSON the ERP and the graph read
  data/products.csv
  data/docs/authored/    pages a person would actually write
  data/docs/generated/   the bulk, produced from the records
  scripts/check-env.ts
  scripts/check-seed.ts
  scripts/generate-docs.ts
  scripts/load-graph.ts
  scripts/embed-docs.ts
  docs/spec.md
```

`scripts/check-env.ts` is the first code to run. It loads `.env` and fails unless Gemini returns a sentence, Neo4j accepts `RETURN 1`, and Pinecone describes `fieldnote` as 768 and cosine.

## Fieldnote

Fieldnote sells food, paper, and smallwares to independent restaurants. Two offices, Jersey City and Chicago. Three warehouses. Four sales territories. The signed-in person is User, an account executive in the Northeast, day two. User reports to Alex Morgan. Alex reports to the VP of Sales. User is the only login. The directory shows the other people.

The cap is one number in `data/rules.json`. An account executive may discount to 15 percent on their own opportunities, and may send the quote when the discount is at or under that cap. Over the cap, Alex has to approve. The graph, the policy pages, and the Send Quote button all read this file.

Harbor Diner is User's open opportunity. Stage Proposal. Amount 12400. Discount 20. That 20 is stored in the ERP record so the page can show it. It is not a property in Neo4j.

### Records

A generator writes these. They are not typed by hand.

| Record | Count | Notes |
|---|---|---|
| Offices | 2 | Jersey City, Chicago |
| Warehouses | 3 | One at each office, plus a dry-goods warehouse |
| Territories | 4 | Northeast is User's |
| Employees | 30 | Sales, ops, warehouse, finance. A real reporting chain |
| Accounts | 40 | Restaurants. About 8 owned by User, including Harbor Diner |
| Contacts | 40 | One buyer each |
| Products | 40 | CSV. Families: dairy, dry goods, paper, smallwares, oil |
| Suppliers | 8 | Each product has one primary supplier |
| Price books | 2 | Standard, and Northeast |
| Opportunities | 20 | Id, owner, account, stage, amount. Harbor Diner is the one at discount 20 |
| Quotes | 12 | None of them are the Harbor Diner send |
| Orders | 15 | Past orders on other accounts |
| Invoices | 15 | Tied to those orders |
| Shipments | 10 | Warehouse, status, account |
| Inventory rows | 40 | Product at a warehouse, on-hand quantity |
| Purchase orders | 8 | One open so the list is not empty |
| Cases | 12 | Delivery complaint, billing question, missing item |
| Approvals | 5 | One pending discount approval that is not Harbor Diner |

Harbor Diner also has line items, two activity notes, and a contact. Every list page has enough rows to scroll.

### Screens

`apps/fieldnote` on port 3000. No login. The banner says User, account executive, Northeast, reports to Alex Morgan.

One shared chrome: a long left nav, a list page, a detail page. Every item opens real rows from `data/records`.

Nav: Home, Accounts, Contacts, Opportunities, Quotes, Orders, Invoices, Products, Price Books, Inventory, Warehouses, Suppliers, Purchase Orders, Shipments, Cases, Approvals, People, Reports.

Home is User's work: their opportunities, the discount rule, their open cases.

The opportunity page is the one custom screen. The header shows the restaurant, the owner, the stage, the amount, the discount field, and Send Quote. Subtabs: Details, Products, Activity. Discount and Send Quote are visible without opening a subtab.

Send Quote reads `rules.json`. Over 15 the button stays visible and disabled, with the sentence from the policy. At 15 or under it appends a quote to `data/records/quotes.json`. The discount field saves into the opportunity record, including a value of 20 or 25. A restart keeps the save.

Reports is one table of open opportunities: account, owner, stage, amount, discount. No chart library.

Kiwi does not call these routes. It clicks the nav and the buttons.

### UI map

`data/ui.json` lists every nav item and the controls Kiwi may be asked about. Each control has `name`, `module`, and `where`. Send Quote and Discount are `module: Opportunity`, `where: header`.

## Documents

### Authored, 24 files in `data/docs/authored`

A few hundred words each. The cap sentence is copied from `rules.json`.

discount policy, pricing exceptions, credit holds, returns, samples, substitutions, food safety, delivery windows, shortages, invoice disputes, new account setup, commission, first week for an account executive, send-quote checklist, approval matrix, territory rules, warehouse receiving, cycle counts, driver exceptions, case handling, supplier claims, product recall, after-hours orders, Northeast price book rules.

`discount-policy.md` contains the cap, who approves over it, and that an account executive may send a quote on their own opportunity. `sending-a-quote.md` names the Opportunity header, the discount field, and Send Quote. The other pages exist so a nearby question can land in the wrong place if metadata is sloppy.

### Generated, about 110 files in `data/docs/generated`

`scripts/generate-docs.ts` writes them from the records and replaces the folder on every run.

- One account brief per restaurant. Territory, buyer, what they usually order, which warehouse serves them. No discount percent.
- One product sheet per SKU. Family, unit, supplier, which warehouses stock it, a short handling note.
- One supplier note each.
- One warehouse note each.
- A short order or case note where a record exists.

Do not also export a PDF of the same page.

## Knowledge graph

`scripts/load-graph.ts` reads `data/` and replaces the Fieldnote graph. A second run does not duplicate nodes. `MERGE` on a stable `id`.

Nodes:

- Company, offices, warehouses, territories.
- All 30 people, with `REPORTS_TO`, `HAS_ROLE`, and `COVERS` territory.
- All 40 accounts, their contact, their territory, and the warehouse that serves them.
- Products, families, suppliers, and which warehouse stocks the product. The on-hand quantity stays in the ERP file. The graph says "stocked at".
- Opportunities as identity: id, name, account, owner, stage. Amount may be copied. Harbor Diner is owned by User. No discount property. That number changes under the cursor, so the picture is the source.
- Quotes, orders, invoices, shipments, cases, and purchase orders as identity nodes linked to an account or a supplier. Line prices stay in the files.
- The two rules, linked to the account executive role. The cap is read from `rules.json` at load time.
- Every nav module from `ui.json`, and the controls, with `ON` and `where`.
- One node per authored document: title, source path, kind, department. `GOVERNS` for the discount policy and the send-quote page. `DESCRIBES` for a page about a module. Generated briefs are not graph nodes. They are only vectors.

`lookupUser("User")` returns:

```text
{
  id, name, role,
  rules: [{ tool, action, scope, allow }],
  screens: [{ name, tab, where }],
  org: { manager, territory, office }
}
```

For User: discount past 15, allow false. Send quote on own opportunities, allow true. Screens for Send Quote and Discount, both on the Opportunity header. Manager Alex Morgan. Territory Northeast.

No URLs, CSS selectors, or pixels in the graph.

## Pinecone

`scripts/embed-docs.ts` embeds `data/docs/authored` and `data/docs/generated`. It deletes the namespace and rewrites it.

Model `gemini-embedding-001`, `outputDimensionality` 768, key `GEMINI_API_KEY`. Upsert into index `fieldnote`, namespace `fieldnote`. Query with the same model and the same size.

Chunking:

- Split authored pages on headings. About 800 to 1200 characters, overlap about 150.
- The discount cap and the send permission stay in the same chunk.
- A generated account brief or product sheet is one chunk.
- Do not embed JSON, CSV, or `ui.json`.

Metadata on every vector: `source`, `title`, `kind` (`policy`, `howto`, `account`, `product`, `supplier`, `warehouse`, `case`), `department`, `roles`, `module`, `accountId` (account briefs only), `company` = `fieldnote`.

`searchPages({ role, query })` filters to `roles` containing that role, takes the top 8, drops anything under 0.25, and returns `{ chunks: [{ text, source, score }] }`.

Retrieval checks, top hit:

- "how much can I discount" → `discount-policy.md`
- "where do I send a quote" → `sending-a-quote.md`
- "who approves a discount over 15" → the approval matrix or the discount policy
- "what does Harbor Diner usually order" → that account brief
- "which warehouse stocks fryer oil" → the product sheet or the warehouse note
- "how long is a delivery window" → the delivery policy
- "how do I receive a purchase order" → warehouse receiving
- "can I discount 20 percent" → the discount policy

A where-is-the-button question is answered from `screens` and the picture. If that question calls `searchPages` and never `lookupUser`, the prompt is wrong.

## Agent

Electron main process. `createDeepAgent` from `deepagents`. Chat model is `@langchain/google-genai` `ChatGoogleGenerativeAI`, model `GEMINI_MODEL`, key `GEMINI_API_KEY`. The screenshot is an image part on the user message. The last ten lines of talk are text. Old pictures are not reattached.

Tools:

- `lookupUser`. Cache, then Neo4j.
- `searchPages`. Cache, then Pinecone. Used when a written page would change the answer.
- `finish`. Ends the run. Arguments are the stops.

One prompt. Kiwi works for Fieldnote. The signed-in employee is User. Replies are spoken, one or two sentences, unless they asked for a walk-through.

- `kind: show` when they asked where, what, why, or for a tour. Draw. Do not click.
- `kind: click` when they asked to open, go, send, or press.
- `kind: type` when they asked to set a field. `text` is the value. Do not press Send in that same stop.
- `draw` is `circle` for a button, `box` for a field, `highlight` for a region.
- Pixels come from the picture. Tab names come from `lookupUser`.
- A where-question about a control on another tab points at that tab. A click on the tab happens when they asked to go there or to do the thing.
- `allow: false` finishes as a show. Never type a discount over 15. Never click Send while the picture shows a discount over 15.

The screen plays:

```text
stops: [{ screen, x, y, label, say, allow, kind, draw, text }]
```

Sign-in loads `lookupUser` and the two demo pages, the discount policy and the send-quote page, into a `Map` inside the tool bodies. A short ask then finishes without Neo4j or Pinecone. A question about Harbor Diner's usual order misses that cache and calls `searchPages`.

`ask` is one run. The kiwi moves only after `finish`. A click or a type takes a new picture and calls `ask` again. "Set the discount to 15 and send it" is a type, a new picture, then a click judged on that new picture.

## Electron

Mac permissions, one card at a time, before sign-in: Microphone, Accessibility, Screen Recording. If one is later turned off, that card comes back and the hotkey does nothing. Electron does not use Clicky's fourth ScreenCaptureKit card.

After the grants: a pill, a click-through overlay, the kiwi riding a little off the real cursor, and a sign-in card. The card reads User's record back. No questionnaire. That click fills the cache.

Hold Control and Option. Let go to send. No words means no `ask`. On let-go, hide the Kiwi windows, picture every monitor, mouse monitor first, JPEG, then bring the windows back.

Ride until a stop arrives. A show draws and speaks in a small click-through card. A click or a type runs only when `allow` is true, then the cursor goes back to where it was. Escape, "stop", or the hotkey again cancels. A typed question box works before voice does.

Fieldnote is a normal browser window on localhost:3000.

## Build order

1. `check-env.ts` against the `.env` already in this repo.
2. Records, `rules.json`, `ui.json`, `check-seed.ts`.
3. The 24 authored docs, then `generate-docs.ts`.
4. Fieldnote list and detail pages, then the Harbor Diner opportunity.
5. `load-graph.ts`. `lookupUser("User")` matches the contract. A second load keeps the same node count.
6. `embed-docs.ts`. The eight retrieval checks pass.
7. Agent against a saved picture of Harbor Diner at 20.
8. Overlay. Then the three asks. Voice last.

## Done when

- Harbor Diner is 20, owned by User, and the cap appears only in `rules.json`.
- Every nav item renders rows. Send Quote is disabled at 20 and enabled at 15. A save survives a restart.
- No graph node has a discount property. `lookupUser` returns Alex Morgan as manager.
- The eight questions hit the expected documents. The namespace holds the chunk count, not a handful of vectors.
- "Where do I send the quote?" is one show. "Set the discount to 25" does not type. "What does Harbor Diner usually order?" calls `searchPages`. The second identical where-question hits the cache.
- The three asks on a fresh seed at 20: where is Send Quote, walk through the opportunity, set the discount to 15 and send it.
