import { jest } from "@jest/globals";

const fetchMock = jest.fn();

global.fetch = fetchMock;

const { getEmbedding, loadIndex, getRelevantSnippets, cosineSimilarity } =
  await import("../extension/rag.js");

describe("rag utilities", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  test("getEmbedding calls OpenAI API", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ embedding: [1, 0] }] }),
    });

    const emb = await getEmbedding("hi", "key");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer key" }),
      }),
    );
    expect(emb).toEqual([1, 0]);
  });

  test("getEmbedding throws on non-ok response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });
    await expect(getEmbedding("hi", "key")).rejects.toThrow("Embedding API");
  });

  test("getEmbedding throws on malformed json", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    await expect(getEmbedding("hi", "key")).rejects.toThrow("invalid response");
  });

  test("loadIndex fetches json", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        embeddings: [{ chunk: "a", embedding: [1] }],
        graph: { nodes: [], edges: [] },
      }),
    });

    const index = await loadIndex("/index.json");
    expect(fetchMock).toHaveBeenCalled();
    expect(index.embeddings).toEqual([{ chunk: "a", embedding: [1] }]);
    expect(index.graph).toEqual({ nodes: [], edges: [] });
  });

  test("getRelevantSnippets ranks by similarity", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ embedding: [1, 0] }] }),
    });

    const snippets = await getRelevantSnippets(
      "query",
      [
        { chunk: "a", embedding: [1, 0] },
        { chunk: "b", embedding: [0, 1] },
      ],
      "key",
      1,
    );
    expect(snippets).toEqual(["a"]);
  });

  test("getRelevantSnippets handles empty index", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ embedding: [1, 0] }] }),
    });
    const res = await getRelevantSnippets("query", [], "key");
    expect(res).toEqual([]);
  });

  test("getRelevantSnippets filters malformed entries", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ embedding: [1, 0] }] }),
    });
    const res = await getRelevantSnippets(
      "query",
      [{ bogus: true }, { chunk: "ok", embedding: [1, 0] }],
      "key",
    );
    expect(res).toEqual(["ok"]);
  });

  test("cosineSimilarity", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
});
