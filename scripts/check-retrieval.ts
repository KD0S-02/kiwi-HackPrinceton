import { requiredEnv } from "./load-env.ts";

const geminiApiKey = requiredEnv("GEMINI_API_KEY");
const embeddingModel = requiredEnv("GEMINI_EMBEDDING_MODEL");
const dimensions = Number(requiredEnv("GEMINI_EMBEDDING_DIMENSIONS"));
const pineconeApiKey = requiredEnv("PINECONE_API_KEY");
const pineconeHost = requiredEnv("PINECONE_INDEX_HOST");

const expected: { question: string; sourceIncludes: string[] }[] = [
  { question: "how much can I discount", sourceIncludes: ["discount-policy.md"] },
  { question: "where do I send a quote", sourceIncludes: ["sending-a-quote.md"] },
  { question: "who approves a discount over 15", sourceIncludes: ["approval-matrix.md", "discount-policy.md"] },
  { question: "what does Harbor Diner usually order", sourceIncludes: ["account-harbor-diner.md"] },
  { question: "which warehouse stocks fryer oil", sourceIncludes: ["product-fryer-oil.md"] },
  { question: "how long is a delivery window", sourceIncludes: ["delivery-windows.md"] },
  { question: "how do I receive a purchase order", sourceIncludes: ["warehouse-receiving.md"] },
  { question: "can I discount 20 percent", sourceIncludes: ["discount-policy.md"] },
];

async function embed(text: string): Promise<number[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${embeddingModel}:embedContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: dimensions,
      }),
    },
  );
  if (!response.ok) throw new Error(await response.text());
  const body = await response.json();
  return body.embedding.values as number[];
}

let failed = 0;
for (const check of expected) {
  const vector = await embed(check.question);
  const response = await fetch(`https://${pineconeHost}/query`, {
    method: "POST",
    headers: { "Api-Key": pineconeApiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      namespace: "fieldnote",
      vector,
      topK: 8,
      includeMetadata: true,
      filter: { roles: { $in: ["account executive"] } },
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  const body = await response.json();
  const matches = (body.matches as { score: number; metadata: { source: string } }[]).filter(
    (match) => match.score >= 0.25,
  );
  const top = matches[0];
  const source = top?.metadata?.source ?? "";
  const ok = check.sourceIncludes.some((expectedSource) => source.includes(expectedSource));
  if (!ok) failed += 1;
  console.log(`${ok ? "ok" : "MISS"} ${check.question} -> ${source} ${top?.score?.toFixed(3) ?? "none"}`);
}

const statsResponse = await fetch(`https://${pineconeHost}/describe_index_stats`, {
  method: "POST",
  headers: { "Api-Key": pineconeApiKey, "Content-Type": "application/json" },
  body: "{}",
});
const stats = await statsResponse.json();
const namespaceCount = stats.namespaces?.fieldnote?.vectorCount ?? 0;
console.log(`namespace vectors ${namespaceCount}`);
if (namespaceCount < 100) {
  throw new Error("Namespace does not hold the chunk count");
}
if (failed > 0) {
  throw new Error(`${failed} retrieval checks missed`);
}
console.log("retrieval ok");
