"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type Request = { id: number; op: "inventory" | "locate" | "act" | "navigate"; target?: string; kind?: "show" | "click" | "type"; text?: string; url?: string };

const clickable = "a[href], button, input, select, textarea, [role=tab], [role=button], [data-kiwi]";

function labelOf(element: Element) {
  const html = element as HTMLElement;
  const input = element as HTMLInputElement;
  if (element instanceof HTMLSelectElement || element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return (element.getAttribute("aria-label") || input.placeholder || element.getAttribute("title") || element.name || "").replace(/\s+/g, " ").trim().slice(0, 60);
  }
  return (
    element.getAttribute("aria-label") ||
    html.innerText ||
    input.value ||
    element.getAttribute("title") ||
    ""
  ).replace(/\s+/g, " ").trim().slice(0, 60);
}

function isShown(element: Element) {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none";
}

// "the Fieldnote logo in the sidebar" and "Fieldnote logo, home" are the same control.
function normalize(text: string) {
  const noise = /^(the|a|an|logo|icon|sidebar|button|link|in|on|menu)$/;
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((word) => word && !noise.test(word)).join(" ");
}

function find(target: string) {
  const exact = document.getElementById(target) ?? document.querySelector(`[data-kiwi="${CSS.escape(target)}"]`);
  if (exact && isShown(exact)) return exact as HTMLElement;
  const wanted = normalize(target);
  if (!wanted && /logo|brand/i.test(target)) {
    const brand = document.querySelector("#brand, a.brand");
    if (brand && isShown(brand)) return brand as HTMLElement;
  }
  if (!wanted) return undefined;
  const candidates = [...document.querySelectorAll(clickable)].filter(isShown) as HTMLElement[];
  const name = (element: HTMLElement) => normalize(labelOf(element));
  return (
    candidates.find((element) => name(element) === wanted) ??
    candidates.find((element) => name(element).startsWith(wanted)) ??
    candidates.find((element) => wanted.startsWith(name(element)) && name(element).length > 3) ??
    candidates.find((element) => name(element).includes(wanted))
  );
}

function screenRect(element: Element) {
  const rect = element.getBoundingClientRect();
  const chromeTop = window.outerHeight - window.innerHeight;
  return {
    x: window.screenX + rect.left + rect.width / 2,
    y: window.screenY + chromeTop + rect.top + rect.height / 2,
    width: rect.width,
    height: rect.height,
  };
}

// One highlight at a time, drawn above the page. It is not part of the element, so
// the sidebar cannot clip it, two of them cannot pile up, and nothing is left behind.
let highlight: { box: HTMLDivElement; stop: () => void } | undefined;

function flash(element: HTMLElement) {
  highlight?.stop();
  const box = document.createElement("div");
  box.setAttribute("aria-hidden", "true");
  box.style.cssText =
    "position:fixed;z-index:2147483647;pointer-events:none;box-sizing:border-box;border:2px solid #3b82f6;" +
    "box-shadow:0 0 0 4px rgba(59,130,246,.22);transition:opacity .25s ease;opacity:1;";
  document.body.appendChild(box);
  const radius = parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
  let frame = 0;
  const place = () => {
    const rect = element.getBoundingClientRect();
    const grow = 3;
    box.style.left = `${rect.left - grow}px`;
    box.style.top = `${rect.top - grow}px`;
    box.style.width = `${rect.width + grow * 2}px`;
    box.style.height = `${rect.height + grow * 2}px`;
    box.style.borderRadius = `${Math.min(radius + grow, 999)}px`;
    frame = requestAnimationFrame(place);
  };
  place();
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    clearTimeout(fade);
    clearTimeout(remove);
    box.remove();
    if (highlight?.box === box) highlight = undefined;
  };
  const fade = setTimeout(() => {
    box.style.opacity = "0";
  }, 2100);
  const remove = setTimeout(stop, 2400);
  highlight = { box, stop };
}

function choose(select: HTMLSelectElement, text: string) {
  const wanted = text.trim().toLowerCase();
  const options = [...select.options];
  const option =
    options.find((item) => item.value.toLowerCase() === wanted || item.label.toLowerCase() === wanted) ??
    options.find((item) => item.label.toLowerCase().includes(wanted) || item.value.toLowerCase().includes(wanted));
  if (!option) return `${labelOf(select)} has no option called ${text}.`;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, option.value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return "";
}

function setValue(element: HTMLElement, text: string) {
  if (element instanceof HTMLSelectElement) return choose(element, text);
  const input = element as HTMLInputElement;
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return "";
}

function describe(element: HTMLElement) {
  const input = element as HTMLInputElement & { disabled?: boolean };
  const control: { id: string; label: string; kind: string; disabled: boolean; value?: string; options?: string[] } = {
    id: element.id || element.dataset.kiwi || "",
    label: labelOf(element),
    kind: element.tagName.toLowerCase(),
    disabled: Boolean(input.disabled),
  };
  if (element instanceof HTMLSelectElement) {
    control.value = element.selectedOptions[0]?.label ?? "";
    control.options = [...element.options].slice(0, 16).map((option) => option.label);
  } else if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.value) {
    control.value = element.value.slice(0, 60);
  }
  return control;
}

function inventory() {
  const controls = ([...document.querySelectorAll(clickable)].filter(isShown) as HTMLElement[])
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    })
    .slice(0, 70)
    .map(describe)
    .filter((control) => control.id || control.label);
  const facts = [...document.querySelectorAll("h1, #stage, #amount, #quote-message, #readiness, #filter-count, .warning, .pill")]
    .filter(isShown)
    .slice(0, 12)
    .map((element) => ({ id: element.id || "", text: ((element as HTMLElement).innerText || "").replace(/\s+/g, " ").trim().slice(0, 200) }))
    .filter((fact) => fact.text);
  return { ok: true, path: location.pathname + location.search, title: document.title, controls, facts };
}

