import { jest } from "@jest/globals";

// Mock loadSettings so openaiApi does not access chrome.storage
jest.unstable_mockModule("../extension/settings.js", () => ({
  loadSettings: jest.fn().mockResolvedValue({ openAIApiKey: "test-key" }),
}));

const fetchMock = jest.fn();

global.fetch = fetchMock;

const { getReviewForPatch } = await import("../extension/openaiApi.js");

describe("getReviewForPatch", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("sends the diff to the OpenAI API and parses the response", async () => {
    const apiResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({ comments: [{ line: 1, body: "hi" }] }),
          },
        },
      ],
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => apiResponse,
    });

    const result = await getReviewForPatch("diff", {
      openAIApiKey: "test-key",
      openAIModel: "gpt",
      maxTokens: 100,
      temperature: 0.3,
      systemPrompt: "prompt",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
        body: expect.any(String),
      }),
    );
    const body = fetchMock.mock.calls[0][1].body;
    expect(body).toContain('"max_tokens":100');
    expect(body).toContain("diff");
    expect(result).toEqual({ comments: [{ line: 1, body: "hi" }] });
  });

  it("throws on authentication failure", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });
    await expect(
      getReviewForPatch("diff", {
        openAIApiKey: "bad",
        openAIModel: "gpt",
        systemPrompt: "p",
      }),
    ).rejects.toThrow("OpenAI API: Authentication failed");
  });
});
