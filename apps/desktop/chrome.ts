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

export async function chromeTabs() {
  try {
    const running = await osascript('application "Google Chrome" is running', 600);
    if (running !== "true") return [];
    const output = await osascript(
      `tell application "Google Chrome"
        set out to ""
        repeat with chromeTab in tabs of front window
          set out to out & (title of chromeTab) & tab & (URL of chromeTab) & linefeed
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
