import { readFile } from "node:fs/promises";
import path from "node:path";
import { ask, primeCache, toolLog, type Stop } from "./ask.ts";
import { lookupUser } from "./lookup-user.ts";
import { repoRoot } from "./paths.ts";

function assertStop(name: string, stop: Stop | undefined, expected: Partial<Stop>) {
  if (!stop) throw new Error(`${name} returned no stop`);
  for (const [key, value] of Object.entries(expected)) {
    if (stop[key as keyof Stop] !== value) {
      throw new Error(`${name} ${key} is ${JSON.stringify(stop[key as keyof Stop])}, expected ${JSON.stringify(value)}`);
    }
  }
  console.log(`ok ${name} ${stop.kind} ${stop.label}`);
}

const image = await readFile(path.join(repoRoot, "fixtures", "harbor-diner.png"));
const imagePngBase64 = image.toString("base64");
const userRecord = await lookupUser("user");
primeCache(userRecord, [
  { source: "discount-policy.md", text: "An account executive may discount up to 15 percent and may send a quote on their own opportunities." },
  { source: "sending-a-quote.md", text: "Send Quote is on the Opportunity header next to the discount field." },
]);

toolLog.length = 0;
const where = await ask({ question: "where do I send the quote?", imagePngBase64 });
assertStop("where", where.stops[0], { kind: "show", allow: false });
if (!/send quote/i.test(where.stops[0].label)) {
  throw new Error(`where label ${where.stops[0].label}`);
}

toolLog.length = 0;
const tooHigh = await ask({ question: "set the discount to 25", imagePngBase64 });
assertStop("too high", tooHigh.stops[0], { kind: "show", text: "" });

toolLog.length = 0;
const setFifteen = await ask({ question: "set the discount to 15", imagePngBase64 });
assertStop("set 15", setFifteen.stops[0], { kind: "type", text: "15", allow: true });

toolLog.length = 0;
const tour = await ask({ question: "walk me through this opportunity", imagePngBase64 });
if (tour.stops.length < 2) throw new Error(`tour stops ${tour.stops.length}`);
if (!toolLog.some((entry) => entry.name === "lookupUser" || entry.name === "searchPages")) {
  throw new Error("tour made no tool call");
}
console.log(`ok tour stops ${tour.stops.length}`);

const callsBefore = toolLog.length;
toolLog.length = 0;
const again = await ask({ question: "where do I send the quote?", imagePngBase64 });
assertStop("where again", again.stops[0], { kind: "show" });
const liveCalls = toolLog.filter((entry) => !entry.cached);
if (liveCalls.length > 0) {
  throw new Error(`second where-question left the cache: ${JSON.stringify(toolLog)}`);
}
console.log(`ok cache, prior tool calls ${callsBefore}`);
console.log("agent ok");
