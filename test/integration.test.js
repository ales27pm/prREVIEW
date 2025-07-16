import { jest } from "@jest/globals";

// Mock modules used by content.js
jest.unstable_mockModule("../extension/openaiApi.js", () => ({
  getReviewForPatch: jest.fn().mockResolvedValue({ comments: [] }),
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
}));
jest.unstable_mockModule("../extension/ui.js", () => ({
  createStatusIndicator: jest.fn(),
  updateStatus: jest.fn(),
  removeStatusIndicator: jest.fn(),
}));

let backgroundListeners = [];
let contentListeners = [];

function setupChrome() {
  global.chrome = {
    runtime: {
      onInstalled: { addListener: jest.fn() },
      sendMessage: jest.fn((msg, cb) => {
        backgroundListeners.forEach((l) => l(msg, {}, cb));
      }),
      onMessage: {
        addListener: jest.fn((fn) => {
          if (global.__loadingContent) {
            contentListeners.push(fn);
          } else {
            backgroundListeners.push(fn);
          }
        }),
      },
    },
    tabs: {
      query: jest.fn((q, cb) =>
        cb([{ id: 1, url: "https://github.com/a/b/pull/1" }]),
      ),
      sendMessage: jest.fn((id, msg, cb) => {
        contentListeners.forEach((l) => l(msg, {}, cb));
      }),
    },
    contextMenus: { create: jest.fn(), onClicked: { addListener: jest.fn() } },
    action: { onClicked: { addListener: jest.fn() } },
  };
}

beforeEach(() => {
  backgroundListeners = [];
  contentListeners = [];
  setupChrome();
  jest.resetModules();
});

test("popup click triggers OpenAI call", async () => {
  // Load background and content scripts
  await import("../extension/background.js");
  global.__loadingContent = true;
  await import("../extension/content.js");
  delete global.__loadingContent;

  document.body.innerHTML =
    '<button id="run-review"></button><button id="open-settings"></button>';
  await import("../extension/popup.js");

  document.getElementById("run-review").click();
  await Promise.resolve();

  expect(chrome.tabs.query).toHaveBeenCalled();
  expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
    1,
    { action: "run_review", prDetails: { owner: "a", repo: "b", prNumber: 1 } },
    expect.any(Function),
  );

  const openai = await import("../extension/openaiApi.js");
  expect(openai.getReviewForPatch).toHaveBeenCalled();
});
