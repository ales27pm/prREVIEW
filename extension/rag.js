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
  if (!Array.isArray(data)) {
    throw new Error("Index file format invalid");
  }
  return data;
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
