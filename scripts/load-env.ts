import path from "node:path";
import dotenv from "dotenv";
import { repoRoot } from "./paths.ts";

dotenv.config({ path: path.join(repoRoot, ".env") });

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in .env`);
  }
  return value;
}
