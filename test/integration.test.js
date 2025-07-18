import { jest } from "@jest/globals";
import { setupChrome, resetChrome } from "./chromeMock.js";

// Mock modules used by content.js
jest.unstable_mockModule("../extension/openaiApi.js", () => ({
  getReviewForPatch: jest.fn().mockResolvedValue({ comments: [] }),
}));
jest.unstable_mockModule("../extension/content/githubService.js", () => ({
  getPageDiff: jest.fn().mockResolvedValue("diff"),
  postReviewComments: jest.fn(),
}));
jest.unstable_mockModule("../extension/githubApi.js", () => ({
  fetchAllPRFiles: jest
    .fn()
    .mockResolvedValue([
      { filename: "f.js", patch: "diff", status: "modified" },
    ]),
  getPRData: jest.fn().mockResolvedValue({ head: { sha: "1" } }),
  postComment: jest.fn(),
}));
jest.unstable_mockModule("../extension/config.js", () => ({
  loadConfig: jest.fn().mockResolvedValue({
    githubToken: "gh",
    openAIApiKey: "openai",
    openAIModel: "model",
    systemPrompt: "prompt",
    concurrencyLimit: 5,
    error: null,
  }),
  getRagMode: jest.fn().mockResolvedValue("performance"),
  setRagMode: jest.fn(),
  AVAILABLE_MODES: ["performance", "security", "test"],
}));
jest.unstable_mockModule("../extension/settings.js", () => ({
  loadSettings: jest.fn().mockResolvedValue({ enableAutoComment: false }),
}));
jest.unstable_mockModule("../extension/ui.js", () => ({
  createStatusIndicator: jest.fn(),
  updateStatus: jest.fn(),
  removeStatusIndicator: jest.fn(),
}));
jest.unstable_mockModule("../extension/feedback.js", () => ({
  observeComments: jest.fn(),
  startMergeTracker: jest.fn(),
  recordComment: jest.fn(),
}));

beforeEach(() => {
  resetChrome();
  jest.resetModules();
});

test("popup click triggers OpenAI call", async () => {
  // Load background and content scripts
  await import("../extension/background.js");
  global.__loadingContent = true;
  await import("../extension/content/content.js");
  global.__loadingContent = undefined;

  document.body.innerHTML =
    '<button id="run-review"></button><button id="open-settings"></button>';
  await import("../extension/popup.js");

  document.getElementById("run-review").click();
  await Promise.resolve();

  expect(chrome.tabs.query).toHaveBeenCalled();
  expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, {
    action: "RUN_REVIEW",
  });

  const openai = await import("../extension/openaiApi.js");
  expect(openai.getReviewForPatch).toHaveBeenCalled();
});