function waitFor(check: () => boolean, timeoutMs: number) {
  return new Promise<boolean>((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (check()) resolve(true);
      else if (Date.now() - started > timeoutMs) resolve(false);
      else setTimeout(tick, 40);
    };
    tick();
  });
}

async function navigate(url: string, push: (href: string) => void) {
  const target = new URL(url, location.href);
  if (target.origin !== location.origin) return { ok: false, error: "Kiwi only opens Fieldnote pages." };
  const wanted = target.pathname + target.search;
  if (location.pathname + location.search !== wanted) {
    push(wanted);
    const arrived = await waitFor(() => location.pathname + location.search === wanted, 6000);
    if (!arrived) return { ok: false, error: "That page took too long to open." };
  }
  await new Promise((resolve) => setTimeout(resolve, 120));
  window.scrollTo({ top: 0 });
  return { ok: true };
}

async function handle(request: Request, push: (href: string) => void) {
  if (request.op === "inventory") return inventory();
  if (request.op === "navigate") return navigate(request.url ?? "/", push);
  const element = request.target ? find(request.target) : undefined;
  if (!element) return { ok: false, error: `No control called ${request.target} on this page.` };
  element.scrollIntoView({ block: "center", inline: "nearest" });
  if (request.op === "locate") {
    flash(element);
    return { ok: true, rect: screenRect(element) };
  }
  if ((element as HTMLButtonElement).disabled) return { ok: false, error: `${labelOf(element)} is switched off.`, rect: screenRect(element) };
  flash(element);
  if (request.kind === "type") {
    element.focus();
    const problem = setValue(element, request.text ?? "");
    if (problem) return { ok: false, error: problem, rect: screenRect(element) };
    return { ok: true, rect: screenRect(element) };
  }
  if (element instanceof HTMLAnchorElement) {
    const href = element.getAttribute("href") || "";
    let sameOrigin = false;
    try {
      sameOrigin = new URL(href, location.href).origin === location.origin;
    } catch {
      sameOrigin = false;
    }
    if (sameOrigin && href && !href.startsWith("#")) {
      const moved = await navigate(href, push);
      return { ...moved, rect: screenRect(element) };
    }
  }
  element.click();
  return { ok: true, rect: screenRect(element) };
}

export function KiwiBridge() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const push = (href: string) => routerRef.current.push(href, { scroll: false });
    const state = () => ({ type: "state", visible: document.visibilityState === "visible", focused: document.hasFocus(), path: location.pathname + location.search, url: location.href, agent: navigator.userAgent });
    const report = () => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(state()));
    };
    const connect = () => {
      if (stopped) return;
      socket = new WebSocket("ws://127.0.0.1:4555");
      socket.onopen = report;
      socket.onmessage = async (event) => {
        const request = JSON.parse(String(event.data)) as Request;
        let reply: Record<string, unknown>;
        try {
          reply = await handle(request, push);
        } catch (error) {
          reply = { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
        socket?.send(JSON.stringify({ ...reply, ...state(), type: "reply", id: request.id }));
      };
      socket.onclose = () => {
        retry = setTimeout(connect, 2000);
      };
      socket.onerror = () => socket?.close();
    };
    connect();
    // What the person does on the page, so a recording can become a skill.
    const tell = (action: "click" | "type", element: HTMLElement, text = "") => {
      if (socket?.readyState !== WebSocket.OPEN) return;
      const label = labelOf(element) || element.getAttribute("name") || "";
      socket.send(JSON.stringify({ type: "action", action, id: element.id || element.dataset.kiwi || "", label, text: text.slice(0, 80), control: element.getAttribute("role") || element.tagName.toLowerCase(), path: location.pathname + location.search }));
    };
    const onClick = (event: MouseEvent) => {
      const element = (event.target as Element | null)?.closest(clickable) as HTMLElement | null;
      if (!element || element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return;
      tell("click", element);
    };
    const onChange = (event: Event) => {
      const element = event.target as HTMLElement;
      if (element instanceof HTMLSelectElement) tell("type", element, element.selectedOptions[0]?.label ?? element.value);
      else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        if (element.type !== "password") tell("type", element, element.value);
      }
    };
    // Kiwi's pointer turns into a hand over anything clickable. Only changes are sent.
    let overClickable = false;
    const hover = (over: boolean) => {
      if (over === overClickable || socket?.readyState !== WebSocket.OPEN) return;
      overClickable = over;
      socket.send(JSON.stringify({ type: "hover", over }));
    };
    const onOver = (event: MouseEvent) => {
      const element = (event.target as Element | null)?.closest(clickable) as HTMLElement | null;
      hover(Boolean(element) && !element!.matches(":disabled, [aria-disabled='true']") && !(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement));
    };
    const onLeave = () => hover(false);
    document.addEventListener("click", onClick, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("mouseover", onOver, true);
    document.documentElement.addEventListener("mouseleave", onLeave);
    window.addEventListener("blur", onLeave);
    // Chrome does not always fire visibilitychange when a window is restored from the Dock.
    const heartbeat = setInterval(report, 1000);
    document.addEventListener("visibilitychange", report);
    window.addEventListener("focus", report);
    window.addEventListener("blur", report);
    return () => {
      stopped = true;
      clearInterval(heartbeat);
      if (retry) clearTimeout(retry);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("mouseover", onOver, true);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("blur", onLeave);
      socket?.close();
      document.removeEventListener("visibilitychange", report);
      window.removeEventListener("focus", report);
      window.removeEventListener("blur", report);
    };
  }, []);
  return null;
}
