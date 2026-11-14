import { execFile } from "node:child_process";

function osascript(script: string, timeoutMs = 1500) {
  return new Promise<string>((resolve, reject) => {
    execFile("/usr/bin/osascript", ["-e", script], { timeout: timeoutMs }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
  });
}

function quoted(text: string) {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

let tabsCache: { at: number; tabs: { title: string; url: string }[] } | undefined;

export function prefetchChromeTabs() {
  void chromeTabs(true);
}

export async function chromeTabs(fresh = false): Promise<{ title: string; url: string }[]> {
  if (!fresh && tabsCache && Date.now() - tabsCache.at < 4000) return tabsCache.tabs;
  const tabs = await readChromeTabs();
  tabsCache = { at: Date.now(), tabs };
  return tabs;
}

// Brings the Chrome window holding this URL forward, which also switches to its desktop.
export async function focusChromeUrl(urlPart: string) {
  const script = `
    tell application "Google Chrome"
      set wanted to ${quoted(urlPart.toLowerCase())}
      if frontmost and (count of windows) > 0 then
        if not (minimized of front window) then
          ignoring case
            if (URL of active tab of front window) contains wanted then return "front"
          end ignoring
        end if
      end if
      repeat with chromeWindow in windows
        set tabIndex to 0
        repeat with chromeTab in tabs of chromeWindow
          set tabIndex to tabIndex + 1
          ignoring case
            if (URL of chromeTab) contains wanted then
              if minimized of chromeWindow then set minimized of chromeWindow to false
              set active tab index of chromeWindow to tabIndex
              set index of chromeWindow to 1
              activate
              return "moved"
            end if
          end ignoring
        end repeat
      end repeat
      return ""
    end tell`;
  try {
    return await osascript(script, 2000);
  } catch {
    return "";
  }
}

async function readChromeTabs() {
  try {
    const running = await osascript('application "Google Chrome" is running', 600);
    if (running !== "true") return [];
    const output = await osascript(
      `tell application "Google Chrome"
        set out to ""
        repeat with chromeWindow in windows
          repeat with chromeTab in tabs of chromeWindow
            set out to out & (title of chromeTab) & tab & (URL of chromeTab) & linefeed
          end repeat
        end repeat
        return out
      end tell`,
      900,
    );
    return output
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [title, url = ""] = line.split("\t");
        return { title, url };
      });
  } catch {
    return [];
  }
}

export async function openChromeTab(name: string) {
  const wanted = name.replace(/^tab:/i, "").trim();
  const script = `
    tell application "Google Chrome"
      set wanted to ${quoted(wanted.toLowerCase())}
      repeat with chromeWindow in windows
        set tabIndex to 0
        repeat with chromeTab in tabs of chromeWindow
          set tabIndex to tabIndex + 1
          set tabTitle to title of chromeTab
          set tabUrl to URL of chromeTab
          ignoring case
            if tabTitle contains wanted or tabUrl contains wanted then
              if minimized of chromeWindow then set minimized of chromeWindow to false
              set active tab index of chromeWindow to tabIndex
              set index of chromeWindow to 1
              activate
              return tabTitle
            end if
          end ignoring
        end repeat
      end repeat
      return ""
    end tell`;
  const found = await osascript(script, 2500);
  return found;
}

export async function chromeRunning() {
  try {
    return (await osascript('application "Google Chrome" is running', 600)) === "true";
  } catch {
    return false;
  }
}

// Opens the URL in a new tab of the front Chrome window, starting Chrome if needed.
export async function openChromeUrl(url: string) {
  if (!(await chromeRunning())) {
    await new Promise<void>((resolve, reject) => {
      execFile("/usr/bin/open", ["-a", "Google Chrome", url], (error) => (error ? reject(error) : resolve()));
    });
    return;
  }
  await osascript(
    `tell application "Google Chrome"
      if (count of windows) = 0 then
        make new window
        set URL of active tab of front window to ${quoted(url)}
      else
        if minimized of front window then set minimized of front window to false
        tell front window to make new tab with properties {URL:${quoted(url)}}
      end if
      activate
    end tell`,
    3000,
  );
}

// Reloads the first tab whose URL contains this text. Chrome discards idle tabs, and a
// discarded Fieldnote tab is listed but has no live page to talk to.
export async function reloadChromeTab(urlPart: string) {
  try {
    return await osascript(
      `tell application "Google Chrome"
        repeat with chromeWindow in windows
          repeat with chromeTab in tabs of chromeWindow
            if (URL of chromeTab) contains ${quoted(urlPart)} then
              tell chromeTab to reload
              return "reloaded"
            end if
          end repeat
        end repeat
        return ""
      end tell`,
      2000,
    );
  } catch {
    return "";
  }
}

// The app and window title in front, read through System Events.
export async function frontWindow() {
  try {
    const output = await osascript(
      `tell application "System Events"
        set frontProcess to first application process whose frontmost is true
        set appName to name of frontProcess
        set windowName to ""
        try
          set windowName to name of front window of frontProcess
        end try
        return appName & tab & windowName
      end tell`,
      1200,
    );
    const [app = "", title = ""] = output.split("\t");
    return { app, title };
  } catch {
    return { app: "", title: "" };
  }
}

export async function activateApp(name: string) {
  try {
    await osascript(`tell application ${quoted(name)} to activate`, 1500);
  } catch {
    // The paste still goes to whatever has focus.
  }
}
