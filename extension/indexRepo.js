import fs from "fs/promises";
import path from "path";
import { getEmbedding } from "./rag.js";

/**
 * Recursively collects file paths from a directory, including only files with specific extensions and skipping certain directories.
 * 
 * Traverses the given directory and its subdirectories, excluding `node_modules` and hidden directories, and returns an array of absolute paths to files with `.js`, `.json`, `.md`, `.html`, or `.css` extensions.
 * 
 * @param {string} dir - The root directory to search.
 * @return {Promise<string[]>} Array of absolute file paths matching the allowed extensions.
 */
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

/**
 * Splits a string into an array of chunks, each with a maximum specified length.
 * @param {string} text - The input text to be divided.
 * @param {number} [size=1000] - The maximum length of each chunk.
 * @return {string[]} An array of text chunks.
 */
function chunkText(text, size = 1000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

/**
 * Builds an index of text chunks and their embeddings from files in a directory tree.
 *
 * Recursively collects files under the specified root directory, splits each file's content into chunks, generates an embedding for each chunk, and returns an array of objects containing the relative file path, chunk text, and embedding.
 *
 * @param {string} rootDir - The root directory to index.
 * @param {string} apiKey - API key used for generating embeddings.
 * @returns {Promise<Array<{path: string, chunk: string, embedding: any}>>} Array of indexed objects with file path, text chunk, and embedding.
 */
export async function buildIndex(rootDir, apiKey) {
  const files = await collectFiles(rootDir);
  const index = [];
  for (const file of files) {
    const rel = path.relative(rootDir, file);
    const content = await fs.readFile(file, "utf8");
    for (const chunk of chunkText(content)) {
      const embedding = await getEmbedding(chunk, apiKey);
      index.push({ path: rel, chunk, embedding });
    }
  }
  return index;
}

/**
 * Writes the provided index array to a file as formatted JSON.
 * @param {Array} index - The index data to write.
 * @param {string} outPath - The file path where the index will be saved.
 */
export async function writeIndex(index, outPath) {
  await fs.writeFile(outPath, JSON.stringify(index, null, 2));
}

if (process.argv.length > 3 && process.argv[1].includes("indexRepo.js")) {
  const [rootDir, outFile, apiKey] = process.argv.slice(2);
  buildIndex(rootDir, apiKey)
    .then((idx) => writeIndex(idx, outFile))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
