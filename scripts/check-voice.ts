import { AssemblyAI } from "assemblyai";
import { requiredEnv } from "./load-env.ts";

const client = new AssemblyAI({ apiKey: requiredEnv("ASSEMBLYAI_API_KEY") });
const transcriber = client.streaming.transcriber({
  sampleRate: 16_000,
  speechModel: "universal-3-6-pro",
  keytermsPrompt: ["Fieldnote", "Send Quote"],
});
transcriber.on("open", (event) => console.log("open", event.id));
transcriber.on("error", (error) => console.log("error", error instanceof Error ? error.message : error));
transcriber.on("close", (code, reason) => console.log("close", code, reason));
const started = Date.now();
await transcriber.connect();
console.log("connected ms", Date.now() - started);
transcriber.sendAudio(new Uint8Array(3200).buffer);
await new Promise((resolve) => setTimeout(resolve, 500));
await transcriber.close();
