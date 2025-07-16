import { jest } from "@jest/globals";

let backgroundListeners = [];
let contentListeners = [];

export function setupChrome() {
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

export function resetChrome() {
  backgroundListeners = [];
  contentListeners = [];
  setupChrome();
}
