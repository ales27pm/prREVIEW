const EMBEDDING_URL = "https://api.openai.com/v1/embeddings";
const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Retrieves the embedding vector for a given text using the external embedding API.
 * @param {string} text - The input text to embed.
 * @param {string} apiKey - The API key for authentication with the embedding service.
 * @returns {Promise<number[]>} A promise that resolves to the embedding vector as an array of numbers.
 * @throws {Error} If the API request fails or the response format is invalid.
 */
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

/**
 * Calculates the cosine similarity between two numeric vectors.
 * @param {number[]} a - The first vector.
 * @param {number[]} b - The second vector.
 * @return {number} The cosine similarity score between the two vectors.
 */
export function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Loads and parses an index file from the specified URL.
 * @param {string} url - The URL of the JSON index file to load.
 * @return {Promise<any[]>} A promise that resolves to the parsed index array.
 * @throws {Error} If the fetch fails or the response is not a valid array.
 */
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

/**
 * Retrieves the most relevant text snippets from an index based on semantic similarity to a query.
 *
 * Computes the embedding for the input query, scores each entry in the index by cosine similarity to the query embedding, and returns the top K text chunks with the highest similarity.
 *
 * @param {string} query - The input text to search for relevant snippets.
 * @param {Array} index - An array of objects, each containing an `embedding` and a `chunk` field.
 * @param {string} apiKey - API key used to obtain the query embedding.
 * @param {number} [topK=3] - The number of top relevant snippets to return.
 * @return {Promise<string[]>} An array of the most relevant text snippets.
 */
export async function getRelevantSnippets(query, index, apiKey, topK = 3) {
  const queryEmbedding = await getEmbedding(query, apiKey);
  const scored = index.map((entry) => ({
    ...entry,
    score: cosineSimilarity(queryEmbedding, entry.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((e) => e.chunk);
}
