import { tool } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createDeepAgent, registerHarnessProfile } from "deepagents";
import { z } from "zod";
import { requiredEnv } from "./load-env.ts";
import { lookupUser } from "./lookup-user.ts";
import { searchPages } from "./search-pages.ts";
import { siteMap } from "./site-map.ts";

export type Stop = {
  screen: number;
  x: number;
  y: number;
  label: string;
  say: string;
  allow: boolean;
  kind: "show" | "click" | "type";
  draw: "circle" | "box" | "highlight" | "none";
  text: string;
  target: string;
  note?: string;
};

const cache = new Map<string, unknown>();
export const toolLog: { name: string; cached: boolean }[] = [];

export function primeCache(userLookup: unknown, pages: { source: string; text: string }[]) {
  cache.set("user:user", userLookup);
  for (const page of pages) cache.set(`page:${page.source}`, page);
}

const lookupUserTool = tool(
  async ({ userId }) => {
    const normalizedUserId = userId.trim().toLowerCase() === "user" ? "user" : userId.trim();
    const cacheKey = `user:${normalizedUserId}`;
    const cached = cache.get(cacheKey);
    toolLog.push({ name: "lookupUser", cached: cached !== undefined });
    if (cached) return cached;
    const record = await lookupUser(normalizedUserId);
    cache.set(cacheKey, record);
    return record;
  },
  {
    name: "lookupUser",
    description: "Who the employee is, what they may do, and which tab a control is on.",
    schema: z.object({ userId: z.string() }),
  },
);

