// Puts the demo data back to its starting point: the committed records and rules, with the
// workflow seed applied on top. Recordings and skills (data/runs, data/skills) are left alone.
import { execFileSync } from "node:child_process";
import { repoRoot } from "./paths.ts";

const git = (...args: string[]) => execFileSync("git", args, { cwd: repoRoot, stdio: "inherit" });

git("checkout", "--", "data/records", "data/rules.json");
git("clean", "-fdq", "--", "data/records");
await import("./seed-workflows.ts");
console.log("data reset");
