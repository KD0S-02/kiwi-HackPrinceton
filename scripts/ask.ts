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
    description: "Search Fieldnote written pages for a policy or a restaurant brief. Skip this when the cache or the picture already answers.",
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
        target: z.string().describe("an id or exact label from PAGE CONTROLS, or tab:<title> from BROWSER TABS, or empty"),
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
you can see their screen. the picture is this moment.
the user message starts with KNOWN CONTEXT. that is already loaded. for a where, why, or set-the-discount question, call finish on the first turn. do not call lookupUser.
call searchPages only when they ask what a restaurant usually orders, which warehouse stocks something, or for a tour.
call finish when you know the stops. finish ends the run. do not use filesystem tools.
kind show: they asked where, what, why, or for a tour. draw. do not click.
kind click: they asked you to open, go, send, or press.
kind type: they asked you to set a field. text is the value. do not press send in that same stop.
draw is circle for a button, box for a field, highlight for a region.
every stop has a target. that is how kiwi finds the real element, so get it right.
if the message has PAGE CONTROLS, target is the id of a control in that list, or its label exactly as written. prefer the id.
to switch to a browser tab from BROWSER TABS, target is tab: and then that tab's title, and kind is click.
if the thing is not in PAGE CONTROLS or BROWSER TABS, target is empty and x and y are your best guess from the picture.
x and y are your guess from the picture. kiwi uses them only when the target is empty or not found. with no picture, x and y are 0.
PAGE TEXT is what the Fieldnote page says right now, like the discount warning. trust it over memory.
a disabled control cannot be clicked. say why instead.
if a rule is allow false, finish with kind show. say why. never type a discount over 15. never click send while the picture shows a discount over 15.
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
    maxOutputTokens: 400,
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
    && Boolean(input.screenContext?.includes("PAGE CONTROLS"))
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
  const stops = stopsFromMessages(result.messages as { tool_calls?: { name: string; args: { stops?: Stop[] } }[] }[])
    .map((stop) => stop.kind === "show" ? { ...stop, text: "" } : stop);
  return { stops, messages: result.messages };
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
