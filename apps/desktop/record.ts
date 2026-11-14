import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type RecordMode = "idle" | "recording" | "paused";

type Beat = {
  at: string;
  where: string;
  app: string;
  title: string;
  shot?: string;
};

type Run = {
  id: string;
  personId: string;
  personName: string;
  startedAt: string;
  stoppedAt?: string;
  status: "recording" | "paused" | "stopped" | "draft";
  title?: string;
  note?: string;
  beats: Beat[];
};

export function createRecorder(options: {
  directory: string;
  look: () => { where: string; app: string; title: string };
  shoot: () => Promise<string | undefined>;
  onState: (state: { mode: RecordMode; beats: number }) => void;
}) {
  let run: Run | null = null;
  let mode: RecordMode = "idle";
  let timer: NodeJS.Timeout | undefined;
  let lastKey = "";
  let busy = false;

  function publish() {
    options.onState({ mode, beats: run?.beats.length ?? 0 });
  }

  function save() {
    if (!run) return;
    const folder = path.join(options.directory, run.id);
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, "run.json"), JSON.stringify(run, null, 2));
  }

  async function tick() {
    if (!run || mode !== "recording" || busy) return;
    const seen = options.look();
    const key = `${seen.where}|${seen.app}|${seen.title}`;
    if (!key.replace(/\|/g, "") || key === lastKey) return;
    lastKey = key;
    busy = true;
    const beat: Beat = { at: new Date().toISOString(), ...seen };
    try {
      const jpeg = await options.shoot();
      if (jpeg) {
        const folder = path.join(options.directory, run.id);
        mkdirSync(folder, { recursive: true });
        const file = `beat-${run.beats.length + 1}.jpg`;
        writeFileSync(path.join(folder, file), Buffer.from(jpeg, "base64"));
        beat.shot = file;
      }
    } catch {
      // A missed still still leaves the moment in the trail.
    } finally {
      busy = false;
    }
    if (!run || mode === "idle") return;
    run.beats.push(beat);
    save();
    publish();
  }

  function start(person: { id: string; name: string }) {
    if (mode !== "idle") return mode;
    run = {
      id: `run-${Date.now().toString(36)}`,
      personId: person.id,
      personName: person.name,
      startedAt: new Date().toISOString(),
      status: "recording",
      beats: [],
    };
    mode = "recording";
    lastKey = "";
    save();
    timer = setInterval(() => void tick(), 1200);
    void tick();
    publish();
    return mode;
  }

  function pause() {
    if (mode !== "recording" || !run) return mode;
    mode = "paused";
    run.status = "paused";
    save();
    publish();
    return mode;
  }

  function resume() {
    if (mode !== "paused" || !run) return mode;
    mode = "recording";
    run.status = "recording";
    lastKey = "";
    save();
    publish();
    return mode;
  }

  function stop() {
    if (!run || mode === "idle") return null;
    if (timer) clearInterval(timer);
    timer = undefined;
    run.status = "stopped";
    run.stoppedAt = new Date().toISOString();
    save();
    const saved = run;
    run = null;
    mode = "idle";
    lastKey = "";
    publish();
    return saved;
  }

  return { start, pause, resume, stop, mode: () => mode };
}

export function nameRun(directory: string, id: string, title: string, note: string) {
  const file = path.join(directory, id, "run.json");
  const run = JSON.parse(readFileSync(file, "utf8")) as Run;
  run.title = title;
  run.note = note;
  run.status = "draft";
  writeFileSync(file, JSON.stringify(run, null, 2));
}
