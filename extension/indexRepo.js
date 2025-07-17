import fs from "fs/promises";
import path from "path";
import { getEmbedding } from "./rag.js";

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const res = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      files.push(...(await collectFiles(res)));
    } else if (/\.(js|json|md|html|css)$/.test(entry.name)) {
      files.push(res);
    }
  }
  return files;
}

function chunkText(text, size = 1000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

export async function buildIndex(rootDir, apiKey) {
  const files = await collectFiles(rootDir);
  const index = [];
  const seen = new Set();
  for (const file of files) {
    const rel = path.relative(rootDir, file);
    const content = await fs.readFile(file, "utf8");
    for (const chunk of chunkText(content)) {
      if (typeof chunk !== "string") continue;
      const trimmed = chunk.trim();
      if (trimmed.length < 3) continue;
      const key = `${rel}:${trimmed}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const embedding = await getEmbedding(chunk, apiKey);
      index.push({ path: rel, chunk, embedding });
    }
  }
  return index;
}

export async function writeIndex(index, outPath) {
  await fs.writeFile(outPath, JSON.stringify(index, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [rootDir, outFile, apiKey] = process.argv.slice(2);
  if (!rootDir || !outFile || !apiKey) {
    console.error(
      "Usage: node indexRepo.js <rootDir> <outFile> <openaiApiKey>",
    );
    process.exit(1);
  }
  buildIndex(rootDir, apiKey)
    .then((idx) => writeIndex(idx, outFile))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
