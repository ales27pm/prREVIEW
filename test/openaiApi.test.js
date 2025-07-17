import { jest } from "@jest/globals";

// Mock loadSettings so openaiApi does not access chrome.storage
jest.unstable_mockModule("../extension/settings.js", () => ({
  loadSettings: jest.fn().mockResolvedValue({ openAIApiKey: "test-key" }),
}));

const fetchMock = jest.fn();

global.fetch = fetchMock;

const { getReviewForPatch, getMultiAgentReviewForPatch } = await import(
  "../extension/openaiApi.js"
);

describe("getReviewForPatch", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("sends the diff to the OpenAI API and parses the response", async () => {
    const apiResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              reasoning: "r",
              comments: [{ line: 1, body: "hi" }],
            }),
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
      prTitle: "t",
      prBody: "b",
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
    expect(body).toContain('"temperature":0.3');
    expect(body).toContain("diff");
    expect(body).toContain("Pull request title: t");
    expect(body).toContain("Pull request description: b");
    expect(result).toEqual({
      reasoning: "r",
      comments: [{ line: 1, body: "hi" }],
    });
  });

  it("omits PR context when title and body are empty", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ reasoning: "", comments: [] }),
            },
          },
        ],
      }),
    });

    await getReviewForPatch("diff", {
      openAIApiKey: "test-key",
      openAIModel: "gpt",
      maxTokens: 50,
      temperature: 0.2,
      systemPrompt: "prompt",
    });
    const body = fetchMock.mock.calls[0][1].body;
    expect(body).not.toContain("Pull request title");
    expect(body).not.toContain("Pull request description");
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
        prTitle: "t",
        prBody: "b",
      }),
    ).rejects.toThrow("OpenAI API: Authentication failed");
  });

  it("wraps prompts in XML for Claude models", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ reasoning: "r", comments: [] }),
            },
          },
        ],
      }),
    });

    await getReviewForPatch("diff", {
      openAIApiKey: "k",
      openAIModel: "claude-2",
      systemPrompt: "p",
    });

    const body = fetchMock.mock.calls[0][1].body;
    expect(body).toContain("<analysis>");
    expect(body).toContain("</analysis>");
  });

  it("does not wrap prompts for unknown models", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ reasoning: "r", comments: [] }),
            },
          },
        ],
      }),
    });

    await getReviewForPatch("diff", {
      openAIApiKey: "k",
      openAIModel: "claude-ish",
      systemPrompt: "p",
    });

    const body = fetchMock.mock.calls[0][1].body;
    expect(body).not.toContain("<analysis>");
  });
});

describe("getMultiAgentReviewForPatch", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  const review = {
    choices: [{ message: { content: JSON.stringify({ comments: [] }) } }],
  };
  const final = {
    choices: [
      {
        message: {
          content: JSON.stringify({ comments: [{ line: 1, body: "x" }] }),
        },
      },
    ],
  };

  [1, 2, 3].forEach((agentCount) => {
    it(`runs ${agentCount} reviews and synthesizes them`, async () => {
      for (let i = 0; i < agentCount; i++) {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => review,
        });
      }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => final,
      });

      const res = await getMultiAgentReviewForPatch("d", {
        openAIApiKey: "k",
        openAIModel: "gpt",
        maxTokens: 10,
        temperature: 0,
        agentCount,
      });

      expect(fetchMock).toHaveBeenCalledTimes(agentCount + 1);
      expect(res).toEqual({ comments: [{ line: 1, body: "x" }] });
    });
  });

  it("defaults to 3 agents when agentCount is missing", async () => {
    for (let i = 0; i < 3; i++) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => review,
      });
    }
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => final,
    });

    const res = await getMultiAgentReviewForPatch("d", {
      openAIApiKey: "k",
      openAIModel: "gpt",
      maxTokens: 10,
      temperature: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(res).toEqual({ comments: [{ line: 1, body: "x" }] });
  });
});
