import { readFile } from "node:fs/promises";
import path from "node:path";
import { dataDirectory, recordsDirectory } from "./paths.ts";

export async function readJson<T>(directory: string, fileName: string): Promise<T> {
  return JSON.parse(await readFile(path.join(directory, fileName), "utf8")) as T;
}

export function readRecords<T>(fileName: string): Promise<T> {
  return readJson<T>(recordsDirectory, fileName);
}

export function readData<T>(fileName: string): Promise<T> {
  return readJson<T>(dataDirectory, fileName);
}
