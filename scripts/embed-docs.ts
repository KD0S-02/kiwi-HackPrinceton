import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { buildCompanyData } from "./company-data.ts";
import { requiredEnv } from "./load-env.ts";
import { authoredDocsDirectory, generatedDocsDirectory } from "./paths.ts";

type Chunk = {
  id: string;
  text: string;
  metadata: Record<string, string | string[]>;
};

const geminiApiKey = requiredEnv("GEMINI_API_KEY");
const embeddingModel = requiredEnv("GEMINI_EMBEDDING_MODEL");
const dimensions = Number(requiredEnv("GEMINI_EMBEDDING_DIMENSIONS"));
const pineconeApiKey = requiredEnv("PINECONE_API_KEY");
const pineconeHost = requiredEnv("PINECONE_INDEX_HOST");

const authoredMeta = new Map(
  buildCompanyData(15).authoredDocuments.map((document) => [document.fileName, document]),
);

function chunkAuthored(fileName: string, body: string): Chunk[] {
  const meta = authoredMeta.get(fileName);
  if (!meta) throw new Error(`No metadata for ${fileName}`);
  const sections = body.split(/\n(?=## )/).map((section) => section.trim()).filter(Boolean);
  const pieces = sections.length > 0 && body.includes("\n## ") ? sections : [body.trim()];
  const keptTogether = pieces.some((piece) => piece.includes("15 percent") && piece.toLowerCase().includes("send a quote"));
  const sourcePieces = keptTogether ? [body.trim()] : pieces;
  return sourcePieces.map((text, index) => ({
    id: `${fileName}-${index}`,
    text,
    metadata: {
      source: `data/docs/authored/${fileName}`,
      title: meta.title,
      kind: meta.kind,
      department: meta.department,
      roles: meta.roles,
      module: meta.module,
      company: "fieldnote",
    },
  }));
}

function field(body: string, label: string): string {
  const match = body.match(new RegExp(`^${label}: (.+)$`, "m"));
  return match?.[1]?.trim() ?? "";
}

function chunkGenerated(fileName: string, body: string): Chunk {
  const roles = field(body, "Roles").split(",").map((role) => role.trim()).filter(Boolean);
  const accountId = field(body, "Account");
  const metadata: Record<string, string | string[]> = {
    source: `data/docs/generated/${fileName}`,
    title: body.split("\n")[0].replace(/^# /, ""),
    kind: field(body, "Kind") || "note",
    department: field(body, "Department") || "ops",
    roles: roles.length > 0 ? roles : ["account executive"],
    module: field(body, "Module") || "",
    company: "fieldnote",
  };
  if (accountId) metadata.accountId = accountId;
  return { id: fileName, text: body.trim(), metadata };
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${embeddingModel}:batchEmbedContents?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${embeddingModel}`,
            content: { parts: [{ text }] },
            outputDimensionality: dimensions,
          })),
        }),
      },
    );
    if (response.status === 429) {
      console.log(`rate limit, waiting ${attempt * 15}s`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 15000));
      continue;
    }
    if (!response.ok) {
      throw new Error(`Embed failed ${response.status} ${await response.text()}`);
    }
    const body = await response.json();
    const vectors = (body.embeddings as { values: number[] }[]).map((embedding) => embedding.values);
    if (vectors.some((vector) => vector.length !== dimensions)) {
      throw new Error("Embedding dimension mismatch");
    }
    return vectors;
  }
  throw new Error("Embed still rate limited");
}

const chunks: Chunk[] = [];
for (const fileName of (await readdir(authoredDocsDirectory)).filter((name) => name.endsWith(".md"))) {
  chunks.push(...chunkAuthored(fileName, await readFile(path.join(authoredDocsDirectory, fileName), "utf8")));
}
for (const fileName of (await readdir(generatedDocsDirectory)).filter((name) => name.endsWith(".md"))) {
  chunks.push(chunkGenerated(fileName, await readFile(path.join(generatedDocsDirectory, fileName), "utf8")));
}

const vectors: { id: string; values: number[]; metadata: Chunk["metadata"] }[] = [];
for (let start = 0; start < chunks.length; start += 20) {
  const batch = chunks.slice(start, start + 20);
  const values = await embedBatch(batch.map((chunk) => chunk.text));
  batch.forEach((chunk, index) => {
    vectors.push({ id: chunk.id, values: values[index], metadata: chunk.metadata });
  });
  console.log(`embedded ${Math.min(start + 20, chunks.length)} / ${chunks.length}`);
  await new Promise((resolve) => setTimeout(resolve, 12000));
}

const deleteResponse = await fetch(`https://${pineconeHost}/vectors/delete`, {
  method: "POST",
  headers: { "Api-Key": pineconeApiKey, "Content-Type": "application/json" },
  body: JSON.stringify({ deleteAll: true, namespace: "fieldnote" }),
});
if (!deleteResponse.ok && deleteResponse.status !== 404) {
  throw new Error(`Delete namespace failed ${deleteResponse.status} ${await deleteResponse.text()}`);
}

for (let start = 0; start < vectors.length; start += 100) {
  const batch = vectors.slice(start, start + 100);
  const upsertResponse = await fetch(`https://${pineconeHost}/vectors/upsert`, {
    method: "POST",
    headers: { "Api-Key": pineconeApiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ vectors: batch, namespace: "fieldnote" }),
  });
  if (!upsertResponse.ok) {
    throw new Error(`Upsert failed ${upsertResponse.status} ${await upsertResponse.text()}`);
  }
}

console.log(`upserted ${vectors.length} vectors`);
