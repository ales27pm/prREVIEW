import fs from "fs/promises";
import path from "path";
import { parse } from "acorn";
import * as walk from "acorn-walk";
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
  const embeddings = [];
  const graph = { nodes: [], edges: [] };
  const seen = new Set();

  function addNode(node) {
    if (!graph.nodes.find((n) => n.id === node.id)) {
      graph.nodes.push(node);
    }
  }

  function addEdge(edge) {
    graph.edges.push(edge);
  }

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
      embeddings.push({ path: rel, chunk, embedding });
    }

    if (/\.js$/.test(file)) {
      try {
        const ast = parse(content, {
          ecmaVersion: "latest",
          sourceType: "module",
        });
        addNode({ id: rel, type: "module", name: rel });
        walk.simple(ast, {
          ImportDeclaration(node) {
            addEdge({ from: rel, to: node.source.value, type: "import" });
          },
          ClassDeclaration(node) {
            if (!node.id) return;
            const classId = `${rel}:${node.id.name}`;
            addNode({
              id: classId,
              type: "class",
              name: node.id.name,
              file: rel,
            });
            node.body.body.forEach((m) => {
              if (!m.key || !m.key.name) return;
              const methodId = `${classId}.${m.key.name}`;
              addNode({
                id: methodId,
                type: "method",
                name: m.key.name,
                file: rel,
              });
              addEdge({ from: classId, to: methodId, type: "contains" });
            });
          },
          FunctionDeclaration(node) {
            if (!node.id) return;
            const funcId = `${rel}:${node.id.name}`;
            addNode({
              id: funcId,
              type: "function",
              name: node.id.name,
              file: rel,
            });
          },
        });

        walk.ancestor(ast, {
          CallExpression(node, ancestors) {
            const callee = node.callee;
            let calleeName = null;
            if (callee.type === "Identifier") {
              calleeName = callee.name;
            } else if (
              callee.type === "MemberExpression" &&
              callee.property.type === "Identifier"
            ) {
              calleeName = callee.property.name;
            }
            if (!calleeName) return;
            const func = ancestors
              .slice()
              .reverse()
              .find((a) => a.type === "FunctionDeclaration" && a.id);
            if (func && func.id) {
              const from = `${rel}:${func.id.name}`;
              const to = `${rel}:${calleeName}`;
              addEdge({ from, to, type: "calls" });
            }
          },
        });
      } catch (e) {
        console.error(`Failed to parse ${rel} for graph`, e);
      }
    }
  }

  return { embeddings, graph };
}

export async function writeIndex(data, outPath) {
  await fs.writeFile(outPath, JSON.stringify(data, null, 2));
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
