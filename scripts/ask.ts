import { tool } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createDeepAgent, registerHarnessProfile } from "deepagents";
import { z } from "zod";
import { requiredEnv } from "./load-env.ts";
import { lookupUser } from "./lookup-user.ts";
import { searchPages } from "./search-pages.ts";

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
the reply is spoken. one or two sentences, unless they asked you to walk them through the page.
you can see their screen. the picture is this moment.
the user message starts with KNOWN CONTEXT. that is already loaded. for a where, why, or set-the-discount question, call finish on the first turn. do not call lookupUser.
call searchPages only when they ask what a restaurant usually orders, which warehouse stocks something, or for a tour.
call finish when you know the stops. finish ends the run. do not use filesystem tools.
kind show: they asked where, what, why, or for a tour. draw. do not click.
kind click: they asked you to open, go, send, or press.
kind type: they asked you to set a field. text is the value. do not press send in that same stop.
draw is circle for a button, box for a field, highlight for a region.
pixels come from the picture. tab names come from lookupUser.
if a rule is allow false, finish with kind show. say why. never type a discount over 15. never click send while the picture shows a discount over 15.
a tour is several show stops. before finish on a tour, call searchPages once so the stops follow the written page.
a where question is one show stop with allow false. you are pointing, not doing it.`;

let sharedAgent: ReturnType<typeof createDeepAgent> | undefined;

function getAgent() {
  if (sharedAgent) return sharedAgent;
  const model = new ChatGoogleGenerativeAI({
    model: requiredEnv("GEMINI_MODEL"),
    apiKey: requiredEnv("GEMINI_API_KEY"),
    temperature: 0,
    maxOutputTokens: 400,
    thinkingConfig: { thinkingBudget: 0 },
  });
  sharedAgent = createDeepAgent({
    model,
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

export async function ask(input: { question: string; imagePngBase64?: string; imageMime?: "image/png" | "image/jpeg" }) {
  const question = `${knownContext()}${input.question}`;
  const mime = input.imageMime ?? "image/png";
  const content = input.imagePngBase64
    ? [
        { type: "text", text: question },
        { type: "image_url", image_url: `data:${mime};base64,${input.imagePngBase64}` },
      ]
    : question;
  const agent = getAgent();
  let result: { messages: unknown[] } | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      result = await agent.invoke({
        messages: [{ role: "user", content }],
      });
      break;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/503|429|UNAVAILABLE|high demand/.test(message) || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 8000));
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
