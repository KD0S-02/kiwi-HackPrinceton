import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(scriptsDirectory, "..");
export const dataDirectory = path.join(repoRoot, "data");
export const recordsDirectory = path.join(dataDirectory, "records");
export const authoredDocsDirectory = path.join(dataDirectory, "docs", "authored");
export const generatedDocsDirectory = path.join(dataDirectory, "docs", "generated");
