import neo4j, { type Session } from "neo4j-driver";
import { requiredEnv } from "./load-env.ts";

export function openDriver() {
  return neo4j.driver(
    requiredEnv("NEO4J_URI"),
    neo4j.auth.basic(requiredEnv("NEO4J_USERNAME"), requiredEnv("NEO4J_PASSWORD")),
  );
}

export function openSession() {
  const driver = openDriver();
  const session = driver.session({ database: requiredEnv("NEO4J_DATABASE") });
  return {
    session,
    close: async () => {
      await session.close();
      await driver.close();
    },
  };
}

export async function runWrite(session: Session, cypher: string, parameters: Record<string, unknown> = {}) {
  await session.executeWrite((transaction) => transaction.run(cypher, parameters));
}
