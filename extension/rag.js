const EMBEDDING_URL = "https://api.openai.com/v1/embeddings";
const EMBEDDING_MODEL = "text-embedding-3-small";

export async function getEmbedding(text, apiKey) {
  const res = await fetch(EMBEDDING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });

  if (!res.ok) {
    throw new Error(`Embedding API: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!data.data || !data.data[0] || !Array.isArray(data.data[0].embedding)) {
    throw new Error("Embedding API returned invalid response");
  }
  return data.data[0].embedding;
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function loadIndex(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load index: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (Array.isArray(data)) {
    return { embeddings: data, graph: null };
  }
  if (
    data &&
    Array.isArray(data.embeddings) &&
    data.graph &&
    Array.isArray(data.graph.nodes)
  ) {
    return data;
  }
  throw new Error("Index file format invalid");
}

export async function getRelevantSnippets(query, index, apiKey, topK = 3) {
  if (!Array.isArray(index) || index.length === 0) {
    return [];
  }
  const queryEmbedding = await getEmbedding(query, apiKey);
  const scored = index
    .filter(
      (entry) =>
        entry &&
        typeof entry.chunk === "string" &&
        Array.isArray(entry.embedding),
    )
    .map((entry) => ({
      ...entry,
      score: cosineSimilarity(queryEmbedding, entry.embedding),
    }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((e) => e.chunk);
}

export function extractSymbols(diff) {
  const symbols = new Set();
  const regexes = [
    /function\s+(\w+)/g,
    /class\s+(\w+)/g,
    /const\s+(\w+)\s*=\s*/g,
  ];
  for (const r of regexes) {
    let m;
    while ((m = r.exec(diff))) {
      symbols.add(m[1]);
    }
  }
  return Array.from(symbols);
}

export function traverseGraph(startIds, graph, depth = 1) {
  const result = new Set(startIds);
  let frontier = Array.from(startIds);
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const id of frontier) {
      for (const e of graph.edges) {
        if (e.from === id && !result.has(e.to)) {
          result.add(e.to);
          next.push(e.to);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return Array.from(result);
}

export function getGraphContext(diff, indexData, depth = 1) {
  if (!indexData.graph) return [];
  const symbols = extractSymbols(diff);
  const start = indexData.graph.nodes
    .filter((n) => symbols.includes(n.name))
    .map((n) => n.id);
  if (start.length === 0) return [];
  const ids = traverseGraph(start, indexData.graph, depth);
  const snippets = [];
  for (const id of ids) {
    const node = indexData.graph.nodes.find((n) => n.id === id);
    if (!node || !node.file) continue;
    const chunks = indexData.embeddings
      .filter((e) => e.path === node.file)
      .map((e) => e.chunk);
    snippets.push(...chunks);
    if (snippets.length >= 3) break;
  }
  return snippets.slice(0, 3);
}
