import fs from "fs/promises";
import path from "path";
import { parse } from "acorn";
import { ancestor as walk } from "acorn-walk";
import { getEmbedding } from "./rag.js";
import pLimit from "./p-limit.js";
import { GraphBuilder } from "./graphBuilder.js";

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

export async function buildIndex(rootDir, apiKey, concurrencyLimit = 5) {
  const files = await collectFiles(rootDir);
  const embeddings = [];
  const seen = new Set();
  const limit = pLimit(concurrencyLimit);
  const builder = new GraphBuilder();

  for (const file of files) {
    const rel = path.relative(rootDir, file);
    const content = await fs.readFile(file, "utf8");

    const embedTasks = [];
    for (const chunk of chunkText(content)) {
      if (typeof chunk !== "string") continue;
      const trimmed = chunk.trim();
      if (trimmed.length < 3) continue;
      const key = `${rel}:${trimmed}`;
      if (seen.has(key)) continue;
      seen.add(key);
      embedTasks.push(
        limit(async () => {
          const embedding = await getEmbedding(chunk, apiKey);
          embeddings.push({ path: rel, chunk, embedding });
        }),
      );
    }
    if (embedTasks.length) {
      await Promise.all(embedTasks);
    }

    if (/\.js$/.test(file)) {
      try {
        const ast = parse(content, {
          ecmaVersion: "latest",
          sourceType: "module",
        });
        builder.addNode({ id: rel, type: "module", name: rel });
        walk(ast, {
          ImportDeclaration(node) {
            let importSource = node.source.value;
            let resolved;
            if (importSource.startsWith(".")) {
              resolved = path.normalize(
                path.join(path.dirname(rel), importSource),
              );
              if (!/\.[jt]sx?$/.test(resolved)) {
                resolved += ".js";
              }
            } else {
              resolved = importSource;
            }
            builder.addEdge({ from: rel, to: resolved, type: "import" });
          },
          ClassDeclaration(node) {
            if (!node.id) return;
            const cid = `${rel}:${node.id.name}`;
            builder.addNode({
              id: cid,
              type: "class",
              name: node.id.name,
              file: rel,
            });
            node.body.body.forEach((m) => {
              if (!m.key || !m.key.name) return;
              if (m.type !== "MethodDefinition") return;
              const mid = `${cid}.${m.key.name}`;
              builder.addNode({
                id: mid,
                type: "method",
                name: m.key.name,
                file: rel,
              });
              builder.addEdge({ from: cid, to: mid, type: "contains" });
            });
          },
          FunctionDeclaration(node) {
            if (!node.id) return;
            const fid = `${rel}:${node.id.name}`;
            builder.addNode({
              id: fid,
              type: "function",
              name: node.id.name,
              file: rel,
            });
          },
          CallExpression(node, ancestors) {
            let calleeName = null;
            if (node.callee.type === "Identifier") {
              calleeName = node.callee.name;
            } else if (
              node.callee.type === "MemberExpression" &&
              node.callee.property.type === "Identifier"
            ) {
              calleeName = node.callee.property.name;
            }
            if (!calleeName) return;
            const caller = ancestors
              .slice()
              .reverse()
              .find((a) => a.type === "FunctionDeclaration" && a.id);
            if (caller && caller.id) {
              const from = `${rel}:${caller.id.name}`;
              const to = `${rel}:${calleeName}`;
              builder.addEdge({ from, to, type: "calls" });
            }
          },
        });
      } catch (e) {
        console.error(`Failed to parse ${rel}`, e);
      }
    }
  }

  return { embeddings, graph: builder.build() };
}

export async function writeIndex(data, outPath) {
  await fs.writeFile(outPath, JSON.stringify(data, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [rootDir, outFile, apiKey, concStr] = process.argv.slice(2);
  if (!rootDir || !outFile || !apiKey) {
    console.error(
      "Usage: node indexRepo.js <rootDir> <outFile> <openaiApiKey> [concurrency]",
    );
    process.exit(1);
  }
  const conc = parseInt(concStr, 10);
  const limit = Number.isInteger(conc) && conc > 0 ? conc : 5;
  buildIndex(rootDir, apiKey, limit)
    .then((idx) => writeIndex(idx, outFile))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