const searchPagesTool = tool(
  async ({ role, query }) => {
    const cacheKey = `search:${role}:${query}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      toolLog.push({ name: "searchPages", cached: true });
      return cached;
    }
    const primed = [...cache.entries()].filter(([key]) => key.startsWith("page:"));
    if (primed.length > 0 && /quote|discount|send|cap/i.test(query)) {
      const pages = {
        chunks: primed.map(([, page]) => page as { text: string; source: string }),
      };
      toolLog.push({ name: "searchPages", cached: true });
      cache.set(cacheKey, pages);
      return pages;
    }
    toolLog.push({ name: "searchPages", cached: false });
    const pages = await searchPages(role, query);
    cache.set(cacheKey, pages);
    return pages;
  },
  {
    name: "searchPages",
    description: "Search Fieldnote written pages for a policy or a restaurant brief. Skip this when the cache or the page already answers.",
    schema: z.object({ role: z.string(), query: z.string() }),
  },
);

const finishTool = tool(
  async ({ stops }) => stops,
  {
    name: "finish",
    description: "End the run by returning the stops the screen will play.",
    returnDirect: true,
    schema: z.object({
      stops: z.array(z.object({
        screen: z.number(),
        x: z.number(),
        y: z.number(),
        label: z.string(),
        say: z.string(),
        allow: z.boolean(),
        kind: z.enum(["show", "click", "type"]),
        draw: z.enum(["circle", "box", "highlight", "none"]),
        text: z.string(),
        target: z.string().describe("an id or exact label from PAGE CONTROLS, url:<path>, tab:<title>, paste, or none"),
        note: z.string().optional().describe("a longer written answer shown in Kiwi's window: a summary, draft, rewrite or list. leave out when say is enough"),
      })),
    }),
  },
);

registerHarnessProfile("google", {
  excludedTools: [
    "ls",
    "read_file",
    "write_file",
    "edit_file",
    "delete",
    "glob",
    "grep",
    "execute",
    "task",
    "write_todos",
    "start_async_task",
    "check_async_task",
    "update_async_task",
    "cancel_async_task",
    "list_async_tasks",
  ],
});

const systemPrompt = `you are kiwi, a guide for Fieldnote. the signed-in employee is Sparsh Bohra (the record named User in the graph). say Sparsh or you, never User. Alex Morgan is Sparsh's manager; say so when you mention approvals.
the reply is spoken. one short sentence, under 20 words, unless they asked you to walk them through the page.
you see the Fieldnote page they have open as PAGE CONTROLS and PAGE TEXT. you see the rest of the screen only when a SCREEN picture is attached.
the user message starts with KNOWN CONTEXT. that is already loaded. for a where, why, or set-the-discount question, call finish on the first turn. do not call lookupUser.
call searchPages only when they ask what a restaurant usually orders, which warehouse stocks something, or for a tour.
call finish when you know the stops. finish ends the run. do not use filesystem tools.
kind show: they asked where, what, why, or for a tour. draw. do not click.
kind click: they asked you to open, go, send, or press.
kind type: they asked you to set a field. text is the value. do not press send in that same stop.
draw is circle for a button, box for a field, highlight for a region.
you help Sparsh with his work. that is Fieldnote, and also any work thing on his screen: a PDF, email, doc, spreadsheet, website or chat about customers, suppliers, products, prices, orders, the company or his job. you can read it, summarize it, explain it, pull numbers out of it, compare it with Fieldnote, and draft or rewrite text for it. when unsure, help.
decline only what is clearly not work: entertainment, sports, games, jokes, poems, personal life, and trivia that has nothing to do with his job. for those, one stop: kind show, allow false, target none, say a short line like "That's outside work, so I'll pass. Ask me about Fieldnote or what's on your screen."
SCREEN is a picture of his screen right now and FRONT APP is the app and window he is in. use them for questions about this, here, what it says, or the document, email or page in front of him. read the words in the picture carefully and quote numbers exactly.
put long answers in note: summaries, drafts, replies, rewrites, lists, numbers pulled from the screen. note is plain text, short paragraphs or lines starting with "- ". then say is one short sentence like "Here's a summary in my window." those answers are one stop with target none; writing or reading never needs a tab: or url: stop unless he asks to open something.
a longer question still gets every part he asked for, in order, one stop each. a note never replaces a click or a page he asked for. generic questions (what should I do, catch me up, what's urgent, what needs a decision, explain this page) are work: answer from PAGE TEXT and KNOWN CONTEXT, usually target none, with the detail in note.
going home: the sidebar Fieldnote logo is the control id brand. when he says home, back, the start, the main page, or the logo, one click stop on brand. that is the logo, not the Home nav item. url:/ is the same page when he did not ask you to click.
when he also asks what, why, or who, the answer is already in PAGE TEXT or KNOWN CONTEXT. put that answer in the note of the same stop. never say you will check, look, or come back.
to put a draft where his cursor is, only when he asks to paste, type, insert or write it in: one stop, kind type, allow true, target paste, text and note both the exact draft. never send an email or message for him; he sends it.
a question that only wants a fact (who is my manager, what is the discount cap) is one stop with target none and the answer in say. to show where something is or how to do it, open its page with url: and then point at its button from BUTTONS.
why a quote cannot be sent: url: to that deal (/opportunities/opp-<account id>), then a show stop on send-quote that says why.
every stop has a target. that is how kiwi finds the real element, so get it right.
if the message has PAGE CONTROLS, target is the id of a control in that list, or its label exactly as written. prefer the id.
to switch to a browser tab from BROWSER TABS, target is tab: and then that tab's title, and kind is click.
if the thing is not on the current page, start with a url: stop for the page that has it, then point at it by its label.
x and y are always 0.
PAGE TEXT is what the Fieldnote page says right now, like the discount warning. trust it over memory.
a disabled control cannot be clicked. say why instead.
if a rule is allow false, finish with kind show. say why. never type a discount over 15. never click send while the discount is over 15.
a tour is several show stops. before finish on a tour, call searchPages once so the stops follow the written page.
a where question is one show stop with allow false. you are pointing, not doing it.
to show a list, a page, or a filtered view ("show me open cases", "only Sparsh's deals in Proposal", "low oil stock in Chicago"), finish with one stop: kind click, allow true, target url: then the path and query, built only from SITE MAP params and values. say what is on screen in a few words, like "Here are the open cases." "my", "mine" and "Sparsh's" mean owner=mine on /accounts and /pipeline and ownerId=user on other lists. on /pipeline, owner=all means everyone. add an owner filter only when the question says my, mine, or names a person. who, which and list questions about records are url stops too, like "who in sales is in the west" is url:/people?department=sales&territoryId=west, and "which open cases are delivery complaints" is url:/cases?status=open&kind=delivery+complaint with no ownerId.
to create, edit, or delete a record, use two stops: a click stop with url: for the right list, then a click stop on its button (New account, New opportunity, New order, New case, New purchase order, Edit, Delete). Sparsh fills in and confirms the dialog. never click confirm-delete.
${siteMap()}`;

let sharedAgent: ReturnType<typeof createDeepAgent> | undefined;
let sharedModel: ChatGoogleGenerativeAI | undefined;

function getModel() {
  sharedModel ??= new ChatGoogleGenerativeAI({
    model: requiredEnv("GEMINI_MODEL"),
    apiKey: requiredEnv("GEMINI_API_KEY"),
    temperature: 0,
    maxOutputTokens: 1200,
    thinkingConfig: { thinkingBudget: 0 },
  });
  return sharedModel;
}

function getAgent() {
  if (sharedAgent) return sharedAgent;
  sharedAgent = createDeepAgent({
    model: getModel(),
    tools: [lookupUserTool, searchPagesTool, finishTool],
    systemPrompt,
    permissions: [{ operations: ["read", "write"], paths: ["/**"], mode: "deny" }],
  });
  return sharedAgent;
}

function knownContext(): string {
  const userRecord = cache.get("user:user");
  const pages = [...cache.entries()]
    .filter(([key]) => key.startsWith("page:"))
    .map(([, page]) => page);
  if (!userRecord && pages.length === 0) return "";
  return `KNOWN CONTEXT ${JSON.stringify({ user: userRecord, pages })}\n`;
}

export async function ask(input: { question: string; screenContext?: string; imagePngBase64?: string; imageMime?: "image/png" | "image/jpeg" }) {
  const question = `${knownContext()}${input.screenContext ? `${input.screenContext}\n` : ""}${input.question}`;
  const mime = input.imageMime ?? "image/png";
  const content = input.imagePngBase64
    ? [
        { type: "text", text: question },
        { type: "image_url", image_url: `data:${mime};base64,${input.imagePngBase64}` },
      ]
    : question;
  // One forced finish call is much faster than the agent loop. Tours and questions
  // before the user record is cached still need the agent's lookup tools.
  const lean = Boolean(cache.get("user:user"))
    && !/\b(tour|walk|guide|explain|how do|usually|history|bought|tell me about)\b/i.test(input.question);
  const run = lean
    ? async () => {
        const reply = await getModel()
          .bindTools([finishTool], { tool_choice: "finish" })
          .invoke([{ role: "system", content: systemPrompt }, { role: "user", content }]);
        return { messages: [reply] as unknown[] };
      }
    : () => getAgent().invoke({ messages: [{ role: "user", content }] });
  let result: { messages: unknown[] } | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      result = await run();
      break;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/503|429|UNAVAILABLE|high demand/.test(message) || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 700));
    }
  }
  if (!result) throw lastError;
  let stops = tidyStops(stopsFromMessages(result.messages as { tool_calls?: { name: string; args: { stops?: Stop[] } }[] }[]));
  // "Let me check" never comes back. Ask once more, with the facts already in front of it.
  if (lean && dodged(stops)) {
    const nudge = "Answer every part now from PAGE TEXT. Keep any click he asked for. Put the facts in note. Do not say you will check or look.";
    const nudged = typeof content === "string"
      ? `${content}\n${nudge}`
      : [{ type: "text", text: `${question}\n${nudge}` }, ...content.slice(1)];
    const reply = await getModel().bindTools([finishTool], { tool_choice: "finish" }).invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: nudged },
    ]);
    stops = tidyStops(stopsFromMessages([reply] as { tool_calls?: { name: string; args: { stops?: Stop[] } }[] }[]));
  }
  return { stops, messages: result.messages };
}

function tidyStops(stops: Stop[]) {
  return stops
    .map((stop) => stop.kind === "show" ? { ...stop, text: "" } : stop)
    .map((stop) => {
      const note = stop.note?.replace(/\\n/g, "\n").trim();
      const text = stop.text?.replace(/\\n/g, "\n");
      return { ...stop, text, note: note && note !== stop.say.trim() ? note : undefined };
    });
}

function dodged(stops: Stop[]) {
  const said = stops.map((stop) => stop.say).join(" ");
  const wrote = stops.map((stop) => stop.note ?? "").join("");
  return /let me (check|look|see|find)|i'?ll (check|look|see)|right back/i.test(said) && wrote.length < 40;
}

function stopsFromMessages(messages: { tool_calls?: { name: string; args: { stops?: Stop[] } }[] }[]): Stop[] {
  let stops: Stop[] = [];
  for (const message of messages) {
    for (const call of message.tool_calls ?? []) {
      if (call.name === "finish" && call.args?.stops) stops = call.args.stops;
    }
  }
  return stops;
}
