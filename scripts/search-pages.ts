import { readFile } from "node:fs/promises";
import path from "node:path";
import { requiredEnv } from "./load-env.ts";
import { repoRoot } from "./paths.ts";

export type PageChunk = { text: string; source: string; score: number };

export async function searchPages(role: string, query: string): Promise<{ chunks: PageChunk[] }> {
  const geminiApiKey = requiredEnv("GEMINI_API_KEY");
  const embeddingModel = requiredEnv("GEMINI_EMBEDDING_MODEL");
  const dimensions = Number(requiredEnv("GEMINI_EMBEDDING_DIMENSIONS"));
  const pineconeApiKey = requiredEnv("PINECONE_API_KEY");
  const pineconeHost = requiredEnv("PINECONE_INDEX_HOST");

  let embedResponse: Response | undefined;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    embedResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${embeddingModel}:embedContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text: query }] },
        outputDimensionality: dimensions,
      }),
    },
  );
    if (embedResponse.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 8000));
      continue;
    }
    break;
  }
  if (!embedResponse || !embedResponse.ok) {
    throw new Error(`Search embed failed ${embedResponse?.status}`);
  }
  const embedBody = await embedResponse.json();
  const queryResponse = await fetch(`https://${pineconeHost}/query`, {
    method: "POST",
    headers: { "Api-Key": pineconeApiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      namespace: "fieldnote",
      vector: embedBody.embedding.values,
      topK: 8,
      includeMetadata: true,
      filter: { roles: { $in: [role] } },
    }),
  });
  if (!queryResponse.ok) {
    throw new Error(`Search query failed ${queryResponse.status} ${await queryResponse.text()}`);
  }
  const queryBody = await queryResponse.json();
  const matches = (queryBody.matches as { score: number; metadata: { source: string } }[])
    .filter((match) => match.score >= 0.25);
  const chunks = [];
  for (const match of matches) {
    const source = match.metadata.source;
    const text = await readFile(path.join(repoRoot, source), "utf8").catch(() => source);
    chunks.push({ text, source, score: match.score });
  }
  return { chunks };
}
