import { WebSocketServer, type WebSocket } from "ws";

export type PageControl = { id: string; label: string; kind: string; disabled: boolean };
export type PageRect = { x: number; y: number; width: number; height: number };
export type PageReply = {
  ok: boolean;
  error?: string;
  rect?: PageRect;
  controls?: PageControl[];
  path?: string;
  title?: string;
};

type Page = { socket: WebSocket; visible: boolean; focused: boolean; path: string; seen: number };

const pages = new Set<Page>();
const waiting = new Map<number, (reply: PageReply) => void>();
let nextId = 1;

export function startBridge(port = 4555) {
  const server = new WebSocketServer({ host: "127.0.0.1", port });
  server.on("connection", (socket) => {
    if (process.env.KIWI_BRIDGE_DEBUG) console.log("page connected");
    const page: Page = { socket, visible: false, focused: false, path: "", seen: Date.now() };
    pages.add(page);
    socket.on("message", (data) => {
      const message = JSON.parse(String(data)) as { type: string; id?: number; visible?: boolean; focused?: boolean; path?: string } & PageReply;
      if (message.visible !== undefined) page.visible = message.visible;
      if (message.focused !== undefined) page.focused = message.focused;
      if (message.path) page.path = message.path;
      page.seen = Date.now();
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
  return [...pages]
    .filter((page) => page.visible)
    .sort((a, b) => Number(b.focused) - Number(a.focused) || b.seen - a.seen)[0];
}

export function pageIsOpen() {
  return Boolean(visiblePage());
}

export function askPage(request: { op: "inventory" | "locate" | "act"; target?: string; kind?: string; text?: string }, timeoutMs = 700) {
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
