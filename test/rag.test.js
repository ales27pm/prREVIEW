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

  test("loadIndex fetches json", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [{ chunk: "a", embedding: [1] }],
    });

    const index = await loadIndex("/index.json");
    expect(fetchMock).toHaveBeenCalled();
    expect(index).toEqual([{ chunk: "a", embedding: [1] }]);
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

  test("cosineSimilarity", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
});
