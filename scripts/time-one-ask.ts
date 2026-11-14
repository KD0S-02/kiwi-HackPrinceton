import { readFile } from "node:fs/promises";
import { ask, primeCache, toolLog } from "./ask.ts";
import { lookupUser } from "./lookup-user.ts";
import { repoRoot } from "./paths.ts";
import path from "node:path";

const image = await readFile(path.join(repoRoot, "fixtures", "harbor-diner.png"));
primeCache(await lookupUser("user"), [
  { source: "discount-policy.md", text: "An account executive may discount up to 15 percent." },
  { source: "sending-a-quote.md", text: "Send Quote is on the Opportunity header." },
]);
const started = Date.now();
toolLog.length = 0;
const result = await ask({ question: "where do I send the quote?", imagePngBase64: image.toString("base64") });
console.log("ms", Date.now() - started);
console.log("tools", JSON.stringify(toolLog));
console.log("messages", result.messages.length);
console.log("stop", JSON.stringify(result.stops[0]));
