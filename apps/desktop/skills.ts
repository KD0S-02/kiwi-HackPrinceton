import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { knownPath } from "../../scripts/site-map.ts";
import type { Run } from "./record.ts";

export type SkillStep =
  | { kind: "page"; path: string }
  | { kind: "click" | "type"; path: string; target: string; label: string; text?: string; control?: string; opens?: string };

export type Skill = {
  id: string;
  title: string;
  note: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  steps: SkillStep[];
  end?: string;
};

// A page the recorder saw for less than this was only passed through on the way somewhere.
const passingMs = 1500;

export function compileSkill(run: Run): Skill {
  const steps: SkillStep[] = [];
  let here = "";
  let end = "";
  let afterAction = false;
  const beats = run.beats.filter((beat) => beat.action || (beat.where && knownPath(beat.where)));
  beats.forEach((beat, index) => {
    const next = beats[index + 1];
    if (!beat.action) {
      end = beat.where;
      const passing = next && !next.action && Date.parse(next.at) - Date.parse(beat.at) < passingMs;
      // Another tab reporting in: the next click happened somewhere else.
      const elsewhere = next?.action && next.where !== beat.where;
      // The action just before already brought this page up.
      if (passing || elsewhere || afterAction || beat.where === here) {
        const last = steps.at(-1);
        if (afterAction && !elsewhere && last && last.kind === "click" && beat.where !== last.path) last.opens = beat.where;
        here = beat.where;
        return;
      }
      steps.push({ kind: "page", path: beat.where });
      here = beat.where;
      return;
    }
    // The recorder samples pages slowly, so the next action's page is the surer sign a click opened something.
    const last = steps.at(-1);
    if (last && last.kind === "click" && !last.opens && beat.where && beat.where !== last.path) last.opens = beat.where;
    const label = (beat.label ?? beat.target ?? "").replace(/[→←›»]/g, "").replace(/([^\d\s])\d+$/, "$1").trim();
    steps.push({ kind: beat.action, path: beat.where, target: beat.target ?? "", label, ...(beat.text ? { text: beat.text } : {}), ...(beat.control ? { control: beat.control } : {}) });
    here = beat.where;
    afterAction = true;
  });
  return {
    id: run.id.replace(/^run-/, "skill-"),
    title: run.title ?? "Untitled",
    note: run.note ?? "",
    authorId: run.personId,
    authorName: run.personName,
    createdAt: new Date().toISOString(),
    steps,
    end,
  };
}

function titled(id: string) {
  return id.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

// How a page reads in a sentence: "Home", "the Harbor Diner deal", "Cases".
export function pageName(target: string, sections: readonly (readonly [string, string])[]) {
  const route = target.split("?")[0] || "/";
  const section = sections.find(([href]) => href === route)?.[1];
  if (section) return section;
  const deal = route.match(/^\/opportunities\/opp-([a-z0-9-]+)$/);
  if (deal) return `the ${titled(deal[1])} deal`;
  const account = route.match(/^\/accounts\/([a-z0-9-]+)$/);
  if (account) return `the ${titled(account[1])} account`;
  return titled(route.replace(/^\//, "").split("/")[0] || "home");
}

// One step in plain words, the way a teammate would say it.
export function describeStep(step: SkillStep, first: boolean, sections: readonly (readonly [string, string])[]) {
  if (step.kind === "page") return `${first ? "Start on" : "Go to"} ${pageName(step.path, sections)}`;
  if (step.kind === "type") {
    if (/^search/i.test(step.label)) return `Search for ${step.text ?? ""}`;
    if (step.control === "select" || /^filter-/.test(step.target)) return `Set ${step.label} to ${step.text ?? ""}`;
    return `Enter ${step.text ?? ""} in ${step.label}`;
  }
  const sameRoute = step.opens && step.opens.split("?")[0] === step.path.split("?")[0];
  if (step.control === "tab" || sameRoute) return `Switch to the ${step.label} tab`;
  if (step.opens && /^(all|view all|see all|more)\b/i.test(step.label)) return `See all ${pageName(step.opens, sections).toLowerCase()}`;
  if (step.opens && /^(open|view) (the )?(opportunity|deal|account)$/i.test(step.label)) return `Open ${pageName(step.opens, sections)}`;
  if (/^(open|view|go|show|send|new|add|create|log|save|export|import|clone|change|request|edit|delete)\b/i.test(step.label)) return step.label;
  if (step.opens) return `Open ${step.label}`;
  return `Press ${step.label}`;
}

export function saveSkill(directory: string, skill: Skill) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, `${skill.id}.json`), JSON.stringify(skill, null, 2));
}

export function listSkills(directory: string): Skill[] {
  try {
    return readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .map((file) => JSON.parse(readFileSync(path.join(directory, file), "utf8")) as Skill)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

const filler = new Set(["a", "an", "the", "and", "to", "of", "my", "me", "i", "it", "its", "for", "on", "in", "how", "do", "can", "you", "through", "guide", "walk", "show", "skill", "skills", "recorded", "saved", "please", "with", "then"]);

function words(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)
    .filter((word) => word.length > 1 && !filler.has(word))
    .map((word) => (word.length > 4 ? word.replace(/(ing|ed|es|s)$/, "") : word));
}

// The saved skill a question is asking for, when most of the skill's title is in it.
export function findSkill(skills: Skill[], question: string) {
  const asked = new Set(words(question));
  let best: { skill: Skill; score: number } | undefined;
  for (const skill of skills) {
    const title = words(skill.title);
    if (title.length === 0) continue;
    const score = title.filter((word) => asked.has(word)).length / title.length;
    if (!best || score > best.score) best = { skill, score };
  }
  return best && best.score >= 0.6 ? best.skill : undefined;
}
