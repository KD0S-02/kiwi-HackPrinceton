"use client";

import { useEffect } from "react";

type Request = { id: number; op: "inventory" | "locate" | "act"; target?: string; kind?: "show" | "click" | "type"; text?: string };

const clickable = "a[href], button, input, select, textarea, [role=tab], [role=button], [data-kiwi]";

function labelOf(element: Element) {
  const html = element as HTMLElement;
  const input = element as HTMLInputElement;
  return (
    element.getAttribute("aria-label") ||
    html.innerText ||
    input.value ||
    input.placeholder ||
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

function find(target: string) {
  const exact = document.getElementById(target) ?? document.querySelector(`[data-kiwi="${CSS.escape(target)}"]`);
  if (exact && isShown(exact)) return exact as HTMLElement;
  const wanted = target.trim().toLowerCase();
  const candidates = [...document.querySelectorAll(clickable)].filter(isShown) as HTMLElement[];
  return (
    candidates.find((element) => labelOf(element).toLowerCase() === wanted) ??
    candidates.find((element) => labelOf(element).toLowerCase().startsWith(wanted)) ??
    candidates.find((element) => labelOf(element).toLowerCase().includes(wanted))
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

function flash(element: HTMLElement) {
  const before = element.style.outline;
  const offset = element.style.outlineOffset;
  element.style.outline = "3px solid #3b82f6";
  element.style.outlineOffset = "3px";
  setTimeout(() => {
    element.style.outline = before;
    element.style.outlineOffset = offset;
  }, 2400);
}

function setValue(element: HTMLElement, text: string) {
  const input = element as HTMLInputElement;
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function handle(request: Request) {
  if (request.op === "inventory") {
    const controls = ([...document.querySelectorAll(clickable)].filter(isShown) as HTMLElement[])
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
      })
      .slice(0, 70)
      .map((element) => {
        const input = element as HTMLInputElement & { disabled?: boolean };
        return {
          id: element.id || element.dataset.kiwi || "",
          label: labelOf(element),
          kind: element.tagName.toLowerCase(),
          disabled: Boolean(input.disabled),
        };
      })
      .filter((control) => control.id || control.label);
    return { ok: true, path: location.pathname, title: document.title, controls };
  }
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
    setValue(element, request.text ?? "");
  } else {
    element.click();
  }
  return { ok: true, rect: screenRect(element) };
}

export function KiwiBridge() {
  useEffect(() => {
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const state = () => ({ type: "state", visible: document.visibilityState === "visible", focused: document.hasFocus(), path: location.pathname });
    const report = () => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(state()));
    };
    const connect = () => {
      if (stopped) return;
      socket = new WebSocket("ws://127.0.0.1:4555");
      socket.onopen = report;
      socket.onmessage = (event) => {
        const request = JSON.parse(String(event.data)) as Request;
        let reply: Record<string, unknown>;
        try {
          reply = handle(request);
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
    document.addEventListener("visibilitychange", report);
    window.addEventListener("focus", report);
    window.addEventListener("blur", report);
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      socket?.close();
      document.removeEventListener("visibilitychange", report);
      window.removeEventListener("focus", report);
      window.removeEventListener("blur", report);
    };
  }, []);
  return null;
}
