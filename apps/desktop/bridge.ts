import { WebSocketServer, type WebSocket } from "ws";

export type PageControl = { id: string; label: string; kind: string; disabled: boolean; value?: string; options?: string[] };
export type PageRect = { x: number; y: number; width: number; height: number };
export type PageReply = {
  ok: boolean;
  error?: string;
  rect?: PageRect;
  controls?: PageControl[];
  facts?: { id: string; text: string }[];
  path?: string;
  title?: string;
};

type Page = { socket: WebSocket; visible: boolean; focused: boolean; path: string; url: string; agent: string; seen: number };

export type PageAction = { action: "click" | "type"; id: string; label: string; text: string; control?: string; path: string };

const pages = new Set<Page>();
const actionListeners = new Set<(action: PageAction) => void>();

export function onPageAction(listener: (action: PageAction) => void) {
  actionListeners.add(listener);
}
const waiting = new Map<number, (reply: PageReply) => void>();
let nextId = 1;

export function startBridge(port = 4555) {
  const server = new WebSocketServer({ host: "127.0.0.1", port });
  server.on("connection", (socket) => {
    if (process.env.KIWI_BRIDGE_DEBUG) console.log("page connected");
    const page: Page = { socket, visible: false, focused: false, path: "", url: "", agent: "", seen: Date.now() };
    pages.add(page);
    socket.on("message", (data) => {
      const message = JSON.parse(String(data)) as { type: string; id?: number; visible?: boolean; focused?: boolean; path?: string; url?: string; agent?: string } & PageReply;
      if (message.visible !== undefined) page.visible = message.visible;
      if (message.focused !== undefined) page.focused = message.focused;
      if (message.path) page.path = message.path;
      if (message.url) page.url = message.url;
      if (message.agent) page.agent = message.agent;
      page.seen = Date.now();
      if (message.type === "action") {
        const action = message as unknown as PageAction;
        for (const listener of actionListeners) listener(action);
      }
      if (message.type === "reply" && message.id !== undefined) {
        waiting.get(message.id)?.(message);
        waiting.delete(message.id);
      }
    });
    socket.on("close", () => pages.delete(page));
  });
  return server;
}

function visiblePage() {
  const only = process.env.KIWI_BRIDGE_ONLY;
  return [...pages].filter((page) => (only ? page.agent.includes(only) : !page.agent.includes("HeadlessChrome"))).sort(
    (a, b) => Number(b.visible) - Number(a.visible) || Number(b.focused) - Number(a.focused) || b.seen - a.seen,
  )[0];
}

export function pageUrl() {
  return visiblePage()?.url ?? "";
}

export function pageIsOpen() {
  return Boolean(visiblePage());
}

export function askPage(request: { op: "inventory" | "locate" | "act" | "navigate"; target?: string; kind?: string; text?: string; url?: string }, timeoutMs = 700) {
  const page = visiblePage();
  if (!page) return Promise.resolve<PageReply | undefined>(undefined);
  const id = nextId++;
  return new Promise<PageReply | undefined>((resolve) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      resolve(undefined);
    }, timeoutMs);
    waiting.set(id, (reply) => {
      clearTimeout(timer);
      resolve(reply);
    });
    page.socket.send(JSON.stringify({ id, ...request }));
  });
}

export async function waitForPage(timeoutMs: number, check: (path: string) => boolean = () => true) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const page = visiblePage();
    if (page && check(page.path)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

export function pagePath() {
  return visiblePage()?.path ?? "";
}

// True when the page Kiwi would talk to is the one showing in its browser window.
export function pageInFront() {
  return Boolean(visiblePage()?.visible);
}
