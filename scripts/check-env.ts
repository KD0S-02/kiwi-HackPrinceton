import { requiredEnv } from "./load-env.ts";

const geminiApiKey = requiredEnv("GEMINI_API_KEY");
const geminiModel = requiredEnv("GEMINI_MODEL");
const pineconeApiKey = requiredEnv("PINECONE_API_KEY");
const pineconeIndex = requiredEnv("PINECONE_INDEX");
const neo4jUri = requiredEnv("NEO4J_URI");
const neo4jUsername = requiredEnv("NEO4J_USERNAME");
const neo4jPassword = requiredEnv("NEO4J_PASSWORD");
const neo4jDatabase = requiredEnv("NEO4J_DATABASE");

let geminiResponse: Response | undefined;
for (let attempt = 1; attempt <= 4; attempt += 1) {
  geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Reply with the single word ready." }] }],
      }),
    },
  );
  if (geminiResponse.status === 503 || geminiResponse.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, attempt * 5000));
    continue;
  }
  break;
}
if (!geminiResponse?.ok) {
  throw new Error(`Gemini failed: ${geminiResponse?.status} ${await geminiResponse?.text()}`);
}
const geminiBody = await geminiResponse.json();
const geminiText = geminiBody.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
if (!geminiText.trim()) {
  throw new Error("Gemini returned an empty sentence");
}

const { default: neo4j } = await import("neo4j-driver");
const driver = neo4j.driver(neo4jUri, neo4j.auth.basic(neo4jUsername, neo4jPassword));
try {
  const session = driver.session({ database: neo4jDatabase });
  try {
    const result = await session.run("RETURN 1 AS ok");
    const okValue = result.records[0].get("ok");
    const okNumber = typeof okValue === "number" ? okValue : okValue.toNumber();
    if (okNumber !== 1) {
      throw new Error("Neo4j did not return 1");
    }
  } finally {
    await session.close();
  }
} finally {
  await driver.close();
}

const pineconeResponse = await fetch(`https://api.pinecone.io/indexes/${pineconeIndex}`, {
  headers: {
    "Api-Key": pineconeApiKey,
    "X-Pinecone-API-Version": "2025-10",
  },
});
if (!pineconeResponse.ok) {
  throw new Error(`Pinecone failed: ${pineconeResponse.status} ${await pineconeResponse.text()}`);
}
const pineconeIndexDescription = await pineconeResponse.json();
if (pineconeIndexDescription.dimension !== 768 || pineconeIndexDescription.metric !== "cosine") {
  throw new Error(
    `Pinecone index is ${pineconeIndexDescription.dimension} ${pineconeIndexDescription.metric}, expected 768 cosine`,
  );
}
if (!pineconeIndexDescription.status?.ready) {
  throw new Error("Pinecone index is not ready");
}

console.log("env ok");
console.log(`gemini model ${geminiModel}`);
console.log(`neo4j ${neo4jUri}`);
console.log(`pinecone ${pineconeIndex} 768 cosine`);
